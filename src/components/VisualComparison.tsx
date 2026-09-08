import { useState } from 'react';
import { useWorkflowStore } from '../workflow/state';
export default function VisualComparison({id}:{id:string}){
 const comparison=useWorkflowStore(s=>s.comparisons[id]);const [position,setPosition]=useState(50);
 if(!comparison)return null;const {before,after,error}=comparison;
 const compatible=before&&after&&before.url===after.url&&before.width===after.width&&before.height===after.height;
 return <details className="visual-comparison" open><summary>Before / after preview</summary><p className="hint">Captured during the task, before proposal files are restored. Images reflect the page at capture time.</p>{error&&<p role="status">{error}</p>}
 {compatible?<><div className="comparison-stage"><img src={after.image} alt="After task preview"/><img className="comparison-before" src={before.image} alt="Before task preview" style={{clipPath:`inset(0 ${100-position}% 0 0)`}}/><span className="comparison-line" style={{left:`${position}%`}}/><b className="comparison-label before">Before</b><b className="comparison-label after">After</b></div><label>Compare before and after<input aria-label="Before and after slider" type="range" min="0" max="100" value={position} onChange={e=>setPosition(Number(e.target.value))}/></label></>:<div className="comparison-pair">{before&&<figure><img src={before.image} alt="Before task preview"/><figcaption>Before · {before.url}</figcaption></figure>}{after&&<figure><img src={after.image} alt="After task preview"/><figcaption>After · {after.url}</figcaption></figure>}<p>{before&&after?'Different URLs or viewports; shown separately.':'One capture is missing. Keep the project preview open for both captures.'}</p></div>}
 <button className="btn btn-ghost" onClick={()=>useWorkflowStore.setState(s=>({comparisons:Object.fromEntries(Object.entries(s.comparisons).filter(([key])=>key!==id))}))}>Delete visual comparison</button></details>;
}
