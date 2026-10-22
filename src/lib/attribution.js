// Lead-source attribution without tracking scripts or cookies.
// The first page a visitor lands on in this browser tab is recorded in
// sessionStorage (UTM tags + referring site's hostname only), so the source
// survives navigation from a LinkedIn landing page to a form.

const KEY = 'adz_attribution_v1';
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const LINKEDIN_HOSTS = /(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/i;

const safeGet = () => {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};
const safeSet = (v) => {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage blocked: attribution falls back to the current page */
  }
};

const tidy = (v) => (typeof v === 'string' ? v.trim().slice(0, 100) : '') || null;

export function classifySource({ utm_source, utm_medium, referrerHost }) {
  const src = (utm_source || '').toLowerCase();
  if (src.includes('linkedin') || (referrerHost && LINKEDIN_HOSTS.test(referrerHost))) {
    return (utm_medium || '').toLowerCase() === 'paid' ? 'linkedin-paid' : 'linkedin-organic';
  }
  if (src) return 'campaign';
  if (referrerHost) return /google\.|bing\.|duckduckgo\.|yahoo\./i.test(referrerHost) ? 'search' : 'referral';
  return 'direct';
}

function fromCurrentPage() {
  const params = new URLSearchParams(window.location.search);
  const record = {};
  for (const k of UTM) record[k] = tidy(params.get(k));
  let referrerHost = null;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.host !== window.location.host) referrerHost = ref.hostname;
  } catch {
    /* ignore malformed referrer */
  }
  record.referrerHost = referrerHost;
  record.landingPath = window.location.pathname.slice(0, 200);
  record.source = classifySource(record);
  return record;
}

/** Call once on app start. Keeps the first landing; a new UTM link replaces it. */
export function captureAttribution() {
  const current = fromCurrentPage();
  const stored = safeGet();
  if (!stored || current.utm_source) safeSet(current);
}

/** Attribution to attach to a form submission. */
export function getAttribution() {
  return { ...(safeGet() ?? fromCurrentPage()), formPath: window.location.pathname.slice(0, 200) };
}
