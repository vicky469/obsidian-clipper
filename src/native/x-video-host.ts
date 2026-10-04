import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { isXMp4, xPostUrl, XVideoResult } from '../utils/x-video-protocol';

export function encodeMessage(value: unknown): Buffer {
	const body = Buffer.from(JSON.stringify(value), 'utf8');
	const header = Buffer.alloc(4);
	header.writeUInt32LE(body.length);
	return Buffer.concat([header, body]);
}

/** One request per Chrome sendNativeMessage process. */
export function readMessage(input: Readable): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let bytes = Buffer.alloc(0);
		const finish = (error?: Error, value?: unknown) => {
			clearTimeout(timer);
			input.removeListener('data', onData);
			input.removeListener('end', onEnd);
			input.removeListener('error', onError);
			input.pause();
			if (error) reject(error); else resolve(value);
		};
		const onEnd = () => finish(new Error('Incomplete native request'));
		const onError = (error: Error) => finish(error);
		const onData = (chunk: Buffer) => {
			bytes = Buffer.concat([bytes, chunk]);
			if (bytes.length < 4) return;
			const size = bytes.readUInt32LE(0);
			if (!size || size > 4096 || bytes.length > size + 4) return finish(new Error('Invalid request size'));
			if (bytes.length === size + 4) {
				try { finish(undefined, JSON.parse(bytes.subarray(4).toString('utf8'))); }
				catch { finish(new Error('Invalid request JSON')); }
			}
		};
		const timer = setTimeout(() => finish(new Error('Native request timed out')), 5000);
		input.on('data', onData).once('end', onEnd).once('error', onError);
	});
}

export function runYtDlp(binary: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(binary, args, { timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 128 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
			if (error) reject(Object.assign(error, { stderr })); else resolve(stdout);
		});
	});
}

export async function resolveVideo(request: unknown, binary: string, run = runYtDlp): Promise<XVideoResult> {
	const data = request as { action?: unknown; url?: unknown } | null;
	const postUrl = xPostUrl(data?.url);
	if (data?.action !== 'resolve' || !postUrl) return { ok: false, error: 'Invalid X post URL.' };
	try {
		const output = await run(binary, [
			'--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--skip-download', '--no-playlist', '--no-warnings',
			'--socket-timeout', '8', '--retries', '0', '-f', 'best[ext=mp4]', '--print', '%(url)s', '--', postUrl,
		]);
		const urls = Array.from(new Set(output.split(/\r?\n/).map(line => line.trim()).filter(Boolean)));
		if (!urls.length || urls.length > 4 || !urls.every(isXMp4)) return { ok: false, error: 'yt-dlp returned no valid MP4 links.' };
		return { ok: true, postUrl, urls };
	} catch (error) {
		const failure = error as { stderr?: string; killed?: boolean; code?: string };
		if (/No video could be found in this tweet/i.test(failure.stderr || '')) return { ok: true, postUrl, urls: [] };
		return { ok: false, error: failure.killed ? 'Video extraction timed out.'
			: failure.code === 'ENOENT' ? 'yt-dlp is missing. Reinstall the video helper.'
				: 'yt-dlp could not resolve this video. Check that the public post is available and yt-dlp is up to date.' };
	}
}
