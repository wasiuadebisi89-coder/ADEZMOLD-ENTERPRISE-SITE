// Server-side settings, read from environment variables (set in Vercel).
// Nothing here is ever sent to the browser.

const list = (v) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

export function readConfig(env = process.env) {
  return {
    // e.g. "https://adezmold.com,https://www.adezmold.com". Empty = same host only.
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    // Secret used to hash IP addresses for rate limiting (raw IPs are never stored).
    rateLimitSalt: env.RATE_LIMIT_SALT ?? '',
    // How long lead records are kept before the retention review (see docs/DATA.md).
    retentionMonths: Number(env.LEAD_RETENTION_MONTHS ?? 24),
    // Bump when the privacy notice text changes, so consent records show which version was shown.
    privacyNoticeVersion: env.PRIVACY_NOTICE_VERSION ?? '2026-10',
    isProduction: env.VERCEL_ENV === 'production',
  };
}

export class ConfigError extends Error {}
