// Form validation shared by the browser and the server (Stage 4 imports this
// same file, so both sides apply identical rules). Plain JS, no dependencies.
import {
  businessSizes,
  businessTypes,
  challenges,
  contactMethods,
  recordStates,
  serviceOptions,
  timeframes,
} from '../content/forms.js';

const values = (list) => new Set(list.map((o) => o.value));
const ENUMS = {
  businessType: values(businessTypes),
  businessSize: values(businessSizes),
  challenge: values(challenges),
  recordsState: values(recordStates),
  timeframe: values(timeframes),
  preferredContact: values(contactMethods),
  service: values(serviceOptions),
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Trim, collapse inner whitespace (except in long text), strip control characters.
export function clean(value, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  let v = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!multiline) v = v.replace(/\s+/g, ' ');
  return v;
}

// Returns a normalised Nigerian/international number (+234…), or null if invalid.
export function normalisePhone(raw) {
  const digits = clean(raw).replace(/[\s\-().]/g, '');
  if (!/^\+?\d{10,15}$/.test(digits)) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`;
  return null;
}

function text(errors, out, input, key, label, { required = false, min = 2, max = 120, multiline = false } = {}) {
  const v = clean(input[key], { multiline });
  if (!v) {
    if (required) errors[key] = `Enter your ${label}.`;
  } else if (v.length < min) errors[key] = `${label[0].toUpperCase() + label.slice(1)} looks too short.`;
  else if (v.length > max) errors[key] = `Keep this under ${max} characters.`;
  out[key] = v;
}

function choice(errors, out, input, key, message, { required = true } = {}) {
  const v = clean(input[key]);
  if (!v) {
    if (required) errors[key] = message;
  } else if (!ENUMS[key].has(v)) errors[key] = message;
  out[key] = v || null;
}

function contact(errors, out, input, { emailRequired }) {
  const email = clean(input.email).toLowerCase();
  const phoneRaw = clean(input.phone);
  if (email && (!EMAIL.test(email) || email.length > 254)) errors.email = 'Enter a valid email address, like name@business.com.';
  const phone = phoneRaw ? normalisePhone(phoneRaw) : null;
  if (phoneRaw && !phone) errors.phone = 'Enter a valid phone number, like 0803 123 4567.';
  if (emailRequired && !email) errors.email = 'Enter your email address so we can send the checklist.';
  if (!emailRequired && !email && !phoneRaw) {
    errors.email = 'Give us an email address or a phone number.';
    errors.phone = 'Give us an email address or a phone number.';
  }
  out.email = email || null;
  out.phone = phone;
}

function consents(errors, out, input) {
  if (input.privacyAck !== true) errors.privacyAck = 'Please confirm you have read the privacy notice.';
  out.privacyAck = input.privacyAck === true;
  out.marketingConsent = input.marketingConsent === true;
}

/** @returns {{ values: object, errors: Record<string,string>, valid: boolean }} */
export function validateConsultation(input = {}) {
  const errors = {};
  const out = {};
  text(errors, out, input, 'fullName', 'full name', { required: true, max: 100 });
  text(errors, out, input, 'businessName', 'business name', { required: true });
  choice(errors, out, input, 'businessType', 'Choose the option closest to your business.');
  choice(errors, out, input, 'businessSize', 'Choose roughly how many staff you have.');
  contact(errors, out, input, { emailRequired: false });
  choice(errors, out, input, 'preferredContact', 'Choose how you would like us to contact you.');
  if (out.preferredContact === 'email' && !out.email && !errors.email) errors.email = 'Add an email address, or choose another contact method.';
  if ((out.preferredContact === 'phone' || out.preferredContact === 'whatsapp') && !out.phone && !errors.phone)
    errors.phone = 'Add a phone number, or choose email.';
  choice(errors, out, input, 'challenge', 'Choose your main business challenge.');
  choice(errors, out, input, 'recordsState', 'Choose how you keep records today.');
  choice(errors, out, input, 'timeframe', 'Choose when you would like help.');
  choice(errors, out, input, 'service', 'Choose a service, or “Not sure yet”.');
  text(errors, out, input, 'additionalInfo', 'details', { min: 0, max: 1000, multiline: true });
  consents(errors, out, input);
  return { values: out, errors, valid: Object.keys(errors).length === 0 };
}

export function validateChecklistRequest(input = {}) {
  const errors = {};
  const out = {};
  text(errors, out, input, 'fullName', 'name', { required: true, max: 100 });
  contact(errors, out, input, { emailRequired: true });
  delete out.phone; // the checklist form does not ask for a phone number
  text(errors, out, input, 'businessName', 'business name');
  choice(errors, out, input, 'businessType', 'Choose the option closest to your business.', { required: false });
  consents(errors, out, input);
  return { values: out, errors, valid: Object.keys(errors).length === 0 };
}
