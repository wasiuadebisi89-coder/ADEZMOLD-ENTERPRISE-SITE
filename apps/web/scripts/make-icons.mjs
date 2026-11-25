// Renders the app icons in public/icons from the BMS mark (public/favicon.svg) with the
// Chromium that Playwright drives. Run from the repo root after changing the logo:
//   node apps/web/scripts/make-icons.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'icons');
const logo = readFileSync(join(here, '..', 'public', 'favicon.svg'), 'utf8');

// "any": the rounded tile as it is. "maskable": full-bleed teal with the mark inside the
// central safe zone, so Android can crop it to a circle or squircle. "apple": iOS rounds the
// corners itself, so it gets a square tile.
const icons = [
  { file: 'icon-192.png', size: 192, kind: 'any' },
  { file: 'icon-512.png', size: 512, kind: 'any' },
  { file: 'maskable-192.png', size: 192, kind: 'maskable' },
  { file: 'maskable-512.png', size: 512, kind: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, kind: 'apple' },
];

function page(size, kind) {
  const svg = logo.replace('<svg ', `<svg width="100%" height="100%" `);
  if (kind === 'any') return `<div style="width:${size}px;height:${size}px">${svg}</div>`;
  const inner = kind === 'maskable' ? 0.78 : 0.92;
  const plain = svg.replace(/<rect width="32" height="32" rx="7"[^>]*\/>/, '');
  const pad = (size * (1 - inner)) / 2;
  return `<div style="width:${size}px;height:${size}px;background:#0f766e;position:relative;overflow:hidden">
    <div style="position:absolute;left:${pad}px;top:${pad}px;width:${size * inner}px;height:${size * inner}px">${plain}</div></div>`;
}

const browser = await chromium.launch();
const p = await browser.newPage({ deviceScaleFactor: 1 });
for (const { file, size, kind } of icons) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(
    `<html><body style="margin:0;background:transparent">${page(size, kind)}</body></html>`,
  );
  await p.screenshot({
    path: join(out, file),
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  console.log('wrote', file);
}
await browser.close();
