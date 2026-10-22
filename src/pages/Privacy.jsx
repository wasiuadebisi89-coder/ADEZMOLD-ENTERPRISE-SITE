import { site } from '../config/site.js';
import { PageHeader, wrap } from '../components/ui.jsx';
import { AttributionPreference } from '../components/ConsentBanner.jsx';

// Keep in step with PRIVACY_NOTICE_VERSION on the server: consent records store this version.
export const PRIVACY_VERSION = '2026-10';
const LAST_UPDATED = '22 October 2026';

const controller = site.legalEntity ?? site.name;

function H({ id, children }) {
  return (
    <h2 id={id} className="font-headline-sm text-headline-sm text-on-surface font-bold mt-space-lg scroll-mt-24">
      {children}
    </h2>
  );
}
const P = ({ children }) => <p className="font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant">{children}</p>;
const UL = ({ items }) => (
  <ul className="list-disc pl-5 flex flex-col gap-1.5 font-body-md text-body-md md:font-body-lg md:text-body-lg text-on-surface-variant">
    {items.map((i) => (
      <li key={typeof i === 'string' ? i : i.key}>{i}</li>
    ))}
  </ul>
);

const contactLine = (
  <>
    by phone on{' '}
    <a href={site.contact.phoneHref} className="text-secondary font-semibold underline">
      {site.contact.phoneDisplay}
    </a>
    {site.contact.email && (
      <>
        , by email to{' '}
        <a href={`mailto:${site.contact.email}`} className="text-secondary font-semibold underline">
          {site.contact.email}
        </a>
      </>
    )}
    , or in writing to {site.contact.addressLines.join(', ')}
  </>
);

