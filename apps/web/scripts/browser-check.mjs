import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { build, loadEnv } from 'vite';
import { isSanityPortrait } from './validate-content.ts';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const base = env.SITE_BASE || '/';
const membershipUrl = 'https://clubs.msa.monash.edu/organisation/9329/';
const contactEmail = 'kitsunies@gmail.com';
const expectedFooterLinks = [
  ['Join the Club', membershipUrl],
  ['Instagram', 'https://www.instagram.com/gcom_club/'],
  ['Discord', 'https://discord.com/invite/KmMVxTY2E'],
];
const motionLabels = { play: 'Play animations', pause: 'Pause animations' };
const contactMessages = {
  success:
    'Message sent. Thanks for getting in touch! We’ll reply to the email address you provided.',
  invalid: 'Please check your name, email, subject and message.',
  tooLarge: 'Message is too large.',
  rateLimited:
    'Too many messages in a short time. Please try again later, or email us directly.',
  unreachable:
    'We couldn’t reach the message service. Your draft is still here. Try again, or use the email link below.',
  failed:
    'We couldn’t send your message right now. Your draft is still here. Try again, or use the email link below.',
  unavailable:
    'Message delivery is temporarily unavailable. You can send your message using the email link below.',
};
assert.match(base, /^\/(?:[A-Za-z0-9_-]+\/)*$/);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};
async function serve(directory, mountBase = base) {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(
        new URL(request.url, 'http://test').pathname,
      );
      assert.ok(path.startsWith(mountBase));
      let file = resolve(root, path.slice(mountBase.length));
      assert.ok(file === root || file.startsWith(root + sep));
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      response.writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((done) => server.listen(0, '0.0.0.0', done));
  return {
    url: `http://127.0.0.1:${server.address().port}${mountBase}`,
    close: () => new Promise((done) => server.close(done)),
  };
}

const evidence = env.BROWSER_EVIDENCE_DIR;
if (evidence) await mkdir(evidence, { recursive: true });
const roster = JSON.parse(await readFile('src/generated/roster.json', 'utf8'));
const expectedPortraits = new Set(
  roster.members.flatMap((member) => (member.photo ? [member.photo.src] : [])),
);
const isSanityHost = (host) =>
  host === 'sanity.io' ||
  host.endsWith('.sanity.io') ||
  host === 'sanity-cdn.com' ||
  host.endsWith('.sanity-cdn.com');
const isExpectedPortrait = (url, portraits) =>
  isSanityPortrait(url.href) && portraits.has(url.href);
const guardSanityRequests = (portraits, blocked) => async (route) => {
  const url = new URL(route.request().url());
  if (!isSanityHost(url.hostname)) return route.fallback();
  if (
    route.request().method() === 'GET' &&
    route.request().resourceType() === 'image' &&
    isExpectedPortrait(url, portraits)
  )
    return route.fallback();
  blocked.push(url.href);
  return route.abort();
};
const isSanityProjectHost = (host) =>
  host === 'cdn.sanity.io' ||
  host.endsWith('.cdn.sanity.io') ||
  host.endsWith('.api.sanity.io') ||
  host.endsWith('.apicdn.sanity.io');
