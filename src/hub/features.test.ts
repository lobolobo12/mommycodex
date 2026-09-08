import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useHubStore, rememberProject, patchHandoff } from './state';
import { saveHandoff, openProject } from './controller';
import { useAppStore } from '../codex/store';
import { DEFAULT_SETTINGS } from '../settings';
import { recoveryPrompt } from '../components/ErrorRecovery';
import { prDescription } from '../components/GitHubPanel';
import { session } from '../codex/session';
import { harness } from '../harness/controller';
import { useHarnessStore } from '../harness/state';
import { emptyMemory } from '../harness/api';
import type { Turn } from '../protocol';
beforeEach(()=>{useHubStore.setState({projects:[],handoffs:{},issues:{}});useAppStore.setState({cwd:'/project',settings:{...DEFAULT_SETTINGS},activeTurn:null,submissionPending:false,threadLoading:false,threads:{},activityByThread:{}});useHarnessStore.setState({busy:false});});
afterEach(()=>vi.restoreAllMocks());
it('remembers project-specific companion and updates recent ordering without duplicates',()=>{rememberProject('/one','nyx');rememberProject('/two','mommy');rememberProject('/one','nyx');expect(useHubStore.getState().projects.map(p=>p.cwd)).toEqual(['/one','/two']);expect(useHubStore.getState().projects[0].character).toBe('nyx');});
it('saves actual results, changed files and unfinished steps while preserving decisions',()=>{
 patchHandoff('/project',{decisions:'Keep keyboard controls'});
 useAppStore.setState({activityByThread:{thread:{turnId:'turn',explanation:null,diff:'',plan:[{step:'Implement',status:'completed'},{step:'Check mobile',status:'pending'}]}}});
 saveHandoff('thread',{id:'turn',status:'completed',items:[{type:'agentMessage',id:'reply',text:'Added controls. Mobile remains unchecked.',phase:'final_answer'},{type:'fileChange',id:'file',changes:[{path:'game.ts'}]},{type:'commandExecution',command:'npm test',exitCode:0,aggregatedOutput:'5 tests passed'}]} as unknown as Turn);
 expect(useHubStore.getState().handoffs['/project']).toMatchObject({summary:'Added controls. Mobile remains unchecked.',remaining:['Check mobile'],changedFiles:['game.ts'],decisions:'Keep keyboard controls',checks:[{command:'npm test',exitCode:0,output:'5 tests passed'}]});
});
it('launches the saved project preview with its own companion and configured server',async()=>{
 vi.spyOn(session,'setCwd').mockResolvedValue();vi.spyOn(harness,'prepare').mockResolvedValue();const start=vi.spyOn(harness,'startServer').mockResolvedValue();const preview=vi.spyOn(harness,'preview').mockResolvedValue({} as never);
 useHarnessStore.setState({memories:{'/one':{...emptyMemory,runCommand:'npm run dev',previewUrl:'http://localhost:4321'}}});
 await openProject({cwd:'/one',character:'nyx',lastOpened:1},true);
 expect(useAppStore.getState().settings.character).toBe('nyx');expect(start).toHaveBeenCalledWith('/one');expect(preview).toHaveBeenCalledWith({action:'navigate',url:'http://localhost:4321'});
});
it('error actions preserve the failed command and distinguish explanation, repair and retry',()=>{
 expect(recoveryPrompt('explain','npm test','failed','/project')).toContain('Do not change files or rerun');
 expect(recoveryPrompt('fix','npm test','failed','/project')).toContain('rerun the relevant check');
 expect(recoveryPrompt('retry','npm test','failed','/project')).toContain('Retry this exact command once');
 expect(recoveryPrompt('retry','npm test','failed','/project')).toContain('"command":"npm test"');
});
it('PR description reports missing checks honestly and includes recorded failures',()=>{
 expect(prDescription(4,'Change',null,[])).toContain('No project checks recorded');
 expect(prDescription(4,'Change',{command:'npm test',status:'failed',output:'1 failed'},[])).toContain('Result: failed');
});
