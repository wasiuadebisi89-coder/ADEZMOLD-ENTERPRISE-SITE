import type { BusinessType } from '@bms/schemas';

/**
 * Menu areas that only some businesses use. A company turns them on in Settings by saying what
 * it does. This only shapes the menu and help: pages stay reachable by link, and the server's
 * permission checks are unchanged.
 */
export const OPTIONAL_MODULES: readonly {
  type: Exclude<BusinessType, 'trading'>;
  label: string;
  hint: string;
  /** Pages (paths under /c/:companyId/) that belong to this module. */
  pages: readonly string[];
}[] = [
  {
    type: 'services',
    label: 'Services and projects',
    hint: 'Adds Projects, to track revenue, costs and margin per job.',
    pages: ['projects'],
  },
  {
    type: 'production',
    label: 'Production (manufacturing)',
    hint: 'Adds Production, to turn materials into finished goods.',
    pages: ['production'],
  },
];

/** Companies created before business types were chosen are trading companies. */
export function businessTypesOf(company: { businessTypes?: readonly string[] } | null) {
  return new Set<string>(company?.businessTypes?.length ? company.businessTypes : ['trading']);
}

/** Whether a company page belongs to a module the company has turned off. */
export function pageHidden(page: string, enabled: ReadonlySet<string>): boolean {
  return OPTIONAL_MODULES.some(
    (m) => !enabled.has(m.type) && m.pages.some((p) => page === p || page.startsWith(`${p}/`)),
  );
}
