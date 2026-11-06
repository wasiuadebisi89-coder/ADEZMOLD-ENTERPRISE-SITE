import type { ReceiptRowOut } from './receipt';

/**
 * ESC/POS bytes for a laid-out receipt. Only commands every mainstream portable
 * thermal printer understands are used: initialise, align, bold, double size,
 * line feed, feed and cut. Text must already be printable ASCII.
 */
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export function encodeReceipt(rows: readonly ReceiptRowOut[], opts: { cut?: boolean } = {}) {
  const out: number[] = [ESC, 0x40]; // initialise
  let align: 'left' | 'center' = 'left';
  let bold = false;
  let big = false;
  out.push(ESC, 0x61, 0);
  for (const r of rows) {
    if (r.align !== align) {
      align = r.align;
      out.push(ESC, 0x61, align === 'center' ? 1 : 0);
    }
    if (r.bold !== bold) {
      bold = r.bold;
      out.push(ESC, 0x45, bold ? 1 : 0);
    }
    if (r.big !== big) {
      big = r.big;
      out.push(GS, 0x21, big ? 0x11 : 0x00);
    }
    for (const ch of r.text) {
      const code = ch.charCodeAt(0);
      out.push(code >= 0x20 && code <= 0x7e ? code : 0x3f);
    }
    out.push(LF);
  }
  if (bold) out.push(ESC, 0x45, 0);
  if (big) out.push(GS, 0x21, 0);
  out.push(ESC, 0x61, 0);
  out.push(ESC, 0x64, 4); // feed 4 lines so the tear bar clears the text
  if (opts.cut ?? true) out.push(GS, 0x56, 0x42, 0x00); // partial cut, ignored without a cutter
  return Uint8Array.from(out);
}

/** Splits bytes into pieces small enough for one Bluetooth LE write. */
export function chunk(bytes: Uint8Array, size: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) parts.push(bytes.subarray(i, i + size));
  return parts;
}
