import { access, chmod, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
	const split = arg.indexOf('=');
	if (!arg.startsWith('--') || split < 0) throw new Error('Use --extension-id=ID --yt-dlp=/absolute/path');
	return [arg.slice(2, split), arg.slice(split + 1)];
}));
if (process.platform !== 'darwin') throw new Error('This installer supports macOS Chrome.');
if (!/^[a-p]{32}$/.test(args['extension-id'] || '')) throw new Error('Provide the local Chrome extension ID.');
const binary = args['yt-dlp'];
if (!binary || !isAbsolute(binary)) throw new Error('Provide --yt-dlp=/absolute/path/to/yt-dlp');
await access(binary, constants.X_OK);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const support = args['support-dir'] || join(homedir(), 'Library/Application Support/Obsidian Web Clipper/native');
const registration = args['registration-dir'] || join(homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts');
const bundle = join(support, 'x-video-host.cjs');
const launcher = join(support, 'x-video-host');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
await mkdir(support, { recursive: true });
await copyFile(join(repo, 'build_native/x-video-host.cjs'), bundle);
await writeFile(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(bundle)} ${quote(binary)} "$@"\n`, { mode: 0o755 });
await chmod(launcher, 0o755);
await mkdir(registration, { recursive: true });
const manifest = {
	name: 'com.obsidian_clipper.x_video', description: 'Resolve public X video links using local yt-dlp',
	path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${args['extension-id']}/`],
};
await writeFile(join(registration, `${manifest.name}.json`), JSON.stringify(manifest, null, 2) + '\n');
console.log('Installed the X video native helper for extension ' + args['extension-id']);
