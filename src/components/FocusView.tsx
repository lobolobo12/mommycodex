import { MascotArt } from './Mascot';
import TaskActivity from './TaskActivity';
import { selectMood, useAppStore } from '../codex/store';
import { useHarnessStore } from '../harness/state';
import { useWorkflowStore } from '../workflow/state';
import { session } from '../codex/session';
import { errorMessage } from '../codex/transport';
export default function FocusView(){
 const mood=useAppStore(selectMood);
 const active=useAppStore(s=>s.activeTurn);const pending=useAppStore(s=>s.pendingRequests.length);const cwd=useAppStore(s=>s.cwd);const queue=useHarnessStore(s=>s.queue);const processing=useHarnessStore(s=>s.busy);
 return <main className="focus-view card" aria-label="Focus mode"><div className="focus-portrait"><MascotArt mood={mood}/></div><h1>{pending?'Your input is needed':active?'Working on your task':processing?'Saving task results':'Ready when you are'}</h1><p>{cwd?.split(/[\\/]/).pop()||'Choose a project to begin'}</p><TaskActivity/><p>{queue.filter(t=>t.status==='queued').length} tasks queued</p>{active&&<button className="btn" onClick={()=>void session.interrupt().catch(e=>useAppStore.getState().pushToast('error',errorMessage(e)))}>Stop task</button>}<button className="btn btn-primary" onClick={()=>useWorkflowStore.setState({focus:false})}>Return to workspace</button></main>;
}
