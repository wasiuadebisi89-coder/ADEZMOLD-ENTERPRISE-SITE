// Generates the social preview image (LinkedIn/WhatsApp/X link cards) and app icons.
//   npm run build:images   -> public/og-image.png (1200x630), public/apple-touch-icon.png (180x180)
// Requires Playwright's Chromium (npx playwright install chromium). Output is committed.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { site } from '../src/config/site.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const fontFile = path.join(path.dirname(require.resolve('@fontsource-variable/inter/package.json')), 'files/inter-latin-wght-normal.woff2');
const font = (await readFile(fontFile)).toString('base64');

const base = `@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
*{margin:0;box-sizing:border-box}body{font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}`;

const og = `<!doctype html><html><head><style>${base}
body{width:1200px;height:630px;background:radial-gradient(circle at 85% 110%,rgba(27,67,50,.55),transparent 55%),linear-gradient(135deg,#0a192f,#0d223f 60%,#0a192f);color:#fff;position:relative;overflow:hidden}
.bar{position:absolute;inset:0 0 auto 0;height:10px;background:linear-gradient(90deg,#ffd782,#d4af37,#ffd782)}
.wrap{position:absolute;inset:78px 80px 64px 80px;display:flex;flex-direction:column}
.eyebrow{display:inline-flex;align-self:flex-start;gap:12px;align-items:center;padding:10px 20px;border-radius:999px;border:2px solid rgba(255,215,130,.35);color:#ffd782;font-weight:700;letter-spacing:.08em;font-size:22px;text-transform:uppercase}
.dot{width:12px;height:12px;border-radius:50%;background:#ffd782}
h1{margin-top:38px;font-size:74px;line-height:1.06;font-weight:800;letter-spacing:-.025em;max-width:980px}
h1 span{color:#ffd782}
p{margin-top:26px;font-size:30px;line-height:1.4;color:#b9c7e4;max-width:900px}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:24px;color:#8892b0}
.brand{display:flex;align-items:center;gap:14px;color:#fff;font-weight:700;font-size:28px}
.mark{width:52px;height:52px;border-radius:12px;background:#ffd782;color:#0a192f;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:30px}
</style></head><body><div class="bar"></div><div class="wrap">
<div class="eyebrow"><span class="dot"></span>Advisory for produce SMEs</div>
<h1>Build a produce business you can <span>actually control.</span></h1>
<p>Cash control, stock and transit losses, buyer credit and systems your staff can run.</p>
<div class="foot"><div class="brand"><div class="mark">A</div>${site.name}</div><div>Iwo, Osun State · Nigeria</div></div>
</div></body></html>`;

const icon = (size) => `<!doctype html><html><head><style>${base}
body{width:${size}px;height:${size}px;background:#0a192f;display:flex;align-items:center;justify-content:center;position:relative}
b{color:#ffd782;font-size:${Math.round(size * 0.62)}px;font-weight:800;line-height:1;margin-top:${Math.round(size * 0.04)}px}
i{position:absolute;right:${Math.round(size * 0.18)}px;bottom:${Math.round(size * 0.2)}px;width:${Math.round(size * 0.11)}px;height:${Math.round(size * 0.11)}px;border-radius:50%;background:#2d6a4f}
</style></head><body><b>A</b><i></i></body></html>`;

const browser = await chromium.launch();
async function shot(html, width, height, out) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(root, out) });
  await page.close();
  console.log(`Wrote ${out}`);
}
await shot(og, 1200, 630, 'public/og-image.png');
await shot(icon(180), 180, 180, 'public/apple-touch-icon.png');
await browser.close();

// Favicon as SVG (crisp at every size, tiny file).
await writeFile(
  path.join(root, 'public/favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0a192f"/><text x="31" y="47" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-weight="800" font-size="42" fill="#ffd782">A</text><circle cx="49" cy="46" r="5" fill="#2d6a4f"/></svg>\n`,
);
console.log('Wrote public/favicon.svg');
