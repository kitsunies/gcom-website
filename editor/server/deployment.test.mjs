import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentStatus } from './deployment.mjs';
const commit = 'a'.repeat(40),
  revision = 'b'.repeat(32),
  publication = { commit, revision, submission: 'committed' };
function client(status, conclusion = 'success', head = commit) {
  return {
    config: { branch: 'main' },
    call: async (path) => {
      assert.match(path, /actions\/workflows\/pages.yml\/runs\?head_sha=/);
      return {
        workflow_runs: status
          ? [
              {
                head_sha: head,
                head_branch: 'main',
                event: 'push',
                status,
                conclusion,
                run_number: 1,
                run_attempt: 1,
                html_url: 'https://github.com/owner/repo/actions/runs/1',
              },
            ]
          : [],
      };
    },
  };
}
test('queued, active and failed workflow runs remain distinct from commit submission', async () => {
  assert.equal(
    (await deploymentStatus(client(null), publication)).status,
    'queued',
  );
  assert.equal(
    (await deploymentStatus(client('in_progress'), publication)).status,
    'in_progress',
  );
  const before = JSON.stringify(publication);
  assert.equal(
    (await deploymentStatus(client('completed', 'failure'), publication))
      .status,
    'failed',
  );
  assert.equal(JSON.stringify(publication), before);
  assert.equal(
    (
      await deploymentStatus(
        client('completed', 'success', 'c'.repeat(40)),
        publication,
      )
    ).status,
    'queued',
  );
});
test('workflow success only claims live when the public snapshot matches the revision', async () => {
  assert.equal(
    (await deploymentStatus(client('completed'), publication)).status,
    'succeeded_unverified',
  );
  assert.equal(
    (
      await deploymentStatus(
        client('completed'),
        publication,
        'https://example.com/data/team.json',
        async () => Response.json({ revision: 'previous-live-revision' }),
      )
    ).live,
    false,
  );
  assert.equal(
    (
      await deploymentStatus(
        client('completed'),
        publication,
        'https://example.com/data/team.json',
        async () => Response.json({ revision }),
      )
    ).status,
    'live',
  );
  assert.equal(
    (
      await deploymentStatus(
        {
          call: async () => {
            throw new Error('Actions read denied');
          },
        },
        publication,
      )
    ).status,
    'unavailable',
  );
});