export default function Privacy() {
  return (
    <>
      <PageHeader
        icon="lock"
        eyebrow="Privacy notice"
        title="How we handle your information"
        text={`This notice explains what ${site.name} collects through this website, why, who it is shared with, how long it is kept, and your rights under the Nigeria Data Protection Act 2023.`}
      />
      <article className={`${wrap} pb-space-xl`}>
        <div className="mx-auto w-full max-w-3xl flex flex-col gap-space-sm" data-testid="privacy-notice">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Version {PRIVACY_VERSION} · Last updated {LAST_UPDATED}
          </p>

          <H id="who">Who we are</H>
          <P>
            {controller} (“Adezmold”, “we”) decides how the personal information collected through this website is used, and is responsible
            for it. You can contact us about anything in this notice {contactLine}.
          </P>

          <H id="what">What we collect</H>
          <P>Only what you give us in our forms, plus a small amount of technical information needed to run the site safely:</P>
          <UL
            items={[
              'Checklist request: your name and email address, and optionally your business name and type.',
              'Consultation request: your name, business name, type and size, phone number and/or email address, how you prefer to be contacted, your main business challenge, how you keep records, your timeframe, the service you are interested in, and anything else you choose to tell us.',
              'Your choices: that you read this notice, and whether you agreed to receive occasional emails from us.',
              'Where you came from, only if you allow it: the campaign tags in the link you used (for example from a LinkedIn post), the website that referred you, and the page you first landed on.',
              'Security information: your IP address is converted into a scrambled code (a one-way hash) to stop abuse such as repeated automated submissions. We do not store your IP address itself.',
              'If you download the checklist, the number of times your personal download link was used.',
            ]}
          />
          <P>
            Please do not send us bank details, passwords, identity numbers or financial records through the website. We do not need them for an
            initial conversation.
          </P>

          <H id="why">Why we use it, and our lawful basis</H>
          <UL
            items={[
              'To send you the checklist you asked for, and to respond to your consultation request and arrange a discovery session: because you asked us to, as steps taken at your request before any contract.',
              'To send you occasional practical tips and updates by email: only with your consent, which you give by ticking the separate optional box. You can withdraw it at any time.',
              'To understand which links and content bring enquiries: only with your consent, given through the choice on this site.',
              'To keep the website and your information secure, prevent spam and abuse, and keep records of who in our team accessed or changed information: our legitimate interest in running a secure service.',
              'To meet legal, tax or regulatory obligations, where they apply.',
            ]}
          />
          <P>We do not sell your information, and we do not use it to make automated decisions about you.</P>

          <H id="sharing">Who we share it with</H>
          <P>Only with service providers that run the website for us, under their terms of service and data processing terms:</P>
          <UL
            items={[
              'Vercel Inc. hosts the website and runs the forms.',
              'Google LLC, through Firebase, stores enquiry records and manages staff sign-in for our team.',
              'Resend, when email is switched on, sends the emails you request and our internal enquiry alerts.',
            ]}
          />
          <P>Within Adezmold, only authorised staff can see enquiries, through a password-protected system that records who viewed and changed what.</P>

          <H id="transfers">Transfers outside Nigeria</H>
          <P>
            These providers operate servers outside Nigeria, including in the United States and Europe, so your information may be processed
            there. We rely on the providers’ contractual data protection commitments and security measures as safeguards for these transfers, as
            the Nigeria Data Protection Act 2023 requires. Contact us if you would like more detail.
          </P>

          <H id="retention">How long we keep it</H>
          <UL
            items={[
              'Enquiries and the related consent records: up to 24 months after you contact us, then reviewed and deleted unless you become a client (client records are kept as needed for the engagement and our legal obligations).',
              'Technical records used to stop duplicate and automated submissions: up to 7 days.',
              'Records of staff actions: up to 24 months.',
              'Checklist download links stop working after 7 days.',
            ]}
          />

          <H id="browser-storage">Cookies and browser storage</H>
          <P>
            The public website does not use tracking cookies, advertising pixels or third-party analytics. If you allow it, we keep a note of which
            link brought you here in your browser’s session storage. It disappears when you close the tab and is only sent to us if you submit a
            form. We also remember your choice so we don’t ask again. Staff who sign in to our internal system receive a strictly necessary
            security cookie.
          </P>
          <AttributionPreference />

          <H id="security">How we protect it</H>
          <P>
            Information travels over encrypted connections (HTTPS). Our database cannot be reached directly from the internet, only through our
            own server. Staff access needs a personal account with a role we grant, sign-ins are limited and logged, and access can be removed
            immediately. If a breach ever puts your information at risk, we will notify the Nigeria Data Protection Commission and, where required,
            you.
          </P>

          <H id="rights">Your rights</H>
          <P>Under the Nigeria Data Protection Act 2023 you can ask us to:</P>
          <UL
            items={[
              'tell you what information we hold about you and give you a copy;',
              'correct information that is wrong or incomplete;',
              'delete your information;',
              'restrict how we use it, or object to our using it, including at any time for direct marketing;',
              'give you your information in a commonly used electronic format, or send it to another organisation;',
              'withdraw any consent you gave. This does not affect what we did before you withdrew it.',
            ]}
          />
          <P>
            To use any of these rights, contact us {contactLine}. Quote your reference number (it starts with ADZ-) if you have one. We may need to
            confirm who you are before acting. We will respond without undue delay.
          </P>
          <P>
            If you are not satisfied with our response, you can complain to the Nigeria Data Protection Commission (NDPC) at{' '}
            <a href="https://ndpc.gov.ng" target="_blank" rel="noopener noreferrer" className="text-secondary font-semibold underline">
              ndpc.gov.ng
            </a>
            .
          </P>

          <H id="children">Children</H>
          <P>This website is for business owners and is not intended for anyone under 18. We do not knowingly collect children’s information.</P>

          <H id="changes">Changes to this notice</H>
          <P>
            If we change how we use your information, we will update this page and its version number. Each enquiry record notes which version of
            this notice was shown when you submitted it.
          </P>
        </div>
      </article>
    </>
  );
}
