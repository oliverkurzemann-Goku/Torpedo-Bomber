#!/usr/bin/env node
'use strict';

// Runs every committed regression test in okinawa/tests/. Unlike
// terrain-system/tests/*.js (which need env vars pointing at three's classic,
// non-ESM example loader scripts -- see run-terrain-tests.js), these .cjs
// files just `require('three')` / `require('@napi-rs/canvas')` directly and
// resolve them the normal Node way, so no special wiring is needed beyond
// having both as devDependencies (npm install already does that). This
// script existed only informally before -- every session had to remember to
// pass NODE_PATH and run each file by hand; now it's `npm run test:okinawa`.
//
// Usage: node scripts/run-okinawa-tests.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const testDir = path.join(root, 'okinawa', 'tests');

const testFiles = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.cjs'))
  .sort();

let failures = 0;

for (const f of testFiles) {
  const full = path.join(testDir, f);
  console.log(`\n=== ${f} ===`);
  const res = spawnSync(process.execPath, [full], { stdio: 'inherit' });
  if (res.status !== 0) {
    failures++;
    console.error(`FAILED: ${f} (exit ${res.status})`);
  }
}

console.log(`\n${testFiles.length} test file(s), ${failures} failure(s)`);
process.exit(failures > 0 ? 1 : 0);
