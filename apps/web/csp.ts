import type { Plugin } from 'vite';

/**
 * Content Security Policy for deployed builds (docs/bms/SECURITY_REVIEW.md §3). It is a meta tag
 * rather than a hosting header so that emulator builds, which talk to 127.0.0.1, are not bound
 * by it; frame-ancestors cannot be set in a meta tag, so X-Frame-Options in firebase.json covers
 * framing.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.gstatic.com https://firebasestorage.googleapis.com",
  "font-src 'self'",
  'connect-src https://*.googleapis.com https://*.cloudfunctions.net https://*.run.app https://www.google.com',
  'frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/ https://*.firebaseapp.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function contentSecurityPolicy(): Plugin {
  let mode = 'production';
  return {
    name: 'bms-csp',
    apply: 'build',
    configResolved(config) {
      mode = config.mode;
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        if (mode === 'emulator') return [];
        return [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}
