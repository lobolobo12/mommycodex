import { useState } from 'react';
import { useHubStore } from '../hub/state';
import { openProject, resumeHandoff } from '../hub/controller';
import { useAppStore } from '../codex/store';
import { errorMessage } from '../codex/transport';
import { pickProjectFolder } from './ProjectPicker';
import { MascotArt } from './Mascot';
export default function ProjectLaunchpad(){
 const h=useHubStore();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
 const running=useAppStore(s=>!!s.activeTurn||s.submissionPending);
 return <div className="launchpad-backdrop"><section className="launchpad card" role="dialog" aria-modal="true" aria-label="Project launchpad"><header><div><span className="section-label">Pick up where you left off</span><h2>Your projects</h2></div><button className="btn" onClick={()=>useHubStore.setState({open:false})}>Close</button></header>
 {error&&<p role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy||running} onClick={()=>void run(async()=>{await pickProjectFolder();useHubStore.setState({open:false});})}>Open another project</button>
 <div className="project-grid">{h.projects.map(p=><article key={p.cwd} className="project-tile">{p.thumbnail?<img className="project-thumbnail" src={p.thumbnail} alt={`Preview of ${p.cwd.split(/[\\/]/).pop()}`}/>:<div className="project-thumbnail project-placeholder"><MascotArt avatar character={p.character}/><span>Preview this project to save a thumbnail</span></div>}<h3>{p.cwd.split(/[\\/]/).pop()}</h3><small title={p.cwd}>{p.cwd}</small><p>{p.character==='nyx'?'☾ Nyx':'♡ Mommy-chan'} · {new Date(p.lastOpened).toLocaleDateString()}</p>{h.handoffs[p.cwd]&&<p className="handoff-preview">{h.handoffs[p.cwd].summary.slice(0,140)}</p>}<div className="workbench-actions"><button className="btn" disabled={busy||running} onClick={()=>void run(()=>openProject(p))}>Open project</button><button className="btn" disabled={busy||running} onClick={()=>void run(()=>openProject(p,true))}>Launch preview</button>{h.handoffs[p.cwd]&&<button className="btn" disabled={busy||running} onClick={()=>void run(()=>resumeHandoff(p.cwd))}>Continue work</button>}</div></article>)}</div>
 {!h.projects.length&&<p>Open a project to start your launchpad.</p>}</section></div>;
}
