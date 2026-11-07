import { doc } from 'firebase/firestore';
import { Copy, MessageCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCompany } from '../lib/company';
import { db } from '../lib/firebase';
import { useDoc } from '../lib/firestore-hooks';
import { useAccounts } from '../lib/ledger';
import { outstanding, useOpenInvoices } from '../lib/purchasing';
import type { Receipt, ReceiptHeader } from '../lib/receipt';
import { salesOutstanding, useOpenSalesInvoices, useOwnOnly } from '../lib/sales';
import {
  customerReminderMessage,
  receiptMessage,
  supplierBalanceMessage,
  whatsappLink,
  whatsappNumber,
  type BankDetailsForMessage,
} from '../lib/whatsapp';
import { useToday } from './BackdateNotice';
import { useReceiptHeader } from './ReceiptPrint';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Spinner } from './ui/feedback';
import { Field, Input, Select, Textarea } from './ui/form';

export type PartyKind = 'customer' | 'supplier';

interface PartyDoc {
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  balanceMinor: number;
  advanceMinor: number;
}

function useParty(kind: PartyKind, id: string | null) {
  const { companyId } = useCompany();
  const ref = useMemo(
    () =>
      id
        ? doc(db, `companies/${companyId}/${kind === 'customer' ? 'customers' : 'suppliers'}/${id}`)
        : null,
    [companyId, kind, id],
  );
  return useDoc<PartyDoc>(ref);
}

/**
 * The phone number and message, both editable, and a link that opens WhatsApp with the
 * message typed in. The user presses Send in WhatsApp; nothing is sent from here.
 */
