import { SYSTEM_ROLES, TRADING_TEMPLATE, businessDate, fiscalYearForDate } from '@bms/domain';
import { defineCommand } from '../lib/command.js';
import { failedPrecondition } from '../lib/errors.js';
import { db } from '../lib/firebase.js';
import {
  companyRefs,
  membershipMirror,
  type BranchDoc,
  type CompanyDoc,
  type MemberDoc,
  type PeriodDoc,
  type RoleDoc,
  type SettingsDoc,
} from '../lib/model.js';
import { seedLocations } from './inventory.js';
import { seedChart } from './ledger.js';

export const DEFAULT_BACKDATE_WINDOW_DAYS = 3; // OPEN_DECISIONS #4, confirmed 2026-10-23

export const createCompany = defineCommand({
  name: 'company.create',
  access: { kind: 'authenticated', requireVerifiedEmail: true },
  async handler({ tx, caller, input, now }) {
    const companyId = db.collection('companies').doc().id;
    const refs = companyRefs(companyId);
    const branchId = input.headOffice.code;
    const meta = { updatedAt: now, updatedBy: caller.uid };

    const company: CompanyDoc = {
      legalName: input.legalName,
      tradingName: input.tradingName ?? input.legalName,
      country: input.country,
      baseCurrency: input.baseCurrency,
      timeZone: input.timeZone,
      fiscalYearStartMonth: input.fiscalYearStartMonth,
      costingMethod: 'weighted_average',
      businessTypes: ['trading'],
      status: 'active',
      locks: { baseCurrency: false, costingMethod: false, fiscalYearStartMonth: false },
      createdAt: now,
      createdBy: caller.uid,
      ...meta,
      schemaVersion: 1,
    };
    tx.set(refs.company, company);

    const branch: BranchDoc = {
      code: input.headOffice.code,
      name: input.headOffice.name,
      address: '',
      status: 'active',
      isHeadOffice: true,
      ...meta,
    };
    tx.set(refs.branch(branchId), branch);
    seedLocations(tx, companyId, branchId, { now, uid: caller.uid });

    for (const template of SYSTEM_ROLES) {
      const role: RoleDoc = {
        name: template.name,
        description: template.description,
        system: true,
        templateId: template.id,
        permissions: [...template.permissions],
        ...meta,
      };
      tx.set(refs.role(template.id), role);
    }

    const settings: SettingsDoc = {
      backdateWindowDays: DEFAULT_BACKDATE_WINDOW_DAYS,
      allowNegativeStock: false,
      roundingMode: 'half_away_from_zero',
      taxRounding: 'per_line',
      pricesIncludeTax: false,
      ...meta,
    };
    tx.set(refs.settings, settings);

    const today = businessDate(now.toDate(), input.timeZone);
    const fy = fiscalYearForDate(today, input.fiscalYearStartMonth);
    tx.set(refs.fiscalYear(fy.id), {
      startDate: fy.startDate,
      endDate: fy.endDate,
      status: 'open',
      createdAt: now,
      createdBy: caller.uid,
    });
    for (const p of fy.periods) {
      const period: PeriodDoc = {
        fiscalYearId: fy.id,
        startDate: p.startDate,
        endDate: p.endDate,
        status: 'open',
        statusChangedAt: now,
        statusChangedBy: caller.uid,
        lastReason: null,
      };
      tx.set(refs.period(p.id), period);
    }

    // OPEN_DECISIONS #14: the trading template is a draft for review; companies can adapt it.
    seedChart(tx, companyId, TRADING_TEMPLATE, { now, uid: caller.uid });

    const adminRole = SYSTEM_ROLES.find((r) => r.id === 'company_admin')!;
    const member: MemberDoc = {
      uid: caller.uid,
      email: caller.email ?? '',
      displayName: caller.displayName ?? caller.email ?? caller.uid,
      status: 'active',
      roleIds: ['company_admin'],
      permissions: [...adminRole.permissions],
      branchScope: 'all',
      joinedAt: now,
      invitedBy: null,
      ...meta,
    };
    tx.set(refs.member(caller.uid), member);
    tx.set(membershipMirror(caller.uid, companyId), {
      companyName: company.tradingName,
      status: 'active',
      roleIds: member.roleIds,
      updatedAt: now,
    });
    tx.set(
      db.doc(`users/${caller.uid}`),
      { email: caller.email ?? null, defaultCompanyId: companyId },
      { merge: true },
    );

    return {
      result: { companyId, branchId, fiscalYearId: fy.id },
      audit: {
        target: { scope: 'company', companyId },
        entityType: 'company',
        entityId: companyId,
        after: {
          legalName: company.legalName,
          baseCurrency: company.baseCurrency,
          timeZone: company.timeZone,
        },
      },
    };
  },
});

