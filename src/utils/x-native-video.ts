import { escapeHtml } from './string-utils';
import { isXMp4, xPostUrl, X_VIDEO_HOST, XVideoResult } from './x-video-protocol';

declare const NATIVE_X_VIDEO: boolean;

type Sender = { url?: string; tab?: { url?: string } };
type NativeSend = (host: string, message: object) => Promise<unknown>;

/** Keep the requested post's media ahead of conversation replies and captions. */
export function insertXVideoEmbeds(content: string, videoHtml: string): string {
	if (!videoHtml) return content;
	const doc = new DOMParser().parseFromString(content, 'text/html');
	const post = doc.querySelector('.twitter.post .post-content');
	if (!post) return `${content}\n${videoHtml}`;
	const links = new DOMParser().parseFromString(videoHtml, 'text/html');
	post.append(...Array.from(links.body.childNodes).map(node => doc.importNode(node, true)));
	return doc.body.innerHTML;
}

/** Direct copy/save commands have no popup in which to display a warning. */
export function showXVideoWarning(doc: Document, error: string): void {
	doc.getElementById('obsidian-clipper-video-warning')?.remove();
	const notice = doc.createElement('div');
	notice.id = 'obsidian-clipper-video-warning';
	notice.setAttribute('role', 'alert');
	notice.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:420px;padding:16px;background:#fff;color:#222;border:1px solid #999;border-radius:8px;font:14px/1.5 sans-serif';
	const message = doc.createElement('span');
	message.textContent = `Video preview unavailable: ${error} Post text is still included.`;
	const close = doc.createElement('button');
	close.textContent = 'Dismiss';
	close.addEventListener('click', () => notice.remove());
	notice.append(message, close);
	doc.body.append(notice);
}

export async function handleXVideoRequest(request: { action?: unknown; url?: unknown }, sender: Sender, send: NativeSend): Promise<XVideoResult> {
	const postUrl = xPostUrl(request.url);
	// The tab URL handles SPA navigation; sender URL still must be an X page.
	let trusted = false;
	try {
		const source = new URL(sender.url || '');
		trusted = source.protocol === 'https:' && /^(?:(?:www|mobile|m)\.)?(?:x|twitter)\.com$/.test(source.hostname);
	} catch { /* invalid */ }
	if (request.action !== 'resolveXVideos' || !trusted || !postUrl || xPostUrl(sender.tab?.url) !== postUrl) return { ok: false, error: 'Video request does not match the current X tab.' };
	try {
		return await send(X_VIDEO_HOST, { action: 'resolve', url: postUrl }) as XVideoResult;
	} catch {
		return { ok: false, error: 'The local video helper is unavailable. Install it, reload the local Clipper extension, and refresh this page.' };
	}
}

export async function resolveXVideoEmbeds(url: string, send: (message: object) => Promise<unknown>): Promise<{ html: string; error?: string }> {
	if (typeof NATIVE_X_VIDEO !== 'undefined' && !NATIVE_X_VIDEO) return { html: '' };
	const postUrl = xPostUrl(url);
	if (!postUrl) return { html: '' };
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const result = await Promise.race([
			send({ action: 'resolveXVideos', url: postUrl }),
			new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Video extraction timed out.')), 18000); }),
		]) as XVideoResult;
		if (!result?.ok) return { html: '', error: result?.error || 'The local video helper returned an invalid response.' };
		if (result.postUrl !== postUrl || !Array.isArray(result.urls) || result.urls.length > 4 || !result.urls.every(isXMp4)) {
			return { html: '', error: 'The local video helper returned invalid video links.' };
		}
		const urls = Array.from(new Set(result.urls));
		return { html: urls.map(src => `<video controls preload="metadata" src="${escapeHtml(src)}" style="max-width: 100%;"></video>`).join('\n') };
	} catch (error) {
		return { html: '', error: error instanceof Error && error.message === 'Video extraction timed out.'
			? error.message : 'The local video helper is unavailable. Install it and reload the extension.' };
	} finally { clearTimeout(timer); }
}
