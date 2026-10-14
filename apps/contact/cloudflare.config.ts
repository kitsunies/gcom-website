import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'gcom-contact',
    entrypoint: './contact.mjs',
    compatibilityDate: '2026-10-06',
    domains: ['gcom-contact.techtom.tech'],
    workersDev: false,
    env: {
      CONTACT_ALLOWED_ORIGIN: bindings.text('https://gcom.techtom.tech'),
      CONTACT_RECIPIENT: bindings.text('kitsunies@gmail.com'),
      // shortcut: Resend's sandbox only reaches the account owner; use a verified club domain before changing the recipient.
      CONTACT_FROM: bindings.text('onboarding@resend.dev'),
      RESEND_API_KEY: bindings.secret(),
      CONTACT_RATE_LIMIT: bindings.rateLimit({
        namespace: '1001',
        simple: { limit: 5, period: 60 },
      }),
    },
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: { enabled: true },
      traces: { enabled: true },
    },
  },
});
