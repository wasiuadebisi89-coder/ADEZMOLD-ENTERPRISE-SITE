// Source-level checks that need no browser.
// Run: node --test tests/e2e/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function sourceFiles(dir = path.join(root, 'src')) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await sourceFiles(p)));
    else if (/\.(jsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('every icon used in src is included in the icon-font subset in index.html', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const subset = new Set(html.match(/icon_names=([a-z0-9_,]+)/)[1].split(','));
  const listed = [...subset];
  assert.deepEqual(listed, [...listed].sort(), 'icon_names must be alphabetical (Google Fonts requirement)');

  const used = new Set();
  for (const f of await sourceFiles()) {
    const text = await readFile(f, 'utf8');
    for (const m of text.matchAll(/(?:<Icon[^>]*\bname=|\bicon[:=]\s*)["']([a-z0-9_]+)["']/g)) used.add(m[1]);
  }
  const missing = [...used].filter((n) => !subset.has(n));
  assert.deepEqual(missing, [], `icons missing from subset: ${missing.join(', ')}`);
});

test('no unverified claims from the Stitch draft remain in the source', async () => {
  const forbidden = [
    'Victoria Island',
    'advisory@adezmold.com',
    'Q2 2025',
    'fiduciary',
    'Advisory Group',
    'senior advisory partners',
    'proprietary',
    'Mile 12',
    'Dawanau',
    'forensic',
    'health certifications',
    'Client Portal',
  ];
  for (const f of await sourceFiles()) {
    const text = await readFile(f, 'utf8');
    for (const phrase of forbidden) {
      assert.ok(!text.includes(phrase), `"${phrase}" found in ${path.relative(root, f)}`);
    }
  }
});

test('checklist has exactly 25 points across the 8 required areas', async () => {
  const { checklistSections, checklistItemCount } = await import(path.join(root, 'src/content/checklist.js'));
  assert.equal(checklistItemCount, 25);
  assert.equal(checklistSections.length, 8);
});

test('leakage estimate arithmetic', async () => {
  // Pure function re-implemented here to avoid importing JSX into node.
  const estimate = (m, pct) => Math.round(m * 1_000_000 * 12 * (pct / 100));
  const src = await readFile(path.join(root, 'src/components/LeakageEstimator.jsx'), 'utf8');
  assert.match(src, /monthlyTurnoverMillions \* 1_000_000 \* 12 \* \(leakagePercent \/ 100\)/);
  assert.equal(estimate(15, 5), 9_000_000);
  assert.equal(estimate(50, 15), 90_000_000);
});
