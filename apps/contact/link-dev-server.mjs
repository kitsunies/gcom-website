import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// shortcut: cf beta.9 only finds local dev servers, remove when cf supports hoisted workspace dependencies.
const target = dirname(
  fileURLToPath(import.meta.resolve('wrangler/package.json')),
);
mkdirSync('node_modules', { recursive: true });
if (!existsSync('node_modules/wrangler'))
  symlinkSync(target, 'node_modules/wrangler', 'junction');
assert.ok(existsSync('node_modules/wrangler/bin/cf-wrangler.js'));
