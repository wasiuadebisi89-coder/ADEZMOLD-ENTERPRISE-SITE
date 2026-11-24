import { Mail, MessageCircle, Phone } from 'lucide-react';
import { SUPPORT, supportMailto, supportTel, supportWhatsApp } from '../lib/support';
import { cn } from '../lib/utils';

/** Email, phone and WhatsApp links for Adezmold support. */
export function SupportContact({ subject, className }: { subject?: string; className?: string }) {
  const link = 'inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline';
  return (
    <ul
      className={cn('flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm', className)}
      aria-label="Contact support"
    >
      <li>
        <a className={link} href={supportMailto(subject)}>
          <Mail className="size-4" aria-hidden /> {SUPPORT.email}
        </a>
      </li>
      <li>
        <a className={link} href={supportTel}>
          <Phone className="size-4" aria-hidden /> {SUPPORT.phoneDisplay}
        </a>
      </li>
      <li>
        <a className={link} href={supportWhatsApp} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="size-4" aria-hidden /> WhatsApp
        </a>
      </li>
    </ul>
  );
}
