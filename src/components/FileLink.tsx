import type { ReactNode } from 'react';
import { previewFile } from '../workflow/files';
export default function FileLink({path,cwd,children}:{path:string;cwd?:string;children?:ReactNode}){
 return <button className="file-link" title={`Preview ${path}`} onClick={e=>{e.preventDefault();e.stopPropagation();void previewFile(path,cwd);}}>{children??path}</button>;
}
