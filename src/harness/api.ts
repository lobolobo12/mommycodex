import { invoke } from '@tauri-apps/api/core';
export interface ProjectMemory { stack:string; preferences:string; runCommand:string; checkCommand:string; previewUrl:string }
export const emptyMemory:ProjectMemory={stack:'',preferences:'',runCommand:'',checkCommand:'',previewUrl:'http://localhost:3000'};
export interface Checkpoint {id:string;label:string;threadId:string;createdAt:number;status:string;changed:string[];error:string|null}
export interface CheckResult {id:string;command:string;status:string;output:string;exitCode:number|null;startedAt:number}
export interface BrowserSnapshot {project?:string;url:string;logs:string[];console:{type:string;text:string;time:number}[];serverRunning:boolean;serverExit:number|null;check:CheckResult|null;screenshot?:string;screenshotPath?:string;text?:string;accessibility?:string;width?:number;height?:number;interactionCount?:number;assertions?:{label:string;passed:boolean;detail:string}[]}
export const memoryLoad=(cwd:string)=>invoke<ProjectMemory>('project_memory_load',{cwd});
export const memorySave=(cwd:string,memory:ProjectMemory)=>invoke<void>('project_memory_save',{cwd,memory});
export const checkpointStart=(cwd:string,threadId:string,label:string)=>invoke<Checkpoint>('checkpoint_start',{cwd,threadId,label});
export const checkpointFinish=(cwd:string,id:string)=>invoke<Checkpoint>('checkpoint_finish',{cwd,id});
export const checkpointList=(cwd:string)=>invoke<Checkpoint[]>('checkpoint_list',{cwd});
export const checkpointUndo=(cwd:string,id:string)=>invoke<Checkpoint>('checkpoint_undo',{cwd,id});
export const browserAction=<T=BrowserSnapshot>(params:Record<string,unknown>)=>invoke<T>('browser_action',{params});

export interface ReviewFile {path:string;kind:string;before:string|null;after:string|null;binary:boolean}
export const checkpointFiles=(cwd:string,id:string)=>invoke<ReviewFile[]>('checkpoint_files',{cwd,id});
export const checkpointReview=(cwd:string,id:string,action:'stage'|'accept'|'discard')=>invoke<Checkpoint>('checkpoint_review',{cwd,id,action});

export const githubAction=<T=unknown>(cwd:string,action:string,params:Record<string,unknown>={})=>invoke<T>('github_action',{cwd,action,params});

export interface ProjectFile {path:string;size:number;text:string|null;image:string|null;binary:boolean;truncated:boolean}
export const projectFileRead=(cwd:string,path:string)=>invoke<ProjectFile>('project_file_read',{cwd,path});
