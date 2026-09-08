import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../harness/api',()=>({projectFileRead:vi.fn()}));
import { projectFileRead } from '../harness/api';
import { openMommyMarkdown } from './mommyMd';
import { useFileStore } from '../workflow/files';
import { useAppStore } from '../codex/store';
beforeEach(()=>{vi.clearAllMocks();useAppStore.setState({cwd:'/project',connection:{state:'error',message:'offline'}});useFileStore.setState({cwd:'',path:'',open:false});vi.mocked(projectFileRead).mockResolvedValue({path:'README.md',text:'# Real document',image:null,binary:false,truncated:false,size:15});});
it('reads actual Markdown offline and opens the chat formatter without starting a task',async()=>{
 await openMommyMarkdown('"docs/My Guide.md"');expect(projectFileRead).toHaveBeenCalledWith('/project','docs/My Guide.md');expect(useFileStore.getState()).toMatchObject({view:'chat',open:true,file:{text:'# Real document'}});
});
it('uses the currently open Markdown, otherwise README.md',async()=>{
 await openMommyMarkdown('');expect(projectFileRead).toHaveBeenLastCalledWith('/project','README.md');
 useFileStore.setState({cwd:'/project',path:'docs/guide.md'});await openMommyMarkdown('');expect(projectFileRead).toHaveBeenLastCalledWith('/project','docs/guide.md');
});
it('rejects topic prompts and surfaces file errors without inventing a document',async()=>{
 await expect(openMommyMarkdown('explain the project')).rejects.toThrow('file path');
 vi.mocked(projectFileRead).mockRejectedValue(Error('File not found'));await expect(openMommyMarkdown('missing.md')).rejects.toThrow('File not found');
});
