// SEO and link-preview checks on the built HTML, read WITHOUT running JavaScript
// (as LinkedIn's crawler does). Requires `npm run build` (set SITE_URL to also
// check absolute URLs, e.g. SITE_URL=https://example.com npm run build).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages } from '../../src/content/seo.js';
import { startLocalServer } from '../../scripts/local-server.mjs';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const html = (p) => readFile(path.join(dist, p === '/' ? 'index.html' : `${p.slice(1)}/index.html`), 'utf8');
const meta = (doc, attr, key) => doc.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];

let server;
let base;
before(async () => {
  ({ server, url: base } = await startLocalServer({ port: 4177 }));
});
after(() => server?.close());

test('every public page has its own HTML with a unique title and description', async () => {
  const titles = new Set();
  const descs = new Set();
  for (const p of pages) {
    const doc = await html(p.path);
    const title = doc.match(/<title>([^<]*)<\/title>/)[1];
    const desc = meta(doc, 'name', 'description');
    assert.ok(title.length >= 20 && title.length <= 80, `${p.path} title length ${title.length}`);
    assert.ok(desc.length >= 70 && desc.length <= 170, `${p.path} description length ${desc.length}`);
    assert.equal((doc.match(/<title>/g) ?? []).length, 1, `${p.path} has one <title>`);
    assert.equal(meta(doc, 'property', 'og:title'), title.replace(/&amp;/g, '&amp;'));
    assert.ok(meta(doc, 'property', 'og:description'));
    assert.equal(meta(doc, 'name', 'twitter:card'), 'summary_large_image');
    titles.add(title);
    descs.add(desc);
  }
  assert.equal(titles.size, pages.length);
  assert.equal(descs.size, pages.length);
});

test('absolute URLs for canonical, og:url and og:image when SITE_URL is set', { skip: !process.env.SITE_URL && 'build without SITE_URL' }, async () => {
  const site = process.env.SITE_URL.replace(/\/+$/, '');
  for (const p of pages) {
    const doc = await html(p.path);
    const expected = site + (p.path === '/' ? '/' : p.path);
    assert.match(doc, new RegExp(`<link rel="canonical" href="${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.equal(meta(doc, 'property', 'og:url'), expected);
    assert.equal(meta(doc, 'property', 'og:image'), `${site}/og-image.png`);
  }
  const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
  assert.equal((sitemap.match(/<loc>/g) ?? []).length, pages.length);
  assert.ok(!sitemap.includes('/admin'));
});

test('structured data is valid JSON with verified details only', async () => {
  const doc = await html('/');
  const json = JSON.parse(doc.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(json['@type'], 'ProfessionalService');
  assert.equal(json.address.addressLocality, 'Iwo');
  assert.equal(json.telephone, '+2347035246809');
  for (const k of ['aggregateRating', 'review', 'award', 'priceRange']) assert.equal(json[k], undefined, `${k} must not be invented`);
});

test('robots, 404 status, and staff pages kept out of search', async () => {
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/api\//);
  const missing = await fetch(`${base}/no-such-page`);
  assert.equal(missing.status, 404, 'unknown URLs are real 404s, not soft 404s');
  assert.match(await missing.text(), /noindex/);
  assert.match(await (await fetch(`${base}/admin`)).text(), /<meta name="robots" content="noindex, nofollow"/);
  for (const p of pages) assert.equal((await fetch(base + p.path)).status, 200, p.path);
});

test('social preview image and icons exist at the advertised sizes', async () => {
  const og = await readFile(path.join(dist, 'og-image.png'));
  assert.equal(og.readUInt32BE(16), 1200);
  assert.equal(og.readUInt32BE(20), 630);
  assert.ok(og.length < 1024 * 1024, 'under 1 MB for fast previews');
  const touch = await readFile(path.join(dist, 'apple-touch-icon.png'));
  assert.equal(touch.readUInt32BE(16), 180);
  assert.match(await readFile(path.join(dist, 'favicon.svg'), 'utf8'), /^<svg/);
  assert.match(await html('/'), /<link rel="icon" href="\/favicon.svg"/);
});
