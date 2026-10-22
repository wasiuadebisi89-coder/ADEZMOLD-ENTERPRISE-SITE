// Option lists for the lead forms. The `value`s are stored in the database, so
// keep them stable; labels can be reworded freely.
import { services } from './services.js';

export const businessTypes = [
  { value: 'produce-merchant', label: 'Produce merchant / trader' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'distributor', label: 'Distributor / haulier' },
  { value: 'processor', label: 'Agro-processor (e.g. oil, grains, cashew, cocoa)' },
  { value: 'retail-sme', label: 'Retailer or other SME' },
  { value: 'other', label: 'Other' },
];

export const businessSizes = [
  { value: '1-5', label: '1–5 staff' },
  { value: '6-20', label: '6–20 staff' },
  { value: '21-50', label: '21–50 staff' },
  { value: '51+', label: 'More than 50 staff' },
];

export const challenges = [
  { value: 'cash-control', label: 'Cash and bank control' },
  { value: 'stock-losses', label: 'Stock or transit losses' },
  { value: 'credit', label: 'Customers owing money / credit control' },
  { value: 'staff', label: 'Staff accountability' },
  { value: 'records', label: 'Poor or missing records' },
  { value: 'profitability', label: 'Not sure if the business is profitable' },
  { value: 'growth', label: 'Growth, structure or financing' },
  { value: 'other', label: 'Something else' },
];

export const recordStates = [
  { value: 'none', label: 'Little or no written records' },
  { value: 'paper', label: 'Paper books / notebooks' },
  { value: 'spreadsheet', label: 'Spreadsheets (e.g. Excel)' },
  { value: 'software', label: 'Accounting or inventory software' },
];

export const timeframes = [
  { value: 'urgent', label: 'As soon as possible (within 2 weeks)' },
  { value: '1-month', label: 'Within a month' },
  { value: '1-3-months', label: 'In 1–3 months' },
  { value: 'exploring', label: 'Just exploring for now' },
];

export const contactMethods = [
  { value: 'phone', label: 'Phone call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
];

export const serviceOptions = [
  ...services.map((s) => ({ value: s.id, label: s.title })),
  { value: 'not-sure', label: 'Not sure yet — advise me' },
];
