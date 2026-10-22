import { useEffect, useRef } from 'react';
import { Link, normalizePath, useLocation } from '../lib/router.jsx';
import { images, site } from '../config/site.js';
import Icon from './Icon.jsx';
import ConsentBanner from './ConsentBanner.jsx';
import usePageMeta from '../lib/usePageMeta.js';

export const navItems = [
  { to: '/', label: 'Home', icon: 'grid_view' },
  { to: '/services', label: 'Services', icon: 'business_center' },
  { to: '/checklist', label: 'Checklist', icon: 'checklist' },
  { to: '/about', label: 'About', icon: 'domain' },
  { to: '/consultation', label: 'Consult', icon: 'calendar_today' },
];

function useIsActive() {
  const { pathname } = useLocation();
  const current = normalizePath(pathname);
  return (to) => current === to;
}

function Header() {
  const isActive = useIsActive();
  return (
    <header className="fixed top-0 w-full z-50 pt-safe bg-surface/90 backdrop-blur-xl border-b border-surface-container-high/60 shadow-[0_4px_20px_-4px_rgba(10,25,47,0.04)]">
      <div className="h-16 px-gutter-mobile md:px-margin-tablet mx-auto max-w-6xl flex items-center justify-between gap-space-sm">
        <Link to="/" className="flex items-center gap-space-sm min-w-0 flex-1 md:flex-none" aria-label={`${site.name}, home`}>
          <img
            src={images.logo.src}
            alt=""
            width="32"
            height="32"
            className="h-8 w-auto object-contain shrink-0 drop-shadow-sm"
          />
          <span className="flex flex-col min-w-0">
            <span className="font-label-md text-label-md text-on-surface truncate tracking-tight font-bold flex items-center gap-1">
              {site.shortName} <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant/80 truncate">{site.descriptor}</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden md:flex items-center gap-1" data-testid="desktop-nav">
          {navItems.slice(0, 4).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive(item.to) ? 'page' : undefined}
              className={`px-3 min-h-[40px] flex items-center rounded-lg font-label-lg text-label-lg transition-colors ${
                isActive(item.to) ? 'text-secondary bg-secondary/10' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-space-xs shrink-0">
          <Link
            to="/consultation"
            className="min-h-[40px] px-3.5 bg-secondary text-on-secondary font-label-sm text-label-sm md:font-label-md md:text-label-md rounded-lg flex items-center justify-center font-semibold shadow-sm hover:bg-secondary/90 transition-all active:scale-[0.98]"
          >
            <span className="md:hidden">Consult</span>
            <span className="hidden md:inline">Book a Consultation</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function ReadProgress() {
  const barRef = useRef(null);
  useEffect(() => {
    const update = () => {
      const el = barRef.current;
      if (!el) return;
      const track = document.documentElement.scrollHeight - window.innerHeight;
      const pct = track > 0 ? (window.scrollY / track) * 100 : 100;
      el.style.width = `${Math.min(100, Math.max(8, pct))}%`;
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return (
    <div className="w-full bg-surface-container-high/60 h-1 sticky top-16 z-30 backdrop-blur-sm" aria-hidden="true">
      <div
        ref={barRef}
        className="h-full bg-gradient-to-r from-secondary via-secondary to-tertiary-fixed-dim transition-all duration-150 shadow-[0_0_8px_rgba(27,67,50,0.4)]"
        style={{ width: '12%' }}
      />
    </div>
  );
}

function Footer() {
  const { contact, social } = site;
  const links = [
    { to: '/about', label: 'Firm Profile' },
    { to: '/services', label: 'Practice Areas' },
    { to: '/checklist', label: 'Free Checklist' },
    { to: '/privacy', label: 'Privacy & Data Protection' },
  ];
  return (
    <footer className="mt-space-xl bg-surface-container-low text-on-surface-variant border-t border-surface-container-high/60">
      <div className="px-gutter-mobile md:px-margin-tablet py-space-lg mx-auto max-w-6xl flex flex-col gap-space-md md:grid md:grid-cols-3 md:gap-space-xl">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-xs">
            <Icon name="verified" className="text-secondary text-[18px]" />
            <span className="font-label-md text-label-md text-on-surface uppercase tracking-wider font-bold">{site.name}</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant text-[13px]">{site.summary}</p>
        </div>

        <address className="not-italic flex flex-col gap-space-xs text-on-surface-variant font-body-sm text-body-sm">
          <div className="flex items-start gap-space-xs">
            <Icon name="location_on" className="text-[16px] text-secondary mt-0.5" />
            <span>
              {contact.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
          </div>
          <a href={contact.phoneHref} className="flex items-center gap-space-xs min-h-[32px] hover:text-on-surface">
            <Icon name="call" className="text-[16px] text-secondary" />
            <span>{contact.phoneDisplay}</span>
          </a>
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-space-xs min-h-[32px] hover:text-on-surface">
              <Icon name="mail" className="text-[16px] text-secondary" />
              <span>{contact.email}</span>
            </a>
          )}
        </address>

        <nav aria-label="Footer" className="flex flex-wrap content-start gap-x-space-md gap-y-space-xs">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface min-h-[44px] flex items-center transition-colors"
            >
              {link.label}
            </Link>
          ))}
          {social.linkedinCompany && (
            <a
              href={social.linkedinCompany}
              target="_blank"
              rel="noopener noreferrer"
              className="font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface min-h-[44px] flex items-center transition-colors"
            >
              LinkedIn
            </a>
          )}
        </nav>

        <div className="md:col-span-3 pt-space-xs font-body-sm text-body-sm text-on-surface-variant border-t border-surface-container-high/40 text-[11px] pt-3">
          © {new Date().getFullYear()} {site.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function BottomNav() {
  const isActive = useIsActive();
  return (
    <nav
      aria-label="Mobile"
      data-testid="bottom-nav"
      className="md:hidden fixed bottom-0 w-full z-50 pb-safe bg-surface/90 backdrop-blur-xl border-t border-surface-container-high/60 shadow-[0_-4px_20px_-4px_rgba(10,25,47,0.04)]"
    >
      <div className="flex items-center justify-around h-16 px-space-xs">
        {navItems.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] w-full transition-all ${
                active ? 'text-secondary font-semibold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name={item.icon} className="text-[20px]" />
              <span className="font-label-sm text-label-sm">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  usePageMeta(normalizePath(pathname));
  const mainRef = useRef(null);
  const firstRender = useRef(true);

  // Move focus to the page content after client-side navigation (screen readers / keyboard users).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface flex flex-col min-h-dvh antialiased">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-surface-container-lowest focus:px-4 focus:py-2 focus:rounded-lg focus:shadow"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 w-full pt-16 pb-20 md:pb-0 bg-surface flex flex-col outline-none">
        <ReadProgress />
        <div className="flex flex-col w-full">{children}</div>
        <Footer />
      </main>
      <BottomNav />
      <ConsentBanner />
    </div>
  );
}
