import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  deploymentState,
  deployedFingerprint,
} from '../scripts/deployment-state';
import { writeSnapshot } from '../scripts/roster';

const env = {
  SITE_ORIGIN: 'https://example.test',
  SITE_BASE: '/club/',
  VITE_CONTACT_ENDPOINT: 'https://contact.example.test',
  SANITY_PROJECT_ID: 'project',
  SANITY_DATASET: 'production',
};
const roster = {
  members: [{ _key: 'member', name: 'Member', role: 'President', links: [] }],
};
const event = {
  id: 'event',
  title: 'Workshop',
  start: '2026-10-20T00:00:00Z',
  allDay: false,
  url: 'https://lu.ma/event',
};

test('fingerprint covers release inputs, ignores only refresh timestamps, and validates provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gcom-release-'));
  const put = async (file: string, value: string) => {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), value);
  };
  const snapshot = join(root, 'apps/web/src/generated/roster.json');
  const provenance = join(root, 'apps/web/src/generated/roster-source.json');
  const saveRoster = (
    value = roster,
    source: 'sanity' | 'fixture' = 'sanity',
  ) =>
    writeSnapshot(
      value,
      snapshot,
      { source, projectId: 'project', dataset: 'production' },
      provenance,
    );
  const saveEvents = (events = [event], updatedAt: string | null = null) =>
    put(
      'apps/web/public/data/events.json',
      JSON.stringify({ updatedAt, events }),
    );
  try {
    execFileSync('git', ['init', '-q', root]);
    for (const file of [
      'apps/web/src/App.tsx',
      'apps/web/public/artwork/icon.svg',
      'package.json',
      'package-lock.json',
      'apps/studio/package.json',
      '.github/workflows/pages.yml',
    ])
      await put(file, 'original');
    await saveEvents();
    execFileSync('git', ['-C', root, 'add', '.']);
    await saveRoster();
    const state = await deploymentState(root, env);
    assert.deepEqual(Object.keys(state), ['version', 'fingerprint']);
    assert.equal(state.version, 1);
    assert.match(state.fingerprint, /^[a-f0-9]{64}$/);
    assert.deepEqual(await deploymentState(root, env), state);
    await saveEvents([event], '2026-10-16T12:00:00Z');
    assert.deepEqual(await deploymentState(root, env), state);
    for (const events of [
      [],
      [event, { ...event, id: 'second' }],
      [{ ...event, title: 'Changed' }],
      [{ ...event, location: 'Room' }],
    ]) {
      await saveEvents(events);
      assert.notDeepEqual(await deploymentState(root, env), state);
    }
    const second = { ...event, id: 'second' };
    await saveEvents([event, second]);
    const ordered = await deploymentState(root, env);
    await saveEvents([second, event]);
    assert.notDeepEqual(await deploymentState(root, env), ordered);
    await saveEvents();
    await saveRoster({ members: [{ ...roster.members[0], name: 'Changed' }] });
    assert.notDeepEqual(await deploymentState(root, env), state);
    await saveRoster();
    for (const file of [
      'apps/web/src/App.tsx',
      'apps/web/public/artwork/icon.svg',
      'package.json',
      'package-lock.json',
      'apps/studio/package.json',
      '.github/workflows/pages.yml',
    ]) {
      await put(file, 'changed');
      assert.notDeepEqual(await deploymentState(root, env), state, file);
      await put(file, 'original');
    }
    for (const key of ['SITE_ORIGIN', 'SITE_BASE', 'VITE_CONTACT_ENDPOINT']) {
      assert.notDeepEqual(
        await deploymentState(root, {
          ...env,
          [key]: `${env[key as keyof typeof env]}changed`,
        }),
        state,
      );
    }
    for (const key of ['SANITY_PROJECT_ID', 'SANITY_DATASET']) {
      await assert.rejects(
        deploymentState(root, { ...env, [key]: 'different' }),
        /does not match release environment/,
      );
    }
    await saveRoster(roster, 'fixture');
    await assert.rejects(deploymentState(root, env), /must come from Sanity/);
    await saveRoster();
    await put(
      'apps/web/src/generated/roster.json',
      JSON.stringify({ members: [] }),
    );
    await assert.rejects(
      deploymentState(root, env),
      /changed after Sanity validation/,
    );
    await saveRoster();
    await saveEvents([{ ...event, url: 'http://unsafe.test' }]);
    await assert.rejects(
      deploymentState(root, env),
      /Invalid event destination/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('baseline uses origin/base, cache bypass and timeout, and fails open to a checked deployment', async () => {
  const fingerprint = 'a'.repeat(64);
  const valid = { version: 1, fingerprint };
  let requested = false;
  assert.equal(
    await deployedFingerprint(env, async (input, options) => {
      const url = new URL(String(input));
      assert.equal(
        url.origin + url.pathname,
        'https://example.test/club/deployment-state.json',
      );
      assert(url.searchParams.has('refresh'));
      assert.equal(options?.cache, 'no-store');
      assert.equal(
        new Headers(options?.headers).get('cache-control'),
        'no-cache',
      );
      assert(options?.signal instanceof AbortSignal);
      requested = true;
      return Response.json(valid);
    }),
    fingerprint,
  );
  assert(requested);
  for (const value of [
    null,
    {},
    { ...valid, version: 2 },
    { ...valid, fingerprint: 'bad' },
    { ...valid, secret: 'unexpected' },
  ]) {
    assert.equal(
      await deployedFingerprint(env, async () => Response.json(value)),
      null,
    );
  }
  for (const response of [
    new Response('missing', { status: 404 }),
    new Response('<html>'),
  ]) {
    assert.equal(await deployedFingerprint(env, async () => response), null);
  }
  assert.equal(
    await deployedFingerprint(env, async () => {
      throw new Error('offline');
    }),
    null,
  );
  assert.equal(
    await deployedFingerprint(env, async (_input, options) => {
      options?.signal?.throwIfAborted();
      throw new DOMException('Timed out', 'TimeoutError');
    }),
    null,
  );
});
