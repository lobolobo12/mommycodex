import { create } from 'zustand';
import type { Handoff } from '../hub/state';
export interface Frame {image:string;url:string;width:number;height:number;at:number}
export interface Comparison {cwd:string;before?:Frame;after?:Frame;error?:string}
export interface TimelineEntry extends Handoff {id:string;checkpointId?:string}
export interface Recipe {id:string;name:string;instructions:string}
export interface ReleaseDraft {version:string;notes:string;screenshots:Frame[];updatedAt:number}
const defaults:Recipe[]=[
 {id:'polish',name:'Polish this screen',instructions:'Inspect the current preview and improve spacing, typography, responsive layout, and accessibility. Preserve existing behavior. Verify the changes with screenshots and real interactions.'},
 {id:'tests',name:'Investigate failing tests',instructions:'Run the configured project checks, diagnose failures, and fix their underlying causes. Do not weaken tests to hide failures. Rerun relevant checks and report the evidence.'},
 {id:'review',name:'Review my changes',instructions:'Review uncommitted changes for bugs, regressions, and missing verification. Report actionable findings with file references. Do not edit files.'},
];
interface WorkflowState {recipes:Recipe[];timeline:TimelineEntry[];comparisons:Record<string,Comparison>;releases:Record<string,ReleaseDraft>;focus:boolean;storageError:string}
const KEY='mommycodex.workflow.v1';
function load():Partial<WorkflowState>{try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');return {recipes:Array.isArray(s.recipes)?s.recipes.filter((r:Recipe)=>r&&typeof r.id==='string'&&typeof r.name==='string'&&typeof r.instructions==='string'):defaults,timeline:Array.isArray(s.timeline)?s.timeline.filter((t:TimelineEntry)=>t&&typeof t.cwd==='string'&&typeof t.id==='string').slice(0,200):[],comparisons:s.comparisons??{},releases:s.releases??{}};}catch{return {};}}
export const useWorkflowStore=create<WorkflowState>(()=>({recipes:defaults,timeline:[],comparisons:{},releases:{},focus:false,storageError:'',...load()}));
useWorkflowStore.subscribe((s,p)=>{if(s.recipes===p.recipes&&s.timeline===p.timeline&&s.comparisons===p.comparisons&&s.releases===p.releases)return;try{localStorage.setItem(KEY,JSON.stringify({recipes:s.recipes,timeline:s.timeline,comparisons:s.comparisons,releases:s.releases}));if(s.storageError)useWorkflowStore.setState({storageError:''});}catch{useWorkflowStore.setState({storageError:'Local storage is full. New workflow data is available in this session but could not be saved. Delete older visual comparisons to free space.'});}});
export function recordTimeline(entry:TimelineEntry){useWorkflowStore.setState(s=>({timeline:[entry,...s.timeline.filter(t=>t.id!==entry.id)].slice(0,200)}));}
export function saveComparison(id:string,value:Comparison){useWorkflowStore.setState(s=>({comparisons:Object.fromEntries([[id,value],...Object.entries(s.comparisons).filter(([key])=>key!==id)].slice(0,12))}));}
export function releaseNotes(cwd:string,version:string,entries:TimelineEntry[],statuses:Record<string,string>):string {
 const tasks=entries.filter(t=>t.cwd===cwd);
 return `# ${version||'Release draft'}\n\nPrepared ${new Date().toLocaleString()}\n\n## Task results\n\n${tasks.map(t=>`### ${new Date(t.updatedAt).toLocaleString()} · ${t.status}\nFile review: ${t.checkpointId?statuses[t.checkpointId]??'unknown':'not recorded'}\n\n${t.summary}\n\nChanged files: ${t.changedFiles.join(', ')||'none recorded'}\n${t.remaining.length?`Unfinished: ${t.remaining.join('; ')}\n`:''}\n${t.checks?.length?t.checks.map(c=>`Command: ${c.command}\nExit code: ${c.exitCode}\n\n${c.output}`).join('\n\n'):'No check results recorded.'}`).join('\n\n')||'No task results recorded for this project.'}\n\n## Release review\n\nCheck results above are historical evidence, not verification of the current release. Review version, accepted changes, platform builds, and remaining work before publishing.\n`;
}
