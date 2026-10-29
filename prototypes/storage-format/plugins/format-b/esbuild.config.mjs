// PROTOTYPE build: bundles src/main.ts into the test vault's plugin folder.
import esbuild from 'esbuild';
import fs from 'fs';

const outDir = '../../vault/.obsidian/plugins/proto-format-b';
fs.mkdirSync(outDir, { recursive: true });
await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  target: 'es2018',
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  outfile: `${outDir}/main.js`,
  logLevel: 'info',
});
fs.copyFileSync('manifest.json', `${outDir}/manifest.json`);
fs.copyFileSync('styles.css', `${outDir}/styles.css`);
