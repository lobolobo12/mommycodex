import { rpc } from '../codex/transport';
import type { Thread, ThreadItem, ThreadListResponse } from '../protocol';
export interface SearchHit {thread:Thread;text:string}
export function searchableText(item:ThreadItem):string {
 switch(item.type){case 'userMessage':return item.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');case 'agentMessage':return item.text;case 'commandExecution':return `${item.command}\n${item.aggregatedOutput??''}`;case 'fileChange':return item.changes.map(c=>`${c.path}\n${c.diff}`).join('\n');default:return '';}
}
export async function searchChats(query:string,onProgress:(hits:SearchHit[],scanned:number,errors:number)=>void,signal:AbortSignal){
 const needle=query.trim().toLocaleLowerCase();if(!needle)return;let cursor:string|null=null;let scanned=0,errors=0;const hits:SearchHit[]=[];const seen=new Set<string>();
 do{
  if(signal.aborted)return;const page:ThreadListResponse=await rpc<ThreadListResponse>('thread/list',{limit:60,sortKey:'updated_at',...(cursor?{cursor}:{})});
  for(const thread of page.data){
   if(signal.aborted)return;if(seen.has(thread.id))continue;seen.add(thread.id);
   let text=[thread.name,thread.preview,thread.cwd].filter(Boolean).join('\n');
   try{const result=await rpc<{thread:Thread}>('thread/read',{threadId:thread.id,includeTurns:true});text+='\n'+result.thread.turns.flatMap(t=>t.items.map(searchableText)).join('\n');}catch{errors++;}
   if(signal.aborted)return;scanned++;const index=text.toLocaleLowerCase().indexOf(needle);if(index>=0)hits.push({thread,text:`${index>90?'…':''}${text.slice(Math.max(0,index-90),index+needle.length+180)}`});onProgress([...hits],scanned,errors);
  }
  if(cursor===page.nextCursor)break;cursor=page.nextCursor;
 }while(cursor);
}
