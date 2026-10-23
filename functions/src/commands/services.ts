/**
 * Services (Phase 9, ACCOUNTING_POLICIES.md §15): projects and quotations. Neither posts to the
 * ledger. A project is a tag that sales, purchase invoices and journals carry so its revenue and
 * direct costs can be reported (DECISION 20). A quotation is an offer; the sales invoice made
 * from it posts the revenue (DECISION 19).
 */
import { addDays, branchAllowed, fromStorable, salesLine, toStorable } from '@bms/domain';
import { defineCommand } from '../lib/command.js';
import { companyTarget, money, positiveQuantity, readSeries } from '../lib/documents.js';
import { conflict, denied, failedPrecondition, invalid, notFound } from '../lib/errors.js';
import {
  companyRefs,
  productType,
  type BranchDoc,
  type CompanyDoc,
  type CustomerDoc,
  type ProductDoc,
  type ProjectDoc,
  type QuotationDoc,
  type QuotationLineDoc,
  type QuotationStatus,
  type SettingsDoc,
  type TaxCodeDoc,
} from '../lib/model.js';
import { salesError } from './sales.js';

// --- Projects ---------------------------------------------------------------------------------

export const createProject = defineCommand({
  name: 'project.create',
  access: { kind: 'company', permission: 'projects.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const [same, customerSnap] = await Promise.all([
      tx.get(refs.projects.where('code', '==', input.code).limit(1)),
      tx.get(refs.customer(input.customerId ?? '_')),
    ]);
    if (!same.empty) throw conflict('code_taken', `Project code ${input.code} is already used`);
    let customer: CustomerDoc | null = null;
    if (input.customerId) {
      customer = (customerSnap.data() as CustomerDoc | undefined) ?? null;
      if (!customer) throw notFound('customer_not_found', 'Customer not found');
      if (customer.status !== 'active') {
        throw failedPrecondition('customer_inactive', 'This customer is inactive');
      }
    }
    const ref = refs.projects.doc();
    const doc: ProjectDoc = {
      code: input.code,
      name: input.name,
      customerId: input.customerId ?? null,
      customerName: customer?.name ?? null,
      description: input.description ?? '',
      status: 'active',
      createdAt: now,
      createdBy: caller.uid,
      updatedAt: now,
      updatedBy: caller.uid,
    };
    tx.set(ref, doc);
    return {
      result: { projectId: ref.id },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'project',
        entityId: ref.id,
        after: { code: doc.code, name: doc.name, customerId: doc.customerId },
      },
    };
  },
});

export const updateProject = defineCommand({
  name: 'project.update',
  access: { kind: 'company', permission: 'projects.manage' },
  async handler({ tx, caller, input, now }) {
    const refs = companyRefs(input.companyId);
    const project = (await tx.get(refs.project(input.projectId))).data() as ProjectDoc | undefined;
    if (!project) throw notFound('project_not_found', 'Project not found');
    const patch: Partial<ProjectDoc> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status;
    tx.update(refs.project(input.projectId), { ...patch, updatedAt: now, updatedBy: caller.uid });
    return {
      result: { projectId: input.projectId },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'project',
        entityId: input.projectId,
        before: Object.fromEntries(
          Object.keys(patch).map((k) => [k, project[k as keyof ProjectDoc]]),
        ),
        after: patch,
      },
    };
  },
});

// --- Quotations -------------------------------------------------------------------------------

