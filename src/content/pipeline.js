// Lead pipeline, shared by the admin screens and the server.
export const statuses = [
  { value: 'new', label: 'New', tone: 'tertiary' },
  { value: 'contacted', label: 'Contacted', tone: 'primary' },
  { value: 'qualified', label: 'Qualified', tone: 'primary' },
  { value: 'consultation-scheduled', label: 'Consultation scheduled', tone: 'secondary' },
  { value: 'proposal-sent', label: 'Proposal sent', tone: 'secondary' },
  { value: 'won', label: 'Won', tone: 'won' },
  { value: 'lost', label: 'Lost', tone: 'lost' },
  { value: 'follow-up', label: 'Follow-up later', tone: 'primary' },
];
export const statusLabel = (v) => statuses.find((s) => s.value === v)?.label ?? v;

export const leadKinds = [
  { value: 'consultation', label: 'Consultation request' },
  { value: 'checklist', label: 'Checklist download' },
];

export const sources = [
  { value: 'linkedin-organic', label: 'LinkedIn (organic)' },
  { value: 'linkedin-paid', label: 'LinkedIn (paid)' },
  { value: 'campaign', label: 'Other campaign link' },
  { value: 'search', label: 'Search engine' },
  { value: 'referral', label: 'Other website' },
  { value: 'direct', label: 'Direct / unknown' },
];
export const sourceLabel = (v) => sources.find((s) => s.value === v)?.label ?? v ?? '—';

// Editable pipeline fields and their rules (validated again on the server).
export const MAX_MONEY = 1_000_000_000_000; // ₦1 trillion: catches typos, not a business limit

/** @returns {{ values: object, errors: Record<string,string> }} only for keys present in input */
export function validatePipelineChanges(input = {}) {
  const values = {};
  const errors = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  const text = (k, max) => {
    if (!has(k)) return;
    const v = input[k];
    if (v === null || v === '') return void (values[k] = null);
    if (typeof v !== 'string' || v.trim().length > max) return void (errors[k] = `Keep this under ${max} characters.`);
    values[k] = v.trim();
  };
  const money = (k) => {
    if (!has(k)) return;
    const v = input[k];
    if (v === null || v === '') return void (values[k] = null);
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s₦]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) return void (errors[k] = 'Enter an amount in naira, e.g. 450000.');
    values[k] = Math.round(n);
  };
  if (has('status')) {
    if (statuses.some((s) => s.value === input.status)) values.status = input.status;
    else errors.status = 'Choose a valid stage.';
  }
  text('owner', 100);
  text('outcome', 500);
  if (has('followUpAt')) {
    const v = input.followUpAt;
    if (v === null || v === '') values.followUpAt = null;
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) values.followUpAt = v;
    else errors.followUpAt = 'Choose a valid date.';
  }
  money('proposalValue');
  money('wonValue');
  return { values, errors };
}
