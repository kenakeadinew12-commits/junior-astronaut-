// Bundles the game for local browser testing in an environment without npm access:
// esbuild + the TEST-ONLY WebGL stand-in (test-three-shim.js) in place of `three`.
// The real build is `npm run build` (Vite + the real three package).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = here;
const req = createRequire(import.meta.url);
const candidates = [process.env.ESBUILD, path.join(root, 'node_modules/esbuild/lib/main.js')].filter(Boolean);
const esbuildPath = candidates.find((p) => existsSync(p));
if (!esbuildPath) { console.error('esbuild not found'); process.exit(1); }
const { build } = req(esbuildPath);

const out = path.join(here, 'test-output', 'dist-world');
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [path.join(root, 'test-world-entry.js')], bundle: true, format: 'esm', outfile: path.join(out, 'world.js'),
  jsx: 'automatic', minify: false, sourcemap: false, logLevel: 'info',
  alias: { three: path.join(here, 'test-three-shim.js') },
  nodePaths: [process.env.NODE_MODULES_GLOBAL].filter(Boolean),
  define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.js': 'jsx' },
});
writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Junior Astronaut - Lunar Outpost (test build)</title></head><body><div id="root"></div><script type="module" src="world.js"></script></body></html>`);
console.log('test build written to', out);
