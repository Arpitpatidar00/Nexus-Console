#!/usr/bin/env node
// One version everywhere (PLAN G.3): package.json, package-lock.json,
// src-tauri/Cargo.toml (+ Cargo.lock), src-tauri/tauri.conf.json, then the
// changelog section. Tag and push yourself: git tag v<version> && git push --tags
// Usage: npm run version:set -- 0.2.0
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version ?? '')) {
  console.error('usage: npm run version:set -- <major.minor.patch>');
  process.exit(1);
}

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, 'utf8')));
const json = (file, fn) => edit(file, (s) => JSON.stringify(fn(JSON.parse(s)), null, 2) + '\n');

json('package.json', (p) => ({ ...p, version }));
json('package-lock.json', (l) => {
  l.version = version;
  if (l.packages?.['']) l.packages[''].version = version;
  return l;
});
json('src-tauri/tauri.conf.json', (c) => ({ ...c, version }));
edit('src-tauri/Cargo.toml', (s) => s.replace(/^version = ".*"$/m, `version = "${version}"`));
edit('src-tauri/Cargo.lock', (s) =>
  s.replace(/(name = "stackroost"\nversion = )".*"/, `$1"${version}"`),
);
execFileSync('node', ['scripts/changelog.mjs', '--next', version], { stdio: 'inherit' });
execFileSync(
  'npx',
  ['prettier', '--write', 'package.json', 'src-tauri/tauri.conf.json', 'CHANGELOG.md'],
  { stdio: 'ignore' },
);
console.log(`Version ${version} set. Next: commit, then git tag v${version} && git push --tags`);
