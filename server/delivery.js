// What happens after a lead is saved: checklist download link and emails.
// Runs only after the transaction has committed, so an email problem can never
// corrupt or lose a lead. Each outcome is written back to the lead record.
import { createDownloadToken } from './tokens.js';
import { createMailer, readEmailConfig } from './email/mailer.js';
import { checklistDeliveryEmail, consultationAckEmail, internalAlertEmail } from './email/templates.js';

const now = () => new Date().toISOString();
const outcome = (r) => ({ state: r.status, ...(r.id ? { providerId: r.id } : {}), ...(r.error ? { error: r.error } : {}), at: now() });

export async function afterLeadSaved({ kind, lead, reference, duplicate, store, env, requestOrigin, log, mailer }) {
  const config = readEmailConfig(env);
  const mail = mailer ?? createMailer(config);
  const full = { ...lead, reference };
  const result = {};
  const siteUrl = config.siteUrl || requestOrigin;

  if (kind === 'checklist') {
    if (env.DOWNLOAD_TOKEN_SECRET) {
      result.downloadUrl = `/api/checklist-download?t=${createDownloadToken(reference, env.DOWNLOAD_TOKEN_SECRET)}`;
    } else {
      log('error', 'download_not_configured', { kind, reference });
    }
  }

  // A repeat of an earlier submission: give the link again, but never re-send emails.
  if (duplicate) return result;

  const jobs = {};
  if (kind === 'checklist') {
    jobs.checklistDelivery = result.downloadUrl
      ? mail.send({ to: full.contact.email, ...checklistDeliveryEmail({ lead: full, downloadUrl: siteUrl + result.downloadUrl }), idempotencyKey: `${reference}-checklist` })
      : Promise.resolve({ status: 'failed', error: 'no-download-link' });
  } else {
    jobs.acknowledgement = full.contact.email
      ? mail.send({ to: full.contact.email, ...consultationAckEmail({ lead: full }), idempotencyKey: `${reference}-ack` })
      : Promise.resolve({ status: 'skipped-no-email' });
  }
  jobs.internalAlert = config.alertTo.length
    ? mail.send({ to: config.alertTo, ...internalAlertEmail({ lead: full }), idempotencyKey: `${reference}-alert`, replyTo: full.contact.email || undefined })
    : Promise.resolve({ status: mail.configured ? 'failed' : 'not-configured', ...(mail.configured ? { error: 'no-alert-recipient' } : {}) });

  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(Object.values(jobs));
  const patch = {};
  settled.forEach((s, i) => {
    patch[names[i]] = outcome(s.status === 'fulfilled' ? s.value : { status: 'failed', error: 'exception' });
  });

  try {
    await store.updateEmailStatus(reference, patch);
  } catch (e) {
    log('error', 'email_status_save_failed', { kind, reference, error: e?.code ?? e?.name ?? 'unknown' });
  }
  for (const [name, o] of Object.entries(patch)) {
    log(o.state === 'failed' ? 'error' : 'info', 'email_outcome', { kind, reference, email: name, state: o.state, error: o.error });
  }

  const visitorEmail = patch.checklistDelivery ?? patch.acknowledgement;
  result.emailed = visitorEmail?.state === 'sent'; // accepted by the provider, not proof of inbox delivery
  return result;
}
