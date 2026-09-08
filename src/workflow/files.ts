import { create } from 'zustand';
import { useAppStore } from '../codex/store';
import { projectFileRead, type ProjectFile } from '../harness/api';
import { errorMessage } from '../codex/transport';
export function fileTarget(value:string):{path:string;line:number}|null {
 let path=value.trim();try{path=decodeURIComponent(path);}catch{/* Keep literal percent characters in local paths. */}if(!path||/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(path)||/^(?:https?|mailto|data|javascript):/i.test(path))return null;
 const match=/(?:#L|:)(\d+)(?:(?:C|:|-L)\d+)?$/.exec(path);const line=match?Math.max(1,Number(match[1])):1;if(match)path=path.slice(0,match.index);
 if(!/(?:^|[\\/])[^\\/]+\.[a-z\d_-]+$/i.test(path)&&!/(?:^|[\\/])(?:Dockerfile|Makefile|LICENSE|AGENTS\.md)$/i.test(path))return null;
 return {path,line};
}
interface FileState {view:'source'|'chat';open:boolean;cwd:string;path:string;line:number;file:ProjectFile|null;loading:boolean;error:string}
export const useFileStore=create<FileState>(()=>({view:'source',open:false,cwd:'',path:'',line:1,file:null,loading:false,error:''}));
let generation=0;
export async function previewFile(value:string,cwd=useAppStore.getState().cwd,view:'source'|'chat'='source'){
 if(!cwd)return;const target=fileTarget(value)??{path:value,line:1};const token=++generation;
 useFileStore.setState({view,open:true,cwd,path:target.path,line:target.line,file:null,loading:true,error:''});
 try{const file=await projectFileRead(cwd,target.path);if(token===generation)useFileStore.setState({file,loading:false});}
 catch(e){if(token===generation)useFileStore.setState({loading:false,error:errorMessage(e)});}
}
