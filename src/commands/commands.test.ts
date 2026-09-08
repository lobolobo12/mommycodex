import {beforeEach,describe,expect,it,vi} from 'vitest';
import {commands,commandOptions,runCommand} from './index';
import {useAppStore} from '../codex/store';
import {DEFAULT_SETTINGS} from '../settings';
import {useHarnessStore} from '../harness/state';
import * as transport from '../codex/transport';
vi.mock('../codex/transport',async importOriginal=>({...await importOriginal<object>(),speechKeyStatus:vi.fn()}));
beforeEach(()=>{useAppStore.setState({settings:{...DEFAULT_SETTINGS},activeTurn:null,submissionPending:false,threadLoading:false,models:[],cwd:null,connection:{state:'error',message:'Offline'}});useHarnessStore.setState({open:false});});
describe('slash commands',()=>{
 it('searches commands and offers explicit current values',()=>{expect(commandOptions('/reasoning')[0].label).toBe('/reasoning');expect(commandOptions('/buil')[0].label).toBe('/building');expect(commandOptions('/building ').map(o=>o.label)).toEqual(['/building on','/building off']);expect(commandOptions('/building ')[1].selected).toBe(true);expect(commandOptions('/building wrong')).toEqual([]);expect(commandOptions('/Users/project')).toEqual([]);});
 it('updates local preferences while offline, without sending a task',async()=>{await runCommand(commands().find(c=>c.name==='building')!,'on');expect(useAppStore.getState().settings.mommyBuilding).toBe(true);expect(useAppStore.getState().settings.seriousMode).toBe(false);await runCommand(commands().find(c=>c.name==='preview')!);expect(useHarnessStore.getState()).toMatchObject({open:true,tab:'preview'});});
 it('rechecks busy guards after the menu opens and rejects invalid arguments',async()=>{const command=commands().find(c=>c.name==='building')!;useAppStore.setState({submissionPending:true});await expect(runCommand(command,'on')).rejects.toThrow('Finish or stop');expect(useAppStore.getState().settings.mommyBuilding).toBe(false);useAppStore.setState({submissionPending:false});await expect(runCommand(command,'maybe')).rejects.toThrow('Choose a value');});
 it('does not enable paid voice without a configured key',async()=>{vi.mocked(transport.speechKeyStatus).mockResolvedValue(false);await expect(runCommand(commands().find(c=>c.name==='voice')!,'on')).rejects.toThrow('Fish API key');expect(useAppStore.getState().settings.ttsAutoRead).toBe(false);});
});