function Composer({
  initialPhone,
  initialText,
  partyLabel,
}: {
  initialPhone: string;
  initialText: string;
  partyLabel: string;
}) {
  const { company } = useCompany();
  const [phone, setPhone] = useState(initialPhone);
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const number = whatsappNumber(phone, company?.country ?? 'NG');
  const badNumber = phone.trim() !== '' && number === null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field
        label={`${partyLabel}'s WhatsApp number`}
        {...(badNumber
          ? { error: 'Enter a number such as 0803 123 4567 or +234 803 123 4567' }
          : {
              hint: number
                ? `Opens a chat with +${number}.`
                : 'Leave empty to choose the chat in WhatsApp.',
            })}
      >
        <Input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0803 123 4567"
        />
      </Field>
      <Field label="Message" hint="You can change it here or in WhatsApp before sending.">
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCopied(false);
          }}
          rows={14}
          className="font-mono text-xs"
          data-testid="whatsapp-message"
        />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" type="button" onClick={() => void copy()}>
          <Copy className="size-4" aria-hidden /> {copied ? 'Copied' : 'Copy message'}
        </Button>
        {badNumber || !text.trim() ? (
          <Button disabled>
            <MessageCircle className="size-4" aria-hidden /> Open WhatsApp
          </Button>
        ) : (
          <Button asChild>
            <a
              href={whatsappLink(number, text)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="whatsapp-open"
            >
              <MessageCircle className="size-4" aria-hidden /> Open WhatsApp
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function ReceiptShareDialog({
  build,
  branchId,
  party,
  partyId,
  note,
  title,
  onClose,
}: {
  build: (h: ReceiptHeader) => Receipt;
  branchId: string;
  party: PartyKind;
  partyId: string | null;
  note?: string | null;
  title: string;
  onClose: () => void;
}) {
  const header = useReceiptHeader(branchId, 'message');
  const p = useParty(party, partyId);
  const text = p.loading ? '' : receiptMessage(build(header), note);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="Opens WhatsApp with the receipt typed in, ready for you to send."
    >
      {p.loading ? (
        <Spinner />
      ) : (
        <Composer
          key={text}
          initialPhone={p.data?.phone ?? ''}
          initialText={text}
          partyLabel={party === 'customer' ? 'Customer' : 'Supplier'}
        />
      )}
    </Dialog>
  );
}

/** Sends a sale or purchase document's receipt as a WhatsApp message. */
export function WhatsAppReceiptButton({
  build,
  branchId,
  party,
  partyId,
  note,
  title = 'Send on WhatsApp',
}: {
  build: (h: ReceiptHeader) => Receipt;
  branchId: string;
  party: PartyKind;
  /** Null for walk-in sales: the number is typed in or the chat chosen in WhatsApp. */
  partyId: string | null;
  /** A line added after the receipt, such as a reminder of the balance due. */
  note?: string | null;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <MessageCircle className="size-4" aria-hidden /> WhatsApp
      </Button>
      {open && (
        <ReceiptShareDialog
          build={build}
          branchId={branchId}
          party={party}
          partyId={partyId}
          note={note ?? null}
          title={title}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The company's own bank accounts with details, to tell a customer where to pay. */
function BankPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string, bank: BankDetailsForMessage | null) => void;
}) {
  const { companyId } = useCompany();
  const accounts = useAccounts(companyId);
  const banks = accounts.data.filter((a) => a.status === 'active' && a.isPostable && a.bank);
  if (accounts.error || banks.length === 0) return null;
  return (
    <Field label="Bank details to include">
      <Select
        value={value}
        onChange={(e) => {
          const a = banks.find((b) => b.id === e.target.value);
          onChange(e.target.value, a?.bank ?? null);
        }}
      >
        <option value="">None</option>
        {banks.map((a) => (
          <option key={a.id} value={a.id}>
            {a.bank!.bankName} · {a.bank!.accountNumber}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function ReminderDialog({
  party,
  partyId,
  onClose,
}: {
  party: PartyKind;
  partyId: string;
  onClose: () => void;
}) {
  const { companyId, company, can } = useCompany();
  const today = useToday();
  const own = useOwnOnly();
  const p = useParty(party, partyId);
  const sales = useOpenSalesInvoices(companyId, party === 'customer' ? partyId : '');
  const purchases = useOpenInvoices(companyId, party === 'supplier' ? partyId : '');
  const [bankId, setBankId] = useState('');
  const [bank, setBank] = useState<BankDetailsForMessage | null>(null);
  const canSeeBanks =
    can('ledger.accounts.read') || can('sales.invoice.post') || can('sales.receipt.post');

  const loading = p.loading || (party === 'customer' ? sales.loading : purchases.loading);
  const text = useMemo(() => {
    const x = p.data;
    if (!x) return '';
    const input = {
      companyName: company?.tradingName || company?.legalName || '',
      partyName: x.name,
      contactName: x.contactName,
      partyCode: x.code,
      currency: company?.baseCurrency ?? 'NGN',
      asAt: today,
      balanceMinor: x.balanceMinor,
      advanceMinor: x.advanceMinor,
      bank,
    };
    if (party === 'customer')
      return customerReminderMessage({
        ...input,
        invoices: sales.data.map((i) => ({
          number: i.number,
          invoiceDate: i.invoiceDate,
          dueDate: i.dueDate,
          outstandingMinor: salesOutstanding(i),
        })),
        invoicesComplete: !own,
      });
    return supplierBalanceMessage({
      ...input,
      invoices: purchases.data.map((i) => ({
        number: i.number,
        theirNumber: i.supplierInvoiceNo,
        invoiceDate: i.invoiceDate,
        dueDate: i.dueDate,
        outstandingMinor: outstanding(i),
      })),
      invoicesComplete: true,
    });
  }, [p.data, company, today, bank, party, sales.data, purchases.data, own]);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        party === 'customer'
          ? `Payment reminder to ${p.data?.name ?? 'customer'}`
          : `Statement to ${p.data?.name ?? 'supplier'}`
      }
      description={
        party === 'customer'
          ? 'What the customer owes, invoice by invoice, ready to send on WhatsApp.'
          : 'The balance between you and the supplier, for them to confirm or to remind them of money they hold.'
      }
    >
      {loading ? (
        <Spinner />
      ) : !p.data ? (
        <p className="text-sm text-slate-500">Not found.</p>
      ) : (
        <div className="space-y-4">
          {canSeeBanks && (
            <BankPicker
              value={bankId}
              onChange={(id, b) => {
                setBankId(id);
                setBank(b);
              }}
            />
          )}
          <Composer
            key={text}
            initialPhone={p.data.phone ?? ''}
            initialText={text}
            partyLabel={party === 'customer' ? 'Customer' : 'Supplier'}
          />
        </div>
      )}
    </Dialog>
  );
}

/** A reminder of what a customer owes, or a statement of the balance with a supplier. */
export function WhatsAppReminderButton({
  party,
  partyId,
  compact = false,
  label,
}: {
  party: PartyKind;
  partyId: string;
  /** Icon only, for a table row. */
  compact?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const text = label ?? (party === 'customer' ? 'Remind on WhatsApp' : 'Statement on WhatsApp');
  return (
    <>
      {compact ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          aria-label={text}
          title={text}
        >
          <MessageCircle className="size-4" aria-hidden />
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <MessageCircle className="size-4" aria-hidden /> {text}
        </Button>
      )}
      {open && <ReminderDialog party={party} partyId={partyId} onClose={() => setOpen(false)} />}
    </>
  );
}
