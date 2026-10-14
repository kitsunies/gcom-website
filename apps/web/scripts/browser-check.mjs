import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { build, loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const base = env.SITE_BASE || '/';
const snapshot = JSON.parse(
  await readFile('src/generated/site-content.json', 'utf8'),
);
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

const server = await serve('dist');
let browser;
const temporary = [];
try {
  browser = await chromium.launch({ headless: true });
  const studio = await serve('../studio/dist', '/');
  const studioPage = await browser.newPage();
  try {
    // Test anonymous startup without granting each ephemeral origin project CORS access.
    await studioPage.route('https://*.api.sanity.io/**/users/me?*', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      }),
    );
    await studioPage.goto(studio.url, { waitUntil: 'networkidle' });
    await studioPage.waitForFunction(() =>
      /Choose login provider|Uncaught error|Set SANITY_STUDIO_/i.test(
        document.body.innerText,
      ),
    );
    const text = await studioPage.locator('body').innerText();
    assert.doesNotMatch(text, /Uncaught error|Set SANITY_STUDIO_/);
    assert.match(text, /Choose login provider/i);
    console.log('Built Studio: browser configuration and sign-in passed');
  } finally {
    await studioPage.close();
    await studio.close();
  }
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    for (const path of ['', 'about/', 'team/', 'contact/']) {
      const page = await context.newPage();
      const errors = [];
      const cmsRequests = [];
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
      page.on('request', (request) => {
        if (
          new URL(request.url()).hostname.endsWith('.api.sanity.io') ||
          new URL(request.url()).hostname.endsWith('.apicdn.sanity.io')
        )
          cmsRequests.push(request.url());
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
      assert.match(facts.bodyFont, /Nunito/);
      assert.match(facts.headingFont, /Pixelify Sans/);
      assert.ok(facts.loadedFonts.some((font) => font.includes('Nunito')));
      assert.ok(
        facts.loadedFonts.some((font) => font.includes('Pixelify Sans')),
      );
      assert.equal(facts.overflow, false, `${path} horizontal overflow`);
      assert.deepEqual(facts.brokenImages, []);
      assert.ok(facts.title && facts.description);
      assert.equal(await page.locator('h1').count(), 1);
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
          .locator('.mascot,.spark,.mascot-ground,.quest-card')
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
      console.log(
        `${path || '/'} ${viewport.width}px: prerender, assets, fonts, overflow, axe, keyboard and reduced motion passed`,
      );
      await page.close();
    }
    await context.close();
  }

  // Compile isolated contact fixtures against the same snapshot; never fetch CMS or overwrite dist.
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
          assert.equal(
            await notice.textContent(),
            snapshot.contact.form.success,
          );
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
            `mailto:${snapshot.settings.contactEmail}`,
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
        assert.equal(await alert.textContent(), snapshot.contact.form[message]);
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
