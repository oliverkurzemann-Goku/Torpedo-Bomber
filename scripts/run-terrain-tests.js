#!/usr/bin/env node
'use strict';

// Runs every committed regression test in terrain-system/tests/.
//
// These tests need the real three.js r128 build plus its classic (non-ESM)
// example loader scripts, referenced via env vars (see each test file's own
// header comment for exactly which ones). Before this script existed, every
// session had to rediscover those env vars and vendor the files into /tmp by
// hand (see CLAUDE.md Abschnitt 6) -- this just resolves them once, from the
// devDependencies installed by `npm install`.
//
// Usage: node scripts/run-terrain-tests.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const testDir = path.join(root, 'terrain-system', 'tests');

// Some of these packages restrict subpath access via package.json "exports"
// (fflate does; three's classic example scripts aren't part of its public
// exports map either), so require.resolve('pkg/sub/path') isn't reliable
// here -- resolve the package root, then join the known-fixed subpath.
function pkgRoot(name) {
  return path.dirname(require.resolve(`${name}/package.json`));
}

const env = Object.assign({}, process.env, {
  THREE_R128: path.join(pkgRoot('three'), 'build', 'three.min.js'),
  GLTF_LOADER_R128: path.join(pkgRoot('three'), 'examples', 'js', 'loaders', 'GLTFLoader.js'),
  FBX_LOADER_R128: path.join(pkgRoot('three'), 'examples', 'js', 'loaders', 'FBXLoader.js'),
  SKELETON_UTILS_R128: path.join(pkgRoot('three'), 'examples', 'js', 'utils', 'SkeletonUtils.js'),
  FFLATE_R128: path.join(pkgRoot('fflate'), 'umd', 'index.js'),
});

const testFiles = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.js'))
  .sort();

let failures = 0;

for (const f of testFiles) {
  const full = path.join(testDir, f);
  console.log(`\n=== ${f} ===`);
  const res = spawnSync(process.execPath, [full], { env, stdio: 'inherit' });
  if (res.status !== 0) {
    failures++;
    console.error(`FAILED: ${f} (exit ${res.status})`);
  }
}

console.log(`\n${testFiles.length} test file(s), ${failures} failure(s)`);
process.exit(failures > 0 ? 1 : 0);
