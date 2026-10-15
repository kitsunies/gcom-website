import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteLink } from '../src/links';
import { href } from '../src/content';

test('HTTPS destinations remain external and page links keep the configured base', () => {
  for (const value of [
    'HTTPS://example.test/path',
    ' https://example.test/path ',
    'https:example.test/path',
    'https:\\example.test/path',
  ]) {
    assert.equal(siteLink(value, '/repo/'), 'https://example.test/path');
    assert.equal(href(value), 'https://example.test/path');
  }
  assert.equal(siteLink('about/', '/repo/'), '/repo/about/');
  assert.equal(siteLink('#events', '/repo/'), '/repo/#events');
});
