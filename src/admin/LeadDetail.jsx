import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { sourceLabel, statusLabel, statuses } from '../content/pipeline.js';
import { businessSizes, businessTypes, challenges, contactMethods, recordStates, serviceOptions, timeframes } from '../content/forms.js';
import { api, date, dateTime, naira } from './api.js';
import { Button, Field, Notice, Panel, StatusBadge, inputClass } from './parts.jsx';

const lbl = (list, v) => list.find((o) => o.value === v)?.label ?? v ?? null;
const fieldNames = { owner: 'Owner', followUpAt: 'Follow-up date', proposalValue: 'Proposal value', wonValue: 'Won value', outcome: 'Outcome' };
const emailStateText = { sent: 'Accepted by email provider', failed: 'Failed', 'not-configured': 'Email not set up yet', 'skipped-no-email': 'No email address given', pending: 'Pending' };

function formFrom(lead) {
  const p = lead.pipeline ?? {};
  return { status: lead.status, owner: p.owner ?? '', followUpAt: p.followUpAt ?? '', proposalValue: p.proposalValue ?? '', wonValue: p.wonValue ?? '', outcome: p.outcome ?? '' };
}

function ActivityItem({ a }) {
  let text;
  if (a.type === 'note') text = a.text;
  else if (a.type === 'status') text = a.from ? `Stage: ${statusLabel(a.from)} → ${statusLabel(a.status)}` : `Created as ${statusLabel(a.status)}${a.note ? ` (${a.note})` : ''}`;
  else {
    const fmt = (v) => (v === null || v === '' ? '—' : ['proposalValue', 'wonValue'].includes(a.field) ? naira(v) : a.field === 'followUpAt' ? date(v) : v);
    text = `${fieldNames[a.field] ?? a.field}: ${fmt(a.from)} → ${fmt(a.to)}`;
  }
  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.type === 'note' ? 'bg-tertiary-fixed-dim' : 'bg-secondary'}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className={`font-body-md text-body-md ${a.type === 'note' ? 'text-on-surface whitespace-pre-wrap' : 'text-on-surface-variant'}`}>{text}</p>
        <p className="font-body-sm text-body-sm text-outline">
          {dateTime(a.at)} · {a.by === 'system' ? 'Website' : a.by}
        </p>
      </div>
    </li>
  );
}

