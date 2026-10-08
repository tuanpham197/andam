// NFR-004: the JavaScript loaded at start-up stays within 200 KB gzip. Run after `vite build`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 200;
const dist = new URL('../dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
// Entry scripts and the chunks they preload.
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
if (files.length === 0) throw new Error('No entry script found in dist/index.html');

const kb = files.reduce((sum, f) => sum + gzipSync(readFileSync(join(dist, f))).length, 0) / 1024;
console.log(`Initial JS: ${kb.toFixed(1)} KB gzip (budget ${BUDGET_KB} KB) — ${files.join(', ')}`);
if (kb > BUDGET_KB) {
  console.error('Over the NFR-004 budget: lazy-load secondary routes or drop a dependency.');
  process.exit(1);
}
