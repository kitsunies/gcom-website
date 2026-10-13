import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';
import sharp from 'sharp';
async function port() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const p = server.address().port;
  await new Promise((r) => server.close(r));
  return p;
}
async function ready(url, process) {
  for (let i = 0; i < 100; i++) {
    if (process.exitCode !== null) throw new Error('Test service exited');
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Test service did not start');
}
test(
  'real PocketBase migrations, authenticated CRUD, atomic order, image sanitation and immediate revocation',
  { skip: !process.env.POCKETBASE_BINARY },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gcom-integration-'));
    const pbPort = await port(),
      serverPort = await port();
    const pbURL = `http://127.0.0.1:${pbPort}`,
      serverURL = `http://127.0.0.1:${serverPort}`;
    const allowlist = join(directory, 'allowlist.json');
    await writeFile(allowlist, JSON.stringify(['committee@example.com']));
    await cp(resolve('pb_hooks'), join(directory, 'hooks'), {
      recursive: true,
    });
    // Isolated test-only identity: never creates an editor account or a real Google session.
    await writeFile(
      join(directory, 'hooks', 'fixture.pb.js'),
      `routerAdd('GET','/api/test/token',(e)=>{
    const collection=e.app.findCollectionByNameOrId('committee_users');
    const record=new Record(collection); record.setEmail('committee@example.com'); record.setVerified(true);record.setRandomPassword();e.app.save(record);
    const external=new Record(e.app.findCollectionByNameOrId('_externalAuths'));external.set('collectionRef',collection.id);external.set('recordRef',record.id);external.set('provider','google');external.set('providerId','isolated-test');e.app.save(external);
    return e.json(200,{token:record.newAuthToken()});
  });`,
    );
    const env = {
      ...process.env,
      COMMITTEE_ALLOWLIST_FILE: allowlist,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GITHUB_TOKEN: '',
      EDITOR_ORIGIN: serverURL,
    };
    const pbProcess = spawn(
      process.env.POCKETBASE_BINARY,
      [
        'serve',
        `--http=127.0.0.1:${pbPort}`,
        `--dir=${join(directory, 'pb_data')}`,
        `--hooksDir=${join(directory, 'hooks')}`,
        `--migrationsDir=${resolve('pb_migrations')}`,
      ],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let logs = '';
    pbProcess.stdout.on('data', (chunk) => (logs += chunk));
    pbProcess.stderr.on('data', (chunk) => (logs += chunk));
    const nodeProcess = spawn(process.execPath, ['server/index.mjs'], {
      env: {
        ...env,
        POCKETBASE_URL: pbURL,
        PORT: String(serverPort),
        EDITOR_STATE_DIR: join(directory, 'state'),
      },
      stdio: 'ignore',
    });
    try {
      await ready(pbURL + '/api/health', pbProcess);
      await ready(serverURL + '/api/editor/setup', nodeProcess);
      const setup = await (await fetch(serverURL + '/api/editor/setup')).json();
      assert.equal(setup.authReady, false);
      assert.equal(setup.publishReady, false);
      assert.equal(
        (await fetch(serverURL + '/api/editor/profiles')).status,
        401,
      );
      const anonymous = await fetch(
        pbURL + '/api/collections/profiles/records',
      );
      assert.equal(anonymous.status, 403);
      assert.equal(
        (
          await fetch(
            pbURL + '/api/collections/committee_users/auth-with-password',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                identity: 'committee@example.com',
                password: 'invalid',
              }),
            },
          )
        ).status,
        403,
      );
      const { token } = await (await fetch(pbURL + '/api/test/token')).json();
      assert.ok(token);
      const refreshed = await fetch(
        pbURL + '/api/collections/committee_users/auth-refresh',
        { method: 'POST', headers: { Authorization: token } },
      );
      assert.equal(
        refreshed.status,
        200,
        JSON.stringify(await refreshed.json(), (key, value) =>
          key === 'token' ? '[redacted]' : value,
        ),
      );
      const direct = await fetch(pbURL + '/api/collections/profiles/records', {
        headers: { Authorization: token },
      });
      assert.equal(direct.status, 200, JSON.stringify(await direct.json()));
      const request = (path, method = 'GET', data) =>
        fetch(serverURL + '/api/editor/' + path, {
          method,
          headers: {
            Authorization: token,
            'Content-Type':
              data instanceof Buffer ? 'image/png' : 'application/json',
          },
          body:
            data === undefined
              ? undefined
              : data instanceof Buffer
                ? data
                : JSON.stringify(data),
        });
      const valid = {
        name: 'Security fixture',
        role: 'Test only',
        position: 0,
        links: [],
        photo: '',
      };
      const created = await request('profiles', 'POST', valid);
      const first = await created.json();
      assert.equal(created.status, 201, JSON.stringify(first));
      const second = await (
        await request('profiles', 'POST', {
          ...valid,
          name: 'Second fixture',
          position: 1,
        })
      ).json();
      assert.ok(second.id);
      const listing = await (await request('profiles')).json();
      assert.equal(listing.records.length, 2);
      assert.equal(
        (
          await request('order', 'POST', {
            ids: [second.id, first.id],
            expectedDraft: listing.version,
          })
        ).status,
        200,
      );
      const reordered = await (await request('profiles')).json();
      assert.deepEqual(
        reordered.records.map((r) => r.id),
        [second.id, first.id],
      );
      assert.equal(
        (
          await request('order', 'POST', {
            ids: [first.id, first.id],
            expectedDraft: reordered.version,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request('profiles/' + first.id, 'PATCH', {
            ...valid,
            links: [{ label: 'Unsafe', url: 'javascript:alert(1)' }],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            'portrait',
            'POST',
            Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
          )
        ).status,
        400,
      );
      const png = await sharp({
        create: { width: 10, height: 10, channels: 3, background: '#aabbcc' },
      })
        .png()
        .toBuffer();
      const upload = await request('portrait', 'POST', png);
      assert.equal(upload.status, 200);
      const { filename } = await upload.json();
      assert.match(filename, /^[a-f0-9]{64}\.webp$/);
      const clean = await readFile(
        join(directory, 'state', 'portraits', filename),
      );
      assert.equal((await sharp(clean).metadata()).format, 'webp');
      assert.equal(
        (
          await request('profiles/' + first.id, 'PATCH', {
            ...valid,
            photo: filename,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request('publish', 'POST', {
            expectedDraft: reordered.version,
            expectedHead: 'a'.repeat(40),
          })
        ).status,
        409,
      );
      await writeFile(allowlist, '[]');
      for (const [path, method, data] of [
        ['profiles', 'GET'],
        ['profiles', 'POST', valid],
        ['profiles/' + first.id, 'PATCH', valid],
        ['profiles/' + first.id, 'DELETE'],
        ['portrait/' + filename, 'GET'],
        ['publish', 'POST', {}],
      ])
        assert.equal((await request(path, method, data)).status, 403);
      assert.equal(
        (
          await fetch(pbURL + '/api/collections/profiles/records', {
            headers: { Authorization: token },
          })
        ).status,
        403,
      );
    } catch (error) {
      error.message +=
        '\n' +
        logs
          .split('\n')
          .filter((line) => /error|failed|ReferenceError|TypeError/i.test(line))
          .slice(-8)
          .join('\n');
      throw error;
    } finally {
      pbProcess.kill();
      nodeProcess.kill();
      await Promise.all([
        new Promise((r) =>
          pbProcess.exitCode !== null ? r() : pbProcess.once('exit', r),
        ),
        new Promise((r) =>
          nodeProcess.exitCode !== null ? r() : nodeProcess.once('exit', r),
        ),
      ]);
      await rm(directory, { recursive: true, force: true });
    }
  },
);
