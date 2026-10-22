// Transactional email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
// No SDK needed. If RESEND_API_KEY / EMAIL_FROM are not set, the mailer reports
// "not-configured" and sends nothing: forms keep working, leads are still saved.

const RESEND_URL = 'https://api.resend.com/emails';

export function readEmailConfig(env = process.env) {
  const list = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    apiKey: env.RESEND_API_KEY ?? '',
    from: env.EMAIL_FROM ?? '', // e.g. "Adezmold Business Consulting <hello@yourdomain.com>"
    replyTo: env.EMAIL_REPLY_TO ?? '',
    alertTo: list(env.LEAD_ALERT_TO), // Adezmold staff who receive new-lead alerts
    siteUrl: (env.SITE_URL ?? '').replace(/\/+$/, ''), // e.g. https://yourdomain.com (for links in emails)
  };
}

/**
 * @returns {{ configured: boolean, send: (msg) => Promise<{status:'sent'|'failed'|'not-configured', id?:string, error?:string}> }}
 * "sent" means Resend accepted the message for delivery. It does NOT prove it reached the inbox.
 */
export function createMailer(config, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const configured = Boolean(config.apiKey && config.from);
  return {
    configured,
    async send({ to, subject, html, text, idempotencyKey, replyTo }) {
      if (!configured) return { status: 'not-configured' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(RESEND_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            // Resend ignores repeats with the same key, so a retried request never sends twice.
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          },
          body: JSON.stringify({
            from: config.from,
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
            text,
            ...(replyTo || config.replyTo ? { reply_to: replyTo || config.replyTo } : {}),
          }),
          signal: controller.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.id) return { status: 'sent', id: body.id };
        return { status: 'failed', error: `http-${res.status}${body?.name ? `-${body.name}` : ''}` };
      } catch (e) {
        return { status: 'failed', error: e.name === 'AbortError' ? 'timeout' : 'network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
