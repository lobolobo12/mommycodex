import { useEffect } from 'react';
import { dictation,useDictationStore } from '../speech/dictation';
import { useAppStore } from '../codex/store';
import { errorMessage } from '../codex/transport';
export default function VoiceInput({onText}:{onText:(text:string)=>void}){
  const {status,seconds}=useDictationStore();const threadId=useAppStore(s=>s.activeThreadId);const cwd=useAppStore(s=>s.cwd);
  useEffect(()=>()=>dictation.cancel(),[threadId,cwd]);
  const start=()=>void dictation.start(onText,e=>useAppStore.getState().pushToast('error',errorMessage(e)));
  return <div className="voice-input">
    <button className={`btn btn-ghost ${status==='recording'?'recording':''}`} aria-label="Hold to talk" title="Hold to record · release to transcribe into your draft · Fish API credits apply" disabled={status==='transcribing'}
      onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);start();}}
      onPointerUp={()=>dictation.finish()} onPointerCancel={()=>dictation.cancel()}
      onClick={e=>{if(e.detail===0){if(status==='recording')dictation.finish();else if(status==='idle')start();}}}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8"/></svg>
      {status==='recording'?`${seconds}s · release to finish`:status==='requesting'?'Microphone…':status==='transcribing'?'Transcribing…':'Hold to talk'}
    </button>
    {status!=='idle'&&<button className="btn btn-ghost" aria-label="Cancel voice input" onClick={()=>dictation.cancel()}>Cancel</button>}
  </div>;
}