const server = await serve('dist');
let browser;
const temporary = [];
try {
  browser = await chromium.launch({ headless: true });
  const portrait =
    'https://cdn.sanity.io/images/test1234/production/synthetic.png';
  const malformedPortrait =
    'https://cdn.sanity.io/images/test1234/production/malformed.svg';
  const guardContext = await browser.newContext();
  await guardContext.route(portrait, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/9iUAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  const guardPage = await guardContext.newPage();
  const guardBlocked = [];
  await guardPage.route(
    '**/*',
    guardSanityRequests(new Set([portrait, malformedPortrait]), guardBlocked),
  );
  const rejectedSanityUrls = [
    'https://test1234.api.sanity.io/v2026-10-01/data/query/production?query=*',
    'https://test1234.api.sanity.io/v2026-10-01/data/doc/production/roster',
    'https://cdn.sanity.io/images/test1234/production/unexpected.png',
    malformedPortrait,
  ];
  await guardPage.setContent(
    [portrait, ...rejectedSanityUrls]
      .map((src) => `<img src="${src}">`)
      .join(''),
  );
  await guardPage
    .locator('img')
    .first()
    .evaluate((image) => image.decode());
  await Promise.allSettled(
    (await guardPage.locator('img').all()).map((image) =>
      image.evaluate((element) => element.decode()),
    ),
  );
  await guardPage.evaluate(async (url) => {
    await Promise.all([
      fetch(url).catch(() => {}),
      fetch(url, { method: 'POST' }).catch(() => {}),
    ]);
  }, portrait);
  assert.deepEqual(
    [...guardBlocked].sort(),
    [...rejectedSanityUrls, portrait, portrait].sort(),
  );
  await guardPage.close();
  await guardContext.close();
  console.log(
    'Sanity request guard: expected portrait decodes; API and unexpected CDN requests are blocked',
  );
  const studio = await serve('../studio/dist', '/');
  const studioPage = await browser.newPage();
  try {
    // Test anonymous startup without granting each ephemeral origin project CORS access.
    const unexpectedStudioRequests = [];
    await studioPage.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (!isSanityHost(url.hostname)) return route.continue();
      if (!isSanityProjectHost(url.hostname)) return route.abort();
      if (
        url.hostname.endsWith('.api.sanity.io') &&
        url.pathname.endsWith('/users/me')
      )
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unauthorized' }),
        });
      if (
        url.hostname.endsWith('.api.sanity.io') &&
        url.pathname.endsWith('/auth/providers')
      )
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            thirdPartyLogin: false,
            sso: { saml: false },
            providers: [
              {
                name: 'google',
                title: 'Google',
                url: 'https://example.invalid/auth/google',
              },
              {
                name: 'github',
                title: 'GitHub',
                url: 'https://example.invalid/auth/github',
              },
              {
                name: 'sanity',
                title: 'E-mail / password',
                url: 'https://example.invalid/auth/sanity',
                signUpUrl: 'https://example.invalid/signup',
              },
            ],
          }),
        });
      unexpectedStudioRequests.push(url.href);
      return route.abort();
    });
    await studioPage.goto(studio.url, { waitUntil: 'networkidle' });
    await studioPage.waitForFunction(() =>
      /Choose login provider|Uncaught error|Set SANITY_STUDIO_/i.test(
        document.body.innerText,
      ),
    );
    const text = await studioPage.locator('body').innerText();
    assert.doesNotMatch(text, /Uncaught error|Set SANITY_STUDIO_/);
    assert.match(text, /Choose login provider/i);
    assert.deepEqual(
      unexpectedStudioRequests,
      [],
      'Studio startup must not make unmocked project API requests',
    );
    console.log('Built Studio: browser configuration and sign-in passed');
  } finally {
    await studioPage.close();
    await studio.close();
  }
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: viewport.width === 390 ? 3 : 1,
    });
    for (const path of ['', 'about/', 'team/', 'contact/']) {
      const page = await context.newPage();
      const errors = [];
      const cmsRequests = [];
      await page.route(
        '**/*',
        guardSanityRequests(expectedPortraits, cmsRequests),
      );
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (
          message.type() === 'error' ||
          /hydrat|did not match|server rendered/i.test(message.text())
        )
          errors.push(message.text());
      });
      page.on('requestfailed', (request) =>
        errors.push(`${request.url()}: ${request.failure()?.errorText}`),
      );
      page.on('response', (response) => {
        if (response.status() >= 400)
          errors.push(`${response.status()} ${response.url()}`);
      });
      const html = await (await context.request.get(server.url + path)).text();
      assert.match(
        html,
        /<div id="root">[\s\S]*<h1/,
        `Prerendered heading: ${path}`,
      );
      const response = await page.goto(server.url + path, {
        waitUntil: 'networkidle',
      });
      assert.equal(response.status(), 200);
      await page.locator('h1').waitFor();
      for (const image of await page.locator('img').all()) {
        await image.evaluate(async (image) => {
          image.loading = 'eager';
          image.scrollIntoView({ behavior: 'instant' });
          await image.decode();
        });
      }
      await page.evaluate(() => document.fonts.ready);
      const facts = await page.evaluate(() => ({
        bodyFont: getComputedStyle(document.body).fontFamily,
        headingFont: getComputedStyle(document.querySelector('h1')).fontFamily,
        loadedFonts: [...document.fonts]
          .filter((font) => font.status === 'loaded')
          .map((font) => font.family),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        brokenImages: [...document.images]
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.src),
        title: document.title,
        description: document.querySelector('meta[name="description"]')
          ?.content,
      }));
      assert.match(facts.bodyFont, /Aldrich/);
      assert.match(facts.headingFont, path ? /Nova Square/ : /IBM Plex Mono/);
      assert.ok(facts.loadedFonts.some((font) => font.includes('Aldrich')));
      assert.ok(facts.loadedFonts.some((font) => font.includes('Nova Square')));
      if (!path)
        assert.ok(
          facts.loadedFonts.some((font) => font.includes('IBM Plex Mono')),
        );
      assert.equal(facts.overflow, false, `${path} horizontal overflow`);
      assert.deepEqual(facts.brokenImages, []);
      assert.ok(facts.title && facts.description);
      assert.equal(await page.locator('h1').count(), 1);
      assert.doesNotMatch(await page.locator('body').innerText(), /[↗▶Ⅱ]/u);
      const footerLinks = page.locator('.footer-links a');
      assert.deepEqual(
        await footerLinks.evaluateAll((links) =>
          links.map((link) => [
            link.textContent.trim(),
            link.getAttribute('href'),
          ]),
        ),
        expectedFooterLinks,
      );
      const footerRows = await footerLinks.evaluateAll((links) =>
        links.map((link) => {
          const box = link.getBoundingClientRect();
          return {
            top: box.top,
            visible: box.left >= 0 && box.right <= innerWidth,
          };
        }),
      );
      assert(
        footerRows.every((row) => row.visible),
        'Footer links stay in viewport',
      );
      for (const link of await footerLinks.all()) {
        await link.focus();
        assert.equal(
          await link.evaluate(
            (element) =>
              element === document.activeElement &&
              element.matches(':focus-visible'),
          ),
          true,
        );
      }
      for (const toggle of await page.locator('.motion-toggle').all()) {
        await toggle.focus();
        await page.keyboard.press('Enter');
        assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
        assert.equal((await toggle.textContent()).trim(), motionLabels.play);
        assert.equal(
          await toggle.locator('svg[aria-hidden="true"]').count(),
          1,
        );
        assert.equal(
          await toggle
            .locator('..')
            .locator('.mascots')
            .getAttribute('data-paused'),
          'true',
        );
        await page.keyboard.press('Space');
        assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
        assert.equal((await toggle.textContent()).trim(), motionLabels.pause);
        assert.equal(
          await toggle
            .locator('..')
            .locator('.mascots')
            .getAttribute('data-paused'),
          'false',
        );
      }
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      assert.deepEqual(
        axe.violations
          .filter((violation) =>
            ['serious', 'critical'].includes(violation.impact),
          )
          .map((violation) => ({
            id: violation.id,
            targets: violation.nodes.map((node) => node.target),
          })),
        [],
        `${path} ${viewport.width}px accessibility`,
      );
      if (!path) {
        const clippedLetters = await page.locator('h1').evaluate((heading) => {
          const original = heading.innerHTML;
          try {
            heading.querySelectorAll('.hero-word').forEach((line) => {
              line.style.animation = 'none';
              const letter = line.querySelector('.hero-letter');
              line.replaceChildren(
                ...Array.from(
                  'BUILD INCREDIBLE GAMES TOGETHER',
                  (character, index) => {
                    const span = letter.cloneNode(true);
                    span.style.setProperty(
                      '--letter-index',
                      Math.min(index, 7),
                    );
                    span.textContent = character === ' ' ? '\u00a0' : character;
                    return span;
                  },
                ),
              );
            });
            return [...heading.querySelectorAll('.hero-letter')]
              .map((letter) => letter.getBoundingClientRect())
              .filter((box) => box.left < -1 || box.right > innerWidth + 1)
              .map((box) => ({ left: box.left, right: box.right }));
          } finally {
            heading.innerHTML = original;
          }
        });
        assert.deepEqual(clippedLetters, [], 'Edited CMS titles stay visible');
      }
      if (viewport.width < 1100) {
        await page.evaluate(() => scrollTo(0, 0));
        const toggle = page.locator('.menu-toggle');
        await toggle.focus();
        await page.keyboard.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Tab');
        assert.equal(
          await page
            .locator('#main-navigation a')
            .first()
            .evaluate((link) => link === document.activeElement),
          true,
        );
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(
          await toggle.evaluate((button) => button === document.activeElement),
          true,
        );
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(
        await page.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches,
        ),
        true,
      );
      assert.deepEqual(
        await page
          .locator(
            '.mascot,.spark,.mascot-ground,.quest-card,.hero-word,.hero-letter',
          )
          .evaluateAll((elements) =>
            elements
              .filter(
                (element) => getComputedStyle(element).animationName !== 'none',
              )
              .map((element) => element.className),
          ),
        [],
        'Reduced motion disables scene animations',
      );
      assert.deepEqual(
        cmsRequests,
        [],
        'Browsers must never fetch Sanity documents',
      );
      assert.deepEqual(
        errors,
        [],
        `${path} ${viewport.width}px browser errors`,
      );
      if (!path && evidence) {
        await page.evaluate(() => document.activeElement?.blur());
        await page.screenshot({
          path: `${evidence}/home-${viewport.width === 390 ? 'mobile-390x844-dpr3' : 'desktop-1440x1000'}.png`,
          fullPage: true,
        });
      }
      console.log(
        `${path || '/'} ${viewport.width}px: prerender, assets, fonts, overflow, axe, keyboard and reduced motion passed`,
      );
      await page.close();
    }
    await context.close();
  }

  // Compile isolated contact fixtures without CMS access or overwriting dist.
  for (const endpoint of ['', 'https://contact.browser-test.invalid/message']) {
    const directory = await mkdtemp(resolve(tmpdir(), 'gcom-browser-'));
    temporary.push(directory);
    await build({
      logLevel: 'error',
      define: {
        'import.meta.env.VITE_CONTACT_ENDPOINT': JSON.stringify(endpoint),
      },
      build: { outDir: directory, emptyOutDir: true },
    });
    const fixture = await serve(directory);
    const context = await browser.newContext();
    try {
      for (const status of endpoint
        ? [
            400,
            413,
            429,
            500,
            200,
            'malformed JSON',
            'network failure',
            'success',
          ]
        : [null]) {
        const page = await context.newPage();
        const errors = [];
        let calls = 0;
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', async (route) => {
          if (route.request().method() !== 'POST') return route.continue();
          calls++;
          assert.equal(
            route.request().url(),
            endpoint,
            'Contact tests cannot send a live message',
          );
          assert.equal(
            route.request().headers()['content-type'],
            'application/json',
          );
          if (status === 'network failure') return route.abort('failed');
          await route.fulfill({
            status: typeof status === 'number' ? status : 200,
            contentType: 'application/json',
            body:
              status === 'malformed JSON'
                ? '{'
                : JSON.stringify({
                    ok: status === 'success',
                    message:
                      status === 413
                        ? 'Message is too large.'
                        : 'Please check your message.',
                  }),
          });
        });
        await page.goto(fixture.url + 'contact/', { waitUntil: 'networkidle' });
        const draft = {
          name: 'Browser fixture',
          email: 'fixture@example.com',
          subject: 'Saved draft',
          message: 'Please preserve this contact draft after failure.',
        };
        for (const [name, value] of Object.entries(draft))
          await page.locator(`[name="${name}"]`).fill(value);
        await page.locator('form button[type="submit"]').click();
        if (status === 'success') {
          const notice = page.locator('.form-feedback.success[role="status"]');
          await notice.waitFor();
          assert.equal(await notice.textContent(), contactMessages.success);
          for (const name of Object.keys(draft))
            assert.equal(
              await page.locator(`[name="${name}"]`).inputValue(),
              '',
            );
          await page.waitForFunction(
            () => document.activeElement?.getAttribute('role') === 'status',
          );
          assert.equal(await page.locator('fieldset').isDisabled(), false);
          assert.equal(
            await page.locator('.direct-email a').getAttribute('href'),
            `mailto:${contactEmail}`,
          );
          assert.equal(calls, 1);
          assert.deepEqual(errors, []);
          console.log('Contact success: form reset, feedback and focus passed');
          await page.close();
          continue;
        }
        const alert = page.getByRole('alert');
        await alert.waitFor();
        const message =
          status === 400
            ? 'invalid'
            : status === 413
              ? 'tooLarge'
              : status === 429
                ? 'rateLimited'
                : status === 'network failure'
                  ? 'unreachable'
                  : endpoint
                    ? 'failed'
                    : 'unavailable';
        assert.equal(await alert.textContent(), contactMessages[message]);
        for (const [name, value] of Object.entries(draft))
          assert.equal(
            await page.locator(`[name="${name}"]`).inputValue(),
            value,
          );
        await page.waitForFunction(
          () => document.activeElement?.getAttribute('role') === 'alert',
        );
        assert.equal(await page.locator('fieldset').isDisabled(), false);
        const mailto = new URL(
          await page.locator('.direct-email a').getAttribute('href'),
        );
        assert.equal(mailto.protocol, 'mailto:');
        assert.equal(mailto.searchParams.get('subject'), draft.subject);
        assert.ok(mailto.searchParams.get('body').includes(draft.message));
        assert.equal(calls, endpoint ? 1 : 0);
        assert.deepEqual(errors, []);
        console.log(
          `Contact ${status || 'missing endpoint'}: draft, email fallback and focus preserved`,
        );
        await page.close();
      }
    } finally {
      await context.close();
      await fixture.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
  await Promise.all(
    temporary.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
}
