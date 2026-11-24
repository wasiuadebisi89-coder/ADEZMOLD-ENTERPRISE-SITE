import { useState } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '../components/ui/button';
import { Spinner } from '../components/ui/feedback';
import { isStaleBuildError, reloadForNewBuild } from '../lib/staleBuild';

/**
 * Shown instead of React Router's "Unexpected Application Error!" page. When the error is a stale
 * build (the page was opened before a deploy), the page reloads once to fetch the new version.
 */
export default function RouteError() {
  const error = useRouteError();
  const stale = isStaleBuildError(error);
  // Decided once, on first render: true when a reload has been started.
  const [reloading] = useState(() => stale && reloadForNewBuild());

  if (reloading) return <Spinner label="Updating to the latest version" />;

  const title = stale ? 'A new version of BMS is available' : 'Something went wrong';
  const detail = stale
    ? 'BMS was updated while this page was open. Reload to continue; nothing you saved is lost.'
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : error instanceof Error
        ? error.message
        : 'An unexpected error occurred.';

  return (
    <div role="alert" className="mx-auto mt-24 max-w-md px-4 text-center">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </div>
  );
}
