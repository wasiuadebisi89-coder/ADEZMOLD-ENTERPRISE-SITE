import { Link } from '../lib/router.jsx';
import Icon from '../components/Icon.jsx';
import usePageTitle from '../lib/usePageTitle.js';

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
