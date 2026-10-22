// Turns validated form values into the stored records. Operational lead data,
// consent records and (later) internal notes are kept in separate places.
import { sha256 } from './ids.js';
import { validateChecklistRequest, validateConsultation } from '../src/lib/validation.js';

const today = () => new Date().toISOString().slice(0, 10);

const pipeline = () => ({ owner: null, followUpAt: null, proposalValue: null, wonValue: null, outcome: null });

function consentRecord(kind, v, attribution, config) {
  return {
    kind,
    email: v.email ?? null,
    phone: v.phone ?? null,
    privacyAck: v.privacyAck === true,
    privacyNoticeVersion: config.privacyNoticeVersion,
    marketing: v.marketingConsent === true,
    method: 'web-form',
    formPath: attribution.formPath,
  };
}

export const consultation = {
  kind: 'consultation',
  validate: validateConsultation,
  toRecord(v, attribution, config) {
    return {
      dedupeKey: sha256('consultation', v.email ?? v.phone, v.service, today()),
      lead: {
        kind: 'consultation',
        contact: { fullName: v.fullName, email: v.email, phone: v.phone, preferredContact: v.preferredContact },
        business: { name: v.businessName, type: v.businessType, size: v.businessSize },
        inquiry: {
          service: v.service,
          challenge: v.challenge,
          recordsState: v.recordsState,
          timeframe: v.timeframe,
          additionalInfo: v.additionalInfo || null,
        },
        attribution,
        marketingConsent: v.marketingConsent === true,
        email: { acknowledgement: { state: 'pending' }, internalAlert: { state: 'pending' } },
        pipeline: pipeline(),
      },
      consent: consentRecord('consultation', v, attribution, config),
    };
  },
};

export const checklist = {
  kind: 'checklist',
  validate: validateChecklistRequest,
  toRecord(v, attribution, config) {
    return {
      dedupeKey: sha256('checklist', v.email, today()),
      lead: {
        kind: 'checklist',
        contact: { fullName: v.fullName, email: v.email, phone: null, preferredContact: 'email' },
        business: { name: v.businessName || null, type: v.businessType, size: null },
        inquiry: { resource: 'produce-business-health-checklist' },
        attribution,
        marketingConsent: v.marketingConsent === true,
        email: { checklistDelivery: { state: 'pending' }, internalAlert: { state: 'pending' } },
        pipeline: pipeline(),
      },
      consent: consentRecord('checklist', v, attribution, config),
    };
  },
};
