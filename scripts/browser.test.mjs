import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import readline from 'node:readline';

test('shared browser captures real interactions, assertions, console errors and check results', {timeout:45000}, async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mommy-browser-test-'));
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<html><body><h1>Fixture game</h1><button id="play" onclick="document.querySelector('#score').textContent='Score: 1'">Play</button><p id="score">Score: 0</p><input id="name"><button id="fail" onclick="console.error('fixture error')">Error</button></body></html>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const child=spawn(process.execPath,[resolve('src-tauri/resources/browser/bridge.cjs')],{stdio:['pipe','pipe','pipe']});
 let counter=0;const pending=new Map();let errors='';child.stderr.on('data',b=>errors+=b);
 readline.createInterface({input:child.stdout}).on('line',line=>{const message=JSON.parse(line);const callbacks=pending.get(message.id);pending.delete(message.id);message.error?callbacks.reject(Error(message.error)):callbacks.resolve(message.result);});
 const request=params=>new Promise((resolve,reject)=>{const id=++counter;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,params})+'\n');});
 try {
  const info=await request({action:'init',directory:dir});assert.ok(info.sessionFile);
  const session=JSON.parse(await readFile(info.sessionFile,'utf8'));
  const denied=await fetch(`http://127.0.0.1:${session.port}/action`,{method:'POST',body:'{}'});assert.equal(denied.status,403);
  await assert.rejects(request({action:'navigate',url:'https://example.com'}),/localhost/);
  let view=await request({action:'navigate',url:`http://127.0.0.1:${server.address().port}`});assert.match(view.screenshot,/^data:image\/png;base64,/);assert.match(view.accessibility,/Play/);
  await request({action:'click',selector:'#play'});view=await request({action:'assert',selector:'#score',text:'Score: 1',label:'Play increases score'});assert.equal(view.assertion.passed,true);
  await request({action:'fill',selector:'#name',text:'Mika'});
  await request({action:'click',selector:'#fail'});view=await request({action:'snapshot'});assert.ok(view.console.some(e=>e.text==='fixture error'));assert.equal(view.assertions[0].passed,true);assert.ok((await readFile(view.screenshotPath)).length>1000);
  const fromAgent=await fetch(`http://127.0.0.1:${session.port}/action`,{method:'POST',headers:{authorization:`Bearer ${session.token}`},body:JSON.stringify({action:'snapshot'})}).then(r=>r.json());assert.match(fromAgent.text,/Score: 1/);
  await request({action:'check_start',cwd:dir,command:'printf "real check ran"; exit 2'});
  for(let i=0;i<30;i++){view=await request({action:'status'});if(view.check.status!=='running')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(view.check.status,'failed');assert.equal(view.check.exitCode,2);assert.match(view.check.output,/real check ran/);
  await request({action:'check_start',cwd:dir,command:'sleep 30'});await request({action:'check_stop'});view=await request({action:'status'});assert.equal(view.check.status,'cancelled');
  await request({action:'server_start',cwd:dir,command:'printf "server alive"; sleep 30'});view=await request({action:'status'});assert.equal(view.serverRunning,true);
  await request({action:'restart_server'});view=await request({action:'status'});assert.equal(view.serverRunning,true);
  await request({action:'stop'});view=await request({action:'status'});assert.equal(view.serverRunning,false);assert.equal(view.url,'');
 }finally {child.stdin.end();await new Promise(r=>child.once('exit',r));server.close();await rm(dir,{recursive:true,force:true});}
 assert.equal(errors,'');
});
