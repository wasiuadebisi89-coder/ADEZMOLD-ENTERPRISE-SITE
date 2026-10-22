import { useId, useState } from 'react';
import { Link } from '../lib/router.jsx';
import Icon from './Icon.jsx';

const naira = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

export function estimateAnnualLeakage(monthlyTurnoverMillions, leakagePercent) {
  return Math.round(monthlyTurnoverMillions * 1_000_000 * 12 * (leakagePercent / 100));
}

// Interactive illustration from the approved design. The Stitch version applied
// a fixed 12% as if it were a measured fact; here the rate is the visitor's own
// assumption and the result is labelled as an illustration.
export default function LeakageEstimator() {
  const [turnover, setTurnover] = useState(15);
  const [rate, setRate] = useState(5);
  const turnoverId = useId();
  const rateId = useId();
  const annual = estimateAnnualLeakage(turnover, rate);

  return (
    <section aria-labelledby="estimator-title" className="px-gutter-mobile md:px-margin-tablet py-2">
      <div className="on-dark depth-card-dark bg-gradient-to-br from-primary-container via-[#0d223f] to-primary-container text-surface-container-lowest p-space-md md:p-space-lg rounded-2xl relative overflow-hidden border border-white/10 mx-auto max-w-3xl">
        <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-secondary/30 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -top-12 w-32 h-32 rounded-full bg-tertiary-fixed/15 blur-2xl pointer-events-none" />

        <div className="relative flex items-center justify-between pb-1 border-b border-white/10">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tertiary-container/80 border border-tertiary-fixed/30 text-tertiary-fixed font-label-sm text-label-sm uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary-fixed pulse-dot" />
            <span>Executive Console</span>
          </div>
          <div className="flex items-center gap-1.5 text-on-primary-container text-[12px] font-medium">
            <Icon name="query_stats" className="text-tertiary-fixed text-[18px]" />
            <span>Leakage Estimator</span>
          </div>
        </div>

        <div className="relative flex flex-col gap-1 mt-3">
          <h2 id="estimator-title" className="font-headline-sm text-headline-sm font-bold text-white tracking-tight">
            Produce Transit &amp; Store Leakage
          </h2>
          <p className="font-body-sm text-body-sm text-on-primary-container leading-snug">
            See what an assumed loss rate on transit weight differences and uncollected buyer credit could cost you in a year.
          </p>
        </div>

        <div className="relative flex flex-col gap-2 mt-4 bg-white/5 p-3 rounded-xl border border-white/10 backdrop-blur-sm">
          <div className="flex justify-between items-center font-label-sm text-label-sm">
            <label htmlFor={turnoverId} className="text-surface-container-high/90">
              Monthly turnover:
            </label>
            <output htmlFor={turnoverId} className="text-tertiary-fixed font-bold text-headline-sm tracking-tight" data-testid="turnover-value">
              ₦{turnover}M
            </output>
          </div>
          <input
            id={turnoverId}
            type="range"
            min="3"
            max="50"
            step="1"
            value={turnover}
            onChange={(e) => setTurnover(Number(e.target.value))}
            aria-valuetext={`${turnover} million naira per month`}
            className="range-gold w-full h-2.5 bg-white/20 rounded-lg cursor-pointer accent-tertiary-fixed"
          />
          <div className="flex justify-between text-[11px] text-on-primary-container font-mono" aria-hidden="true">
            <span>₦3M</span>
            <span>₦25M</span>
            <span>₦50M</span>
          </div>

          <div className="flex justify-between items-center font-label-sm text-label-sm mt-2">
            <label htmlFor={rateId} className="text-surface-container-high/90">
              Assumed loss rate:
            </label>
            <output htmlFor={rateId} className="text-tertiary-fixed font-bold text-headline-sm tracking-tight" data-testid="rate-value">
              {rate}%
            </output>
          </div>
          <input
            id={rateId}
            type="range"
            min="1"
            max="15"
            step="1"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            aria-valuetext={`${rate} percent of turnover`}
            className="range-gold w-full h-2.5 bg-white/20 rounded-lg cursor-pointer accent-tertiary-fixed"
          />
          <div className="flex justify-between text-[11px] text-on-primary-container font-mono" aria-hidden="true">
            <span>1%</span>
            <span>8%</span>
            <span>15%</span>
          </div>
        </div>

        <div className="relative bg-gradient-to-r from-white/10 via-white/5 to-white/10 p-3.5 rounded-xl border border-white/15 flex flex-col items-stretch min-[400px]:flex-row min-[400px]:items-center justify-between gap-3 mt-2 shadow-inner">
          <div className="min-w-0">
            <div className="font-body-sm text-body-sm text-surface-container-high/80 text-[11px] uppercase tracking-wider font-semibold">
              Estimated annual leakage:
            </div>
            <div className="font-headline-md text-headline-md text-tertiary-fixed font-extrabold tracking-tight" aria-live="polite" data-testid="annual-value">
              ₦{naira.format(annual)}
            </div>
          </div>
          <Link
            to="/consultation?service=health-check"
            className="min-h-[42px] px-3.5 bg-secondary text-on-secondary font-label-sm text-label-sm rounded-lg flex items-center justify-center gap-1.5 shrink-0 shadow-md hover:bg-secondary/90 active:scale-[0.98] transition-transform font-semibold border border-secondary-fixed/30"
          >
            <span>Stop the Leak</span>
            <Icon name="chevron_right" className="text-[16px]" />
          </Link>
        </div>

        <p className="relative mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-on-primary-container">
          <Icon name="info" className="text-[14px] mt-px" />
          <span>Illustration only, based on the loss rate you choose. Your actual figure can only be established by reviewing your records.</span>
        </p>
      </div>
    </section>
  );
}
