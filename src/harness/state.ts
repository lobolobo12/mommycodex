import { create } from 'zustand';
import type { BrowserSnapshot, Checkpoint, ProjectMemory } from './api';
export type QueueStatus='queued'|'running'|'completed'|'failed'|'cancelled'|'interrupted';
export interface QueueTask {character?:"mommy"|"nyx";id:string;cwd:string;threadId:string|null;text:string;status:QueueStatus;error?:string;createdAt:number}
export interface Verification {id:string;cwd:string;threadId:string|null;status:'running'|'passed'|'failed'|'cancelled';attempt:number;maxAttempts:number;summary:string;reports:string[]}
const STORAGE='mommycodex.harness.v1';
function restored():QueueTask[]{try {const value=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(value)?value.filter(t=>typeof t.id==='string'&&typeof t.cwd==='string'&&typeof t.text==='string').map(t=>({...t,status:t.status==='running'?'interrupted':t.status})):[];}catch{return [];}}
export const useHarnessStore=create<{
  open:boolean;tab:'preview'|'queue'|'memory'|'checkpoints';memories:Record<string,ProjectMemory>;checkpoints:Record<string,Checkpoint[]>;
  queue:QueueTask[];queuePaused:boolean;busy:boolean;browser:BrowserSnapshot|null;verification:Verification|null;
}>(()=>({open:false,tab:'preview',memories:{},checkpoints:{},queue:restored(),queuePaused:true,busy:false,browser:null,verification:null}));
useHarnessStore.subscribe((s,p)=>{if(s.queue!==p.queue){try{localStorage.setItem(STORAGE,JSON.stringify(s.queue));}catch{ /* UI remains usable without persistent browser storage. */ }}});
export function patchTask(id:string,patch:Partial<QueueTask>){useHarnessStore.setState(s=>({queue:s.queue.map(t=>t.id===id?{...t,...patch}:t)}));}
