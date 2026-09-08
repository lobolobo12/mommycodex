import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { HarnessController } from './controller';
import { useHarnessStore } from './state';
import * as api from './api';
import { useAppStore } from '../codex/store';
import { session,CodexSession } from '../codex/session';
import * as transport from '../codex/transport';
import { DEFAULT_SETTINGS } from '../settings';
import type { Turn } from '../protocol';
const done=(id='turn',status='completed')=>({id,status,items:[],error:null} as unknown as Turn);
const snapshot:api.BrowserSnapshot={url:'http://localhost:3000',project:'/tmp/project',logs:[],console:[],serverRunning:true,serverExit:null,check:{id:'check',command:'test',status:'passed',output:'passed',exitCode:0,startedAt:1},interactionCount:1,assertions:[{label:'Play works',passed:true,detail:'observed'}]};
beforeEach(()=>{
 vi.restoreAllMocks();vi.useFakeTimers();session.extensions=undefined;
 useAppStore.setState({cwd:'/tmp/project',activeThreadId:null,activeTurn:null,submissionPending:false,threadLoading:false,threads:{},items:{},itemsByThread:{},models:[],settings:{...DEFAULT_SETTINGS,reviewBeforeKeeping:false},connection:{state:'ready',binary:'codex'},toasts:[]});
 useHarnessStore.setState({memories:{'/tmp/project':{...api.emptyMemory,checkCommand:'npm test',previewUrl:'http://localhost:3000'}},queue:[],queuePaused:true,busy:false,verification:null,checkpoints:{},browser:null});
 vi.spyOn(api,'memoryLoad').mockResolvedValue({...api.emptyMemory,stack:'React',checkCommand:'npm test'});
 vi.spyOn(api,'checkpointStart').mockResolvedValue({id:'1',label:'task',threadId:'thread',createdAt:1,status:'running',changed:[],error:null});
 vi.spyOn(api,'checkpointFinish').mockResolvedValue({id:'1',label:'task',threadId:'thread',createdAt:1,status:'ready',changed:['a.ts'],error:null});
 vi.spyOn(api,'checkpointList').mockResolvedValue([]);
 vi.spyOn(api,'checkpointReview').mockResolvedValue({id:'1',label:'task',threadId:'thread',createdAt:1,status:'pending',changed:['a.ts'],error:null});
 vi.spyOn(api,'browserAction').mockImplementation(async params => (params.action === 'info' ? {node:'/node',script:'/bridge.cjs',sessionFile:'/session.json'} : snapshot) as never);
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
describe('project memory and snapshots',()=>{
 it('loads scoped memory into instructions and saves changes',async()=>{const h=new HarnessController();await h.prepare('/tmp/project');expect(h.instructions('/tmp/project')).toContain('React');expect(h.instructions('/another')).not.toContain('"stack":"React"');const save=vi.spyOn(api,'memorySave').mockResolvedValue();await h.saveMemory('/tmp/project',{...api.emptyMemory,preferences:'Use purple'});expect(save).toHaveBeenCalledWith('/tmp/project',expect.objectContaining({preferences:'Use purple'}));expect(h.instructions('/tmp/project')).toContain('Use purple');});
 it('captures before a task and finalizes once even with duplicate completion',async()=>{const h=new HarnessController();await h.beforeTask('/tmp/project','thread','fix');await h.completed('thread',done());await h.completed('thread',done());expect(api.checkpointStart).toHaveBeenCalledBefore(vi.mocked(api.checkpointFinish));expect(api.checkpointFinish).toHaveBeenCalledTimes(1);});
 it('does not finalize a checkpoint when a follow-up is rejected',async()=>{const s=new CodexSession();const h=new HarnessController();s.extensions=h;await h.beforeTask('/tmp/project','thread','task');useAppStore.setState({activeThreadId:'thread',activeTurn:{threadId:'thread',turnId:'turn',status:'inProgress'}});vi.spyOn(transport,'rpc').mockRejectedValue(Error('rejected'));await expect(s.send('follow up')).rejects.toThrow('rejected');expect(api.checkpointFinish).not.toHaveBeenCalled();});
});
describe('task queue',()=>{
 it('runs FIFO in the saved project and waits for completion before the next task',async()=>{
  const h=new HarnessController();const project=vi.spyOn(session,'setCwd').mockResolvedValue();vi.spyOn(session,'newThread').mockResolvedValue('thread');const send=vi.spyOn(session,'send').mockResolvedValue();
  h.enqueue('/tmp/first','Build');h.enqueue('/tmp/second','Polish');h.resumeQueue();await h.drainQueue();expect(project).toHaveBeenCalledWith('/tmp/first');expect(send).toHaveBeenCalledTimes(1);expect(useHarnessStore.getState().queue.map(t=>t.status)).toEqual(['running','queued']);
  useAppStore.setState({activeTurn:{threadId:'thread',turnId:'turn',status:'inProgress'}});await h.drainQueue();expect(send).toHaveBeenCalledTimes(1);
  useAppStore.setState({activeTurn:null});await h.completed('thread',done());await vi.advanceTimersByTimeAsync(200);expect(send).toHaveBeenCalledTimes(2);expect(project).toHaveBeenLastCalledWith('/tmp/second');
 });
 it('pauses on failure and cancellation never starts a queued task',async()=>{const h=new HarnessController();vi.spyOn(session,'setCwd').mockRejectedValue(Error('project missing'));h.enqueue('/tmp/missing','Build');h.resumeQueue();await h.drainQueue();expect(useHarnessStore.getState().queue[0].status).toBe('failed');expect(useHarnessStore.getState().queuePaused).toBe(true);h.enqueue('/tmp/project','Do not run');await h.cancelTask(useHarnessStore.getState().queue[1].id);expect(useHarnessStore.getState().queue[1].status).toBe('cancelled');});
 it('marks active work interrupted on disconnection',()=>{const h=new HarnessController();useHarnessStore.setState({queue:[{id:'x',cwd:'/tmp/project',threadId:'thread',text:'Build',status:'running',createdAt:1}],queuePaused:false});h.disconnected();expect(useHarnessStore.getState()).toMatchObject({queuePaused:true,queue:[{status:'interrupted'}]});});
});
describe('bounded verification',()=>{
 function active(attempt=1){useHarnessStore.setState({verification:{id:'v',cwd:'/tmp/project',threadId:'thread',status:'running',attempt,maxAttempts:3,summary:'',reports:[]}});}
 it('requires real browser assertions even when commands pass, stopping at the retry cap',async()=>{const h=new HarnessController();active(3);vi.mocked(api.browserAction).mockResolvedValue({...snapshot,assertions:[]} as never);const completion=h.completed('thread',done());await vi.advanceTimersByTimeAsync(500);await completion;expect(useHarnessStore.getState().verification?.status).toBe('failed');expect(useHarnessStore.getState().verification?.summary).toContain('three attempts');});
 it('records success only when final commands and assertions pass without console errors',async()=>{const h=new HarnessController();active();const completion=h.completed('thread',done());await vi.advanceTimersByTimeAsync(500);await completion;expect(useHarnessStore.getState().verification?.status).toBe('passed');expect(api.browserAction).toHaveBeenCalledWith({action:'check_start',cwd:'/tmp/project',command:'npm test'});});
 it('cancellation prevents a late check result from reporting success',async()=>{const h=new HarnessController();active();vi.spyOn(session,'interrupt').mockResolvedValue();const completion=h.completed('thread',done());await Promise.resolve();await h.cancelVerification();await vi.advanceTimersByTimeAsync(1000);await completion;expect(useHarnessStore.getState().verification?.status).toBe('cancelled');});
});

describe('review proposals',()=>{
 it('stages completed edits and pauses the queue for review',async()=>{useAppStore.getState().updateSettings({reviewBeforeKeeping:true});const h=new HarnessController();await h.beforeTask('/tmp/project','thread','change');await h.completed('thread',done());expect(api.checkpointReview).toHaveBeenCalledWith('/tmp/project','1','stage');expect(useHarnessStore.getState()).toMatchObject({open:true,tab:'checkpoints',queuePaused:true});});
 it('blocks new work when a persisted proposal is pending',async()=>{vi.mocked(api.checkpointList).mockResolvedValue([{id:'1',label:'task',threadId:'thread',createdAt:1,status:'pending',changed:['a.ts'],error:null}]);const h=new HarnessController();await expect(h.beforeTask('/tmp/project','thread','next')).rejects.toThrow('Accept or discard');expect(api.checkpointStart).not.toHaveBeenCalled();});
});
it('keeps verification attempts in one proposal and stages only after final checks',async()=>{
 useAppStore.getState().updateSettings({reviewBeforeKeeping:true});
 useHarnessStore.setState({verification:{id:'v',cwd:'/tmp/project',threadId:'thread',status:'running',attempt:1,maxAttempts:3,summary:'',reports:[]}});
 const h=new HarnessController();await h.beforeTask('/tmp/project','thread','verify');await h.beforeTask('/tmp/project','thread','retry');
 expect(api.checkpointStart).toHaveBeenCalledTimes(1);
 const completion=h.completed('thread',done());expect(api.checkpointReview).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(500);await completion;
 expect(useHarnessStore.getState().verification?.status).toBe('passed');expect(api.checkpointReview).toHaveBeenCalledWith('/tmp/project','1','stage');
});
