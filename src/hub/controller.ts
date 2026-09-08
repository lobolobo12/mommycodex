import { recordTimeline } from '../workflow/state';
import { useAppStore } from '../codex/store';
import { session } from '../codex/session';
import { harness } from '../harness/controller';
import { useHarnessStore } from '../harness/state';
import { useHubStore, rememberProject, patchHandoff, type RecentProject } from './state';
import type { Turn } from '../protocol';
export function saveHandoff(threadId:string,turn:Turn){
 const s=useAppStore.getState(),cwd=s.threads[threadId]?.cwd??s.cwd;if(!cwd)return;
 const items=turn.items?.length?turn.items:(s.itemsByThread[threadId]??[]).map(k=>s.items[k]).filter(i=>i?.turnId===turn.id).map(i=>i.item);
 const replies=items.filter(i=>i.type==='agentMessage'&&i.phase!=='commentary');
 const last=replies[replies.length-1];const plan=s.activityByThread[threadId]?.plan??[];
 const changedFiles=Array.from(new Set(items.flatMap(i=>i.type==='fileChange'?i.changes.map(c=>c.path):[])));
 const checks=items.flatMap(i=>i.type==='commandExecution'&&i.exitCode!==null&&/\b(test|vitest|pytest|check|typecheck|build)\b/.test(i.command)?[{command:i.command,exitCode:i.exitCode,output:(i.aggregatedOutput??'').slice(-3000)}]:[]).slice(-8);
 patchHandoff(cwd,{checks,threadId,status:turn.status,updatedAt:Date.now(),summary:last?.type==='agentMessage'?last.text.slice(0,12000):turn.error?.message??`Task ${turn.status}; no final summary was received.`,remaining:plan.filter(p=>p.status!=='completed').map(p=>p.step),changedFiles});
 const handoff=useHubStore.getState().handoffs[cwd];
 const checkpoint=useHarnessStore.getState().checkpoints[cwd]?.filter(c=>c.threadId===threadId).sort((a,b)=>b.createdAt-a.createdAt)[0];
 recordTimeline({...handoff,id:turn.id,checkpointId:checkpoint?.id});
}
export async function openProject(project:RecentProject,preview=false){
 const s=useAppStore.getState();if(s.activeTurn||s.submissionPending||s.threadLoading||useHarnessStore.getState().busy)throw Error('Finish or stop the current task first.');
 harness.pauseQueue();s.switchCharacter(project.character);await session.setCwd(project.cwd);await harness.prepare(project.cwd);useHubStore.setState({open:false});
 if(preview){useHarnessStore.setState({open:true,tab:'preview'});const memory=useHarnessStore.getState().memories[project.cwd];if(memory?.runCommand.trim())await harness.startServer(project.cwd);await harness.preview({action:'navigate',url:memory?.previewUrl||project.previewUrl||'http://localhost:3000'});}
}
export async function resumeHandoff(cwd:string){
 const h=useHubStore.getState().handoffs[cwd];if(!h)return;
 const p=useHubStore.getState().projects.find(p=>p.cwd===cwd);if(p)await openProject(p);
 if(h.threadId){const s=useAppStore.getState();s.switchCharacter(s.settings.threadCharacters[h.threadId]??"mommy");await session.openThread(h.threadId);}
 await session.send(`Continue from this saved handoff. First inspect the current files and confirm what remains; the saved summary may be stale.\n${JSON.stringify(h)}`);
}
async function thumbnail(url:string):Promise<string>{return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=Math.round(320*img.height/img.width);const ctx=canvas.getContext('2d');if(!ctx){reject(Error('No canvas'));return;}ctx.drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.65));};img.onerror=reject;img.src=url;});}
export function installHub(){
 const app=useAppStore.getState();if(app.cwd)rememberProject(app.cwd,app.settings.character);
 const unsubscribe=useAppStore.subscribe((s,p)=>{
   if(s.cwd&&(s.cwd!==p.cwd||s.settings.character!==p.settings.character))rememberProject(s.cwd,s.settings.character);
   const active=s.activeTurn;
   if(active&&(active.turnId!==p.activeTurn?.turnId||s.activityByThread[active.threadId]!==p.activityByThread[active.threadId])){
     const cwd=s.threads[active.threadId]?.cwd??s.cwd;if(!cwd)return;
     const items=(s.itemsByThread[active.threadId]??[]).map(k=>s.items[k]).filter(Boolean);
     const users=items.filter(i=>i.item.type==='userMessage');const user=users[users.length-1]?.item;
     const request=user?.type==='userMessage'?user.content.filter(c=>c.type==='text').map(c=>c.text).join(' ').slice(0,2000):'Task in progress';
     patchHandoff(cwd,{threadId:active.threadId,status:'inProgress',updatedAt:Date.now(),summary:request,remaining:(s.activityByThread[active.threadId]?.plan??[]).filter(step=>step.status!=='completed').map(step=>step.step)});
   }
 });
 let last=0;
 const browserUnsubscribe=useHarnessStore.subscribe((s,p)=>{const b=s.browser;if(!b?.project||!b.screenshot||b.screenshot===p.browser?.screenshot||Date.now()-last<5000)return;last=Date.now();const cwd=b.project;void thumbnail(b.screenshot).then(thumbnail=>useHubStore.setState(h=>({projects:h.projects.map(project=>project.cwd===cwd?{...project,thumbnail,previewUrl:b.url}:project)}))).catch(()=>undefined);});
 return ()=>{unsubscribe();browserUnsubscribe();};
}
