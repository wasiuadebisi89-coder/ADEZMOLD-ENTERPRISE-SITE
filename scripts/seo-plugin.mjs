// Vite build plugin: after the bundle is written, creates one HTML file per page
// with its own <title>, description, canonical URL, Open Graph / Twitter tags
// (LinkedIn previews read these without running JavaScript), plus sitemap.xml,
// robots.txt and a real 404 page.
//
// The public address comes from SITE_URL, or Vercel's production domain. Without it
// the pages still build, but canonical/og:url/og:image and the sitemap are left out.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pages, OG_IMAGE, organizationJsonLd } from '../src/content/seo.js';
import { site } from '../src/config/site.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function resolveSiteUrl(env = process.env) {
  const raw = env.SITE_URL || site.url || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return raw ? raw.replace(/\/+$/, '') : null;
}

export function headFor(page, siteUrl) {
  const url = siteUrl ? `${siteUrl}${page.path === '/' ? '/' : page.path}` : null;
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    page.noindex ? `<meta name="robots" content="noindex, nofollow" />` : '',
    url && !page.noindex ? `<link rel="canonical" href="${esc(url)}" />` : '',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(site.name)}" />`,
    `<meta property="og:locale" content="en_NG" />`,
    `<meta property="og:title" content="${esc(page.ogTitle ?? page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    url ? `<meta property="og:url" content="${esc(url)}" />` : '',
    siteUrl ? `<meta property="og:image" content="${esc(siteUrl + OG_IMAGE)}" />` : '',
    siteUrl ? `<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />` : '',
    siteUrl ? `<meta property="og:image:alt" content="${esc(`${site.name}: financial control for produce businesses`)}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    page.path === '/' ? `<script type="application/ld+json">${JSON.stringify(organizationJsonLd(siteUrl)).replace(/</g, '\\u003c')}</script>` : '',
  ];
  return tags.filter(Boolean).join('\n    ');
}

export function seoPlugin() {
  let outDir;
  return {
    name: 'adezmold-seo',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    async closeBundle() {
      const siteUrl = resolveSiteUrl();
      const template = await readFile(path.join(outDir, 'index.html'), 'utf8');
      const render = (page) =>
        template.replace(/<title>[\s\S]*?<\/title>\s*<meta\s+name="description"[\s\S]*?\/>/, headFor(page, siteUrl));

      for (const page of pages) {
        const dir = page.path === '/' ? outDir : path.join(outDir, page.path);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, 'index.html'), render(page));
      }
      const extra = [
        { path: '/admin', title: `Lead register | ${site.name}`, description: 'Staff only.', noindex: true },
        { path: '/404', title: `Page not found | ${site.name}`, description: 'The page you were looking for does not exist.', noindex: true },
      ];
      await mkdir(path.join(outDir, 'admin'), { recursive: true });
      await writeFile(path.join(outDir, 'admin/index.html'), render(extra[0]));
      await writeFile(path.join(outDir, '404.html'), render(extra[1]));

      const robots = ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml` : ''].filter(Boolean).join('\n') + '\n';
      await writeFile(path.join(outDir, 'robots.txt'), robots);
      if (siteUrl) {
        const urls = pages
          .map((p) => `  <url><loc>${esc(siteUrl + (p.path === '/' ? '/' : p.path))}</loc><priority>${p.priority}</priority></url>`)
          .join('\n');
        await writeFile(path.join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
      } else {
        this.warn('SITE_URL is not set: canonical links, og:image and sitemap.xml were skipped. Set SITE_URL in Vercel.');
      }
    },
  };
}
