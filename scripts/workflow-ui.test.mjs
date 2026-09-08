// Runs the actual UI against isolated native/Codex fixtures; no external services.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=spawn('./node_modules/.bin/vite',['--host','127.0.0.1','--port','1428','--strictPort'],{stdio:'ignore'});let browser;
try {
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:1428')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1000}});
 await page.addInitScript(()=>{window.fixtureCalls=[];window.fixtureBranch='main';window.fixtureFiles=[];window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{
  window.fixtureCalls.push({cmd,args});
  if(cmd==='project_memory_load')return {stack:'React',preferences:'',runCommand:'npm run dev',checkCommand:'npm test',previewUrl:'http://localhost:4321'};
  if(cmd==='checkpoint_list')return [];
  if(cmd==='browser_action')return args.params.action==='info'?{}:window.fixtureBrowser;
  if(cmd==='github_action'){
   const issue={number:7,title:'Improve game controls',body:'Make the controls work.',url:'https://github.com/fixture/project/issues/7'};
   if(args.action==='issues')return [issue];
   if(args.action==='status')return {repo:'fixture/project',branch:window.fixtureBranch,base:'main',files:window.fixtureFiles,fingerprint:'reviewed-files'};
   if(args.action==='start'){window.fixtureBranch='mommycodex/issue-7-fixture';return {repo:'fixture/project',branch:window.fixtureBranch,base:'main',issue};}
   if(args.action==='diff')return {diff:'--- a/src/game.ts\n+++ b/src/game.ts\n-controls = false\n+controls = true'};
   if(args.action==='publish'){window.fixturePublished=args.params;window.fixtureFiles=[];return {url:'https://github.com/fixture/project/pull/8'};}
  }
  throw Error('Native service disabled in isolated UI fixture');
 }};});
 await page.goto('http://127.0.0.1:1428');await page.getByRole('button',{name:'Project launchpad',exact:true}).waitFor();
 await page.evaluate(async()=>{
  const {useAppStore:s}=await import('/src/codex/store.ts');const {session}=await import('/src/codex/session.ts');
  session.send=async(text,images)=>{window.sentRequest={text,images};};session.newThread=async()=>{s.setState({activeThreadId:'thread'});return 'thread';};session.openThread=async(id)=>{s.setState({activeThreadId:id});};session.setCwd=async(cwd)=>s.getState().setCwd(cwd);
  s.setState({connection:{state:'ready',binary:'fixture'},cwd:'/tmp/ui-fixture',activeThreadId:'thread',threads:{thread:{id:'thread',cwd:'/tmp/ui-fixture',preview:'Improve the game',updatedAt:Date.now()/1000,createdAt:Date.now()/1000}},settings:{...s.getState().settings,character:'nyx',threadCharacters:{thread:'nyx'}}});
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=650;const ctx=canvas.getContext('2d');ctx.fillStyle='#171020';ctx.fillRect(0,0,1000,650);ctx.fillStyle='#eee7ff';ctx.font='bold 52px serif';ctx.fillText('Moonlight Arcade',90,150);ctx.font='24px sans-serif';ctx.fillStyle='#ba9cdc';ctx.fillText('Catch a little kindness.',90,210);ctx.fillStyle='#9962d8';ctx.fillRect(90,280,300,75);ctx.fillStyle='white';ctx.fillText('Start game',160,327);
  window.fixtureBrowser={project:'/tmp/ui-fixture',url:'http://localhost:4321',screenshot:canvas.toDataURL('image/png'),width:1000,height:650,serverRunning:true,serverExit:null,logs:[],console:[],check:{id:'check',command:'npm test',status:'failed',output:'Controls do not respond',exitCode:1,startedAt:1},assertions:[]};
  const {useHarnessStore:h}=await import('/src/harness/state.ts');h.setState({open:true,tab:'preview',browser:window.fixtureBrowser,memories:{'/tmp/ui-fixture':{stack:'React',preferences:'',runCommand:'npm run dev',checkCommand:'npm test',previewUrl:'http://localhost:4321'}}});
 });
 await page.getByRole('button',{name:'Point and request a change',exact:true}).click();
 const preview=page.getByAltText('Interactive live project preview');await preview.click({position:{x:120,y:100}});
 await page.getByRole('textbox',{name:'Visual change request',exact:true}).fill('Make this button darker');await page.getByRole('button',{name:'Send visual feedback',exact:true}).click();
 const request=await page.evaluate(()=>window.sentRequest);assert.match(request.text,/Make this button darker/);assert.match(request.text,/selected point x=\d+, y=\d+/);assert.equal(request.images[0].type,'image');
 await page.getByRole('button',{name:'Explain',exact:true}).click();assert.match((await page.evaluate(()=>window.sentRequest)).text,/Do not change files or rerun/);
 await page.getByRole('button',{name:'Fix',exact:true}).click();assert.match((await page.evaluate(()=>window.sentRequest)).text,/Investigate and fix/);
 await page.getByRole('button',{name:'Retry',exact:true}).click();assert.match((await page.evaluate(()=>window.sentRequest)).text,/Retry this exact command once/);
 await page.getByRole('button',{name:'Handoff',exact:true}).click();await page.getByRole('textbox',{name:'Handoff decisions',exact:true}).fill('Keep the keyboard controls and violet palette.');
 await page.evaluate(async()=>{const {patchHandoff}=await import('/src/hub/state.ts');patchHandoff('/tmp/ui-fixture',{threadId:'thread',status:'completed',summary:'Controls now respond. Mobile still needs checking.',remaining:['Check mobile controls'],changedFiles:['src/game.ts']});});
 await page.getByRole('button',{name:'Continue from handoff',exact:true}).click();assert.match((await page.evaluate(()=>window.sentRequest)).text,/Keep the keyboard controls/);
 await page.getByRole('button',{name:'Project launchpad',exact:true}).click();await page.getByRole('dialog',{name:'Project launchpad',exact:true}).waitFor();await page.getByAltText('Preview of ui-fixture').waitFor();
 await mkdir('output/verification',{recursive:true});await page.screenshot({path:'output/verification/project-launchpad.png'});
 await page.getByRole('button',{name:'Launch preview',exact:true}).click();assert((await page.evaluate(()=>window.fixtureCalls)).some(c=>c.cmd==='browser_action'&&c.args.params.action==='server_start'));
 await page.getByRole('button',{name:'GitHub',exact:true}).click();await page.getByRole('button',{name:'Build this issue',exact:true}).click();assert.match((await page.evaluate(()=>window.sentRequest)).text,/Implement GitHub issue #7/);
 await page.evaluate(async()=>{window.fixtureFiles=['src/game.ts'];window.fixtureBrowser.check.status='passed';window.fixtureBrowser.check.output='All controls passed';const {patchHandoff}=await import('/src/hub/state.ts');patchHandoff('/tmp/ui-fixture',{checks:[{command:'npm test',exitCode:0,output:'All controls passed'}]});});await page.getByRole('button',{name:'Refresh GitHub',exact:true}).click();await page.getByRole('button',{name:'Prepare PR description',exact:true}).click();
 await page.getByRole('button',{name:'View changes',exact:true}).click();await page.getByText('+controls = true',{exact:true}).waitFor();await page.getByLabel('Include current preview screenshot in the public PR').check();await page.getByLabel('I reviewed the selected files, description, and attached evidence.').check();
 await page.screenshot({path:'output/verification/github-workflow.png'});
 await page.getByRole('button',{name:'Commit, push & open draft PR',exact:true}).click();await page.getByRole('button',{name:'Open draft PR',exact:true}).waitFor();
 const published=await page.evaluate(()=>window.fixturePublished);assert.deepEqual(published.files,['src/game.ts']);assert.match(published.body,/Closes #7/);assert.match(published.body,/Exit code: 0/);assert.match(published.body,/All controls passed/);assert.match(published.screenshot,/^data:image\/png;base64,/);assert.equal(published.fingerprint,'reviewed-files');
 await page.reload();await page.getByRole('button',{name:'Project launchpad',exact:true}).waitFor();const saved=await page.evaluate(async()=>{const {useHubStore:h}=await import('/src/hub/state.ts');return h.getState();});assert.equal(saved.handoffs['/tmp/ui-fixture'].decisions,'Keep the keyboard controls and violet palette.');assert.equal(saved.issues['/tmp/ui-fixture'].prUrl,'https://github.com/fixture/project/pull/8');assert(saved.projects[0].thumbnail);
 console.log('PASS: visual feedback with screenshot/coordinates, all recovery buttons, handoff resume/persistence, thumbnail launchpad/preview, issue branch and reviewed draft PR UI.');
}finally{await browser?.close();server.kill();}
