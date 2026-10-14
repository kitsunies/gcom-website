import { pagePaths } from './page-metadata';
import {
  readFile,
  writeFile,
  copyFile,
  mkdir,
  readdir,
} from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const { render } = await import(
  pathToFileURL(resolve('.build/prerender.js')).href
);
const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const origin = env.SITE_ORIGIN || 'https://gcom.techtom.tech';
const base = env.SITE_BASE || '/';
const paths = pagePaths;
const assets = await readdir('dist/assets');
const fonts = [
  'nova-square-latin-400-normal-',
  'aldrich-latin-400-normal-',
  'ibm-plex-mono-latin-700-italic-',
]
  .map((prefix) => {
    const file = assets.find(
      (file) => file.startsWith(prefix) && file.endsWith('.woff2'),
    );
    if (!file) throw new Error(`Missing display font: ${prefix}`);
    return `<link rel="preload" as="font" type="font/woff2" crossorigin href="${base}assets/${file}">`;
  })
  .join('');
for (const [page, path] of Object.entries(paths)) {
  const file = `dist/${path}index.html`;
  const html = await readFile(file, 'utf8');
  await writeFile(
    file,
    html
      .replace('</head>', `${fonts}</head>`)
      .replace('<div id="root"></div>', `<div id="root">${render(page)}</div>`),
  );
}
await writeFile(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.values(
    paths,
  )
    .map(
      (path) =>
        `<url><loc>${new URL(`${base}${path}`, origin).href}</loc></url>`,
    )
    .join('')}</urlset>`,
);
await writeFile(
  'dist/robots.txt',
  `User-agent: *\nAllow: /\nSitemap: ${new URL(`${base}sitemap.xml`, origin).href}\n`,
);
await mkdir('dist/licenses', { recursive: true });
for (const font of ['nova-square', 'aldrich', 'ibm-plex-mono'])
  await copyFile(
    new URL(
      './LICENSE',
      import.meta.resolve(`@fontsource/${font}/package.json`),
    ),
    `dist/licenses/${font}.txt`,
  );
