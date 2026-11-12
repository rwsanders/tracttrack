#!/usr/bin/env node
// Assembles a self-contained deploy/ folder: the bundled API server, the built
// client and the data it reads. The host only needs Node: `node server.mjs`.
//
//   npm run package
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'deploy');

if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/ is missing. Run "npm run build" first (or use "npm run package").');
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await build({
  entryPoints: [path.join(root, 'server', 'index.ts')],
  outfile: path.join(out, 'server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  minify: true,
  legalComments: 'none',
  // Some dependencies are CommonJS and call require() for Node built-ins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});

// The server resolves both of these relative to itself and its working directory.
await cp(path.join(root, 'dist'), path.join(out, 'dist'), {
  recursive: true,
  filter: (src) => !src.endsWith('.map'),
});
await cp(path.join(root, 'server', 'states', 'tx', 'data'), path.join(out, 'data'), { recursive: true });

await writeFile(
  path.join(out, 'package.json'),
  `${JSON.stringify(
    {
      name: 'tracttrack-deploy',
      private: true,
      type: 'module',
      scripts: { start: 'NODE_ENV=production node server.mjs' },
      engines: { node: '>=20' },
    },
    null,
    2,
  )}\n`,
);

console.log(`Packaged ${path.relative(root, out)}/ (start with: npm start)`);