export const createQuotation = defineCommand({
  name: 'quotation.create',
  access: { kind: 'company', permission: 'sales.quotation.manage' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    if (input.validUntil < input.quoteDate) {
      throw invalid('valid_before_quote', 'A quotation cannot expire before its date');
    }
    if (input.validUntil > addDays(input.quoteDate, 366)) {
      throw invalid('valid_too_long', 'A quotation can be valid for at most a year');
    }
    if (!branchAllowed(company!.member.branchScope, input.branchId)) {
      throw denied('branch_not_allowed', 'You cannot quote for this branch');
    }
    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    const taxCodeIds = [...new Set(input.lines.flatMap((l) => (l.taxCodeId ? [l.taxCodeId] : [])))];
    const [companySnap, settingsSnap, branchSnap, customerSnap, projectSnap, ...rest] =
      await tx.getAll(
        refs.company,
        refs.settings,
        refs.branch(input.branchId),
        refs.customer(input.customerId),
        refs.project(input.projectId ?? '_'),
        ...productIds.map((id) => refs.product(id)),
        ...taxCodeIds.map((id) => refs.taxCode(id)),
      );
    const currency = (companySnap!.data() as CompanyDoc).baseCurrency;
    const settings = settingsSnap!.data() as SettingsDoc;
    const branch = branchSnap!.data() as BranchDoc | undefined;
    if (!branch || branch.status !== 'active') {
      throw failedPrecondition('branch_inactive', 'Choose an active branch');
    }
    const customer = customerSnap!.data() as CustomerDoc | undefined;
    if (!customer) throw notFound('customer_not_found', 'Customer not found');
    if (customer.status !== 'active') {
      throw failedPrecondition('customer_inactive', 'This customer is inactive');
    }
    if (input.projectId) {
      const project = projectSnap!.data() as ProjectDoc | undefined;
      if (!project) throw notFound('project_not_found', 'Project not found');
      if (project.status !== 'active') {
        throw failedPrecondition(
          'project_inactive',
          `Project ${project.code} is ${project.status}`,
        );
      }
      if (project.customerId && project.customerId !== input.customerId) {
        throw failedPrecondition(
          'project_customer_mismatch',
          `Project ${project.code} is for ${project.customerName}`,
        );
      }
    }
    const products = new Map(
      productIds.map((id, i) => [id, rest[i]!.data() as ProductDoc | undefined]),
    );
    const taxCodes = new Map(
      taxCodeIds.map((id, i) => [
        id,
        rest[productIds.length + i]!.data() as TaxCodeDoc | undefined,
      ]),
    );
    const mayOverridePrice = company!.permissions.has('sales.priceOverride');

    const lines: QuotationLineDoc[] = input.lines.map((l, i) => {
      const lineNo = i + 1;
      const product = products.get(l.productId);
      if (!product || product.status !== 'active') {
        throw failedPrecondition('product_inactive', `Line ${lineNo}: choose an active product`);
      }
      const qty = positiveQuantity(l.quantity, product.unit, lineNo);
      const listPrice = product.salePrice === null ? null : fromStorable(product.salePrice);
      const price = l.unitPrice !== undefined ? money(l.unitPrice, currency, lineNo) : listPrice;
      if (price === null) {
        throw failedPrecondition(
          'price_required',
          `Line ${lineNo}: ${product.sku} has no sale price; enter one`,
        );
      }
      const discount = l.discount !== undefined ? money(l.discount, currency, lineNo) : 0n;
      // The same rule as at the till: quoting another price needs the override permission.
      if ((price !== listPrice || discount !== 0n) && !mayOverridePrice) {
        throw denied(
          'price_override_not_allowed',
          `Line ${lineNo}: you cannot change the price of ${product.sku} or give a discount`,
        );
      }
      let tax: TaxCodeDoc | null = null;
      if (l.taxCodeId) {
        tax = taxCodes.get(l.taxCodeId) ?? null;
        if (!tax || tax.status !== 'active') {
          throw failedPrecondition(
            'tax_code_inactive',
            `Line ${lineNo}: choose an active tax code`,
          );
        }
      }
      try {
        const amounts = salesLine({
          qtyMilli: qty,
          unitPriceMinor: price,
          discountMinor: discount,
          rateBp: tax?.rateBp ?? 0,
          pricesIncludeTax: settings.pricesIncludeTax,
        });
        return {
          lineNo,
          itemType: productType(product),
          productId: l.productId,
          sku: product.sku,
          productName: product.name,
          unit: product.unit,
          qtyMilli: toStorable(qty),
          listPriceMinor: listPrice === null ? null : toStorable(listPrice),
          unitPriceMinor: toStorable(price),
          discountMinor: toStorable(discount),
          netMinor: toStorable(amounts.netMinor),
          taxCodeId: l.taxCodeId ?? null,
          taxCode: tax?.code ?? null,
          taxRateBp: tax?.rateBp ?? 0,
          taxMinor: toStorable(amounts.taxMinor),
          grossMinor: toStorable(amounts.grossMinor),
        };
      } catch (e) {
        return salesError(e, lineNo);
      }
    });
    const sumOf = (k: 'netMinor' | 'taxMinor' | 'grossMinor') =>
      lines.reduce((s, l) => s + BigInt(l[k]), 0n);
    const total = sumOf('grossMinor');
    if (total <= 0n) throw invalid('amount_zero', 'The quotation total must be above zero');

    const series = await readSeries(tx, input.companyId, 'quotation', 'QT');
    const ref = refs.quotations.doc();
    const doc: QuotationDoc = {
      number: series.number,
      customerId: input.customerId,
      customerName: customer.name,
      branchId: input.branchId,
      projectId: input.projectId ?? null,
      quoteDate: input.quoteDate,
      validUntil: input.validUntil,
      reference: input.reference ?? null,
      memo: input.memo ?? null,
      pricesIncludeTax: settings.pricesIncludeTax,
      lines,
      netMinor: toStorable(sumOf('netMinor')),
      taxMinor: toStorable(sumOf('taxMinor')),
      totalMinor: toStorable(total),
      status: 'draft',
      invoiceId: null,
      invoiceNumber: null,
      createdAt: now,
      createdBy: caller.uid,
      statusChangedAt: now,
      statusChangedBy: caller.uid,
    };
    series.commit();
    tx.set(ref, doc);
    return {
      result: { quotationId: ref.id, number: series.number },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'quotation',
        entityId: ref.id,
        after: { number: series.number, customerId: input.customerId, total: total.toString() },
      },
    };
  },
});

