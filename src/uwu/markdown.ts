import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visitParents } from 'unist-util-visit-parents';
import type { Text } from 'mdast';
import { remarkUwu } from './remarkUwu';
import { segment, type UwuIntensity } from './uwuify';

/** Apply the chat prose transform while retaining original Markdown structure and code bytes. */
export function styleMarkdown(source:string,intensity:UwuIntensity=3):string {
 if(!intensity)return source;
 const frontmatter=/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(source);
 if(frontmatter)return frontmatter[0]+styleMarkdown(source.slice(frontmatter[0].length),intensity);
 const tree=unified().use(remarkParse).use(remarkGfm).parse(source);
 const original=new Map<Text,string>();visitParents(tree,'text',(node:Text)=>{original.set(node,node.value);});
 remarkUwu({intensity,stutter:true,seed:0})(tree);
 const edits:{start:number;end:number;value:string}[]=[];
 visitParents(tree,'text',(node:Text,parents)=>{
  if(node.value===original.get(node))return;
  const start=node.position?.start.offset,end=node.position?.end.offset;if(start===undefined||end===undefined)return;
  // Text nodes contain decoded Markdown; escape metacharacters before reinserting prose.
  let value=segment(node.value).map(part=>part.kind==='protected'&&!/[<>*`\[\]]/.test(part.text)?part.text:part.text.replace(/[\\`*_[\]<>]/g,'\\$&')).join('').replace(/(^|\n)([ \t]*)([#>+-])(?=\s)/g,'$1$2\\$3').replace(/(^|\n)([ \t]*)(\d+)([.)])(?=\s)/g,'$1$2$3\\$4');
  if(parents.some(p=>p.type==='tableCell'))value=value.replace(/\|/g,'\\|');
  edits.push({start,end,value});
 });
 return edits.sort((a,b)=>b.start-a.start).reduce((text,edit)=>text.slice(0,edit.start)+edit.value+text.slice(edit.end),source);
}
