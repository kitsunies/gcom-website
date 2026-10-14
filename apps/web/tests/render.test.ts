import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from '../src/App';
import { content, type PageName } from '../src/content';
import fixture from '../content/fixture.json';
import events from '../public/data/events.json';
import type { EventSummary } from '../src/content';
import { pageHtml } from '../scripts/page-metadata';

test('every editorial text and media field reaches rendering or metadata', () => {
  const leaves = (value: any, path: string[] = []): string[][] =>
    typeof value === 'string'
      ? [path]
      : Object.entries(value).flatMap(([key, item]) =>
          leaves(item, [...path, key]),
        );
  const hidden = new Set([
    'navigation.menuClose',
    'navigation.motion.playLabel',
    'team.linksLabel',
    'home.events.emptyHeading',
    'home.events.emptyText',
    ...[
      'defaultSubject',
      'sending',
      'sendingLabel',
      'unavailable',
      'rateLimited',
      'invalid',
      'tooLarge',
      'failed',
      'success',
      'unreachable',
    ].map((key) => `contact.form.${key}`),
  ]);
  const configuration = new Set([
    'settings.membershipUrl',
    'settings.calendarUrl',
    'settings.contactEmail',
    ...fixture.navigation.links.map(
      (_, index) => `navigation.links.${index}.key`,
    ),
    ...fixture.home.quests.map((_, index) => `home.quests.${index}.theme`),
  ]);
  const original = structuredClone(content);
  try {
    for (const path of leaves(fixture)) {
      const name = path.join('.');
      if (hidden.has(name) || configuration.has(name)) continue;
      const parent = path.slice(0, -1).reduce((v, k) => v[k], content as any);
      const key = path.at(-1)!;
      const before = parent[key];
      parent[key] = 'CMS_SENTINEL';
      const pages: PageName[] = ['home', 'about', 'team', 'contact'];
      let output = pages
        .map(
          (page) =>
            renderToString(createElement(App, { page })) +
            pageHtml(content, page, new URL('https://example.test'), '/repo/'),
        )
        .join('');
      const calendar = content.settings.calendarUrl;
      content.settings.calendarUrl = 'https://example.test/calendar';
      output += renderToString(createElement(App, { page: 'home' }));
      const previous = events.events;
      (events as { events: EventSummary[] }).events = [
        {
          id: 'test',
          title: 'Event',
          allDay: false,
          start: '2026-10-15T00:00:00.000Z',
          url: 'https://example.test/event',
        },
      ];
      output += renderToString(createElement(App, { page: 'home' }));
      events.events = previous;
      content.settings.calendarUrl = calendar;
      assert(
        output.includes('CMS_SENTINEL'),
        `Unmapped editorial field: ${name}`,
      );
      parent[key] = before;
    }
    content.settings.calendarUrl = 'https://example.test/calendar';
    const home = renderToString(createElement(App, { page: 'home' }));
    assert(home.includes(content.home.events.emptyHeading));
    assert(home.includes(content.home.events.emptyText));
    content.team.members = [
      { id: 'two', name: 'Second', role: 'Member', links: [] },
      {
        id: 'one',
        name: 'First',
        role: 'President',
        photo: {
          src: 'https://cdn.sanity.io/images/abc/staging/hash-400x400.png',
          alt: 'Portrait description',
        },
        links: [{ label: 'Public site', url: 'https://example.test' }],
      },
    ];
    const team = renderToString(createElement(App, { page: 'team' }));
    assert(team.indexOf('Second') < team.indexOf('First'));
    assert(team.includes('Portrait description'));
    assert(team.includes(content.team.linksLabel));
    assert(team.includes('photo-placeholder'));
  } finally {
    Object.assign(content, original);
  }
});
test('metadata escapes editorial input and handles local and CDN images at subpaths', () => {
  const copy = structuredClone(fixture);
  copy.home.metadata.title = 'Title <script> & "quoted"';
  copy.home.metadata.image.alt = 'Social "description"';
  let html = pageHtml(copy, 'home', new URL('https://example.test'), '/repo/');
  assert(html.includes('Title &lt;script&gt; &amp; &quot;quoted&quot;'));
  assert(html.includes('https://example.test/repo/artwork/banner.png'));
  assert(html.includes('Social &quot;description&quot;'));
  copy.home.metadata.image.src =
    'https://cdn.sanity.io/images/abc/staging/hash-1200x630.png?w=1200&fit=max';
  html = pageHtml(copy, 'home', new URL('https://example.test'), '/repo/');
  assert(html.includes('hash-1200x630.png?w=1200&amp;fit=max'));
});

test('the animated hero keeps the CMS title as one accessible name', () => {
  const heading = content.home.hero.heading;
  try {
    content.home.hero.heading = ['BUILD & PLAY', 'Cafe\u0301 👩‍💻'];
    const html = renderToString(createElement(App, { page: 'home' }));
    assert.match(html, /<h1[^>]*aria-label="BUILD &amp; PLAY Café 👩‍💻"/);
    assert.match(html, /class="hero-letter"[^>]*>é<\/span>/u);
    assert.match(html, /class="hero-letter"[^>]*>👩‍💻<\/span>/u);
  } finally {
    content.home.hero.heading = heading;
  }
});
