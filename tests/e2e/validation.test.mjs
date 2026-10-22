// Unit tests for the shared validation rules (used by browser and server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalisePhone, validateChecklistRequest, validateConsultation } from '../../src/lib/validation.js';
import { classifySource } from '../../src/lib/attribution.js';

const goodConsultation = {
  fullName: '  Ade   Bello ',
  businessName: 'Bello Produce Ventures',
  businessType: 'wholesaler',
  businessSize: '6-20',
  email: 'Ade@Example.com ',
  phone: '0803 123 4567',
  preferredContact: 'whatsapp',
  challenge: 'stock-losses',
  recordsState: 'paper',
  timeframe: '1-month',
  service: 'health-check',
  additionalInfo: 'Line one\nLine two',
  privacyAck: true,
  marketingConsent: false,
};

test('valid consultation passes and is normalised', () => {
  const { valid, values, errors } = validateConsultation(goodConsultation);
  assert.deepEqual(errors, {});
  assert.ok(valid);
  assert.equal(values.fullName, 'Ade Bello');
  assert.equal(values.email, 'ade@example.com');
  assert.equal(values.phone, '+2348031234567');
  assert.equal(values.additionalInfo, 'Line one\nLine two');
  assert.equal(values.marketingConsent, false);
});

test('empty consultation reports every required field', () => {
  const { valid, errors } = validateConsultation({});
  assert.ok(!valid);
  for (const k of ['fullName', 'businessName', 'businessType', 'businessSize', 'email', 'phone', 'preferredContact', 'challenge', 'recordsState', 'timeframe', 'service', 'privacyAck']) {
    assert.ok(errors[k], `expected an error for ${k}`);
  }
  assert.ok(!errors.additionalInfo, 'additional info is optional');
});

test('either email or phone is enough, but it must match the chosen contact method', () => {
  const emailOnly = { ...goodConsultation, phone: '', preferredContact: 'email' };
  assert.ok(validateConsultation(emailOnly).valid);
  const mismatch = { ...goodConsultation, phone: '', preferredContact: 'whatsapp' };
  assert.ok(validateConsultation(mismatch).errors.phone);
});

test('unknown option values and non-boolean consent are rejected (tampered requests)', () => {
  const { errors } = validateConsultation({ ...goodConsultation, service: 'free-money', privacyAck: 'yes' });
  assert.ok(errors.service);
  assert.ok(errors.privacyAck);
});

test('length limits and control characters', () => {
  const { errors, values } = validateConsultation({ ...goodConsultation, additionalInfo: 'x'.repeat(1001), fullName: 'Ade\u0000 Bello' });
  assert.ok(errors.additionalInfo);
  assert.equal(values.fullName, 'Ade Bello');
});

test('phone normalisation', () => {
  assert.equal(normalisePhone('08031234567'), '+2348031234567');
  assert.equal(normalisePhone('+234 803 123 4567'), '+2348031234567');
  assert.equal(normalisePhone('2348031234567'), '+2348031234567');
  assert.equal(normalisePhone('12345'), null);
  assert.equal(normalisePhone('0803-ABC-4567'), null);
});

test('checklist request needs name, valid email and privacy acknowledgement only', () => {
  assert.ok(validateChecklistRequest({ fullName: 'Ade', email: 'ade@example.com', privacyAck: true }).valid);
  const { errors } = validateChecklistRequest({ fullName: '', email: 'not-an-email', privacyAck: false });
  assert.deepEqual(Object.keys(errors).sort(), ['email', 'fullName', 'privacyAck']);
});

test('lead source classification', () => {
  assert.equal(classifySource({ utm_source: 'linkedin', utm_medium: 'social' }), 'linkedin-organic');
  assert.equal(classifySource({ referrerHost: 'www.linkedin.com' }), 'linkedin-organic');
  assert.equal(classifySource({ referrerHost: 'lnkd.in' }), 'linkedin-organic');
  assert.equal(classifySource({ utm_source: 'whatsapp' }), 'campaign');
  assert.equal(classifySource({ referrerHost: 'www.google.com' }), 'search');
  assert.equal(classifySource({ referrerHost: 'naccima.com' }), 'referral');
  assert.equal(classifySource({}), 'direct');
});
