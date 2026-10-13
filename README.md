# GCOM website

The GCOM club website, built with React and Vite.

- **CMS:** [Sanity Studio](https://gcom-wtzkb2rs.sanity.studio/) manages page content, images and the committee roster. Sign in with your Sanity account to edit and publish. Events come from Luma.
- **Deployment:** GitHub Actions builds and checks the site, then deploys to GitHub Pages at [gcom.techtom.tech](https://gcom.techtom.tech/). Pushes to `main`, published CMS changes via webhook and scheduled refreshes trigger builds. Production deployment requires `SANITY_PUBLICATION_ENABLED=true`; staging builds never deploy.
- **Contact form:** A separate server in `editor/` handles email delivery.

For local development, use Node.js 22:

```sh
npm ci
CONTENT_SOURCE=fixture npm run dev
```

See [.env.example](.env.example) for configuration and [docs/cms.txt](docs/cms.txt) for CMS setup and deployment details.