/** Which statuses each status may move to. `invoiced` is set only by the sales invoice. */
const NEXT_STATUS: Record<QuotationStatus, readonly QuotationStatus[]> = {
  draft: ['sent', 'accepted', 'cancelled'],
  sent: ['accepted', 'declined', 'cancelled'],
  accepted: ['cancelled'],
  declined: [],
  cancelled: [],
  invoiced: [],
};

export const setQuotationStatus = defineCommand({
  name: 'quotation.setStatus',
  access: { kind: 'company', permission: 'sales.quotation.manage' },
  async handler({ tx, caller, input, now, company }) {
    const refs = companyRefs(input.companyId);
    const quote = (await tx.get(refs.quotation(input.quotationId))).data() as
      QuotationDoc | undefined;
    if (!quote) throw notFound('quotation_not_found', 'Quotation not found');
    if (!branchAllowed(company!.member.branchScope, quote.branchId)) {
      throw denied('branch_not_allowed', 'You cannot change quotations for this branch');
    }
    if (!NEXT_STATUS[quote.status].includes(input.status)) {
      throw failedPrecondition(
        'invalid_transition',
        `A ${quote.status} quotation cannot be marked ${input.status}`,
      );
    }
    tx.update(refs.quotation(input.quotationId), {
      status: input.status,
      statusChangedAt: now,
      statusChangedBy: caller.uid,
    });
    return {
      result: { quotationId: input.quotationId, status: input.status },
      audit: {
        target: companyTarget(input.companyId),
        entityType: 'quotation',
        entityId: input.quotationId,
        before: { status: quote.status },
        after: { status: input.status },
      },
    };
  },
});
