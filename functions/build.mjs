// Bundles the functions with the workspace packages inlined, and writes a deployable
// package.json into dist/ that lists only the external runtime dependencies.
import { build } from 'esbuild';
import { copyFile, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';

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
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
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
// Per-project settings (`.env.staging`, `.env.production`): the Firebase CLI reads the file named
// after the deploy alias from the functions source directory, which is dist/.
for (const name of await readdir('env')) await copyFile(`env/${name}`, `dist/${name}`);
// Lets the Functions emulator resolve the SDKs locally. `firebase deploy` skips node_modules
// and installs the dependencies listed above in the cloud.
await rm('dist/node_modules', { force: true, recursive: true });
await symlink('../node_modules', 'dist/node_modules', 'dir');
console.log('functions built to dist/');
