import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useAppStore, selectSortedThreads, type ThreadMeta } from './store';
import { DEFAULT_SETTINGS } from '../settings';
import { installReactions, useReactionStore } from '../speech/reactions';
import { speech } from '../speech/controller';
beforeEach(()=>{vi.useFakeTimers();useAppStore.setState({settings:{...DEFAULT_SETTINGS},activeThreadId:null,activeTurn:null,submissionPending:false,threadLoading:false,threads:{},items:{},lastTurnStatus:null});});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
it('keeps conversations and preferences separate and restores each companion’s choices',()=>{
 const s=useAppStore.getState();s.updateSettings({ttsSpeed:1.2,companionNotes:'Be gentle',mommyBuilding:true});s.claimThread('sweet');
 s.switchCharacter('nyx');s.updateSettings({ttsSpeed:0.9,companionNotes:'Dry wit'});s.claimThread('goth');
 useAppStore.setState({threads:Object.fromEntries(['sweet','goth','legacy'].map(id=>[id,{id,cwd:'/p',updatedAt:1} as ThreadMeta]))});
 expect(selectSortedThreads(useAppStore.getState()).map(t=>t.id)).toEqual(['goth']);
 s.switchCharacter('mommy');expect(useAppStore.getState().settings).toMatchObject({ttsSpeed:1.2,companionNotes:'Be gentle',mommyBuilding:true});
 expect(selectSortedThreads(useAppStore.getState()).map(t=>t.id)).toEqual(['sweet','legacy']);
 s.switchCharacter('nyx');expect(useAppStore.getState().settings).toMatchObject({ttsSpeed:0.9,companionNotes:'Dry wit'});
});
it('does not switch companions in the middle of a task',()=>{useAppStore.setState({submissionPending:true});useAppStore.getState().switchCharacter('nyx');expect(useAppStore.getState().settings.character).toBe('mommy');});
it('reacts to completion with the selected personality without spending voice credits by default',()=>{
 const play=vi.spyOn(speech,'play').mockResolvedValue();useAppStore.setState({settings:{...DEFAULT_SETTINGS,character:'nyx'},activeThreadId:'t',activeTurn:{threadId:'t',turnId:'v',status:'inProgress'}});
 const stop=installReactions();useAppStore.setState({activeTurn:null,lastTurnStatus:'completed'});
 expect(useReactionStore.getState()).toMatchObject({mood:'happy',text:expect.stringContaining('darling')});expect(play).not.toHaveBeenCalled();
 vi.advanceTimersByTime(6600);expect(useReactionStore.getState().mood).toBeNull();stop();
});
it('remembers the last open conversation for each companion',()=>{
 const s=useAppStore.getState();useAppStore.setState({activeThreadId:'sweet'});s.switchCharacter('nyx');useAppStore.setState({activeThreadId:'goth'});s.switchCharacter('mommy');
 expect(useAppStore.getState().settings.lastCompanionThread).toEqual({mommy:'sweet',nyx:'goth'});
});
