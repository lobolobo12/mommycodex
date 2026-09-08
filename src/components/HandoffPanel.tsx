import { useState } from 'react';
import { useHubStore, patchHandoff } from '../hub/state';
import { resumeHandoff } from '../hub/controller';
import { useAppStore } from '../codex/store';
import { errorMessage } from '../codex/transport';
export default function HandoffPanel({cwd}:{cwd:string}){
 const h=useHubStore(s=>s.handoffs[cwd]);const [error,setError]=useState('');const busy=useAppStore(s=>!!s.activeTurn||s.submissionPending||s.threadLoading);
 return <section className="handoff-panel"><h3>Session handoff</h3><p>Task results and unfinished plan steps are saved automatically. Add decisions you want the next session to remember.</p>{h&&<><small>{h.status} · {new Date(h.updatedAt).toLocaleString()}</small><h4>Last result</h4><pre>{h.summary}</pre><h4>Changed files</h4><ul>{h.changedFiles.map(p=><li key={p}><code>{p}</code></li>)}</ul><h4>Unfinished steps</h4><ul>{h.remaining.map((s,i)=><li key={i}>{s}</li>)}</ul></>}<label>Decisions and next-session notes<textarea rows={5} aria-label="Handoff decisions" value={h?.decisions??''} onChange={e=>patchHandoff(cwd,{decisions:e.target.value})}/></label>{error&&<p role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy||!h} onClick={()=>void resumeHandoff(cwd).catch(e=>setError(errorMessage(e)))}>Continue from handoff</button></section>;
}
