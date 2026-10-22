import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { leadKinds, sources, sourceLabel, statuses } from '../content/pipeline.js';
import { serviceOptions } from '../content/forms.js';
import { api, date, naira } from './api.js';
import { Button, Notice, StatusBadge, inputClass } from './parts.jsx';

const emptyFilters = { status: '', kind: '', source: '', service: '', followup: '', due: '' };

function Select({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function LeadList({ user, onOpen }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const params = useMemo(() => Object.fromEntries(Object.entries({ ...filters, q: query }).filter(([, v]) => v)), [filters, query]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .leads(params)
        .then((d) => live && (setData(d), setError(null)))
        .catch((e) => live && setError(e))
        .finally(() => live && setLoading(false));
    }, 250); // small debounce for typing in search
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [params]);

  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  const active = Object.values(params).some(Boolean);

  return (
    <div className="flex flex-col gap-space-md">
      {/* Pipeline counts (over the most recent leads loaded) */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Filter by stage">
        <button
          onClick={() => set('status')('')}
          className={`shrink-0 min-h-[40px] px-3 rounded-full border font-label-md text-label-md ${!filters.status ? 'bg-primary-container text-white border-primary-container' : 'bg-surface-container-lowest border-surface-container-high'}`}
        >
          All {data ? `· ${data.scanned}` : ''}
        </button>
        {statuses.map((s) => (
          <button
            key={s.value}
            onClick={() => set('status')(filters.status === s.value ? '' : s.value)}
            aria-pressed={filters.status === s.value}
            className={`shrink-0 min-h-[40px] px-3 rounded-full border font-label-md text-label-md whitespace-nowrap ${filters.status === s.value ? 'bg-primary-container text-white border-primary-container' : 'bg-surface-container-lowest border-surface-container-high'}`}
          >
            {s.label} · {data?.counts?.[s.value] ?? 0}
          </button>
        ))}
      </div>

      <div className="grid gap-space-sm sm:grid-cols-2 lg:grid-cols-5 items-end">
        <div className="flex gap-2 items-end sm:col-span-2 lg:col-span-2">
          <label className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Search</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, business, phone or ADZ- ref"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="more-filters"
            className="sm:hidden shrink-0 min-h-[44px] px-3 rounded-lg border border-surface-container-high bg-surface-container-lowest flex items-center gap-1 font-label-md text-label-md"
          >
            <Icon name="tune" className="text-[18px] text-secondary" />
            Filters{['kind', 'source', 'service', 'followup', 'due'].filter((k) => filters[k]).length ? ` · ${['kind', 'source', 'service', 'followup', 'due'].filter((k) => filters[k]).length}` : ''}
          </button>
        </div>
        <div id="more-filters" className={`${showFilters ? 'grid' : 'hidden'} sm:contents gap-space-sm`}>
          <Select label="Type" value={filters.kind} onChange={set('kind')} options={leadKinds} />
          <Select label="Source" value={filters.source} onChange={set('source')} options={sources} />
          <Select label="Service" value={filters.service} onChange={set('service')} options={serviceOptions} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {[
          ['followup', 'Follow-up due'],
          ['due', 'Retention review due'],
        ].map(([k, label]) => (
          <label key={k} className="min-h-[40px] px-3 rounded-full border border-surface-container-high bg-surface-container-lowest flex items-center gap-2 font-label-md text-label-md cursor-pointer">
            <input type="checkbox" className="accent-secondary w-4 h-4" checked={filters[k] === '1'} onChange={(e) => set(k)(e.target.checked ? '1' : '')} />
            {label}
          </label>
        ))}
        {active && (
          <button onClick={() => (setFilters(emptyFilters), setQuery(''))} className="min-h-[40px] px-3 text-secondary font-label-md text-label-md underline">
            Clear filters
          </button>
        )}
        {user.role === 'admin' && (
          <a href={api.exportUrl(params)} className="ml-auto min-h-[40px] px-3 rounded-lg border border-surface-container-high bg-surface-container-lowest flex items-center gap-1.5 font-label-md text-label-md hover:border-secondary/40" data-testid="export-csv">
            <Icon name="download" className="text-[18px] text-secondary" />
            Export CSV
          </a>
        )}
      </div>

      {error && <Notice>Couldn’t load leads ({error.message}). Check your connection and try again.</Notice>}

      <div aria-live="polite" className="sr-only">
        {loading ? 'Loading leads' : data ? `${data.leads.length} leads shown` : ''}
      </div>

      {data && data.leads.length === 0 && !loading && (
        <div className="text-center py-space-xl text-on-surface-variant font-body-md text-body-md" data-testid="no-leads">
          {active ? 'No leads match these filters.' : 'No leads yet. New checklist and consultation requests will appear here.'}
        </div>
      )}

      <ul className={`flex flex-col gap-2 ${loading ? 'opacity-60' : ''}`} data-testid="lead-list">
        {data?.leads.map((l) => (
          <li key={l.reference}>
            <button
              onClick={() => onOpen(l.reference)}
              className="w-full text-left bg-surface-container-lowest rounded-xl border border-surface-container-high/70 p-3.5 hover:border-secondary/40 transition-colors grid gap-1.5 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <span className="min-w-0 flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-label-lg text-label-lg text-on-surface truncate">{l.business || l.name}</span>
                  <StatusBadge status={l.status} />
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                  {l.business ? `${l.name} · ` : ''}
                  {l.kind === 'checklist' ? 'Checklist' : serviceOptions.find((s) => s.value === l.service)?.label ?? 'Consultation'} · {sourceLabel(l.source)}
                </span>
              </span>
              <span className="flex sm:flex-col sm:items-end gap-x-3 gap-y-0.5 font-body-sm text-body-sm text-on-surface-variant">
                <span className="font-mono">{l.reference}</span>
                <span>{date(l.createdAt)}</span>
                {l.followUpAt && <span className="text-secondary font-semibold">Follow up {date(l.followUpAt)}</span>}
                {l.wonValue ? <span className="text-secondary font-semibold">Won {naira(l.wonValue)}</span> : l.proposalValue ? <span>Proposal {naira(l.proposalValue)}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {data?.nextCursor && (
        <p className="font-body-sm text-body-sm text-on-surface-variant text-center">
          Showing the most recent {data.scanned} leads. Use search or export for older ones.
        </p>
      )}
      {loading && !data && <p className="text-center text-on-surface-variant py-space-lg">Loading leads…</p>}
      <Button variant="quiet" className="self-center" onClick={() => setFilters((f) => ({ ...f }))}>
        <Icon name="refresh" className="text-[18px]" /> Refresh
      </Button>
    </div>
  );
}
