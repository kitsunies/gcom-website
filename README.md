# GCOM website

The website for GCOM, the Monash University Game Development Club. Static pages on GitHub Pages, content managed in Sanity, and a separate service for contact email.

## Stack

| Part          | Technology                       | Location                            |
| ------------- | -------------------------------- | ----------------------------------- |
| Website       | React, TypeScript, Vite and CSS  | `apps/web`                          |
| CMS           | Sanity Studio                    | `apps/studio`                       |
| Contact email | Cloudflare Worker and Resend     | `apps/contact`                      |
| Hosting       | GitHub Pages and GitHub Actions  | `.github/workflows`                 |
| Events        | Luma calendar imported into JSON | `apps/web/scripts/import-events.ts` |

Sanity manages page copy, navigation, images, membership links and the committee roster. Builds fetch published content, validate it and bake it into prerendered HTML and the React bundle. Visitors read the static site without querying the CMS. Events are imported separately from Luma.

The contact form sends requests to the Worker, which validates submissions, limits spam and delivers email through Resend. Messages never go into Sanity. A direct-email fallback remains available.

## Run locally

Use Node.js **22.18 or newer** and npm. From the repository root:

```sh
npm ci
npm run dev
```

Local development uses committed fixtures and needs no CMS credentials. Copy [apps/web/.env.example](apps/web/.env.example) to `apps/web/.env` to configure the website. An empty `VITE_CONTACT_ENDPOINT` leaves email delivery unconfigured.

| Command                 | Purpose                            |
| ----------------------- | ---------------------------------- |
| `npm run build`         | Build into `apps/web/dist`         |
| `npm run preview`       | Preview the built website          |
| `npm test`              | Test all three apps                |
| `npm run format:check`  | Check formatting                   |
| `npm run dev:studio`    | Start the configured CMS           |
| `npm run dev:contact`   | Start the contact Worker           |
| `npm run build:contact` | Check deployment without uploading |

## Use Sanity

Copy [apps/studio/.env.example](apps/studio/.env.example) to `apps/studio/.env`, set your project ID and dataset, then run `npm run dev:studio`.

For CMS-backed website builds, set `CONTENT_SOURCE=sanity`, `SANITY_PROJECT_ID` and `SANITY_DATASET` in the website env file. Add `SANITY_READ_TOKEN` for a private dataset. Only published documents are included.

Optional: `npm run seed:content` loads fixtures into a non-production dataset using shell variables `SANITY_PROJECT_ID`, `SANITY_DATASET` and `SANITY_WRITE_TOKEN`. It skips existing documents and refuses `production`.

## Deployment

**Website:** the [Pages workflow](.github/workflows/pages.yml) tests and builds the apps before publishing. It refreshes every 30 minutes and supports CMS webhook triggers. Deployment requires `main`, the production dataset and `SANITY_PUBLICATION_ENABLED=true`.

For your own copy, enable GitHub Pages through Actions. Set repository variables `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SITE_ORIGIN` and `SITE_BASE`. Use `/` for a custom domain or `/repository-name/` for a project site. Store `SANITY_READ_TOKEN` and `LUMA_ICAL_URL` as repository secrets when needed. Staging runs validate without deploying.

**Contact:** configure your domain, allowed website origin, recipient and verified Resend sender in [cloudflare.config.ts](apps/contact/cloudflare.config.ts). Deploy separately from `apps/contact`, keeping `RESEND_API_KEY` in an external env file:

```sh
npx cf deploy --secrets-file /path/to/contact.env
```

Set repository variable `CONTACT_ENDPOINT` to the deployed HTTPS URL ending in `/api/contact`, then rebuild the website. Local settings use `VITE_CONTACT_ENDPOINT` and an ignored Worker `.dev.vars` file; match `CONTACT_ALLOWED_ORIGIN` to your local website.

When forking, replace GCOM content, domains and the [webhook destination](apps/studio/webhook.json). Never commit credentials or put them in public `VITE_` variables.

## License and credits

Source code: [MIT](LICENSE). GCOM logos, artwork, photographs and editorial content are excluded. Dependencies and fonts retain their own licenses; font notices are copied into website builds.

CMS patterns and contact delivery are adapted from [Monash Association of Coding](https://github.com/monashcoding/monashcoding-site), which declares ISC licensing. See [third-party notices](THIRD_PARTY_NOTICES).
