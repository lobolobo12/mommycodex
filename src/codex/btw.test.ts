import { beforeEach, expect, it, vi } from 'vitest';
import { BtwController, useBtwStore } from './btw';
import { useAppStore } from './store';
import { DEFAULT_SETTINGS } from '../settings';
import * as transport from './transport';
vi.mock('./transport',()=>({rpc:vi.fn(),respondError:vi.fn().mockResolvedValue(undefined),errorMessage:(e:unknown)=>String(e)}));
beforeEach(()=>{vi.clearAllMocks();useBtwStore.setState({status:'idle',answer:''});useAppStore.setState({cwd:'/project',connection:{state:'ready',binary:'fixture'},activeThreadId:'main',activeTurn:{threadId:'main',turnId:'main-turn',status:'inProgress'},settings:{...DEFAULT_SETTINGS},items:{},itemsByThread:{}});});
it('uses an ephemeral read-only thread without steering or replacing the main task',async()=>{
 vi.mocked(transport.rpc).mockImplementation(async method=>method==='thread/start'?{thread:{id:'side'}}:method==='turn/start'?{turn:{id:'side-turn',status:'inProgress'}}:{});
 const controller=new BtwController();await controller.ask('Why TypeScript?');
 expect(transport.rpc).toHaveBeenCalledWith('thread/start',expect.objectContaining({ephemeral:true,sandbox:'read-only',approvalPolicy:'never'}));
 controller.handle({type:'notification',method:'item/agentMessage/delta',params:{threadId:'side',itemId:'answer',delta:'For types.'}});
 expect(useBtwStore.getState().answer).toBe('For types.');
 expect(controller.handle({type:'notification',method:'turn/completed',params:{threadId:'main',turn:{id:'main-turn'}}})).toBe(false);
 await controller.stop();expect(transport.rpc).toHaveBeenCalledWith('turn/interrupt',{threadId:'side',turnId:'side-turn'});
 controller.handle({type:'notification',method:'item/agentMessage/delta',params:{threadId:'side',itemId:'answer',delta:'late'}});
 expect(useBtwStore.getState().answer).toBe('For types.');expect(useAppStore.getState().activeTurn?.turnId).toBe('main-turn');
 expect(vi.mocked(transport.rpc).mock.calls.some(([method])=>method==='turn/steer')).toBe(false);
});
it('cancellation during thread creation never starts a side turn',async()=>{
 let resolve!:(v:unknown)=>void;vi.mocked(transport.rpc).mockImplementation(method=>method==='thread/start'?new Promise(r=>{resolve=r;}):Promise.resolve({}));
 const c=new BtwController();const pending=c.ask('Question');await c.stop();resolve({thread:{id:'side'}});await pending;
 expect(vi.mocked(transport.rpc).mock.calls.some(([method])=>method==='turn/start')).toBe(false);
});
it('reports failures and marks in-flight answers disconnected',async()=>{
 vi.mocked(transport.rpc).mockRejectedValue(Error('offline'));const c=new BtwController();await expect(c.ask('Question')).rejects.toThrow('offline');expect(useBtwStore.getState().status).toBe('failed');useBtwStore.setState({status:'answering'});c.disconnected();expect(useBtwStore.getState().error).toContain('disconnected');
});
