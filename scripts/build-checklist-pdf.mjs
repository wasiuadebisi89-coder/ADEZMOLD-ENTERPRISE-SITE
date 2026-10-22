// Generates the downloadable checklist PDF from src/content/checklist.js, so the
// PDF and the website always list the same 25 checks.
//   npm run build:pdf   ->  server/assets/produce-business-health-checklist.pdf
// The output is committed; re-run this after editing the checklist content.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { checklistSections, checklistTitle, checklistItemCount } from '../src/content/checklist.js';
import { site } from '../src/config/site.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PDF_PATH = path.join(root, 'server/assets/produce-business-health-checklist.pdf');

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  navy: hex('#0a192f'),
  green: hex('#1b4332'),
  greenTint: hex('#c2e9d1'),
  gold: hex('#d4af37'),
  goldLight: hex('#ffd782'),
  ink: hex('#0b1c30'),
  muted: hex('#44474d'),
  line: hex('#dce9ff'),
  panel: hex('#eff4ff'),
  white: rgb(1, 1, 1),
};

const W = 595.28; // A4
const H = 841.89;
const M = 48; // margin

export async function buildChecklistPdf() {
  const doc = await PDFDocument.create();
  doc.setTitle(checklistTitle);
  doc.setAuthor(site.name);
  doc.setSubject('Self-assessment checklist for produce businesses');
  doc.setCreator(site.name);
  doc.setProducer(site.name);
  doc.setCreationDate(new Date('2026-10-01T00:00:00Z')); // fixed, so rebuilds are reproducible
  doc.setModificationDate(new Date('2026-10-01T00:00:00Z'));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const wrap = (text, font, size, width) => {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };

  let page;
  let y;
  const pages = [];
  const newPage = (first = false) => {
    page = doc.addPage([W, H]);
    pages.push(page);
    if (first) {
      page.drawRectangle({ x: 0, y: H - 190, width: W, height: 190, color: C.navy });
      page.drawRectangle({ x: 0, y: H - 194, width: W, height: 4, color: C.gold });
      page.drawText('FREE EXECUTIVE RESOURCE', { x: M, y: H - 58, size: 9, font: bold, color: C.goldLight });
      let ty = H - 92;
      for (const l of wrap(checklistTitle, bold, 24, W - 2 * M)) {
        page.drawText(l, { x: M, y: ty, size: 24, font: bold, color: C.white });
        ty -= 30;
      }
      page.drawText(`${site.name}  |  ${site.contact.phoneDisplay}`, { x: M, y: H - 172, size: 9.5, font: regular, color: hex('#b9c7e4') });
      y = H - 230;
    } else {
      page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: C.navy });
      page.drawText(checklistTitle, { x: M, y: H - 34, size: 8.5, font: bold, color: C.muted });
      y = H - 64;
    }
  };
  const ensure = (needed) => {
    if (y - needed < 70) newPage();
  };
  const para = (text, { size = 10.5, font = regular, color = C.ink, x = M, width = W - 2 * M, gap = 4 } = {}) => {
    for (const l of wrap(text, font, size, width)) {
      ensure(size + gap);
      page.drawText(l, { x, y, size, font, color });
      y -= size + gap;
    }
  };

  // ---- Page 1: how to use ----
  newPage(true);
  para('Find where money slips away between buying, transport, storage and sales collections, before your next shipment.', { size: 12, color: C.muted, gap: 6 });
  y -= 14;

  const howTo = [
    'Go through each check honestly. Tick the box only if it is true in your business today, not "most of the time".',
    'Involve the person who handles cash and the person who handles stock. Their answers often differ from the owner’s.',
    'Count your ticks at the end and look first at the sections with the most empty boxes.',
  ];
  const boxTop = y;
  const lines = howTo.map((t) => wrap(t, regular, 10, W - 2 * M - 46));
  const boxH = 34 + lines.reduce((n, l) => n + l.length * 14 + 6, 0);
  page.drawRectangle({ x: M, y: boxTop - boxH, width: W - 2 * M, height: boxH, color: C.panel, borderColor: C.line, borderWidth: 1 });
  page.drawText('HOW TO USE THIS CHECKLIST', { x: M + 16, y: boxTop - 22, size: 9, font: bold, color: C.green });
  y = boxTop - 42;
  lines.forEach((ls, i) => {
    page.drawCircle({ x: M + 24, y: y + 3.5, size: 7, color: C.green });
    page.drawText(String(i + 1), { x: M + 21.5, y, size: 8, font: bold, color: C.white });
    for (const l of ls) {
      page.drawText(l, { x: M + 40, y, size: 10, font: regular, color: C.ink });
      y -= 14;
    }
    y -= 6;
  });
  y = boxTop - boxH - 26;

  // ---- The checks ----
  let n = 0;
  for (const section of checklistSections) {
    ensure(70);
    page.drawRectangle({ x: M, y: y - 6, width: 4, height: 20, color: C.green });
    page.drawText(section.title.toUpperCase(), { x: M + 12, y, size: 10.5, font: bold, color: C.green });
    const count = `${section.items.length} checks`;
    page.drawText(count, { x: W - M - regular.widthOfTextAtSize(count, 9), y, size: 9, font: regular, color: C.muted });
    y -= 24;
    for (const item of section.items) {
      n += 1;
      const ls = wrap(item, regular, 10.5, W - 2 * M - 62);
      ensure(ls.length * 15 + 12);
      page.drawRectangle({ x: M + 2, y: y - 3, width: 13, height: 13, borderColor: C.green, borderWidth: 1.2 });
      page.drawText(String(n).padStart(2, '0'), { x: M + 24, y, size: 9.5, font: bold, color: C.muted });
      for (const l of ls) {
        page.drawText(l, { x: M + 50, y, size: 10.5, font: regular, color: C.ink });
        y -= 15;
      }
      y -= 6;
      page.drawLine({ start: { x: M + 50, y: y + 7 }, end: { x: W - M, y: y + 7 }, thickness: 0.5, color: C.line });
    }
    y -= 12;
  }

  // ---- Score + next step ----
  ensure(260);
  page.drawText('YOUR SCORE', { x: M, y, size: 10.5, font: bold, color: C.green });
  y -= 20;
  page.drawText(`Boxes ticked:  ______  out of ${checklistItemCount}`, { x: M, y, size: 12, font: bold, color: C.ink });
  y -= 22;
  para('A rough guide, not a grade: fewer ticks means more places where cash, stock or credit can leak without anyone noticing. Start with the section that has the most empty boxes.', { size: 10, color: C.muted });
  y -= 16;

  const ctaH = 96;
  page.drawRectangle({ x: M, y: y - ctaH, width: W - 2 * M, height: ctaH, color: C.navy });
  page.drawRectangle({ x: M, y: y - ctaH, width: 4, height: ctaH, color: C.gold });
  page.drawText('Want a second pair of eyes on your answers?', { x: M + 20, y: y - 28, size: 13, font: bold, color: C.white });
  const ctaText = wrap('Book a confidential discovery session with Adezmold. We will look at where control is slipping and what to fix first.', regular, 10, W - 2 * M - 40);
  let cy = y - 48;
  for (const l of ctaText) {
    page.drawText(l, { x: M + 20, y: cy, size: 10, font: regular, color: hex('#b9c7e4') });
    cy -= 14;
  }
  const contactLine = [`Call ${site.contact.phoneDisplay}`, site.contact.email, site.url && site.url.replace(/^https?:\/\//, '') + '/consultation'].filter(Boolean).join('   |   ');
  page.drawText(contactLine, { x: M + 20, y: y - ctaH + 14, size: 10, font: bold, color: C.goldLight });
  y -= ctaH + 24;

  para(
    'This checklist is general educational guidance to help you review your own business. It is not an audit, a certification, or legal, tax or accounting advice, and it does not replace advice on your specific circumstances.',
    { size: 8.5, color: C.muted, gap: 3 },
  );

  // ---- Footers ----
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: C.line });
    p.drawText(`${site.name}  |  ${site.contact.addressLines.join(', ')}`, { x: M, y: 30, size: 7.5, font: regular, color: C.muted });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - regular.widthOfTextAtSize(label, 7.5), y: 30, size: 7.5, font: regular, color: C.muted });
  });

  return doc.save({ useObjectStreams: false });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = await buildChecklistPdf();
  await mkdir(path.dirname(PDF_PATH), { recursive: true });
  await writeFile(PDF_PATH, bytes);
  console.log(`Wrote ${path.relative(root, PDF_PATH)} (${(bytes.length / 1024).toFixed(1)} kB)`);
}
