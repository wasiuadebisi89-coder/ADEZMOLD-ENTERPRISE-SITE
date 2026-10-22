// GET /api/checklist-download?t=<token>
// Serves the checklist PDF only for a valid, unexpired signed link. The PDF is
// not in the public site folder, so it cannot be fetched any other way.
import { readFile } from 'node:fs/promises';
import { verifyDownloadToken } from './tokens.js';

const PDF_URL = new URL('./assets/produce-business-health-checklist.pdf', import.meta.url);
let cached;
const defaultReadPdf = async () => (cached ??= await readFile(PDF_URL));

function page(res, status, title, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#0b1c30;line-height:1.6">
<h1 style="font-size:22px">${title}</h1><p>${message}</p><p><a href="/checklist" style="color:#1b4332;font-weight:bold">Request the checklist again</a></p></body>`);
}

export function createDownloadHandler({ getStore, env = process.env, readPdf = defaultReadPdf }) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      return res.end();
    }
    const token = new URL(req.url, 'http://x').searchParams.get('t');
    const check = verifyDownloadToken(token, env.DOWNLOAD_TOKEN_SECRET);
    if (!check.ok) {
      console.warn(JSON.stringify({ event: 'download_rejected', reason: check.reason }));
      return check.reason === 'expired'
        ? page(res, 410, 'This link has expired', 'Download links work for 7 days. Request the checklist again and we will give you a fresh link.')
        : page(res, 403, 'This link is not valid', 'The download link is incomplete or has been changed. Please request the checklist again.');
    }

    const pdf = await readPdf();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdf.length));
    res.setHeader('Content-Disposition', 'attachment; filename="Adezmold-Produce-Business-Health-Checklist.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'HEAD') return res.end();

    // Best-effort: note the download on the lead (helps prioritise follow-up).
    try {
      await getStore().recordDownload(check.reference);
    } catch (e) {
      console.warn(JSON.stringify({ event: 'download_record_failed', reference: check.reference, error: e?.code ?? e?.name ?? 'unknown' }));
    }
    console.info(JSON.stringify({ event: 'checklist_downloaded', reference: check.reference }));
    return res.end(pdf);
  };
}
