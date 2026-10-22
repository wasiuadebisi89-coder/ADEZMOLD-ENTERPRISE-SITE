// Page titles and descriptions: used in the browser and written into each page's
// static HTML at build time (vite.config.js), so search engines and LinkedIn's
// link preview see them without running JavaScript.
import { site } from '../config/site.js';

export const pages = [
  {
    path: '/',
    title: `${site.name} | Financial control for produce businesses`,
    description:
      'Adezmold helps Nigerian produce merchants, wholesalers and distributors control cash, cut stock and transit losses, manage buyer credit and build systems staff can run.',
    priority: '1.0',
  },
  {
    path: '/services',
    title: `Services: Health Check, Systems & Advisory | ${site.name}`,
    description:
      'Produce Business Health Check, Business Systems Implementation and Ongoing Business Advisory for Nigerian produce and commodity businesses: scope, process and limits.',
    priority: '0.9',
  },
  {
    path: '/checklist',
    title: `Free 25-Point Produce Business Health Checklist | ${site.name}`,
    description:
      'Free PDF checklist: 25 practical checks across cash, stock, credit, records, margins, staff and reporting to find where your produce business is losing money.',
    priority: '0.9',
  },
  {
    path: '/consultation',
    title: `Book a Confidential Discovery Session | ${site.name}`,
    description: 'Tell us about your produce or commodity business and the problem you want solved. We will contact you to arrange a confidential discovery session.',
    priority: '0.8',
  },
  {
    path: '/about',
    title: `About Adezmold | Business consulting in Iwo, Osun State`,
    description:
      'Adezmold Business Consulting helps Nigerian produce merchants and SMEs become visible, organised and scalable through financial control and stock systems.',
    priority: '0.7',
  },
  {
    path: '/privacy',
    title: `Privacy & Data Protection | ${site.name}`,
    description: 'How Adezmold collects, uses, shares and protects your information, and your rights under the Nigeria Data Protection Act 2023.',
    priority: '0.3',
  },
];

export const pageByPath = Object.fromEntries(pages.map((p) => [p.path, p]));

export const OG_IMAGE = '/og-image.png';

/** Accurate structured data only: verified name, address and phone. No ratings or reviews. */
export function organizationJsonLd(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: site.name,
    ...(siteUrl ? { url: siteUrl, image: `${siteUrl}${OG_IMAGE}` } : {}),
    telephone: site.contact.phoneHref.replace('tel:', ''),
    ...(site.contact.email ? { email: site.contact.email } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: '2, Oluwo Oke Shopping Complex, Agbowo Area, Odo-Ori',
      addressLocality: 'Iwo',
      addressRegion: 'Osun State',
      addressCountry: 'NG',
    },
    areaServed: { '@type': 'Country', name: 'Nigeria' },
    founder: { '@type': 'Person', name: site.founder.name },
    description: pageByPath['/'].description,
    ...([site.social.linkedinCompany, site.social.linkedinProfile].some(Boolean) ? { sameAs: [site.social.linkedinCompany, site.social.linkedinProfile].filter(Boolean) } : {}),
  };
}
