import { fail, photoPattern } from './validation.mjs';
export function githubClient(config, transport = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository || '') || !config.branch || !config.token || !config.authorName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.authorEmail || '')) fail('GitHub repository, branch, token and human author require setup.', 503);
  const base = `https://api.github.com/repos/${config.repository}`;
  async function call(path, method = 'GET', data) {
    const response = await transport(base + path, {method, headers:{Authorization:`Bearer ${config.token}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json'}, body:data === undefined ? undefined : JSON.stringify(data), signal:AbortSignal.timeout(30000)});
    if (!response.ok) fail(`GitHub ${method} failed (${response.status}).`, response.status === 422 || response.status === 409 ? 409 : 502);
    return response.json();
  }
  const ref = `/git/ref/heads/${config.branch.split('/').map(encodeURIComponent).join('/')}`;
  return { call, ref, config, head:async () => (await call(ref)).object.sha };
}
export async function commitRoster(client, snapshot, portraits, expectedHead, onCommit = async () => {}) {
  if (!/^[a-f0-9]{40}$/.test(expectedHead || '')) fail('A current repository head is required.', 409);
  if (await client.head() !== expectedHead) fail('Repository changed. Reload before publishing.', 409);
  const revision = snapshot.revision;
  if (!/^[a-f0-9]{32}$/.test(revision)) fail('Invalid revision.');
  const files = [{path:'public/data/team.json', content:Buffer.from(JSON.stringify(snapshot, null, 2) + '\n')}];
  for (const [name, content] of portraits) {
    if (!photoPattern.test(name) || !Buffer.isBuffer(content)) fail('Invalid portrait artifact.');
    files.push({path:`public/team/${revision}/${name}`, content});
  }
  const source = await client.call(`/git/commits/${expectedHead}`);
  const tree = [];
  for (const file of files) {
    const blob = await client.call('/git/blobs', 'POST', {content:file.content.toString('base64'), encoding:'base64'});
    tree.push({path:file.path, mode:'100644', type:'blob', sha:blob.sha});
  }
  const result = await client.call('/git/trees', 'POST', {base_tree:source.tree.sha, tree});
  const author = {name:client.config.authorName, email:client.config.authorEmail};
  const commit = await client.call('/git/commits', 'POST', {message:`Publish committee roster ${revision}`, tree:result.sha, parents:[expectedHead], author, committer:author});
  // Persist the commit before updating the branch so an interrupted request can be reconciled.
  await onCommit(commit.sha);
  if (await client.head() !== expectedHead) fail('Repository changed during publication. Reload before publishing.', 409);
  try {
    await client.call(client.ref.replace('/git/ref/', '/git/refs/'), 'PATCH', {sha:commit.sha, force:false});
  } catch (error) {
    try { if (await client.head() === commit.sha) return {commit:commit.sha, submission:'committed', deployment:'unverified'}; } catch { /* Reconciliation is retried through publication status. */ }
    if (error.status === 409) throw error;
    fail('Commit submission outcome unknown. Check publication status before retrying.', 502);
  }
  return {commit:commit.sha, submission:'committed', deployment:'unverified'};
}
