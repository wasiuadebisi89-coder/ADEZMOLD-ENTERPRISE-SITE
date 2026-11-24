import { SUPPORT } from '../../lib/support';
import { LegalLayout } from './LegalLayout';

export default function Terms() {
  return (
    <LegalLayout title="Terms of use">
      <p>
        These terms apply to Adezmold BMS, the business management service run by {SUPPORT.operator}{' '}
        ({SUPPORT.rcNumber}). By creating an account or using BMS you agree to them. If you use BMS
        for a company, you confirm you may accept them for that company.
      </p>

      <h2>Accounts and companies</h2>
      <ul>
        <li>Give accurate details and keep your password private.</li>
        <li>
          Every new company is checked before it goes live. We may decline a registration, for
          example if the details cannot be verified.
        </li>
        <li>
          Company administrators decide who can use the company's records and what each person can
          do. Actions taken with a user's account are treated as that user's.
        </li>
      </ul>

      <h2>Your records</h2>
      <ul>
        <li>
          Your company owns the records it enters. We use them only to run the service for you, as
          the privacy policy describes.
        </li>
        <li>
          You are responsible for the accuracy of your records and for your tax returns, statutory
          filings and audits. BMS is a tool and does not give accounting, tax or legal advice.
        </li>
        <li>
          Make sure you may store the personal data you enter about customers, suppliers and staff.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not use BMS to break the law, or try to:</p>
      <ul>
        <li>reach another company's records or another person's account;</li>
        <li>overload, probe or disrupt the service, or get around its security;</li>
        <li>record false transactions to mislead anyone, including tax authorities.</li>
      </ul>
      <p>
        We may suspend a company or user that breaks these terms. Suspension does not delete
        records.
      </p>

      <h2>Fees</h2>
      <p>Any fees, and what they cover, will be agreed with you before they apply.</p>

      <h2>Availability and changes</h2>
      <p>
        We work to keep BMS available and your data backed up, but we cannot promise the service
        will never be interrupted. We may improve or change features; we will give notice before
        removing a feature you rely on.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, BMS is provided as it is, and we are not liable for indirect
        losses such as lost profit or business. Nothing in these terms limits liability that cannot
        be limited by law.
      </p>

      <h2>Ending use</h2>
      <p>
        You may stop using BMS at any time. Contact us to close a company and to get a copy of its
        records first.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>
    </LegalLayout>
  );
}
