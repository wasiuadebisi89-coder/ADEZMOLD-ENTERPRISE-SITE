import type { Permission } from '@bms/domain';
import { pageHidden } from '../modules';
import { HELP_TOPICS, type HelpTopic } from './topics';

/**
 * Topics this member may read. Company admins read every topic. When the company's business
 * types are given, topics only about areas the company has turned off (such as Production
 * for a trading company) are left out, matching the menu.
 */
export function topicsFor(
  can: (p: Permission) => boolean,
  isAdmin: boolean,
  topics: readonly HelpTopic[] = HELP_TOPICS,
  businessTypes?: ReadonlySet<string>,
): HelpTopic[] {
  const inUse = (t: HelpTopic) =>
    !businessTypes || t.pages.length === 0 || !t.pages.every((p) => pageHidden(p, businessTypes));
  return topics.filter((t) => inUse(t) && (isAdmin || !t.anyOf || t.anyOf.some((p) => can(p))));
}

/** The page part of a company URL: `/c/abc/sales/new` -> `sales/new`. */
export function pageOf(pathname: string): string {
  const m = /^\/c\/[^/]+\/?(.*)$/.exec(pathname);
  return (m?.[1] ?? '').replace(/\/+$/, '');
}

/** Topics for the current page, most specific page first. */
export function topicsForPage(page: string, topics: readonly HelpTopic[]): HelpTopic[] {
  const depth = (t: HelpTopic) =>
    Math.max(
      ...t.pages.map((p) =>
        p === '' ? (page === '' ? 0 : -1) : page === p || page.startsWith(`${p}/`) ? p.length : -1,
      ),
    );
  return topics
    .map((t) => ({ t, d: depth(t) }))
    .filter((x) => x.d >= 0)
    .sort((a, b) => b.d - a.d)
    .map((x) => x.t);
}

const STOP = new Set(
  'a an and are can do does for from how i in is it me my of on or the to what where which who why with you your want'.split(
    ' ',
  ),
);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\*\*/g, '')
    .split(/[^a-z0-9&]+/)
    .filter((w) => w && !STOP.has(w));
}

/** Crude stem so "refunds", "refunding" and "refund" match. */
function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/, '') || w;
}

function matches(token: string, field: string[]): boolean {
  const s = stem(token);
  return field.some((w) => w === token || stem(w) === s || (s.length >= 4 && w.startsWith(s)));
}

/** Ranks topics against a free-text question. Topics with no matching word are left out. */
export function searchTopics(query: string, topics: readonly HelpTopic[]): HelpTopic[] {
  const tokens = [...new Set(words(query))];
  if (tokens.length === 0) return [];
  const scored = topics.map((t) => {
    const title = words(t.title);
    const keywords = words(t.keywords ?? '');
    const body = words([t.summary, ...(t.steps ?? []), ...(t.tips ?? [])].join(' '));
    let score = 0;
    let hits = 0;
    for (const tok of tokens) {
      const s = matches(tok, title) ? 3 : matches(tok, keywords) ? 2 : matches(tok, body) ? 1 : 0;
      if (s) hits++;
      score += s;
    }
    // Favour topics that answer more of the question's words.
    return { t, score: score * (hits / tokens.length) };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
}
