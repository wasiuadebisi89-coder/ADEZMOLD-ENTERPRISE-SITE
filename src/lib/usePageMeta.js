import { useEffect } from 'react';
import { pageByPath } from '../content/seo.js';

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    const [, key, name] = selector.match(/\[(\w+)="([^"]+)"\]/);
    el.setAttribute(key, name);
    document.head.append(el);
  }
  el.setAttribute(attr, value);
}

/** Keeps title/description/Open Graph in step with client-side navigation. */
export default function usePageMeta(pathname) {
  useEffect(() => {
    const page = pageByPath[pathname];
    if (!page) return; // e.g. not-found page sets its own title
    document.title = page.title;
    setMeta('meta[name="description"]', 'content', page.description);
    setMeta('meta[property="og:title"]', 'content', page.title);
    setMeta('meta[property="og:description"]', 'content', page.description);
    const canonical = document.head.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = new URL(page.path, canonical.href).href;
    const ogUrl = document.head.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.content = new URL(page.path, ogUrl.content).href;
  }, [pathname]);
}
