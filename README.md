# GCOM website

The website for GCOM, the Monash University Game Development Club. Developers change the website through GitHub; committee members maintain the roster in Sanity; event organisers maintain events in Luma.

[Website](https://gcom.techtom.tech/) · [Roster editor](https://gcom-wtzkb2rs.sanity.studio/)

## Who changes what

| Owner               | Responsibility                                                                       | Where to edit               |
| ------------------- | ------------------------------------------------------------------------------------ | --------------------------- |
| GitHub contributors | Page copy, navigation, footer, metadata, settings, artwork and interactions          | React source in `apps/web`  |
| Committee editors   | Member names, roles, optional portraits, alternative text, public links and ordering | **Roster** in Sanity Studio |
| Event organisers    | Event titles, dates, venues and registration                                         | Luma                        |

Sanity is a roster editor, not a page builder. Website copy belongs beside the JSX that renders it, using component-local constants and local arrays for repeated cards. Do not add page content to Sanity or introduce a shared full-site JSON file.

Visitors receive prerendered HTML and a React bundle. The website does not query Sanity in the browser. Builds fetch and validate published roster data; drafts and private fields never enter the public snapshot.

## Contribute a website change

Use Node.js **22.18 or newer** and npm. From the repository root:

```sh
npm ci
npm run dev
```

No CMS account, token or calendar feed is needed. Local development, tests and normal builds automatically generate a fictional roster from [roster.fixture.json](apps/web/content/roster.fixture.json). These members are development data and cannot be used by a release build.

Create a branch, make the change in its owning file, check it locally, then open a pull request against `main`.

| Change                                                                              | Owning source                                       |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| Home, About, Team or Contact copy                                                   | `apps/web/src/pages/`                               |
| Navigation, footer, shared sections or mascots                                      | `apps/web/src/components/`                          |
| Contact form labels and feedback                                                    | `apps/web/src/ContactForm.tsx`                      |
| Shared membership URL, contact details, calendar destination and artwork references | `apps/web/src/content.ts`                           |
| Route titles, descriptions and social metadata                                      | `apps/web/scripts/page-metadata.ts`                 |
| Layout, styling and motion                                                          | `apps/web/src/style.css` and the affected component |

Keep accessibility, link destinations, responsive behavior and reduced-motion support intact. Generated snapshots and build output are ignored by Git; change their source instead.

Before opening a pull request:

```sh
npm run format:check
npm test
npm run build
```

Pull-request CI also typechecks/builds Studio, checks the contact Worker and runs desktop/mobile browser checks. It uses synthetic members, blocks CMS requests and receives no CMS or calendar secrets. Forks use the ordinary `pull_request` workflow.

Copy [apps/web/.env.example](apps/web/.env.example) to `apps/web/.env` only when you need local settings. `VITE_CONTACT_ENDPOINT` is a public service URL; leaving it empty keeps the direct-email fallback available. Never put credentials in a `VITE_` variable.

## Update the committee roster

Sign in to [Sanity Studio](https://gcom-wtzkb2rs.sanity.studio/) with your individual account and open **Roster**. Access must be granted by the project owner.

1. Add or edit member cards.
2. Give each member a unique ID, name and role.
3. Add an optional portrait with meaningful alternative text.
4. Add public HTTPS links and drag members into the desired order.
5. Review the draft, then select **Publish**.

Portraits retain their uploaded framing. A member without a portrait gets a placeholder. An explicitly published empty roster is valid.

Publishing queues a website refresh; it does not immediately change the live site. The update appears after the GitHub Actions build and deployment succeed. A scheduled refresh also runs every 30 minutes. If a published change does not appear, check the [Public website workflow](https://github.com/kitsunies/gcom-website/actions/workflows/pages.yml) or ask a maintainer.

Do not put private committee information or contact submissions in the roster. Drafts remain unpublished. Page text, social links in the footer and other website changes go through GitHub.

To work on Studio itself, copy [apps/studio/.env.example](apps/studio/.env.example) to `apps/studio/.env`, set `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET`, then run `npm run dev:studio`. Use a non-production dataset for development.

## Events and contact email

Create and update events in Luma. The importer uses the public calendar destination from `apps/web/src/content.ts` and a private subscription feed from `LUMA_ICAL_URL`. A failed import retains the last valid event snapshot; a release without a usable previous snapshot stops instead of publishing missing data.

The contact form posts to a separate Cloudflare Worker, which validates submissions, limits spam and delivers email through Resend. Messages never enter Sanity. The direct-email fallback remains available when delivery fails.

The Worker lives in `apps/contact` and deploys separately. Configure its domain, allowed origin, recipient and verified sender in [cloudflare.config.ts](apps/contact/cloudflare.config.ts). Keep `RESEND_API_KEY` in an external secret file:

```sh
cd apps/contact
npx cf deploy --secrets-file /path/to/contact.env
```

Set repository variable `CONTACT_ENDPOINT` to its HTTPS `/api/contact` URL, then rebuild the website. Local Worker development uses an ignored `.dev.vars` file and `npm run dev:contact`; match `CONTACT_ALLOWED_ORIGIN` to the local website.

## Maintainer builds and deployment

Merging a checked pull request into `main` deploys the website when `SANITY_PUBLICATION_ENABLED=true`. Production deployments require the production dataset. Manual staging runs validate without deploying; pull requests never deploy.

Production and staging CI each fetch their published roster once, then test and build that validated snapshot. Missing or malformed CMS data fails the release. A failed fetch preserves the previous local snapshot and never substitutes fictional members. Releases still require working Sanity access.

To build against published content locally, set `SANITY_PROJECT_ID`, `SANITY_DATASET` and, for a private dataset, `SANITY_READ_TOKEN` in your shell or ignored website env file:

```sh
npm run build:release
```

This command forces `ROSTER_SOURCE=sanity`. For a fetch-once validation run, export `ROSTER_SOURCE=sanity`, fetch with `npm run sync:roster`, then use `npm run test:snapshot` and `npm run build:snapshot`. The snapshot check binds its source, project, dataset and file hash; do not hand-edit generated files.

For a deployment of your own fork, enable GitHub Pages through Actions and configure:

| Setting                               | Purpose                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `SANITY_PROJECT_ID`, `SANITY_DATASET` | Published roster location                            |
| `SANITY_PUBLICATION_ENABLED`          | Set to `true` to enable production publication       |
| `SITE_ORIGIN`, `SITE_BASE`            | Canonical origin and `/` or `/repository-name/` base |
| `CONTACT_ENDPOINT`                    | Public contact-service URL                           |
| `SANITY_READ_TOKEN` secret            | Read access to a private dataset                     |
| `LUMA_ICAL_URL` secret                | Optional private calendar subscription               |

Studio deployment is separate from Pages. Its build receives only the public `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET` identifiers. Read/write tokens must never enter Studio bundles, browser JavaScript, HTML or public snapshots.

The [disabled webhook recipe](apps/studio/webhook.json) targets `main` and matches only published roster changes. Configure its remote Actions credential outside source. When forking, replace the destination, content and domains before enabling publication.

## Seeding, migration and recovery

`npm run seed:roster` creates only a missing empty roster in an explicit non-production dataset. Set `SANITY_PROJECT_ID`, `SANITY_DATASET` and `SANITY_WRITE_TOKEN` in the shell. Existing published documents and drafts are preserved; production seeding is refused.

For an existing full-site CMS, `npm run migrate:roster` copies the legacy team members into the new singleton, preserving keys, IDs, ordering and asset references. Back up documents, drafts, revisions and assets first. Validate staging before production; pause roster editing during cutover.

The migration checks source revisions before and after exclusive roster creation without patching legacy documents. Identical reruns are harmless. Drafts, conflicting targets or concurrent edits stop migration; a newly created target may remain for inspection. Production requires explicit flags:

```sh
npm run migrate:roster --workspace @gcom/studio -- \
  --allow-production --expected-source-revision "$TEAM_REVISION"
```

Keep legacy documents and assets for recovery. Rollback restores the prior website, Studio and webhook. If members changed after cutover, preserve those edits in the legacy team document with a revision-guarded patch before restoring the old reader. Never delete old datasets, documents, drafts or assets as part of migration.

## Stack and commands

| Part          | Technology                      | Location            |
| ------------- | ------------------------------- | ------------------- |
| Website       | React, TypeScript, Vite and CSS | `apps/web`          |
| Roster editor | Sanity Studio                   | `apps/studio`       |
| Contact email | Cloudflare Worker and Resend    | `apps/contact`      |
| Hosting       | GitHub Pages and GitHub Actions | `.github/workflows` |

| Command                 | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `npm run dev`           | Start the website with synthetic members      |
| `npm test`              | Generate the roster and test all three apps   |
| `npm run build`         | Generate the roster and build `apps/web/dist` |
| `npm run preview`       | Preview the built website                     |
| `npm run format:check`  | Check formatting                              |
| `npm run dev:studio`    | Start the configured roster editor            |
| `npm run build:studio`  | Build the configured roster editor            |
| `npm run dev:contact`   | Start the contact Worker                      |
| `npm run build:contact` | Check Worker deployment without uploading     |
| `npm run sync:events`   | Import events or retain the current snapshot  |

## License and credits

Source code: [MIT](LICENSE). GCOM logos, artwork, photographs and editorial content are excluded. Dependencies and fonts retain their own licenses; font notices are copied into website builds.

CMS patterns and contact delivery are adapted from [Monash Association of Coding](https://github.com/monashcoding/monashcoding-site), which declares ISC licensing. See [third-party notices](THIRD_PARTY_NOTICES).
