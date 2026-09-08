import { useAppStore } from '../codex/store';
import { previewFile, useFileStore } from '../workflow/files';

/** Read and style the actual file locally, without sending a writing request to Codex. */
export async function openMommyMarkdown(argument:string){
 const cwd=useAppStore.getState().cwd;if(!cwd)throw Error('Open a project first.');
 const current=useFileStore.getState();
 const requested=argument.trim().replace(/^(["'])(.*)\1$/s,'$2');
 const path=requested||(current.cwd===cwd&&/\.(md|markdown)$/i.test(current.path)?current.path:'README.md');
 if(!/\.(md|markdown)$/i.test(path))throw Error('Use /mommy-md followed by a Markdown file path, such as README.md.');
 await previewFile(path,cwd,'chat');
 const result=useFileStore.getState();if(result.path!==path||result.cwd!==cwd)return;
 if(result.error)throw Error(result.error);
 if(result.file?.binary)throw Error('This file is not readable Markdown text.');
}
