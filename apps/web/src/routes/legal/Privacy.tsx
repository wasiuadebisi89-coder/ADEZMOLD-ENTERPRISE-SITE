import { SUPPORT } from '../../lib/support';
import { LegalLayout } from './LegalLayout';

export default function Privacy() {
  return (
    <LegalLayout title="Privacy policy">
      <p>
        This policy explains what personal data Adezmold BMS collects, why, and the choices you
        have. It is written to meet the Nigeria Data Protection Act 2023 (NDPA).
      </p>

      <h2>Two kinds of data</h2>
      <ul>
        <li>
          <strong>Your account.</strong> When you sign up we hold your name, email address and
          sign-in details. For this data, {SUPPORT.operator} is the data controller.
        </li>
        <li>
          <strong>Your business records.</strong> Companies that use BMS enter their own records,
          which can include details of their customers, suppliers and staff (names, phone numbers,
          emails, addresses, tax numbers and balances). The company that enters them is the data
          controller; we process them only to run the service for that company.
        </li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email address and a securely stored password.</li>
        <li>
          Company details given at registration and in Settings, such as legal name, address, phone,
          RC number and TIN.
        </li>
        <li>
          Records you post: journals, sales, purchases, stock, payments and the other documents in
          the app, with who posted them and when.
        </li>
        <li>
          Security data: the time, IP address and browser of each change, kept in the company's
          audit log, and a reCAPTCHA check by Google that protects the service from abuse.
        </li>
      </ul>
      <p>We do not use advertising cookies or trackers, and we do not sell personal data.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide the service you signed up for (performance of a contract).</li>
        <li>
          To keep the service secure, prevent fraud and approve new companies (legitimate interest).
        </li>
        <li>To send account emails such as verification and password resets.</li>
        <li>To meet legal obligations, for example keeping accounting records.</li>
      </ul>

      <h2>Where it is stored and who processes it</h2>
      <p>
        BMS runs on Google Cloud and Firebase, in Google's europe-west1 region (Belgium). Google
        processes the data for us under its data processing terms, which include safeguards for
        transfers out of Nigeria. Data is encrypted in transit and at rest, backed up daily, and
        each company can see only its own records.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep account and business records while the company uses BMS. Accounting records are
        generally kept for at least six years, as Nigerian tax and company law expects. When a
        company leaves, we delete or return its records on request, unless the law requires us to
        keep them. Backups expire within 14 weeks.
      </p>

      <h2>Your rights</h2>
      <p>Under the NDPA you can ask us to:</p>
      <ul>
        <li>give you a copy of your personal data;</li>
        <li>correct data that is wrong or incomplete;</li>
        <li>delete your data, where we are not required to keep it;</li>
        <li>send your data to you or another provider in a common format;</li>
        <li>stop or limit processing you object to, or withdraw consent you gave.</li>
      </ul>
      <p>
        If your data was entered by a business that uses BMS, contact that business first; we will
        help them answer you. You can also complain to the Nigeria Data Protection Commission
        (NDPC).
      </p>

      <h2>Children</h2>
      <p>BMS is a business tool and is not meant for anyone under 18.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy we will update the date above, and tell company administrators in
        the app or by email before a significant change applies.
      </p>
    </LegalLayout>
  );
}
