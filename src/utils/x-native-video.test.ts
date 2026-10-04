// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { handleXVideoRequest, insertXVideoEmbeds, resolveXVideoEmbeds, showXVideoWarning } from './x-native-video';
import { createMarkdownContent } from 'defuddle/full';

const post = 'https://x.com/example/status/123456';
const mp4 = 'https://video.twimg.com/video.mp4?tag=1&x=2';
afterEach(() => vi.useRealTimers());

test('places the video player with the post before comments and captions', async () => {
	const video = await resolveXVideoEmbeds(post, async () => ({ ok: true, postUrl: post, urls: [mp4] }));
	const content = '<article><div class="twitter post"><div class="post-content"><p>Original post</p></div></div><hr><div class="twitter comments"><h2>Comments</h2><blockquote>Reader reply</blockquote></div></article>'
		+ '<h2>Transcript</h2><p>Caption text</p>';
	// Exercise the same content assembly used by the clipping entrypoints.
	const assembled = insertXVideoEmbeds(content, video.html);
	const markdown = createMarkdownContent(assembled, post);
	expect(markdown.indexOf('<video ')).toBeGreaterThan(markdown.indexOf('Original post'));
	expect(markdown.indexOf('<video ')).toBeLessThan(markdown.indexOf('## Comments'));
	expect(markdown.indexOf('<video ')).toBeLessThan(markdown.indexOf('## Transcript'));
});

test('leaves content unchanged when no video was resolved', () => {
	expect(insertXVideoEmbeds('<p>Post</p>', '')).toBe('<p>Post</p>');
});

test('preserves the player when an extractor has no post wrapper', async () => {
	const video = await resolveXVideoEmbeds(post, async () => ({ ok: true, postUrl: post, urls: [mp4] }));
	const content = insertXVideoEmbeds('<p>Post</p>', video.html);
	expect(createMarkdownContent(content, post)).toContain('<video ');
});

test('shows a dismissible export warning without interpreting errors as HTML', () => {
	showXVideoWarning(document, '<img src=x onerror=alert(1)>');
	const warning = document.getElementById('obsidian-clipper-video-warning')!;
	expect(warning.textContent).toContain('<img src=x onerror=alert(1)>');
	expect(warning.querySelector('img')).toBeNull();
	(warning.querySelector('button') as HTMLButtonElement).click();
	expect(document.getElementById('obsidian-clipper-video-warning')).toBeNull();
});

test('returns playable video embeds that survive Markdown conversion', async () => {
	const send = vi.fn().mockResolvedValue({ ok: true, postUrl: post, urls: [mp4] });
	const result = await resolveXVideoEmbeds(post, send);
	expect(send).toHaveBeenCalledWith({ action: 'resolveXVideos', url: post });
	const markdown = createMarkdownContent(result.html, post);
	const doc = new DOMParser().parseFromString(markdown, 'text/html');
	const player = doc.querySelector('video')!;
	expect(player).not.toBeNull();
	expect(player.getAttribute('src')).toBe(mp4);
	expect(player.hasAttribute('controls')).toBe(true);
	expect(player.hasAttribute('autoplay')).toBe(false);
	expect(doc.querySelector('a')).toBeNull();
	expect(result.error).toBeUndefined();
});
test('does not invoke the helper for non-X pages', async () => {
	const send = vi.fn();
	expect(await resolveXVideoEmbeds('https://example.com/', send)).toEqual({ html: '' });
	expect(send).not.toHaveBeenCalled();
});
test('reports missing host without fallback markup', async () => {
	const result = await resolveXVideoEmbeds(post, async () => { throw new Error('host missing'); });
	expect(result.html).toBe('');
	expect(result.error).toContain('helper');
});
test('bounds a hung background request', async () => {
	vi.useFakeTimers();
	const pending = resolveXVideoEmbeds(post, () => new Promise(() => {}));
	await vi.advanceTimersByTimeAsync(20000);
	expect((await pending).error).toContain('timed out');
});
test.each([
	null,
	{ ok: true, postUrl: post, urls: 'not an array' },
	{ ok: true, postUrl: post, urls: [null] },
	{ ok: true, postUrl: post, urls: Array(5).fill(mp4) },
	{ ok: true, postUrl: 'https://x.com/example/status/999', urls: [mp4] },
	{ ok: true, postUrl: post, urls: ['javascript:alert(1)'] },
])('does not trust malformed or mismatched responses', async response => {
	const result = await resolveXVideoEmbeds(post, async () => response);
	expect(result.html).toBe('');
	expect(result.error).toBeTruthy();
});
test('background invokes the named native host for a matching X sender', async () => {
	const native = vi.fn().mockResolvedValue({ ok: true, postUrl: post, urls: [mp4] });
	await handleXVideoRequest({ action: 'resolveXVideos', url: post }, { url: post, tab: { url: post } }, native);
	expect(native).toHaveBeenCalledWith('com.obsidian_clipper.x_video', { action: 'resolve', url: post });
});
test.each([
	{ url: 'https://evil.example/', tab: { url: post } },
	{ url: post, tab: { url: 'https://x.com/example/status/999' } },
	{ url: post },
])('background rejects untrusted or mismatched senders', async sender => {
	const native = vi.fn();
	const result = await handleXVideoRequest({ action: 'resolveXVideos', url: post }, sender, native);
	expect(result.ok).toBe(false);
	expect(native).not.toHaveBeenCalled();
});
