// The 25-Point Produce Business Health Checklist.
// Used for the homepage teaser now, and for the landing page and PDF in later stages.
// Educational guidance only: not an audit, certification or compliance opinion.

export const checklistTitle = 'The 25-Point Produce Business Health Checklist';

export const checklistSections = [
  {
    id: 'cash',
    title: 'Cash and bank management',
    items: [
      'Every sale is recorded on the day it happens, including cash sales.',
      'Cash on hand is counted and agreed to the sales record at each day’s close.',
      'Business money and personal money are kept in separate accounts.',
      'Bank statements are reconciled to your records at least once a month.',
    ],
  },
  {
    id: 'stock',
    title: 'Stock control and stock losses',
    items: [
      'Every delivery is weighed or counted on arrival and recorded against its waybill.',
      'Differences between quantities dispatched and quantities received are recorded and explained.',
      'Physical stock is counted at least monthly and compared with the stock record.',
      'Spoiled, damaged or downgraded stock is recorded with the reason and who approved it.',
    ],
  },
  {
    id: 'credit',
    title: 'Debtors and creditors',
    items: [
      'Each credit customer has an agreed credit limit and payment period.',
      'You keep an up-to-date list of who owes you, how much, and for how long.',
      'You know exactly what you owe each supplier and when it falls due.',
    ],
  },
  {
    id: 'records',
    title: 'Sales and purchasing records',
    items: [
      'Each sale has a receipt or invoice showing date, quantity, price and buyer.',
      'Each purchase is supported by a receipt, waybill or supplier invoice.',
      'Unit prices paid and received are recorded so you can compare them over time.',
    ],
  },
  {
    id: 'profit',
    title: 'Gross profit and operating costs',
    items: [
      'You know your gross profit for each product line, not only total sales.',
      'Transport, loading, storage and market levies are recorded as separate costs.',
      'You compare each month’s costs and margins with previous months.',
    ],
  },
  {
    id: 'staff',
    title: 'Staff responsibilities and operating procedures',
    items: [
      'Each staff member has written duties, including who handles cash and who handles stock.',
      'No one person both receives stock and records it without a second check.',
      'Key routines (intake, dispatch, daily cash close) are written down so others can follow them.',
    ],
  },
  {
    id: 'compliance',
    title: 'Business documentation and compliance readiness',
    items: [
      'Business registration documents are current and easy to find.',
      'Receipts, invoices and waybills are filed and kept for a defined period.',
      'You know which taxes and levies apply to your business and keep records that support them.',
    ],
  },
  {
    id: 'reporting',
    title: 'Management reporting',
    items: [
      'You review a simple monthly summary of sales, costs, profit, debtors and stock.',
      'Within one day, you can tell how much cash, stock and money owed to you the business has.',
    ],
  },
];

export const checklistItemCount = checklistSections.reduce((n, s) => n + s.items.length, 0);

// Short labels for the homepage teaser card.
export const checklistTeaser = [
  'Daily cash count agreed to the sales record',
  'Dispatch vs. delivery differences explained',
  'Who owes you, how much, and for how long',
];
