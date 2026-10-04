export const X_VIDEO_HOST = 'com.obsidian_clipper.x_video';
export type XVideoResult = { ok: true; postUrl: string; urls: string[] } | { ok: false; error: string };

export function xPostUrl(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.length > 2048) return;
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:' || url.username || url.password || url.port
			|| !/^(?:(?:www|mobile|m)\.)?(?:x|twitter)\.com$/.test(url.hostname)) return;
		const match = url.pathname.match(/^\/(\w{1,15})\/status\/(\d+)(?:\/(?:video|photo)\/\d+)?\/?$/);
		if (match) return `https://x.com/${match[1]}/status/${match[2]}`;
	} catch { /* Not a public X status URL. */ }
}

export function isXMp4(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 8192) return false;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' && url.hostname === 'video.twimg.com'
			&& !url.username && !url.password && !url.port && /\.mp4$/i.test(url.pathname);
	} catch { return false; }
}
