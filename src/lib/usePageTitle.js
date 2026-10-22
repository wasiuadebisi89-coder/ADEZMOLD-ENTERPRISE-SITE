import { useEffect } from 'react';
import { site } from '../config/site.js';

const DEFAULT_TITLE = `${site.name} | Financial control for produce businesses`;

// Per-page <title>. Full meta/Open Graph handling arrives with the SEO stage.
export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${site.name}` : DEFAULT_TITLE;
  }, [title]);
}