export default function LeadDetail({ reference, user, onBack, onDeleted }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');

  const load = () =>
    api
      .lead(reference)
      .then((d) => (setData(d), setForm(formFrom(d.lead))))
      .catch((e) => setMsg({ kind: 'error', text: e.status === 404 ? 'This lead no longer exists.' : 'Couldn’t load this lead. Try again.' }));
  useEffect(() => {
    load();
  }, [reference]);

  if (!data) {
    return (
      <div className="flex flex-col gap-space-md">
        <BackButton onBack={onBack} />
        {msg ? <Notice>{msg.text}</Notice> : <p className="text-on-surface-variant">Loading…</p>}
      </div>
    );
  }

  const { lead, activity, consents } = data;
  const c = lead.contact ?? {};
  const dirty = JSON.stringify(form) !== JSON.stringify(formFrom(lead));
  const wa = c.phone ? `https://wa.me/${c.phone.replace(/^\+/, '')}` : null;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const before = formFrom(lead);
    const changes = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== before[k]));
    try {
      const d = await api.update(reference, lead.version, changes);
      setData(d);
      setForm(formFrom(d.lead));
      setMsg({ kind: 'ok', text: 'Saved.' });
    } catch (err) {
      if (err.status === 409) setMsg({ kind: 'error', text: 'Someone else updated this lead while you were editing. Reload to see their changes, then make yours again.', reload: true });
      else if (err.status === 422) setMsg({ kind: 'error', text: Object.values(err.body.errors).join(' ') });
      else setMsg({ kind: 'error', text: 'Not saved. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      const d = await api.addNote(reference, note);
      setData(d);
      setNote('');
    } catch {
      setMsg({ kind: 'error', text: 'Note not saved. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.remove(reference);
      onDeleted(reference);
    } catch {
      setMsg({ kind: 'error', text: 'Not deleted. Try again.' });
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-space-md" data-testid="lead-detail">
      <BackButton onBack={onBack} />

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-headline-md text-headline-md text-on-surface font-bold">{lead.business?.name || c.fullName}</h1>
          <StatusBadge status={lead.status} />
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          <span className="font-mono">{lead.reference}</span> · {lead.kind === 'checklist' ? 'Checklist download' : 'Consultation request'} · {dateTime(lead.createdAt)}
        </p>
      </div>

      {msg && (
        <Notice kind={msg.kind}>
          {msg.text}{' '}
          {msg.reload && (
            <button className="underline font-semibold" onClick={() => (setMsg(null), load())}>
              Reload
            </button>
          )}
        </Notice>
      )}

      <div className="flex flex-wrap gap-2">
        {c.phone && (
          <a href={`tel:${c.phone}`} className="min-h-[44px] px-3.5 rounded-lg bg-secondary text-on-secondary flex items-center gap-1.5 font-label-lg text-label-lg">
            <Icon name="call" className="text-[18px]" /> Call
          </a>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="min-h-[44px] px-3.5 rounded-lg border border-surface-container-high bg-surface-container-lowest flex items-center gap-1.5 font-label-lg text-label-lg">
            <Icon name="chat" className="text-[18px] text-secondary" /> WhatsApp
          </a>
        )}
        {c.email && (
          <a href={`mailto:${c.email}?subject=${encodeURIComponent(`Your enquiry (${lead.reference})`)}`} className="min-h-[44px] px-3.5 rounded-lg border border-surface-container-high bg-surface-container-lowest flex items-center gap-1.5 font-label-lg text-label-lg">
            <Icon name="mail" className="text-[18px] text-secondary" /> Email
          </a>
        )}
      </div>

      <div className="grid gap-space-md lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <div className="flex flex-col gap-space-md">
          <Panel title="Contact & business" icon="domain">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">{c.fullName}</Field>
              <Field label="Prefers">{lbl(contactMethods, c.preferredContact)}</Field>
              <Field label="Phone">{c.phone}</Field>
              <Field label="Email">{c.email}</Field>
              <Field label="Business">{lead.business?.name}</Field>
              <Field label="Type">{lbl(businessTypes, lead.business?.type)}</Field>
              {lead.business?.size && <Field label="Size">{lbl(businessSizes, lead.business.size)}</Field>}
            </dl>
          </Panel>

          {lead.kind === 'consultation' && (
            <Panel title="Their request" icon="troubleshoot">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Service">{lbl(serviceOptions, lead.inquiry?.service)}</Field>
                <Field label="Main challenge">{lbl(challenges, lead.inquiry?.challenge)}</Field>
                <Field label="Records today">{lbl(recordStates, lead.inquiry?.recordsState)}</Field>
                <Field label="Timeframe">{lbl(timeframes, lead.inquiry?.timeframe)}</Field>
              </dl>
              {lead.inquiry?.additionalInfo && (
                <div className="rounded-lg bg-surface-container-low p-3 font-body-md text-body-md whitespace-pre-wrap">{lead.inquiry.additionalInfo}</div>
              )}
            </Panel>
          )}

          <Panel title="Pipeline" icon="conversion_path">
            <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" aria-label="Update pipeline">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Stage</span>
                <select value={form.status} onChange={set('status')} className={inputClass}>
                  {statuses.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Owner</span>
                <input value={form.owner} onChange={set('owner')} maxLength={100} className={inputClass} placeholder="Who is handling this?" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Follow-up date</span>
                <input type="date" value={form.followUpAt} onChange={set('followUpAt')} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Proposal value (₦)</span>
                <input inputMode="numeric" value={form.proposalValue} onChange={set('proposalValue')} className={inputClass} placeholder="e.g. 450000" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Won value (₦)</span>
                <input inputMode="numeric" value={form.wonValue} onChange={set('wonValue')} className={inputClass} placeholder="When the deal is won" />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Consultation / proposal outcome</span>
                <textarea value={form.outcome} onChange={set('outcome')} maxLength={500} rows={2} className={inputClass} />
              </label>
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" disabled={!dirty || busy}>
                  <Icon name="check_circle" className="text-[18px]" /> Save changes
                </Button>
                {dirty && (
                  <Button type="button" variant="quiet" onClick={() => setForm(formFrom(lead))}>
                    Undo
                  </Button>
                )}
              </div>
            </form>
          </Panel>
        </div>

        <div className="flex flex-col gap-space-md">
          <Panel title="Notes & history" icon="history">
            <form onSubmit={addNote} className="flex flex-col gap-2">
              <label htmlFor="note" className="sr-only">
                Add a note
              </label>
              <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} className={inputClass} placeholder="Add an internal note (not shared with the lead)" />
              <Button type="submit" variant="quiet" disabled={!note.trim() || busy} className="self-start">
                Add note
              </Button>
            </form>
            <ol className="flex flex-col gap-3 mt-1" data-testid="activity">
              {[...activity].reverse().map((a, i) => (
                <ActivityItem key={a.id ?? i} a={a} />
              ))}
            </ol>
          </Panel>

          <Panel title="Source & consent" icon="verified">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Source">{sourceLabel(lead.attribution?.source)}</Field>
              <Field label="Campaign">{lead.attribution?.utm_campaign}</Field>
              <Field label="Landed on">{lead.attribution?.landingPath}</Field>
              <Field label="Referring site">{lead.attribution?.referrerHost}</Field>
              {lead.kind === 'checklist' && <Field label="PDF downloads">{lead.downloads ?? 0}</Field>}
              <Field label="Keep until">{date(lead.retainUntil)}</Field>
            </dl>
            {consents.map((cn) => (
              <p key={cn.id ?? cn.recordedAt} className="font-body-sm text-body-sm text-on-surface-variant">
                Privacy notice ({cn.privacyNoticeVersion}) acknowledged {dateTime(cn.recordedAt)}. Marketing emails:{' '}
                <strong className={cn.marketing ? 'text-secondary' : 'text-on-surface'}>{cn.marketing ? 'agreed' : 'not agreed'}</strong>.
              </p>
            ))}
            {lead.email && (
              <ul className="font-body-sm text-body-sm text-on-surface-variant flex flex-col gap-0.5">
                {Object.entries(lead.email).map(([k, v]) => (
                  <li key={k}>
                    {{ checklistDelivery: 'Checklist email', acknowledgement: 'Confirmation email', internalAlert: 'Alert to Adezmold' }[k] ?? k}:{' '}
                    {emailStateText[v?.state] ?? v?.state ?? v}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {user.role === 'admin' && (
            <Panel title="Delete lead" icon="lock">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Use this for data deletion requests or leads past their retention date. It permanently removes the lead, its history and consent
                records. Type <strong className="font-mono text-on-surface">{lead.reference}</strong> to confirm.
              </p>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} className={inputClass} aria-label="Type the reference to confirm deletion" />
              <Button variant="danger" disabled={confirm !== lead.reference || busy} onClick={remove} className="self-start">
                Delete permanently
              </Button>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function BackButton({ onBack }) {
  return (
    <button onClick={onBack} className="self-start min-h-[44px] flex items-center gap-1 text-secondary font-label-lg text-label-lg">
      <Icon name="arrow_back" className="text-[20px]" /> All leads
    </button>
  );
}
