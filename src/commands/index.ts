import { create } from 'zustand';
import { session } from '../codex/session';
import { useAppStore } from '../codex/store';
import { useHarnessStore } from '../harness/state';
import { useHubStore } from '../hub/state';
import { speech } from '../speech/controller';
import { speechKeyStatus } from '../codex/transport';

export const useCommandUI = create<{settingsOpen:boolean}>(()=>({settingsOpen:false}));
export interface SlashCommand { name:string; description:string; value?:string; choices?:{value:string;label:string}[]; disabled?:string; run:(value:string)=>void|Promise<unknown> }
const onOff=[{value:'on',label:'On'},{value:'off',label:'Off'}];
export function commands():SlashCommand[] {
  const s=useAppStore.getState(), settings=s.settings;
  const busy=!!s.activeTurn||s.submissionPending||s.threadLoading;
  const idle=busy?'Finish or stop the current task first.':undefined;
  const ready=idle||(s.connection.state!=='ready'?'Connect to Codex first.':!s.cwd?'Open a project first.':undefined);
  const panel=(tab:ReturnType<typeof useHarnessStore.getState>['tab'])=>{useHarnessStore.setState({open:true,tab});};
  const toggle=(name:string,description:string,key:'mommyBuilding'|'reviewBeforeKeeping'|'showReasoning'|'ttsAutoRead'|'reactionVoice'|'listAllProjects',disabled?:string):SlashCommand=>({
    name,description,value:settings[key]?'on':'off',choices:onOff,disabled,
    run:async value=>{
      if(value==='on'&&(key==='ttsAutoRead'||key==='reactionVoice')&&!await speechKeyStatus())throw Error('Add your Fish API key with /settings first.');
      s.updateSettings({[key]:value==='on'});
      if(key==='ttsAutoRead'&&value==='off')await speech.stop();
      if(key==='listAllProjects')await session.refreshThreads();
    },
  });
  const model=session.currentModel();
  return [
    {name:'model',description:'Choose the model for your next task',value:settings.model??model?.model,choices:s.models.filter(m=>!m.hidden||m.model===settings.model).map(m=>({value:m.model,label:m.displayName||m.model})),disabled:s.models.length?undefined:'Models are still loading.',run:value=>s.updateSettings({model:value,effort:null})},
    {name:'effort',description:'Choose reasoning effort for your next task',value:settings.effort??model?.defaultReasoningEffort,choices:(model?.supportedReasoningEfforts??[]).map(e=>({value:e.reasoningEffort,label:e.reasoningEffort})),disabled:model?undefined:'Models are still loading.',run:value=>s.updateSettings({effort:value})},
    toggle('building','Theme new builds with your companion', 'mommyBuilding',idle),
    toggle('proposals','Review file proposals before keeping them','reviewBeforeKeeping',idle),
    toggle('reasoning','Show reasoning summaries','showReasoning'),
    toggle('voice','Automatically read finished replies','ttsAutoRead'),
    toggle('reactions','Speak short companion reactions','reactionVoice'),
    toggle('threads','List conversations from all projects','listAllProjects'),
    {name:'review',description:'Ask Codex to review uncommitted changes',disabled:ready,run:()=>session.reviewChanges()},
    {name:'new',description:'Start a new conversation',disabled:ready,run:()=>session.newThread()},
    ...(['preview','queue','memory','checkpoints','github','handoff'] as const).map(tab=>({name:tab,description:({preview:'Open the local app preview',queue:'Manage queued tasks',memory:'Edit project commands and preferences',checkpoints:'Review proposals and undo tasks',github:'Open issues and draft PR tools',handoff:'Read or update the project handoff'})[tab],run:()=>panel(tab)})),
    {name:'projects',description:'Open recent projects',run:()=>{useHubStore.setState({open:true});}},
    {name:'settings',description:'Open voice, permissions, and connection settings',run:()=>{useCommandUI.setState({settingsOpen:true});}},
    {name:'reconnect',description:'Reconnect to Codex',disabled:idle,run:()=>session.restart()},
    {name:'stop',description:'Stop the running task',disabled:s.activeTurn?undefined:'No task is running.',run:()=>session.interrupt()},
    {name:'quiet',description:'Stop speech playback',run:()=>speech.stop()},
  ];
}
export interface CommandOption {id:string; label:string; description:string; disabled?:string; selected?:boolean; command:SlashCommand; argument?:string}
export function commandOptions(text:string, entries=commands()):CommandOption[] {
  const match=/^\/([\w-]*)(?:\s+(.*))?$/.exec(text);
  if(!match)return [];
  const name=match[1].toLowerCase(),argument=match[2];
  const exact=entries.find(c=>c.name===name);
  if(exact?.choices && /\s/.test(text))return exact.choices.filter(c=>c.value.toLowerCase().includes((argument??'').toLowerCase())||c.label.toLowerCase().includes((argument??'').toLowerCase())).map(c=>({id:`${name}:${c.value}`,label:`/${name} ${c.value}`,description:c.label,disabled:exact.disabled,selected:c.value===exact.value,command:exact,argument:c.value}));
  if(argument!==undefined)return [];
  const rank=(c:SlashCommand)=>c.name===name?0:c.name.startsWith(name)?1:c.name.includes(name)?2:3;
  return entries.filter(c=>c.name.includes(name)||c.description.toLowerCase().includes(name)).sort((a,b)=>rank(a)-rank(b)).map(c=>({id:c.name,label:`/${c.name}`,description:c.description+(c.value?` · ${c.value}`:''),disabled:c.disabled,command:c}));
}
export async function runCommand(command:SlashCommand,argument='') {
  // Re-read guards at execution time, not only when the menu was rendered.
  const current=commands().find(c=>c.name===command.name)??command;
  if(current.disabled)throw Error(current.disabled);
  if(current.choices&&!current.choices.some(c=>c.value===argument))throw Error(`Choose a value for /${current.name}.`);
  await current.run(argument);
}
