export async function deploymentStatus(client, publication, publicURL, transport = fetch) {
  if (!publication?.commit || publication.submission !== 'committed') return {status:'unverified',live:false};
  try {
    const result = await client.call(`/actions/workflows/pages.yml/runs?head_sha=${publication.commit}&branch=${encodeURIComponent(client.config.branch)}&per_page=10`);
    const runs = result.workflow_runs.filter(run => run.head_sha === publication.commit && run.head_branch === client.config.branch && run.event === 'push').sort((a,b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt);
    const run = runs[0];
    if (!run) return {status:'queued',live:false};
    const detail = {runURL:run.html_url,live:false};
    if (run.status !== 'completed') return {...detail,status:run.status === 'in_progress'?'in_progress':'queued'};
    if (run.conclusion !== 'success') return {...detail,status:'failed',conclusion:run.conclusion};
    if (!publicURL) return {...detail,status:'succeeded_unverified'};
    const url = new URL(publicURL);
    if (url.protocol !== 'https:' || url.username || url.password) return {...detail,status:'succeeded_unverified'};
    const response = await transport(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(10000),redirect:'error'});
    if (response.ok && (await response.json()).revision === publication.revision) return {...detail,status:'live',live:true};
    return {...detail,status:'succeeded_unverified'};
  } catch { return {status:'unavailable',live:false}; }
}
