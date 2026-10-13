import test from 'node:test';
import assert from 'node:assert/strict';
import { githubClient, commitRoster } from './publisher.mjs';
const head='1'.repeat(40),commit='2'.repeat(40),revision='a'.repeat(32),name='b'.repeat(64)+'.webp';
const snapshot={revision,publishedAt:'2026-10-13T00:00:00.000Z',members:[]};
function fixture({stale=false,race=false,patchError=false,committedDespiteError=false}={}) {
  const calls=[];let reads=0;let patched=false;
  const client=githubClient({repository:'owner/repo',branch:'main',token:'test-secret',authorName:'Human Person',authorEmail:'human@example.com'},async(url,options)=>{
    const path=new URL(url).pathname.replace('/repos/owner/repo','');
    const data=options.body?JSON.parse(options.body):undefined;
    calls.push({path,method:options.method,data});
    if(path==='/git/ref/heads/main'){reads++;return Response.json({object:{sha:patched&&committedDespiteError?commit:stale||race&&reads>1?'3'.repeat(40):head}})}
    if(path===`/git/commits/${head}`)return Response.json({tree:{sha:'base-tree'}});
    if(path==='/git/blobs')return Response.json({sha:'blob'});
    if(path==='/git/trees')return Response.json({sha:'tree'});
    if(path==='/git/commits')return Response.json({sha:commit});
    if(options.method==='PATCH'){patched=true;return Response.json({}, {status:patchError?500:200})}
    throw new Error('Unexpected API call');
  });
  return {client,calls};
}
test('one commit preserves the base tree, restricts paths and uses configured human author',async()=>{
  const {client,calls}=fixture();let durable;
  const result=await commitRoster(client,snapshot,new Map([[name,Buffer.from('photo')]]),head,async sha=>{durable=sha});
  assert.equal(result.submission,'committed');assert.equal(result.deployment,'unverified');assert.equal(durable,commit);
  const tree=calls.find(c=>c.path==='/git/trees').data;
  assert.equal(tree.base_tree,'base-tree');assert.deepEqual(tree.tree.map(f=>f.path),['public/data/team.json',`public/team/${revision}/${name}`]);
  const creation=calls.find(c=>c.path==='/git/commits').data;
  assert.deepEqual(creation.parents,[head]);assert.equal(creation.author.name,'Human Person');assert.equal(creation.committer.email,'human@example.com');
  assert.deepEqual(calls.find(c=>c.method==='PATCH').data,{sha:commit,force:false});
});
test('stale head, mid-publish races and malicious paths cannot update the branch',async()=>{
  for(const options of [{stale:true},{race:true}]){
    const {client,calls}=fixture(options);await assert.rejects(commitRoster(client,snapshot,new Map(),head),/Repository changed/);assert.equal(calls.some(c=>c.method==='PATCH'),false);
  }
  const {client,calls}=fixture();await assert.rejects(commitRoster(client,snapshot,new Map([['../escape',Buffer.from('x')]]),head),/Invalid portrait/);assert.equal(calls.some(c=>c.method==='POST'),false);
});
test('ambiguous commit submission is reconciled and never reported as deployed',async()=>{
  const unknown=fixture({patchError:true});await assert.rejects(commitRoster(unknown.client,snapshot,new Map(),head),/outcome unknown/);
  const completed=fixture({patchError:true,committedDespiteError:true});assert.deepEqual(await commitRoster(completed.client,snapshot,new Map(),head),{commit,submission:'committed',deployment:'unverified'});
});
