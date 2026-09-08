import { useState } from 'react';
import { checkpointFiles, type Checkpoint, type ReviewFile } from '../harness/api';
import { harness } from '../harness/controller';
import { useHarnessStore } from '../harness/state';
import { useAppStore } from '../codex/store';
import { errorMessage } from '../codex/transport';
export default function ChangeReview({cwd,checkpoint:c}:{cwd:string;checkpoint:Checkpoint}){
  const [files,setFiles]=useState<ReviewFile[]|null>(null);
  const [error,setError]=useState('');const [loading,setLoading]=useState(false);
  const busy=useHarnessStore(s=>s.busy);const running=useAppStore(s=>!!s.activeTurn||s.submissionPending);
  async function run(fn:()=>Promise<unknown>){setError('');setLoading(true);try{await fn();}catch(e){setError(errorMessage(e));}finally{setLoading(false);}}
  return <article className="checkpoint-card">
    <strong>{c.label||'Coding task'}</strong><small>{new Date(c.createdAt*1000).toLocaleString()} · {c.status}</small>
    {c.status==='pending'&&<p role="status">Proposal ready. Starting files have been restored. Review these changes, then accept or discard.</p>}
    <button className="btn btn-ghost" disabled={loading||c.status==='running'} onClick={()=>void run(async()=>setFiles(await checkpointFiles(cwd,c.id)))}>{files?'Refresh file comparison':`Review ${c.changed.length} changed files`}</button>
    {files&&<div className="review-files">{files.map(f=><details key={f.path}><summary><b>{f.kind}</b> <code>{f.path}</code></summary>{f.binary?<p>Binary or large file. Contents are preserved in the snapshot; text preview is unavailable.</p>:<div className="file-comparison"><section><b>Before</b><pre>{f.before??'(File did not exist)'}</pre></section><section><b>Proposed</b><pre>{f.after??'(File deleted)'}</pre></section></div>}</details>)}</div>}
    {error&&<p role="alert" className="workbench-error">{error}</p>}
    <div className="workbench-actions">
      {c.status==='pending'&&<><button className="btn btn-primary" disabled={busy||running||loading||!files} onClick={()=>void run(()=>harness.reviewDecision(cwd,c.id,'accept'))}>Accept changes</button><button className="btn" disabled={busy||running||loading} onClick={()=>void run(()=>harness.reviewDecision(cwd,c.id,'discard'))}>Discard proposal</button></>}
      {['ready','accepted'].includes(c.status)&&<button className="btn" disabled={busy||running||loading||!c.changed.length} onClick={()=>void run(()=>harness.undo(cwd,c.id))}>Undo this task</button>}
      {c.status==='restored'&&<button className="btn" disabled={busy||running||loading||!files} onClick={()=>void run(()=>harness.reviewDecision(cwd,c.id,'accept'))}>Apply again</button>}
    </div>
  </article>;
}
