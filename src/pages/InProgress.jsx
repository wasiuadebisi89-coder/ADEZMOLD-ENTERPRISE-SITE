import { Link } from '../lib/router.jsx';
import { site } from '../config/site.js';
import Icon from '../components/Icon.jsx';
import usePageTitle from '../lib/usePageTitle.js';

// Clearly-labelled placeholder for pages scheduled in later build stages.
// Each one still gives visitors a working way to reach Adezmold.
export function makeInProgressPage({ title, intro }) {
  return function InProgressPage() {
    usePageTitle(title);
    return (
      <section className="px-gutter-mobile md:px-margin-tablet py-space-xl">
        <div className="mx-auto w-full max-w-2xl flex flex-col gap-space-md" data-testid="in-progress">
          <div className="inline-flex items-center gap-1.5 self-start px-2.5 py-0.5 rounded-full bg-tertiary-fixed/40 text-on-tertiary-fixed-variant font-label-sm text-label-sm font-semibold border border-tertiary-fixed-dim/40">
            <Icon name="construction" className="text-[16px]" />
            <span>Page in progress</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">{title}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">{intro}</p>
          <div className="depth-card bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 flex flex-col gap-space-sm">
            <p className="font-body-md text-body-md text-on-surface">In the meantime, you can reach Adezmold directly:</p>
            <a
              href={site.contact.phoneHref}
              className="min-h-[48px] px-space-md bg-secondary text-on-secondary font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-2 shadow-md hover:bg-secondary/90 font-semibold"
            >
              <Icon name="call" className="text-[20px]" />
              <span>Call {site.contact.phoneDisplay}</span>
            </a>
            {site.contact.email && (
              <a
                href={`mailto:${site.contact.email}`}
                className="min-h-[48px] px-space-md bg-surface-container-lowest text-on-surface font-label-lg text-label-lg rounded-xl flex items-center justify-center gap-2 border border-surface-container-high/80"
              >
                <Icon name="mail" className="text-[20px] text-secondary" />
                <span>{site.contact.email}</span>
              </a>
            )}
          </div>
          <Link to="/" className="self-start min-h-[44px] flex items-center gap-1.5 text-secondary font-label-md text-label-md font-bold">
            <Icon name="arrow_back" className="text-[18px]" />
            <span>Back to home</span>
          </Link>
        </div>
      </section>
    );
  };
}

export function NotFound() {
  usePageTitle('Page not found');
  return (
    <section className="px-gutter-mobile md:px-margin-tablet py-space-xl">
      <div className="mx-auto w-full max-w-2xl flex flex-col gap-space-md" data-testid="not-found">
        <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">Page not found</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">The page you were looking for doesn’t exist or has moved.</p>
        <Link to="/" className="self-start min-h-[44px] flex items-center gap-1.5 text-secondary font-label-md text-label-md font-bold">
          <Icon name="arrow_back" className="text-[18px]" />
          <span>Back to home</span>
        </Link>
      </div>
    </section>
  );
}
