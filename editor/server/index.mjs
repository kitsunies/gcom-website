import http from 'node:http';
import { readFile, writeFile, mkdir, open, unlink, stat, rename } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { cleanPortrait } from './images.mjs';
import { authorized, normalizeEmails, fail, profile, roster, draftHash, photoPattern } from './validation.mjs';
import { githubClient, commitRoster } from './publisher.mjs';
import { deploymentStatus } from './deployment.mjs';
import { createContactHandler } from './contact.mjs';
const contact = createContactHandler();
const state = resolve(process.env.EDITOR_STATE_DIR || './state');
const pb = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
const github = () => githubClient({repository:process.env.GITHUB_REPOSITORY, branch:process.env.GITHUB_BRANCH, token:process.env.GITHUB_TOKEN, authorName:process.env.GIT_AUTHOR_NAME, authorEmail:process.env.GIT_AUTHOR_EMAIL});
const allowlist = async () => {
  try { return normalizeEmails(JSON.parse(await readFile(process.env.COMMITTEE_ALLOWLIST_FILE, 'utf8'))); }
  catch { return new Set(); }
};
await mkdir(join(state, 'portraits'), {recursive:true});
await mkdir(join(state, 'revisions'), {recursive:true});
let busy = false;
async function pbRequest(path, token, method = 'GET', body) {
  const r = await fetch(pb + path, {method, headers:{Authorization:token || '', 'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(15000)});
  if (!r.ok) fail(r.status === 403 ? 'Committee access denied.' : `PocketBase request failed (${r.status}).`, r.status);
  return r.status === 204 ? null : r.json();
}
async function auth(req) {
  const token = req.headers.authorization || '';
  if (!token || token.length > 8192) fail('Sign in with Google.', 401);
  const result = await pbRequest('/api/collections/committee_users/auth-refresh', token, 'POST', {});
  if (!authorized(result.record, await allowlist())) fail('Committee access revoked or unavailable.', 403);
  return token;
}
async function body(req, limit = 12 * 1024 * 1024) {
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > limit) fail('Upload is too large.', 413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function json(req) {
  try { return JSON.parse((await body(req, 16384)).toString()); }
  catch (error) { if (error.status) throw error; fail('Invalid JSON.'); }
}
async function drafts(token) {
  const data = await pbRequest('/api/collections/profiles/records?perPage=101&sort=position,id', token);
  if (data.totalItems > 100) fail('Roster is limited to 100 profiles.');
  return data.items;
}
async function exclusive(action) {
  if (busy) fail('Another editor operation is running. Try again.', 409);
  busy = true;
  try { return await action(); } finally { busy = false; }
}
async function publicationReceipt() {
  try {return JSON.parse(await readFile(join(state,'publication.json'),'utf8'));}
  catch(error) {if(error.code === 'ENOENT') return null;throw error;}
}
async function savePublication(receipt) {
  const target = join(state,'publication.json');
  await writeFile(target+'.tmp',JSON.stringify(receipt),{mode:0o600});
  await rename(target+'.tmp',target);
}
async function status() {
  const client = github();
  const last = await publicationReceipt();
  const head = await client.head();
  if (last?.commit && last.submission === 'pending') {
    let included = head === last.commit;
    if (!included) {
      try {const comparison = await client.call(`/compare/${last.commit}...${head}`);included = comparison.status === 'ahead' || comparison.status === 'identical';} catch {}
    }
    if (included) {last.submission='committed';await savePublication(last);}
    else last.submission='unknown';
  }
  return {head,last,deployment:await deploymentStatus(client,last,process.env.PUBLIC_TEAM_URL)};
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  const send = (data, code = 200) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };
  try {
    const url = new URL(req.url, 'http://local');
    const path = url.pathname;
    if (path === '/api/contact') { await contact(req, res); return; }
    if (req.method !== 'GET' && req.headers.origin) {
      const expected = process.env.EDITOR_ORIGIN || 'http://localhost:4174';
      if (req.headers.origin !== expected) fail('Origin denied.', 403);
    }
    if (path === '/api/editor/setup' && req.method === 'GET') {
      const missing = ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','COMMITTEE_ALLOWLIST_FILE','GITHUB_REPOSITORY','GITHUB_BRANCH','GITHUB_TOKEN','GIT_AUTHOR_NAME','GIT_AUTHOR_EMAIL'].filter(key => !process.env[key]);
      if (!(await allowlist()).size && !missing.includes('COMMITTEE_ALLOWLIST_FILE')) missing.push('Committee allowlist is empty or invalid');
      let pbReady = false; try { pbReady = (await fetch(pb + '/api/health', {signal:AbortSignal.timeout(2000)})).ok; } catch {}
      send({authReady:pbReady && !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && (await allowlist()).size > 0, publishReady:missing.length === 0, pocketbaseReady:pbReady, missing}); return;
    }
    const oauthBase = '/api/collections/committee_users/';
    if (path === oauthBase + 'auth-methods' && req.method === 'GET') { send(await pbRequest(path, '')); return; }
    if (path === oauthBase + 'auth-with-oauth2' && req.method === 'POST') {
      const b = await json(req);
      if (b.provider !== 'google' || b.redirectURL !== (process.env.EDITOR_ORIGIN || 'http://localhost:4174') + '/oauth/callback') fail('Invalid Google OAuth request.');
      const result = await pbRequest(path, '', 'POST', {provider:'google',code:b.code,codeVerifier:b.codeVerifier,redirectURL:b.redirectURL});
      send({token:result.token, record:result.record}); return;
    }
    if (path.startsWith('/api/editor/')) {
      const token = await auth(req);
      if (path === '/api/editor/profiles' && req.method === 'GET') { const records = await drafts(token); send({records, version:draftHash(records)}); return; }
      if (path === '/api/editor/publication' && req.method === 'GET') { send(await exclusive(status)); return; }
      if (path === '/api/editor/order' && req.method === 'POST') {
        send(await exclusive(async () => {
          const b = await json(req); const records = await drafts(token);
          if (b.expectedDraft !== draftHash(records)) fail('Draft changed. Reload before reordering.',409);
          return pbRequest('/api/gcom/reorder',token,'POST',{ids:b.ids});
        })); return;
      }
      if (path === '/api/editor/portrait' && req.method === 'POST') {
        const bytes = await body(req);
        const cleaned = await cleanPortrait(bytes);
        const filename = createHash('sha256').update(cleaned).digest('hex') + '.webp';
        await writeFile(join(state, 'portraits', filename), cleaned, {flag:'wx',mode:0o600}).catch(error => {if (error.code !== 'EEXIST') throw error;});
        send({filename}); return;
      }
      if (path.startsWith('/api/editor/portrait/') && req.method === 'GET') {
        const name = path.slice('/api/editor/portrait/'.length); if (!photoPattern.test(name)) fail('Invalid portrait.');
        const image = await readFile(join(state, 'portraits', name)); res.writeHead(200, {'Content-Type':'image/webp'}); res.end(image); return;
      }
      if (path === '/api/editor/profiles' && req.method === 'POST') {
        send(await exclusive(async () => {
          const b = await json(req); const records = await drafts(token);
          if (records.length >= 100) fail('Roster is limited to 100 profiles.');
          const p = profile(b); if (p.photo) await stat(join(state,'portraits',p.photo));
          return pbRequest('/api/collections/profiles/records',token,'POST',p);
        }), 201); return;
      }
      if (/^\/api\/editor\/profiles\/[a-z0-9]{15}$/.test(path) && ['PATCH','DELETE'].includes(req.method)) {
        const id = path.split('/').pop();
        send(await exclusive(async () => {
          let p; if (req.method === 'PATCH') {p = profile(await json(req)); if (p.photo) await stat(join(state,'portraits',p.photo));}
          return pbRequest(`/api/collections/profiles/records/${id}`, token, req.method, p);
        })); return;
      }
      if (path === '/api/editor/publish' && req.method === 'POST') {
        send(await exclusive(async () => {
          let lock; try { lock = await open(join(state, 'publish.lock'), 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') fail('Publication is locked. Operator recovery is required after an interrupted publish.',409); throw error; }
          try {
            const previous = await publicationReceipt();
            if (previous?.submission === 'pending') fail('Previous commit outcome requires reconciliation. Reload publication status or ask the operator before retrying.',409);
            const b = await json(req); const records = await drafts(token);
            if (draftHash(records) !== b.expectedDraft) fail('Draft changed. Reload before publishing.',409);
            const client = github();
            if (await client.head() !== b.expectedHead) fail('Repository changed. Reload before publishing.',409);
            const snapshot = roster(records,randomUUID().replaceAll('-',''),new Date().toISOString());
            const directory = join(state,'revisions',snapshot.revision); await mkdir(directory);
            const portraits = new Map();
            for (const member of snapshot.members) if (member.photo) {
              const name = member.photo.split('/').pop();
              if (!portraits.has(name)) { const bytes = await readFile(join(state,'portraits',name)); portraits.set(name,bytes); await writeFile(join(directory,name),bytes,{flag:'wx',mode:0o400}); }
            }
            await writeFile(join(directory,'team.json'),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o400});
            const receipt = {revision:snapshot.revision, publishedAt:snapshot.publishedAt, submission:'pending',deployment:'unverified'};
            // Permission is checked again immediately before any remote publication writes.
            await auth(req);
            let result;
            try { result = await commitRoster(client,snapshot,portraits,b.expectedHead,async commit => {await auth(req); receipt.commit=commit; await savePublication(receipt);}); }
            catch(error) {if(error.status === 409 && receipt.commit) {receipt.submission='rejected';await savePublication(receipt);}throw error;}
            Object.assign(receipt,result); await savePublication(receipt); return receipt;
          } finally {await lock.close(); await unlink(join(state,'publish.lock'));}
        })); return;
      }
      fail('Endpoint not found.',404);
    }
    if (path.startsWith('/api/')) fail('Endpoint not found.',404);
    const root = resolve('dist'); const target = resolve(root, '.' + path);
    if (!target.startsWith(root + '/') && target !== root) fail('Invalid path.');
    let data; let type;
    try {data = await readFile(target); type = ({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.woff2':'font/woff2','.woff':'font/woff','.txt':'text/plain'})[extname(target)] || 'application/octet-stream';}
    catch {data=await readFile(join(root,'index.html'));type='text/html';}
    res.writeHead(200,{'Content-Type':type});res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') send({message:'Requested file is unavailable.'},404);
    else send({message:error.status ? error.message : 'Operation failed. Drafts and the public site are preserved.'},error.status || 500);
  }
});
server.listen(Number(process.env.PORT || 8091), process.env.HOST || '127.0.0.1', () => console.log('GCOM editor server ready'));