export const updateCompanySettings = defineCommand({
  name: 'company.updateSettings',
  access: { kind: 'company', permission: 'company.settings.update' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const company = (await tx.get(refs.company)).data() as CompanyDoc;
    const settings = (await tx.get(refs.settings)).data() as SettingsDoc;

    if (
      input.baseCurrency &&
      input.baseCurrency !== company.baseCurrency &&
      company.locks.baseCurrency
    ) {
      throw failedPrecondition(
        'base_currency_locked',
        'The base currency cannot change after transactions are posted',
      );
    }
    if (
      input.fiscalYearStartMonth &&
      input.fiscalYearStartMonth !== company.fiscalYearStartMonth &&
      company.locks.fiscalYearStartMonth
    ) {
      throw failedPrecondition(
        'fiscal_year_locked',
        'The fiscal year start cannot change after transactions are posted',
      );
    }

    if (
      input.costingMethod &&
      input.costingMethod !== company.costingMethod &&
      company.locks.costingMethod
    ) {
      throw failedPrecondition(
        'costing_method_locked',
        'The costing method cannot change after stock has been posted',
      );
    }

    const companyPatch: Partial<CompanyDoc> = {};
    if (input.costingMethod !== undefined) companyPatch.costingMethod = input.costingMethod;
    if (input.tradingName !== undefined) companyPatch.tradingName = input.tradingName;
    if (input.timeZone !== undefined) companyPatch.timeZone = input.timeZone;
    if (input.baseCurrency !== undefined) companyPatch.baseCurrency = input.baseCurrency;
    if (input.fiscalYearStartMonth !== undefined)
      companyPatch.fiscalYearStartMonth = input.fiscalYearStartMonth;
    const settingsPatch: Partial<SettingsDoc> = {};
    if (input.backdateWindowDays !== undefined)
      settingsPatch.backdateWindowDays = input.backdateWindowDays;

    let mirrorsToUpdate: string[] = [];
    if (companyPatch.tradingName && companyPatch.tradingName !== company.tradingName) {
      const members = await tx.get(refs.members.where('status', '==', 'active'));
      mirrorsToUpdate = members.docs.map((d) => d.id);
    }

    if (Object.keys(companyPatch).length) {
      tx.update(refs.company, { ...companyPatch, updatedAt: now, updatedBy: caller.uid });
    }
    if (Object.keys(settingsPatch).length) {
      tx.update(refs.settings, { ...settingsPatch, updatedAt: now, updatedBy: caller.uid });
    }
    for (const uid of mirrorsToUpdate) {
      tx.set(
        membershipMirror(uid, input.companyId),
        { companyName: companyPatch.tradingName, updatedAt: now },
        { merge: true },
      );
    }

    const pick = <T extends object>(src: T, keys: string[]) =>
      Object.fromEntries(keys.map((k) => [k, (src as Record<string, unknown>)[k]]));
    return {
      result: { updated: true },
      audit: {
        target: { scope: 'company', companyId: input.companyId },
        entityType: 'companySettings',
        entityId: input.companyId,
        before: {
          ...pick(company, Object.keys(companyPatch)),
          ...pick(settings, Object.keys(settingsPatch)),
        },
        after: { ...companyPatch, ...settingsPatch },
      },
    };
  },
});
