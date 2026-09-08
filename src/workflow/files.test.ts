import { expect, it, vi } from 'vitest';
vi.mock('../harness/api',()=>({projectFileRead:vi.fn()}));
import { projectFileRead } from '../harness/api';
import { fileTarget, previewFile, useFileStore } from './files';
it('recognizes file references and line anchors without treating web links as local files',()=>{
 expect(fileTarget('src/App.tsx:12:3')).toEqual({path:'src/App.tsx',line:12});
 expect(fileTarget('/project/My%20File.ts#L22')).toEqual({path:'/project/My File.ts',line:22});
 expect(fileTarget('C:\\project\\app.ts:7')).toEqual({path:'C:\\project\\app.ts',line:7});
 expect(fileTarget('https://example.com/file.ts')).toBeNull();expect(fileTarget('console.log(x)')).toBeNull();
});
it('keeps the latest file selected when an older read resolves late',async()=>{
 let resolve!:(v:never)=>void;vi.mocked(projectFileRead).mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValueOnce({path:'b.ts',text:'new',image:null,binary:false,size:3,truncated:false});
 const older=previewFile('a.ts','/project');await previewFile('b.ts','/project');resolve({path:'a.ts',text:'old'} as never);await older;expect(useFileStore.getState().file?.text).toBe('new');
});
