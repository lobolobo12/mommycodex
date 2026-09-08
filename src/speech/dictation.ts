import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { speech } from './controller';
export const useDictationStore=create<{status:'idle'|'requesting'|'recording'|'transcribing';seconds:number}>(()=>({status:'idle',seconds:0}));
export class DictationController {
  private epoch=Date.now();private timer:ReturnType<typeof setInterval>|null=null;private released=false;
  private onText:((text:string)=>void)|null=null;private onError:((error:unknown)=>void)|null=null;
  async start(onText:(text:string)=>void,onError:(error:unknown)=>void){
    if(useDictationStore.getState().status!=='idle')return;
    const epoch=this.epoch=Math.max(Date.now(),this.epoch+1);this.released=false;this.onText=onText;this.onError=onError;
    useDictationStore.setState({status:'requesting',seconds:0});
    try {
      await speech.stop();
      const hasKey=await invoke<boolean>('speech_key_status');if(!hasKey)throw Error('Add your Fish API key in Settings to use voice input.');
      if(epoch!==this.epoch)return;
      await invoke('microphone_start',{requestId:epoch});
      if(epoch!==this.epoch)return;
      if(this.released){this.cancel();return;}
      useDictationStore.setState({status:'recording'});
      this.timer=setInterval(()=>{const seconds=useDictationStore.getState().seconds+1;useDictationStore.setState({seconds});if(seconds>=120)this.finish();},1000);
    }catch(e){if(epoch===this.epoch){this.cancel();onError(e);}}
  }
  finish(){
    this.released=true;
    if(useDictationStore.getState().status!=='recording')return;
    if(this.timer)clearInterval(this.timer);this.timer=null;
    const epoch=this.epoch;useDictationStore.setState({status:'transcribing'});
    void (async()=>{
      try{
        const audio=await invoke<number[]>('microphone_finish',{requestId:epoch});
        if(epoch!==this.epoch)return;
        if(audio.length<100)return;
        const text=await invoke<string>('speech_transcribe',{requestId:epoch,audio,mime:'audio/wav'});
        if(epoch===this.epoch&&text.trim())this.onText?.(text.trim());
      }catch(e){if(epoch===this.epoch)this.onError?.(e);}
      finally{if(epoch===this.epoch)useDictationStore.setState({status:'idle',seconds:0});}
    })();
  }
  cancel(){const requestId=this.epoch=Math.max(Date.now(),this.epoch+1);this.released=true;if(this.timer)clearInterval(this.timer);this.timer=null;useDictationStore.setState({status:'idle',seconds:0});void invoke('microphone_cancel',{requestId}).catch(()=>{});void invoke('speech_transcribe_stop',{requestId}).catch(()=>{});}
}
export const dictation=new DictationController();
