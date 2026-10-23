import { describe, expect, it } from 'vitest';
import { isPermission } from '@bms/domain';
import { COMMAND_SCHEMAS } from '@bms/schemas';
import { COMMANDS } from './registry.js';

/** Commands that are deliberately not company-scoped. Adding one here needs review. */
const NON_COMPANY_COMMANDS = ['company.create', 'invitation.accept', 'platform.supportRead', 'session.revokeAll'];

describe('command registry (E1)', () => {
  it('registers exactly the commands that have schemas, under their own names', () => {
    expect(Object.keys(COMMANDS).sort()).toEqual(Object.keys(COMMAND_SCHEMAS).sort());
    for (const [name, def] of Object.entries(COMMANDS)) expect(def.name).toBe(name);
  });

  it('every company command requires a catalogued permission', () => {
    for (const [name, def] of Object.entries(COMMANDS)) {
      if (NON_COMPANY_COMMANDS.includes(name)) {
        expect(def.access.kind).not.toBe('company');
        continue;
      }
      expect(def.access.kind, name).toBe('company');
      if (def.access.kind === 'company' && typeof def.access.permission === 'string') {
        expect(isPermission(def.access.permission), name).toBe(true);
      }
    }
  });

  it('company creation and invitation acceptance require a verified email', () => {
    for (const name of ['company.create', 'invitation.accept'] as const) {
      expect(COMMANDS[name].access).toEqual({ kind: 'authenticated', requireVerifiedEmail: true });
    }
  });
});
