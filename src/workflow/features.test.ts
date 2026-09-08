import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../codex/transport',()=>({rpc:vi.fn()}));
import { rpc } from '../codex/transport';
import { searchChats } from './search';
import { recordTimeline, releaseNotes, saveComparison, useWorkflowStore, type TimelineEntry } from './state';
const entry:TimelineEntry={id:'turn',cwd:'/a',threadId:'t',updatedAt:1,status:'completed',summary:'Fixed controls',decisions:'',remaining:['Check Windows'],changedFiles:['game.ts'],checks:[{command:'test',exitCode:1,output:'Failed'}],checkpointId:'c'};
beforeEach(()=>{vi.clearAllMocks();useWorkflowStore.setState({timeline:[],comparisons:{}});});
it('searches paginated message bodies across projects and reports unavailable histories',async()=>{
 vi.mocked(rpc).mockImplementation(async(method,params)=>{const p=params as Record<string,unknown>;if(method==='thread/list')return p.cursor?{data:[{id:'b',cwd:'/b',preview:'other'}],nextCursor:null}:{data:[{id:'a',cwd:'/a',preview:'first'}],nextCursor:'next'};if(p.threadId==='b')throw Error('unavailable');return {thread:{turns:[{items:[{type:'agentMessage',text:'The hidden error is E42'}]}]}};});
 const progress=vi.fn();await searchChats('E42',progress,new AbortController().signal);expect(progress).toHaveBeenLastCalledWith([expect.objectContaining({text:expect.stringContaining('E42')})],2,1);expect(vi.mocked(rpc).mock.calls.every(([method])=>method!=='thread/resume')).toBe(true);
});
it('cancels a search without emitting stale results',async()=>{const abort=new AbortController();vi.mocked(rpc).mockImplementation(async()=>{abort.abort();return {data:[{id:'a'}],nextCursor:null};});const progress=vi.fn();await searchChats('x',progress,abort.signal);expect(progress).not.toHaveBeenCalled();});
it('preserves multiple tasks while deduplicating completion notifications',()=>{recordTimeline(entry);recordTimeline({...entry,id:'second'});recordTimeline({...entry,summary:'Updated'});expect(useWorkflowStore.getState().timeline).toHaveLength(2);expect(useWorkflowStore.getState().timeline[0].summary).toBe('Updated');});
it('keeps release evidence project-bound and reports failed checks and pending proposals',()=>{const notes=releaseNotes('/a','v1',[entry,{...entry,cwd:'/b',summary:'SECRET'}],{c:'pending'});expect(notes).toContain('Exit code: 1');expect(notes).toContain('File review: pending');expect(notes).toContain('Check Windows');expect(notes).not.toContain('SECRET');expect(notes).toContain('historical evidence');});
it('bounds visual storage and replaces the same checkpoint without duplication',()=>{for(let i=0;i<15;i++)saveComparison(String(i),{cwd:'/a'});saveComparison('14',{cwd:'/b'});expect(Object.keys(useWorkflowStore.getState().comparisons)).toHaveLength(12);expect(useWorkflowStore.getState().comparisons['14'].cwd).toBe('/b');});
