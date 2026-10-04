import { build } from 'esbuild';
await build({
	entryPoints: ['src/native/x-video-host-main.ts'],
	bundle: true, platform: 'node', target: 'node18', format: 'cjs',
	minify: true, sourcemap: false, outfile: 'build_native/x-video-host.cjs',
});
