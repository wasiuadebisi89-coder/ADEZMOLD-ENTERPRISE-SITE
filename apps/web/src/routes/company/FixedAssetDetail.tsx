import { doc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { depreciationDue, isIsoDate, lastChargedMonth, lastMonthBeforeDisposal } from '@bms/domain';
import { BackdateNotice, useBackdate, useToday } from '../../components/BackdateNotice';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { ASSET_TONE, bookValue, monthLabel, type FixedAssetRow } from '../../lib/assets';
import { useCompany } from '../../lib/company';
import { db } from '../../lib/firebase';
import { useDoc } from '../../lib/firestore-hooks';
import { money, tryParseMoney, useAccounts } from '../../lib/ledger';
import { useAction } from '../../lib/useAction';
import { formatDate } from '../../lib/utils';

type Asset = Omit<FixedAssetRow, 'id'>;

function stateOf(a: Asset) {
  return {
    costMinor: BigInt(a.costMinor),
    residualMinor: BigInt(a.residualMinor),
    lifeMonths: a.usefulLifeMonths,
    baseMonths: a.baseMonths,
    baseAccumulatedMinor: BigInt(a.baseAccumulatedMinor),
    firstMonth: a.firstMonth,
    chargedMonths: a.chargedMonths,
    accumulatedMinor: BigInt(a.accumulatedMinor),
  };
}

function DisposeDialog({
  assetId,
  asset,
  onClose,
}: {
  assetId: string;
  asset: Asset;
  onClose: () => void;
}) {
  const { companyId, company } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const today = useToday();
  const accounts = useAccounts(companyId);
  const action = useAction();
  const [date, setDate] = useState(today);
  const [proceeds, setProceeds] = useState('');
  const [proceedsAccountId, setProceedsAccountId] = useState('');
  const [gainLossAccountId, setGainLossAccountId] = useState('');
  const [reason, setReason] = useState('');
  const backdate = useBackdate(date);

  const usable = accounts.data.filter((a) => a.status === 'active' && a.isPostable);
  const proceedsTo = usable.filter(
    (a) =>
      a.subtype === 'cash' ||
      a.subtype === 'bank' ||
      (a.type === 'asset' && a.subtype === 'general'),
  );
  const incomes = usable.filter((a) => a.type === 'income' && a.subtype === 'general');
  const expenses = usable.filter((a) => a.type === 'expense' && a.subtype === 'general');
  const value = tryParseMoney(proceeds, currency);

  // The same catch-up the server works out (DECISION 10 applied to the disposal month).
  type Preview =
    | { kind: 'blocked'; charged: string }
    | { kind: 'ok'; due: ReturnType<typeof depreciationDue>; gain: bigint };
  const preview = useMemo((): Preview | null => {
    if (!isIsoDate(date) || value === null) return null;
    const state = stateOf(asset);
    const through = lastMonthBeforeDisposal(date);
    const charged = lastChargedMonth(state);
    if (charged && charged > through) return { kind: 'blocked', charged };
    const due = depreciationDue(state, through);
    const accumulated = state.accumulatedMinor + due.amountMinor;
    return { kind: 'ok', due, gain: value - (state.costMinor - accumulated) };
  }, [asset, date, value]);
  const gain = preview?.kind === 'ok' ? preview.gain : null;
  const gainLossOptions = gain !== null && gain < 0n ? expenses : incomes;
  const gainLoss =
    gainLossAccountId && gainLossOptions.some((a) => a.id === gainLossAccountId)
      ? gainLossAccountId
      : (gainLossOptions[0]?.id ?? '');
  const proceedsAccount = proceedsAccountId || proceedsTo[0]?.id || '';
  const complete =
    preview?.kind === 'ok' &&
    !!gainLoss &&
    (value === 0n || !!proceedsAccount) &&
    reason.trim().length >= 3 &&
    (!backdate.needsApproval || !!backdate.approvalId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await action.run('fixedAsset.dispose', {
        companyId,
        assetId,
        disposalDate: date,
        proceeds,
        ...(value !== null && value > 0n ? { proceedsAccountId: proceedsAccount } : {}),
        gainLossAccountId: gainLoss,
        reason,
        ...(backdate.approvalId ? { backdateApprovalId: backdate.approvalId } : {}),
      });
      onClose();
    } catch {
      /* shown below */
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Dispose of ${asset.number}`}
      description="Depreciation is caught up first: a disposal on or before the 15th is not charged for that month. The cost and depreciation are then removed and the difference from what it fetched is a gain or loss."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {action.error && <Alert tone="error">{action.error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date disposed of">
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field
            label="Sold for"
            hint="Leave empty if scrapped."
            error={action.error?.fields.proceeds}
          >
            <Input
              inputMode="decimal"
              value={proceeds}
              onChange={(e) => setProceeds(e.target.value)}
            />
          </Field>
          {value !== null && value > 0n && (
            <Field label="Money received into">
              <Select
                value={proceedsAccount}
                onChange={(e) => setProceedsAccountId(e.target.value)}
              >
                {proceedsTo.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={gain !== null && gain < 0n ? 'Loss account' : 'Gain account'}>
            <Select value={gainLoss} onChange={(e) => setGainLossAccountId(e.target.value)}>
              {gainLossOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" className="sm:col-span-2" error={action.error?.fields.reason}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <BackdateNotice date={date} state={backdate} />
        {preview?.kind === 'blocked' && (
          <Alert tone="error">
            Depreciation has been charged through {monthLabel(preview.charged)}; choose a later
            date.
          </Alert>
        )}
        {preview?.kind === 'ok' && (
          <p className="text-sm text-slate-700" role="status" data-testid="dispose-preview">
            {preview.due.months > 0
              ? `${money(preview.due.amountMinor, currency)} depreciation for ${preview.due.months} month${preview.due.months === 1 ? '' : 's'} is charged first. `
              : ''}
            {preview.gain >= 0n
              ? `Gain on disposal: ${money(preview.gain, currency)}.`
              : `Loss on disposal: ${money(-preview.gain, currency)}.`}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={action.pending} disabled={!complete}>
            Post disposal
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function FixedAssetDetail() {
  const { companyId, company, can } = useCompany();
  const currency = company?.baseCurrency ?? 'NGN';
  const { assetId = '' } = useParams();
  const ref = useMemo(
    () => doc(db, `companies/${companyId}/fixedAssets/${assetId}`),
    [companyId, assetId],
  );
  const asset = useDoc<Asset>(ref);
  const [disposing, setDisposing] = useState(false);
  if (asset.loading) return <Spinner />;
  const a = asset.data;
  if (!a) return <EmptyState title="Asset not found" />;
  const readsLedger = can('reports.financial.read') || can('ledger.journal.read');
  const journalLink = (id: string, label: string) =>
    readsLedger ? (
      <Link className="font-medium text-brand-700 underline" to={`/c/${companyId}/journals/${id}`}>
        {label}
      </Link>
    ) : (
      label
    );
  const facts: [string, React.ReactNode, string?][] = [
    ['Status', <Badge tone={ASSET_TONE[a.status]}>{a.status}</Badge>],
    ['Cost', money(a.costMinor, currency), 'fa-cost'],
    ['Depreciation to date', money(a.accumulatedMinor, currency), 'fa-accumulated'],
    ['Book value', a.status === 'active' ? money(bookValue(a), currency) : '—', 'fa-book'],
    ['Residual value', money(a.residualMinor, currency)],
    ['Useful life', `${a.usefulLifeMonths} months`],
    ['In use from', formatDate(a.availableForUseDate)],
    ['First month charged', monthLabel(a.firstMonth)],
    [
      'Charged through',
      a.depreciatedThrough ? monthLabel(a.depreciatedThrough) : 'Not yet',
      'fa-through',
    ],
    ['Months charged', `${a.chargedMonths} of ${a.usefulLifeMonths}`],
    ['Asset account', a.assetAccountName],
    [
      a.acquisition.kind === 'purchase' ? 'Bought' : 'Brought in at',
      <>
        {formatDate(a.acquisition.date)} · {journalLink(a.acquisition.journalId, 'View journal')}
      </>,
    ],
  ];
  if (a.disposal) {
    facts.push(
      ['Disposed of', formatDate(a.disposal.date)],
      ['Sold for', money(a.disposal.proceedsMinor, currency)],
      [
        a.disposal.gainMinor >= 0 ? 'Gain' : 'Loss',
        money(Math.abs(a.disposal.gainMinor), currency),
        'fa-gain',
      ],
      ['Disposal', journalLink(a.disposal.journalId, 'View journal')],
      ['Reason', a.disposal.reason],
    );
  }

  return (
    <>
      <PageHeader
        title={`${a.number} ${a.name}`}
        description={
          a.baseMonths > 0
            ? `Brought in with ${a.baseMonths} months already depreciated.`
            : 'Straight-line depreciation each month.'
        }
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/c/${companyId}/fixed-assets`}>All assets</Link>
            </Button>
            {a.status === 'active' && can('assets.manage') && (
              <Button onClick={() => setDisposing(true)}>Dispose</Button>
            )}
          </>
        }
      />
      <Card className="p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          {facts.map(([label, value, testId]) => (
            <div key={label}>
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-medium tabular-nums" data-testid={testId}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      {disposing && (
        <DisposeDialog assetId={assetId} asset={a} onClose={() => setDisposing(false)} />
      )}
    </>
  );
}
