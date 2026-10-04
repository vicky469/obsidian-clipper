import { PassThrough } from 'node:stream';
import { describe, expect, test, vi } from 'vitest';
import { encodeMessage, readMessage, resolveVideo } from './x-video-host';

const post = 'https://x.com/example/status/123456';
const mp4 = 'https://video.twimg.com/video/one.mp4?tag=1';

describe('X video native host', () => {
	test('reads fragmented native messages and uses UTF-8 byte lengths', async () => {
		const input = new PassThrough();
		const message = { url: post, label: '视频' };
		const framed = encodeMessage(message);
		expect(framed.readUInt32LE(0)).toBe(Buffer.byteLength(JSON.stringify(message)));
		const pending = readMessage(input);
		input.write(framed.subarray(0, 2));
		input.write(framed.subarray(2, 7));
		input.end(framed.subarray(7));
		expect(await pending).toEqual(message);
	});
	test('rejects oversized native requests before reading their bodies', async () => {
		const input = new PassThrough();
		const pending = readMessage(input);
		const header = Buffer.alloc(4); header.writeUInt32LE(50000);
		input.end(header);
		await expect(pending).rejects.toThrow('size');
	});
	test('rejects truncated requests', async () => {
		const input = new PassThrough();
		const pending = readMessage(input);
		input.end(encodeMessage({ url: post }).subarray(0, 8));
		await expect(pending).rejects.toThrow('Incomplete');
	});
	test('uses fixed arguments and returns deduplicated MP4 links without downloading', async () => {
		const run = vi.fn().mockResolvedValue(`${mp4}\n${mp4}\nhttps://video.twimg.com/two.mp4\n`);
		const result = await resolveVideo({ action: 'resolve', url: post + '?s=20' }, '/test/yt-dlp', run);
		expect(result).toEqual({ ok: true, postUrl: post, urls: [mp4, 'https://video.twimg.com/two.mp4'] });
		expect(run).toHaveBeenCalledWith('/test/yt-dlp', expect.arrayContaining([
			'--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--skip-download', '--print', '%(url)s', '-f', 'best[ext=mp4]', '--', post,
		]));
		expect(run.mock.calls[0][1]).not.toContain('--cookies-from-browser');
	});
	test.each(['file:///etc/passwd', 'https://evil.example/example/status/123456', 'https://x.com/home'])('rejects unsupported request %s', async url => {
		const run = vi.fn();
		expect((await resolveVideo({ action: 'resolve', url }, '/test/yt-dlp', run)).ok).toBe(false);
		expect(run).not.toHaveBeenCalled();
	});
	test.each(['javascript:alert(1)', 'https://video.twimg.com.evil.example/v.mp4', 'https://video.twimg.com/master.m3u8'])('rejects unexpected process output %s', async output => {
		expect((await resolveVideo({ action: 'resolve', url: post }, '/test/yt-dlp', async () => output)).ok).toBe(false);
	});
	test('reports process failure without exposing stderr or local paths', async () => {
		const result = await resolveVideo({ action: 'resolve', url: post }, '/test/yt-dlp', async () => { throw new Error('private stderr'); });
		expect(result.ok).toBe(false);
		expect(JSON.stringify(result)).not.toContain('private stderr');
	});
	test('handles a text-only post as having no videos', async () => {
		const result = await resolveVideo({ action: 'resolve', url: post }, '/test/yt-dlp', async () => {
			throw Object.assign(new Error('yt-dlp failed'), { stderr: 'ERROR: No video could be found in this tweet' });
		});
		expect(result).toEqual({ ok: true, postUrl: post, urls: [] });
	});
});

test('rejects malformed JSON in a complete native frame', async () => {
	const input = new PassThrough();
	const pending = readMessage(input);
	const body = Buffer.from('{bad');
	const header = Buffer.alloc(4);
	header.writeUInt32LE(body.length);
	input.end(Buffer.concat([header, body]));
	await expect(pending).rejects.toThrow('Invalid request JSON');
});
