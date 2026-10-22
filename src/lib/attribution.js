// Lead-source attribution, with the visitor's consent.
// If the visitor allows it (consent banner), the first page they land on in this
// browser tab is remembered in sessionStorage: UTM tags and the referring site's
// hostname only. No cookies, no third-party trackers. If they decline, or have not
// chosen yet, nothing is stored and forms are sent with no source information.

const KEY = 'adz_attribution_v1';
const CHOICE_KEY = 'adz_attribution_choice_v1'; // 'granted' | 'denied' (remembering the choice is strictly necessary)
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const LINKEDIN_HOSTS = /(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/i;

const store = (kind) => {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};
const read = (kind, key) => {
  try {
    return store(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const write = (kind, key, value) => {
  try {
    if (value === null) store(kind)?.removeItem(key);
    else store(kind)?.setItem(key, value);
  } catch {
    /* storage blocked: behave as if nothing was stored */
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

// Captured in memory on first load. It only reaches storage if the visitor allows it.
let landing = null;

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

export function getAttributionChoice() {
  const v = read('local', CHOICE_KEY);
  return v === 'granted' || v === 'denied' ? v : null;
}

export function setAttributionChoice(choice) {
  write('local', CHOICE_KEY, choice);
  if (choice === 'granted') {
    if (landing && !read('session', KEY)) write('session', KEY, JSON.stringify(landing));
  } else {
    write('session', KEY, null);
  }
  window.dispatchEvent(new Event('adz-attribution-choice'));
}

/** Call once on app start. */
export function captureAttribution() {
  landing = fromCurrentPage();
  if (getAttributionChoice() !== 'granted') return;
  const stored = read('session', KEY);
  if (!stored || landing.utm_source) write('session', KEY, JSON.stringify(landing)); // a new campaign link replaces the old one
}

/** Attribution attached to a form submission: empty unless the visitor allowed it. */
export function getAttribution() {
  const formPath = window.location.pathname.slice(0, 200);
  if (getAttributionChoice() !== 'granted') return { formPath };
  let saved = null;
  try {
    saved = JSON.parse(read('session', KEY) || 'null');
  } catch {
    saved = null;
  }
  return { ...(saved ?? landing ?? fromCurrentPage()), formPath };
}
