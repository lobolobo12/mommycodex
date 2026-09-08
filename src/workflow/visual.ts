import { useHarnessStore } from '../harness/state';
import { browserAction, type BrowserSnapshot } from '../harness/api';
import { saveComparison, useWorkflowStore, type Frame } from './state';
export async function frameFrom(snapshot:BrowserSnapshot):Promise<Frame>{
 if(!snapshot.screenshot||!snapshot.url)throw Error('Open a project preview before capturing.');
 const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Preview image could not be loaded.'));img.src=snapshot.screenshot!;});
 const canvas=document.createElement('canvas');canvas.width=Math.min(image.naturalWidth,1000);canvas.height=Math.round(canvas.width*image.naturalHeight/image.naturalWidth);const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image capture is unavailable.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 return {image:canvas.toDataURL('image/jpeg',.72),url:snapshot.url,width:snapshot.width??image.naturalWidth,height:snapshot.height??image.naturalHeight,at:Date.now()};
}
export async function captureComparison(cwd:string,id:string,side:'before'|'after'){
 if(useHarnessStore.getState().browser?.project!==cwd||!useHarnessStore.getState().browser?.screenshot)return;
 try{const snapshot=await browserAction({action:'snapshot'});if(snapshot.project!==cwd||!snapshot.screenshot)return;const frame=await frameFrom(snapshot);const prior=useWorkflowStore.getState().comparisons[id];saveComparison(id,{...prior,cwd,[side]:frame,error:undefined});}
 catch(e){const prior=useWorkflowStore.getState().comparisons[id];if(prior)saveComparison(id,{...prior,error:`${side} capture unavailable: ${String(e)}`});}
}
