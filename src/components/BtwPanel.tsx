import { UwuMarkdown } from './MessageBubble';
import { btw, useBtwStore } from '../codex/btw';
import { useAppStore } from '../codex/store';
import { errorMessage } from '../codex/transport';
export default function BtwPanel(){
 const settings=useAppStore(s=>s.settings);
 const s=useBtwStore();if(!s.open)return null;const busy=s.status==='starting'||s.status==='answering';
 return <section className="btw-panel" aria-label="Side question"><header><b>/btw · Side question</b><span role="status">{s.status}</span>{busy?<button className="btn btn-ghost" onClick={()=>void btw.stop().catch(e=>useAppStore.getState().pushToast('error',errorMessage(e)))}>Stop side answer</button>:<button className="btn btn-ghost" aria-label="Close side answer" onClick={()=>useBtwStore.setState({open:false})}>×</button>}</header><div className="btw-body"><strong>{s.question}</strong>{s.answer?<UwuMarkdown text={s.answer} intensity={settings.seriousMode||settings.character==='nyx'?0:3}/>:busy?<p>Thinking about your side question…</p>:null}{s.error&&<p role="alert">{s.error}</p>}</div><small>Separate from the main task · recent chat context · temporary answer</small></section>;
}
