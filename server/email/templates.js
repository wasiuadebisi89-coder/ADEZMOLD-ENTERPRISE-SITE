// Email content. Every value from a form is HTML-escaped. Plain-text versions
// are included for email clients that block HTML.
import { site } from '../../src/config/site.js';
import { businessSizes, businessTypes, challenges, contactMethods, recordStates, serviceOptions, timeframes } from '../../src/content/forms.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const label = (list, value) => list.find((o) => o.value === value)?.label ?? value ?? '—';
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there';

const contactFooter = () =>
  [site.name, site.contact.addressLines.join(', '), site.contact.phoneDisplay, site.contact.email].filter(Boolean).join(' · ');

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f8f9ff;font-family:Arial,Helvetica,sans-serif;color:#0b1c30">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dce9ff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0a192f;padding:20px 24px;border-bottom:4px solid #d4af37">
<div style="color:#ffd782;font-size:11px;letter-spacing:.08em;font-weight:bold">${esc(site.name.toUpperCase())}</div>
<div style="color:#ffffff;font-size:20px;font-weight:bold;margin-top:6px">${esc(title)}</div></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;background:#eff4ff;color:#44474d;font-size:12px;line-height:1.5">${esc(contactFooter())}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href, text) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#1b4332;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${esc(text)}</a></p>`;

export function checklistDeliveryEmail({ lead, downloadUrl }) {
  const name = firstName(lead.contact.fullName);
  const subject = 'Your Produce Business Health Checklist';
  const html = layout(
    'Your checklist is ready',
    `<p>Hello ${esc(name)},</p>
<p>Thank you for requesting the 25-Point Produce Business Health Checklist. Download it here:</p>
${button(downloadUrl, 'Download the checklist (PDF)')}
<p style="color:#44474d;font-size:13px">This link works for 7 days. If it has expired, request the checklist again on our website.</p>
<p>Go through each check with the people who handle your cash and your stock. If you would like a second pair of eyes on your answers, reply to this email or call ${esc(site.contact.phoneDisplay)}.</p>
<p>Reference: <strong>${esc(lead.reference)}</strong></p>`,
  );
  const text = `Hello ${name},

Thank you for requesting the 25-Point Produce Business Health Checklist.
Download it here (link works for 7 days): ${downloadUrl}

If you would like a second pair of eyes on your answers, reply to this email or call ${site.contact.phoneDisplay}.

Reference: ${lead.reference}
${contactFooter()}`;
  return { subject, html, text };
}

export function consultationAckEmail({ lead }) {
  const name = firstName(lead.contact.fullName);
  const how = label(contactMethods, lead.contact.preferredContact).toLowerCase();
  const subject = `We received your consultation request (${lead.reference})`;
  const html = layout(
    'Request received',
    `<p>Hello ${esc(name)},</p>
<p>Thank you for contacting Adezmold. We have received your consultation request for <strong>${esc(lead.business.name)}</strong>.</p>
<p>We will contact you by ${esc(how)} to arrange a confidential discovery session. There is no obligation to proceed.</p>
<p>Your reference: <strong>${esc(lead.reference)}</strong></p>
<p>If anything is urgent, call us on ${esc(site.contact.phoneDisplay)}.</p>`,
  );
  const text = `Hello ${name},

Thank you for contacting Adezmold. We have received your consultation request for ${lead.business.name}.
We will contact you by ${how} to arrange a confidential discovery session. There is no obligation to proceed.

Your reference: ${lead.reference}
If anything is urgent, call us on ${site.contact.phoneDisplay}.

${contactFooter()}`;
  return { subject, html, text };
}

// Internal alert to Adezmold staff. Contains the lead's details, so it only goes to LEAD_ALERT_TO.
export function internalAlertEmail({ lead }) {
  const c = lead.kind === 'consultation';
  const rows = [
    ['Reference', lead.reference],
    ['Type', c ? 'Consultation request' : 'Checklist download'],
    ['Name', lead.contact.fullName],
    ['Business', lead.business.name],
    ['Business type', label(businessTypes, lead.business.type)],
    ...(c
      ? [
          ['Size', label(businessSizes, lead.business.size)],
          ['Phone', lead.contact.phone],
          ['Email', lead.contact.email],
          ['Prefers', label(contactMethods, lead.contact.preferredContact)],
          ['Service', label(serviceOptions, lead.inquiry.service)],
          ['Main challenge', label(challenges, lead.inquiry.challenge)],
          ['Records', label(recordStates, lead.inquiry.recordsState)],
          ['Timeframe', label(timeframes, lead.inquiry.timeframe)],
          ['Notes', lead.inquiry.additionalInfo],
        ]
      : [['Email', lead.contact.email]]),
    ['Source', [lead.attribution.source, lead.attribution.utm_campaign].filter(Boolean).join(' / ')],
    ['Marketing consent', lead.marketingConsent ? 'Yes' : 'No'],
  ].filter(([, v]) => v);

  const subject = `New ${c ? 'consultation request' : 'checklist lead'}: ${lead.business.name || lead.contact.fullName} (${lead.reference})`;
  const html = layout(
    c ? 'New consultation request' : 'New checklist lead',
    `<table role="presentation" cellpadding="6" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse">
${rows.map(([k, v]) => `<tr><td style="color:#44474d;vertical-align:top;width:140px;border-bottom:1px solid #eff4ff">${esc(k)}</td><td style="border-bottom:1px solid #eff4ff;white-space:pre-wrap">${esc(v)}</td></tr>`).join('\n')}
</table>`,
  );
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  return { subject, html, text };
}
