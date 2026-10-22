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
  },
];

export const serviceById = Object.fromEntries(services.map((s) => [s.id, s]));
