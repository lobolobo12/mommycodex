// Runs the actual UI against isolated native/Codex fixtures; no external services.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1428','--strictPort'],{stdio:'ignore'});let browser;
try {
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:1428')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1000}});
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


 await page.evaluate(async()=>{
  const original=window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{
   if(cmd==='codex_request'){window.fixtureCalls.push({cmd,args});if(args.method==='thread/start')return {thread:{id:'btw-thread'}};if(args.method==='turn/start')return {turn:{id:'btw-turn',status:'inProgress'}};return {};}
   if(cmd==='project_file_read'){if(args.path.endsWith('.md'))return {path:args.path,text:'# Hello darling\n\nHello **darling**. Open `src/game.ts`.\n\n~~~~ts\nconst greeting = "Hello darling";\n~~~~\n',image:null,binary:false,size:100,truncated:false};if(args.path==='missing.ts')throw Error('File not found');return {path:args.path,text:'const first = 1;\nconst second = 2;\n',image:null,binary:false,size:36,truncated:false};}
   return original(cmd,args);
  };
  const {useAppStore:s}=await import('/src/codex/store.ts');s.setState({activeTurn:{threadId:'thread',turnId:'main-turn',status:'inProgress'}});
  s.getState().hydrateThread('thread',[{id:'main-turn',status:'inProgress',items:[{id:'main-answer',type:'agentMessage',text:'See [app.ts](/tmp/ui-fixture/app.ts:2) and `src/game.ts`.',phase:'final'}]}]);
 });
 const input=page.getByRole('textbox',{name:'Message',exact:true});
 await input.fill('/btw');await input.press('Enter');assert.equal(await input.inputValue(),'/btw ');
 await input.fill('/btw Why TypeScript?');await input.press('Enter');await page.getByRole('region',{name:'Side question',exact:true}).waitFor();
 await page.evaluate(async()=>{const {session}=await import('/src/codex/session.ts');session.dispatch({type:'notification',method:'item/agentMessage/delta',params:{threadId:'btw-thread',itemId:'side-answer',delta:'TypeScript catches type errors.'}});});
 await page.getByText('TypeScript catches type errors.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');return s.getState().activeTurn.turnId;}),'main-turn');
 await page.getByRole('button',{name:'Stop side answer',exact:true}).click();
 const calls=await page.evaluate(()=>window.fixtureCalls);assert(calls.some(c=>c.args?.method==='turn/interrupt'&&c.args.params.threadId==='btw-thread'));assert(!calls.some(c=>c.args?.method==='turn/steer'));
 await page.getByRole('button',{name:'Close side answer',exact:true}).click();
 await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');s.getState().updateSettings({character:'mommy',seriousMode:false});s.setState({connection:{state:'error',message:'Offline fixture'}});});
 await input.fill('/mommy-md');await input.press('Enter');await page.getByRole('heading',{name:'README.md',exact:true}).waitFor();
 const filePanel=page.getByRole('complementary',{name:'File preview',exact:true});await filePanel.getByRole('heading',{name:'H-Hewwo dawwing',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.sentRequest),undefined);
 await filePanel.getByRole('button',{name:'Original source',exact:true}).click();await filePanel.getByText('# Hello darling',{exact:false}).waitFor();
 await input.fill('/mommy-md docs/guide.md');await input.press('Enter');await page.getByRole('heading',{name:'guide.md',exact:true}).waitFor();await filePanel.getByRole('heading',{name:'H-Hewwo dawwing',exact:true}).waitFor();
 const downloadPromise=page.waitForEvent('download');await filePanel.getByRole('button',{name:'Save styled Markdown',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'guide.mommy.md');const stream=await download.createReadStream();let styled='';for await(const chunk of stream)styled+=chunk;assert.match(styled,/# H-Hewwo dawwing/);assert(styled.includes('~~~~ts\nconst greeting = "Hello darling";\n~~~~'));assert(styled.includes('`src/game.ts`'));
 await page.screenshot({path:'output/verification/automatic-mommy-markdown.png'});
 await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');s.getState().updateSettings({character:'nyx'});s.setState({connection:{state:'ready',binary:'fixture'}});});
 await page.getByRole('button',{name:'app.ts',exact:true}).click();await page.getByRole('complementary',{name:'File preview',exact:true}).waitFor();await page.getByText('const second = 2;', {exact:false}).waitFor();assert.match(await page.locator('.selected-line').innerText(),/const second/);
 await mkdir('output/verification',{recursive:true});await page.screenshot({path:'output/verification/file-preview.png'});
 await page.getByRole('button',{name:'Close file preview',exact:true}).click();await page.getByRole('complementary',{name:'Project workbench',exact:true}).waitFor();
 await page.getByRole('button',{name:'src/game.ts',exact:true}).click();await page.getByRole('heading',{name:'game.ts',exact:true}).waitFor();
 await page.evaluate(async()=>{const {previewFile}=await import('/src/workflow/files.ts');await previewFile('missing.ts','/tmp/ui-fixture');});await page.getByRole('alert').filter({hasText:'File not found'}).waitFor();
 await page.evaluate(async()=>{
  const {useAppStore:s}=await import('/src/codex/store.ts');s.getState().updateSettings({character:'mommy',seriousMode:false});
  const {useBtwStore:b}=await import('/src/codex/btw.ts');b.setState({open:true,status:'completed',question:'Full Mommy style',answer:'Hello darling. Oh, I can help with `src/game.ts`.'});
 });
 const side=page.getByRole('region',{name:'Side question',exact:true});await side.getByText(/H-Hewwo dawwing/).waitFor();await side.getByText(/O-Oh, I can hewp/).waitFor();await side.getByRole('button',{name:'src/game.ts',exact:true}).waitFor();
 await page.screenshot({path:'output/verification/full-mommy-style.png'});
 console.log('PASS: /mommy-md local file reading offline, automatic chat styling, original source and styled Markdown export; /btw discovery, inline arguments, streaming and independent stop; main task preserved; file links, inline filenames, line anchors, close/restore, and missing-file error.');

}finally{await browser?.close();server.kill();}
