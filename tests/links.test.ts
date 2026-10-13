import { test } from 'node:test';
import assert from 'node:assert/strict';
import { href } from '../src/content';
import { safeLink } from '../scripts/site-content';

test('all accepted HTTPS spellings remain external links', () => {
  for (const value of [
    'HTTPS://example.test/path',
    ' https://example.test/path ',
    'https:example.test/path',
    'https:\\example.test/path',
  ]) {
    assert(safeLink(value));
    assert.equal(href(value), 'https://example.test/path');
  }
});
