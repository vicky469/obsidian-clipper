import { isAbsolute } from 'node:path';
import { encodeMessage, readMessage, resolveVideo } from './x-video-host';

async function main() {
	const binary = process.argv[2];
	if (!binary || !isAbsolute(binary)) throw new Error('Missing yt-dlp path');
	return resolveVideo(await readMessage(process.stdin), binary);
}

void main().catch(() => ({ ok: false, error: 'Invalid native video request.' }))
	.then(result => process.stdout.write(encodeMessage(result), () => process.exit(0)));
