// The three principal services. Shared by the homepage cards, the Services
// page (Stage 3) and the consultation form's service selector.
// Durations come from the approved design and should be confirmed by Adezmold.

export const services = [
  {
    id: 'health-check',
    title: 'Produce Business Health Check',
    badge: 'Audit',
    icon: 'troubleshoot',
    tone: 'secondary',
    summary:
      'A structured diagnostic of where cash leaks, stock shrinks and margins erode, from purchase point through transit to sale.',
    tag: '14-Day Cycle',
    deliverables: [
      'Detailed cash and bank reconciliation review',
      'Farm-gate to depot transit loss profiling',
      'Written remediation plan with priorities',
    ],
    cta: 'Review Diagnostic Scope',
    problem:
      'Money comes in, stock goes out, yet the profit you expect is not in the bank, and nobody can say exactly where it went.',
    customers:
      'Produce merchants, wholesalers and distributors who suspect losses in cash, stock or credit but have no clear picture of the size or source.',
    scope: [
      'Review of cash handling, bank records and daily sales recording',
      'Comparison of quantities bought, dispatched, received and sold',
      'Review of customers owing money and supplier balances',
      'Gross margin check by product line, where records allow',
      'Interviews with the owner and key staff on how work is actually done',
      'A written findings report with a prioritised remediation plan',
    ],
    process: [
      'Discovery call to agree scope and the records needed',
      'On-site review of records and operations',
      'Analysis of the findings',
      'Walk-through of the report and remediation plan with the owner',
    ],
    limits: [
      'This is a management diagnostic, not a statutory audit, and it does not produce audited financial statements or tax filings.',
      'Findings depend on the records and access available; where records are missing, we say so rather than estimate.',
    ],
  },
  {
    id: 'systems-implementation',
    title: 'Business Systems Implementation',
    badge: 'Execution',
    icon: 'schema',
    tone: 'primary',
    summary:
      'Tailored operating procedures, inventory logs and accounting controls that your own staff can run without you watching every step.',
    tag: 'Floor Deployment',
    deliverables: [
      'Intake, weighing and sorting verification logs',
      'Simple daily shift reconciliations for store staff',
      'Hands-on supervisor training and follow-through',
    ],
    cta: 'Explore Implementation Framework',
    problem:
      'The owner is the only control system. When they are away, stock, cash and credit decisions drift, and problems surface weeks later.',
    customers:
      'Growing produce and commodity businesses ready to put written routines in place, usually after a Health Check or with an obvious control gap.',
    scope: [
      'Written standard operating procedures for intake, storage, dispatch and daily cash close',
      'Stock, weighing and waybill logs designed for your products and staff',
      'Buyer credit limits, approval rules and a debt recovery routine',
      'Clear duties and sign-offs so no one person controls a transaction alone',
      'Training and on-the-floor coaching for supervisors and staff',
      'Setup of spreadsheets or business software where it suits the business',
    ],
    process: [
      'Agree the controls to implement and the order to roll them out',
      'Design forms, logs and procedures with your team',
      'Roll out on site with staff coaching',
      'Follow-up checks that the new routines are being used',
    ],
    limits: [
      'Equipment and software (scales, computers, licences) are not included and are quoted separately where needed.',
      'Lasting results depend on management continuing to enforce the routines after rollout.',
    ],
  },
  {
    id: 'ongoing-advisory',
    title: 'Ongoing Business Advisory',
    badge: 'Governance',
    icon: 'query_stats',
    tone: 'tertiary',
    summary:
      'Regular performance reviews and accountability so the owner keeps sight of the business without being on site every day.',
    tag: 'Monthly Retainer',
    deliverables: [
      'Monthly gross margin review',
      'Unannounced store stock-count routines',
      'Working capital and financing guidance',
    ],
    cta: 'Learn About Retainer Advisory',
    problem:
      'New systems slip back into old habits without regular review, and the owner has no independent view of how the business is really performing.',
    customers:
      'Owners who want an outside adviser to review performance each month and hold the team to agreed standards.',
    scope: [
      'Monthly review of sales, costs, gross margin, debtors and stock',
      'Unannounced stock counts and spot checks on agreed routines',
      'A simple monthly scorecard with actions for the coming month',
      'Guidance on working capital, cash planning and preparing for financing',
      'A regular review meeting with the owner',
    ],
    process: [
      'Agree the measures and the monthly reporting the business will provide',
      'Monthly review, spot checks and scorecard',
      'Review meeting and action list',
      'Quarterly look at what to strengthen next',
    ],
    limits: [
      'We give business advice, not legal, tax-filing or audit opinions; we work alongside your accountant and lawyer where needed.',
      'Financing guidance helps you prepare; it cannot guarantee that a lender will approve.',
    ],
  },
];

export const serviceById = Object.fromEntries(services.map((s) => [s.id, s]));
