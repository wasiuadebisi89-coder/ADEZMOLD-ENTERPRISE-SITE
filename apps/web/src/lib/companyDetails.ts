/** Company contact lines printed on documents; no Firebase imports so tests stay pure. */

export interface CompanyContactDetails {
  address: string | null;
  phone: string | null;
  email: string | null;
  rcNumber: string | null;
  taxId: string | null;
}

/** "RC 1445936 · TIN 1234-5678", or '' when neither is set. */
export function registrationLine(c?: Partial<CompanyContactDetails> | null): string {
  if (!c) return '';
  const rc = c.rcNumber ? (/^rc\b/i.test(c.rcNumber) ? c.rcNumber : `RC ${c.rcNumber}`) : '';
  const tin = c.taxId ? `TIN ${c.taxId}` : '';
  return [rc, tin].filter(Boolean).join(' · ');
}

/** "08012345678 · sales@example.com", or '' when neither is set. */
export function contactLine(c?: Partial<CompanyContactDetails> | null): string {
  if (!c) return '';
  return [c.phone, c.email].filter(Boolean).join(' · ');
}
