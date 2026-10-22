import { useEffect, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { getAttributionChoice, setAttributionChoice } from '../lib/attribution.js';

// Asks once before remembering how the visitor found the site (GAID 2025 Art. 19:
// non-essential cookies and similar tools need an explicit accept/reject choice,
// shown without scrolling). Equal-weight buttons; declining changes nothing else.
export default function ConsentBanner() {
  const [choice, setChoice] = useState(getAttributionChoice);

  useEffect(() => {
    const sync = () => setChoice(getAttributionChoice());
    window.addEventListener('adz-attribution-choice', sync);
    return () => window.removeEventListener('adz-attribution-choice', sync);
  }, []);

  if (choice) return null;

  return (
    <section
      aria-label="Privacy choice"
      data-testid="consent-banner"
      className="fixed inset-x-0 bottom-16 md:bottom-0 z-[55] px-gutter-mobile pb-2 md:pb-4 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-xl border border-surface-container-high bg-surface-container-lowest shadow-[0_8px_30px_-6px_rgba(10,25,47,0.25)] p-3.5 md:p-4 flex flex-col md:flex-row md:items-center gap-3">
        <p className="font-body-sm text-body-sm text-on-surface flex-1">
          May we remember which link brought you here (for example a LinkedIn post)? It helps us see which content is useful. Stored only in
          this browser tab, with no tracking cookies or third parties.{' '}
          <Link to="/privacy#browser-storage" className="text-secondary font-semibold underline">
            Details
          </Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAttributionChoice('denied')}
            className="flex-1 md:flex-none min-h-[44px] px-4 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface font-label-lg text-label-lg"
          >
            No thanks
          </button>
          <button
            type="button"
            onClick={() => setAttributionChoice('granted')}
            className="flex-1 md:flex-none min-h-[44px] px-4 rounded-lg bg-secondary text-on-secondary font-label-lg text-label-lg"
          >
            Allow
          </button>
        </div>
      </div>
    </section>
  );
}

/** Lets visitors change their mind later (used on the privacy page). */
export function AttributionPreference() {
  const [choice, setChoice] = useState(getAttributionChoice);
  useEffect(() => {
    const sync = () => setChoice(getAttributionChoice());
    window.addEventListener('adz-attribution-choice', sync);
    return () => window.removeEventListener('adz-attribution-choice', sync);
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="attribution-preference">
      <span className="font-body-md text-body-md text-on-surface">
        Your current choice: <strong>{choice === 'granted' ? 'allowed' : choice === 'denied' ? 'not allowed' : 'not chosen yet'}</strong>.
      </span>
      {choice !== 'denied' && (
        <button type="button" onClick={() => setAttributionChoice('denied')} className="min-h-[40px] px-3 rounded-lg border border-outline-variant font-label-md text-label-md">
          Turn off
        </button>
      )}
      {choice !== 'granted' && (
        <button type="button" onClick={() => setAttributionChoice('granted')} className="min-h-[40px] px-3 rounded-lg border border-outline-variant font-label-md text-label-md">
          Allow
        </button>
      )}
    </div>
  );
}
