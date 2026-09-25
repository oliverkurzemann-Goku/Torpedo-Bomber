#!/usr/bin/env node
'use strict';

// Syntax-checks every inline <script> block (no src=) in every top-level
// game/tool HTML file, using the same method CLAUDE.md's own testing
// doctrine (Abschnitt 6) describes: extract the block and run it through
// `new Function()`. This catches typos/parse errors before they ship,
// without needing a browser or WebGL.
//
// Usage: node scripts/check-syntax.js

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root)
  .filter(f => f.endsWith('.html'))
  .sort();

let totalBlocks = 0;
let totalErrors = 0;

for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0, errs = 0;
  while ((m = re.exec(html))) {
    n++;
    try {
      new Function(m[1]);
    } catch (e) {
      errs++;
      console.error(`  ${file} block ${n}: ${e.message}`);
    }
  }
  totalBlocks += n;
  totalErrors += errs;
  console.log(`${file}: ${n} inline script block(s), ${errs} error(s)`);
}

console.log(`\n${files.length} file(s), ${totalBlocks} block(s), ${totalErrors} error(s)`);
process.exit(totalErrors > 0 ? 1 : 0);
