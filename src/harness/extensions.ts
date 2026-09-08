import type { DynamicToolSpec, DynamicToolCallParams, DynamicToolCallResponse, Turn } from '../protocol';
export interface SessionExtensions {
  prepare(cwd:string):Promise<void>;
  instructions(cwd:string):string;
  tools:DynamicToolSpec[];
  beforeTask(cwd:string,threadId:string,text:string):Promise<void>;
  completed(threadId:string,turn:Turn):Promise<void>;
  failed(threadId:string|null,error:unknown):Promise<void>;
  tool(params:DynamicToolCallParams):Promise<DynamicToolCallResponse>;
  disconnected():void;
}
