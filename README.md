# GCOM website

The club website stays static on GitHub Pages. Sanity manages page content and the committee roster; a small Cloudflare Worker sends contact messages through Resend.

| App            | Purpose                                                 |
| -------------- | ------------------------------------------------------- |
| `apps/web`     | React/Vite website, content fixtures and browser checks |
| `apps/studio`  | Sanity Studio, schemas and seed tools                   |
| `apps/contact` | Contact Worker; no server or database to manage         |

Use Node.js 22.18 or newer and install all workspaces once:

```sh
npm ci
npm run dev
```

Local development uses fixture content. Copy `apps/web/.env.example` to `apps/web/.env` to configure the website; never put provider or CMS credentials in `VITE_` variables. Generated HTML, content snapshots and build output are ignored.

```sh
npm run build
npm test
npm run format:check
npm run dev:studio
npm run build:contact
```

Studio requires `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET`; its example is in `apps/studio/.env.example`. [Sanity Studio](https://gcom-wtzkb2rs.sanity.studio/) publishes editorial content. Events come from Luma.

## Contact setup

The form posts to `https://gcom-contact.techtom.tech/api/contact`. The Worker validates the request and sends a plain-text email to the temporary recipient `kitsunies@gmail.com`, with the visitor's email as Reply-To. It returns success only after Resend accepts the message.

The temporary `onboarding@resend.dev` sender is Resend's sandbox and can only reach the Resend account's own email address. Use a verified club domain before changing the recipient.

1. [Verify a sender domain in Resend](https://resend.com/docs/dashboard/domains/introduction) and create an API key permitted to send from it.
2. Set `CONTACT_FROM` in `apps/contact/cloudflare.config.ts` to an address at that verified domain; keep the configured recipient and website origin.
3. Store `RESEND_API_KEY` in a mode-600 env file outside the repository, for example `~/.claude/.secrets/gcom-contact.env`.
4. Authenticate the Cloudflare CLI and deploy from the Worker directory:

```sh
cd apps/contact
npx cf deploy --secrets-file ~/.claude/.secrets/gcom-contact.env
```

5. Set GitHub's `CONTACT_ENDPOINT` repository variable to the deployed HTTPS Worker URL plus `/api/contact`; set local `VITE_CONTACT_ENDPOINT` to the same URL when needed. Rebuild the website to activate it.
6. Submit one test from the live contact page and check the recipient's inbox before considering delivery verified.

For local Worker development, put the key in an ignored `apps/contact/.dev.vars` file and set `CONTACT_ALLOWED_ORIGIN` to your exact local website origin, then run `npm run dev:contact`. Local previews from another device should use a raw tailnet IP and bind to `0.0.0.0`.

The endpoint retains request validation, a honeypot and a 16 KiB body limit. Cloudflare limits five POST attempts per IP per minute per location; this is approximate abuse protection. Missing configuration and delivery failures preserve the visitor's draft and direct-email fallback. Contact submissions and provider credentials are never stored in Sanity or the static bundle.

## Publishing and checks

GitHub Actions validates CMS content, tests all apps, builds Studio and the static website, runs browser checks, then publishes `apps/web/dist` to [gcom.techtom.tech](https://gcom.techtom.tech/). Production publication requires `SANITY_PUBLICATION_ENABLED=true`; staging builds never deploy. CMS publication webhooks and scheduled refreshes retain the existing workflow.

The Worker has separate checks and manual deployment; website publication does not deploy it. `npm run build:contact` checks deployment without uploading. Browser contact tests mock delivery and never send real messages.

Private CMS operations and historical editor recovery instructions are maintained outside this repository.

CMS patterns and the contact delivery approach are adapted from [Monash Association of Coding](https://github.com/monashcoding/monashcoding-site).
