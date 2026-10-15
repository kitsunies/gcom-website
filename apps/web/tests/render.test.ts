import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from '../src/App';
import { splitGraphemes } from '../src/pages/Home';
import { settings, type PageName } from '../src/content';
import roster from '../src/generated/roster.json';
import type { TeamMember } from '../src/site-content';
import { pageHtml, pageMetadata, pagePaths } from '../scripts/page-metadata';

const pages: PageName[] = ['home', 'about', 'team', 'contact'];

test('all routes render source-owned copy, links and metadata', () => {
  for (const page of pages) {
    const rendered = renderToString(createElement(App, { page }));
    const head = pageHtml(page, new URL('https://example.test'), '/repo/');
    assert.match(rendered, /Skip to content/);
    assert.match(rendered, /Monash University Game Development Club/);
    assert.match(
      head,
      new RegExp(
        `<title>${pageMetadata[page].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</title>`,
      ),
    );
    assert.match(head, new RegExp(`data-page="${page}"`));
    assert.match(
      head,
      new RegExp(`href="https://example.test/repo/${pagePaths[page]}"`),
    );
  }
  const home = renderToString(createElement(App, { page: 'home' }));
  assert.match(
    home,
    /href="https:\/\/clubs\.msa\.monash\.edu\/organisation\/9329\/"/,
  );
  assert.match(home, /aria-label="BUILD IT YOUR WAY"/);
});

test('metadata escapes text and resolves local and CDN images under subpaths', () => {
  const custom = {
    ...pageMetadata.home,
    title: 'Title <script> & "quoted"',
    image: { src: 'artwork/banner.png', alt: 'Social "description"' },
  };
  let html = pageHtml(
    'home',
    new URL('https://example.test'),
    '/repo/',
    custom,
  );
  assert(html.includes('Title &lt;script&gt; &amp; &quot;quoted&quot;'));
  assert(html.includes('https://example.test/repo/artwork/banner.png'));
  assert(html.includes('Social &quot;description&quot;'));
  html = pageHtml('home', new URL('https://example.test'), '/repo/', {
    ...custom,
    image: {
      src: 'https://cdn.sanity.io/images/abc/staging/hash-1200x630.png?w=1200&fit=max',
      alt: 'Social',
    },
  });
  assert(html.includes('hash-1200x630.png?w=1200&amp;fit=max'));
});

test('the animated hero keeps combining marks and emoji in accessible graphemes', () => {
  const html = renderToString(createElement(App, { page: 'home' }));
  assert.match(html, /aria-label="BUILD IT YOUR WAY"/);
  assert.deepEqual(splitGraphemes('Cafe\u0301 👩‍💻'), [
    'C',
    'a',
    'f',
    'é',
    ' ',
    '👩‍💻',
  ]);
});

test('team renders mutable roster names, links, portraits and order', () => {
  const original = structuredClone(roster.members);
  try {
    (roster as { members: TeamMember[] }).members = [
      {
        id: 'second',
        name: 'Second Person',
        role: 'Designer',
        links: [{ label: 'Portfolio', url: 'https://example.test/second' }],
      },
      {
        id: 'first',
        name: 'First Person',
        role: 'Developer',
        photo: {
          src: 'https://cdn.sanity.io/images/abc/staging/portrait-400x400.png',
          alt: 'First portrait',
        },
        links: [{ label: 'GitHub', url: 'https://example.test/first' }],
      },
    ];
    const html = renderToString(createElement(App, { page: 'team' }));
    assert(html.indexOf('Second Person') < html.indexOf('First Person'));
    assert.match(html, /href="https:\/\/example\.test\/second"[^>]*>Portfolio/);
    assert.match(
      html,
      /src="https:\/\/cdn\.sanity\.io\/images\/abc\/staging\/portrait-400x400\.png"[^>]*alt="First portrait"/,
    );
    assert.match(html, /href="https:\/\/example\.test\/first"[^>]*>GitHub/);
  } finally {
    (roster as { members: TeamMember[] }).members = original;
  }
});

test('team social links use recognizable icons with accessible names and exact URLs', () => {
  const original = structuredClone(roster.members);
  try {
    (roster as { members: TeamMember[] }).members = [
      {
        id: 'social',
        name: 'Social Person',
        role: 'Developer',
        links: [
          { label: 'LinkedIn', url: 'https://www.linkedin.com/in/person' },
          { label: 'GitHub', url: 'https://github.com/person' },
          { label: 'Instagram', url: 'https://instagram.com/person' },
          { label: 'GitHub', url: 'https://github.com.example.test/person' },
          { label: 'Custom', url: 'https://constructor/person' },
        ],
      },
    ];
    const html = renderToString(createElement(App, { page: 'team' }));
    for (const [platform, url] of [
      ['LinkedIn', 'https://www.linkedin.com/in/person'],
      ['GitHub', 'https://github.com/person'],
      ['Instagram', 'https://instagram.com/person'],
    ]) {
      assert(
        html.includes(
          `<a class="team-social-link" href="${url}" aria-label="Social Person on ${platform}" title="Social Person on ${platform}"><svg`,
        ),
      );
    }
    assert(
      html.includes(
        '<a href="https://github.com.example.test/person">GitHub<!-- --> <svg',
      ),
    );
    assert(
      html.includes('<a href="https://constructor/person">Custom<!-- --> <svg'),
    );
    assert.equal((html.match(/class="team-social-link"/g) || []).length, 3);
  } finally {
    (roster as { members: TeamMember[] }).members = original;
  }
});

test('calendar source setting controls the event link', () => {
  const original = settings.calendarUrl;
  try {
    settings.calendarUrl = 'https://example.test/calendar';
    const html = renderToString(createElement(App, { page: 'home' }));
    assert.match(html, /href="https:\/\/example\.test\/calendar"/);
  } finally {
    settings.calendarUrl = original;
  }
});
