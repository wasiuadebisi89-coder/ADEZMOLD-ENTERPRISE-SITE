/**
 * How customers reach Adezmold for help. Shown on the company status screens, the legal pages
 * and in Settings. Change it here; nothing else holds these details.
 */
export const SUPPORT = {
  /** Who runs the service, as named on the legal pages. */
  operator: 'Adezmold Enterprise',
  rcNumber: 'RC 1445936',
  email: 'adezmoldent@gmail.com',
  /** E.164 without the plus, for tel: and wa.me links. */
  phoneE164: '2347031565506',
  phoneDisplay: '+234 703 156 5506',
  website: 'https://bmsclick.com.ng',
} as const;

export const supportMailto = (subject?: string) =>
  `mailto:${SUPPORT.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
export const supportTel = `tel:+${SUPPORT.phoneE164}`;
export const supportWhatsApp = `https://wa.me/${SUPPORT.phoneE164}`;
