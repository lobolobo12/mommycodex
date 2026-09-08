import { create } from 'zustand';
import { useAppStore, type Mood } from '../codex/store';
import { speech, useSpeechStore } from './controller';
export type ReactionEvent = 'finished' | 'error' | 'checksPassed' | 'checksFailed';
const lines = {
  mommy: { finished: 'All done, sweetheart. Come see what we made!', error: 'A little snag, sweetie. Let’s take it one step at a time.', checksPassed: 'That check passed! Nicely done, sweetheart.', checksFailed: 'That check needs some love. We’ll work through it.' },
  nyx: { finished: 'Your task is finished, darling. Come inspect my work.', error: 'A snag. Stay close, darling. Let’s see what needs attention.', checksPassed: 'Good. That check passed. Just how I like it.', checksFailed: 'That check failed. It has our attention now, darling.' },
};
export const useReactionStore = create<{text:string; mood:Mood|null}>(()=>({text:'',mood:null}));
let timer:ReturnType<typeof setTimeout>|undefined;
export function reactTo(event:ReactionEvent) {
  const s=useAppStore.getState();
  if(s.settings.seriousMode)return;
  const text=lines[s.settings.character][event];
  const mood=event==='finished'||event==='checksPassed'?'happy':'pouty';
  clearTimeout(timer);useReactionStore.setState({text,mood});s.setTransientMood(mood);
  timer=setTimeout(()=>useReactionStore.setState({text:'',mood:null}),6500);
  // Reactions are opt-in, never interrupt replies or manual playback.
  if(s.settings.reactionVoice&&!s.settings.ttsAutoRead&&!useSpeechStore.getState().activeKey)void speech.play(`reaction-${Date.now()}`,text,'reaction');
}
export function installReactions(){
  return useAppStore.subscribe((s,p)=>{
    if(s.settings.character!==p.settings.character||s.activeThreadId!==p.activeThreadId){clearTimeout(timer);useReactionStore.setState({text:'',mood:null});return;}
    if(s.activeTurn!==p.activeTurn&&!s.activeTurn&&p.activeTurn?.threadId===s.activeThreadId){reactTo(s.lastTurnStatus==='completed'?'finished':'error');return;}
    if(s.items!==p.items){
      for(const [key,item] of Object.entries(s.items)){
        if(item.threadId!==s.activeThreadId||item.turnId!==s.activeTurn?.turnId||!item.done||!p.items[key]||p.items[key].done)continue;
        if(item.item.type==='commandExecution'&&/\b(test|vitest|pytest|check|typecheck|build)\b/.test(item.item.command)&&item.item.exitCode!==null){reactTo(item.item.exitCode===0?'checksPassed':'checksFailed');break;}
      }
    }
  });
}
