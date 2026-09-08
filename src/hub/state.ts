import { create } from 'zustand';
import type { Character } from '../settings';
export interface RecentProject {cwd:string;character:Character;lastOpened:number;thumbnail?:string;previewUrl?:string}
export interface Handoff {checks?:{command:string;exitCode:number;output:string}[];cwd:string;threadId:string;updatedAt:number;status:string;summary:string;decisions:string;remaining:string[];changedFiles:string[]}
export interface IssueWork {startedAt?:number;cwd:string;repo:string;number:number;title:string;branch:string;base:string;threadId?:string;prUrl?:string}
interface HubState {projects:RecentProject[];handoffs:Record<string,Handoff>;issues:Record<string,IssueWork>;open:boolean}
const KEY='mommycodex.hub.v1';
function load():Partial<HubState>{try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');return {projects:Array.isArray(s.projects)?s.projects.filter((p:RecentProject)=>typeof p.cwd==='string').slice(0,12):[],handoffs:Object.fromEntries(Object.entries(s.handoffs??{}).map(([key,value])=>{const h=value as Handoff;return [key,h.status==='inProgress'?{...h,status:'interrupted'}:h];})),issues:s.issues??{}};}catch{return {};}}
export const useHubStore=create<HubState>(()=>({projects:[],handoffs:{},issues:{},open:false,...load()}));
useHubStore.subscribe((s,p)=>{if(s.projects!==p.projects||s.handoffs!==p.handoffs||s.issues!==p.issues)try{localStorage.setItem(KEY,JSON.stringify({projects:s.projects,handoffs:s.handoffs,issues:s.issues}));}catch{ /* The current session remains available if storage is full. */ }});
export function rememberProject(cwd:string,character:Character){useHubStore.setState(s=>({projects:[{...s.projects.find(p=>p.cwd===cwd),cwd,character,lastOpened:Date.now()},...s.projects.filter(p=>p.cwd!==cwd)].slice(0,12)}));}
export function patchHandoff(cwd:string,patch:Partial<Handoff>){useHubStore.setState(s=>({handoffs:{...s.handoffs,[cwd]:{...(s.handoffs[cwd]??{cwd,threadId:'',updatedAt:Date.now(),status:'saved',summary:'',decisions:'',remaining:[],changedFiles:[]}),...patch}}}));}
