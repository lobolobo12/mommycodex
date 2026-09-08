// Keep the generated type dependency graph rooted at the app's public protocol API.
// Run after Codex regeneration; declarations themselves are never rewritten.
import ts from 'typescript';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const generated=resolve(root,'src/protocol/generated');
const keep=new Set();
async function visit(path){
 if(keep.has(path))return;keep.add(path);
 const source=ts.createSourceFile(path,await readFile(path,'utf8'),ts.ScriptTarget.Latest,true);
 for(const statement of source.statements){
  if(!(ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement))||!statement.moduleSpecifier||!ts.isStringLiteral(statement.moduleSpecifier))continue;
  const specifier=statement.moduleSpecifier.text;if(!specifier.startsWith('.'))continue;
  const dependency=resolve(dirname(path),specifier.replace(/\.js$/,''))+'.ts';
  if(dependency.startsWith(generated+'/'))await visit(dependency);
 }
}
async function files(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]))).flat();}
await visit(resolve(root,'src/protocol/index.ts'));
const unused=(await files(generated)).filter(path=>path.endsWith('.ts')&&!keep.has(path));
for(const path of unused)await unlink(path);
console.log(`Protocol cleanup: removed ${unused.length} unused declarations; kept ${keep.size-1}.`);
