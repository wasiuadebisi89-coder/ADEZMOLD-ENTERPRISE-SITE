// Bundles the functions with the workspace packages inlined, and writes a deployable
// package.json into dist/ that lists only the external runtime dependencies.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const external = ['firebase-admin', 'firebase-functions'];

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [...external, 'firebase-admin/*', 'firebase-functions/*'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

await writeFile(
  'dist/package.json',
  JSON.stringify(
    {
      name: pkg.name.replace('@bms/', 'bms-'),
      private: true,
      type: 'module',
      main: 'index.js',
      engines: pkg.engines,
      dependencies: Object.fromEntries(external.map((d) => [d, pkg.dependencies[d]])),
    },
    null,
    2,
  ) + '\n',
);
console.log('functions built to dist/');
