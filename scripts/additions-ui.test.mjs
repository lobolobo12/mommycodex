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

 await page.getByRole('button',{name:'Review & undo',exact:true}).click();
 const reviewToggle=page.getByRole('switch',{name:'Review before keeping changes',exact:true});
 assert.equal(await reviewToggle.getAttribute('aria-checked'),'false');
 await reviewToggle.click();assert.equal(await reviewToggle.getAttribute('aria-checked'),'true');
 await reviewToggle.click();assert.equal(await reviewToggle.getAttribute('aria-checked'),'false');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mommycodex.settings.v1')).reviewBeforeKeeping),false);
 await page.getByRole('button',{name:'Recipes',exact:true}).click();
 await page.getByRole('button',{name:'Polish this screen',exact:true}).click();
 await page.getByLabel('Recipe name',{exact:true}).fill('My polish');
 await page.getByLabel('Recipe instructions',{exact:true}).fill('Polish keyboard controls and verify them.');
 await page.getByRole('button',{name:'Save recipe',exact:true}).click();
 await page.getByRole('button',{name:'Queue recipe',exact:true}).click();
 assert.equal(await page.evaluate(async()=>{const {useHarnessStore:s}=await import('/src/harness/state.ts');return s.getState().queue.at(-1).text;}),'Polish keyboard controls and verify them.');
 await page.getByRole('button',{name:'Run recipe',exact:true}).click();
 assert.equal((await page.evaluate(()=>window.sentRequest)).text,'Polish keyboard controls and verify them.');
 await page.evaluate(async()=>{
  const {recordTimeline,saveComparison}=await import('/src/workflow/state.ts');
  recordTimeline({id:'turn-fixture',cwd:'/tmp/ui-fixture',threadId:'thread',updatedAt:Date.now(),status:'completed',summary:'Keyboard controls fixed',decisions:'',remaining:['Check Windows'],changedFiles:['src/game.ts'],checks:[{command:'npm test',exitCode:0,output:'Controls passed'}],checkpointId:'checkpoint'});
  const frame={image:window.fixtureBrowser.screenshot,url:window.fixtureBrowser.url,width:1000,height:650,at:Date.now()};saveComparison('checkpoint',{cwd:'/tmp/ui-fixture',before:frame,after:frame});
  const {useHarnessStore:h}=await import('/src/harness/state.ts');h.setState({checkpoints:{'/tmp/ui-fixture':[{id:'checkpoint',threadId:'thread',label:'Controls',status:'accepted',createdAt:1,changed:['src/game.ts']}]}});
 });
 await page.getByRole('button',{name:'Timeline',exact:true}).click();
 await page.getByText('Keyboard controls fixed',{exact:true}).waitFor();
 await page.getByLabel('Before and after slider').fill('25');
 assert.match(await page.locator('.comparison-before').getAttribute('style'),/75%/);
 await mkdir('output/verification',{recursive:true});await page.screenshot({path:'output/verification/new-timeline.png'});
 await page.getByRole('button',{name:'Release',exact:true}).click();
 await page.getByLabel('Release version',{exact:true}).fill('v0.3.0');
 await page.getByRole('button',{name:'Generate release notes',exact:true}).click();
 assert.match(await page.getByLabel('Release notes',{exact:true}).inputValue(),/Controls passed/);
 await page.getByRole('button',{name:'Attach current preview',exact:true}).click();
 await page.getByAltText('Release screenshot 1').waitFor();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export release draft',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'release-v0.3.0.json');
 const stream=await download.createReadStream();let contents='';for await(const chunk of stream)contents+=chunk;const exported=JSON.parse(contents);assert.equal(exported.screenshots.length,1);assert.match(exported.notes,/File review: accepted/);
 await page.screenshot({path:'output/verification/new-release.png'});
 await page.getByRole('button',{name:'Focus mode',exact:true}).click();await page.getByRole('main',{name:'Focus mode',exact:true}).waitFor();assert.equal(await page.getByRole('complementary',{name:'Project workbench',exact:true}).isVisible(),false);
 await page.screenshot({path:'output/verification/new-focus.png'});
 await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');s.setState({activeTurn:{threadId:'thread',turnId:'focus-turn',status:'inProgress'},pendingRequests:[{id:99,method:'item/commandExecution/requestApproval',params:{threadId:'thread',turnId:'focus-turn',itemId:'command',command:'npm test',cwd:'/tmp/ui-fixture'},receivedAt:Date.now()}]});});
 await page.getByRole('button',{name:'deny and stop',exact:true}).waitFor();await page.getByRole('heading',{name:'Your input is needed',exact:true}).waitFor();
 await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');s.setState({activeTurn:null,pendingRequests:[]});});
 await page.getByRole('button',{name:'Return to workspace',exact:true}).click();await page.getByRole('complementary',{name:'Project workbench',exact:true}).waitFor();
 await page.evaluate(()=>{const original=window.__TAURI_INTERNALS__.invoke;window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{if(cmd==='codex_request'&&args.method==='thread/list')return {data:[{id:'search-thread',cwd:'/tmp/another-project',name:'Old decision',preview:'Design',turns:[]}],nextCursor:null};if(cmd==='codex_request'&&args.method==='thread/read')return {thread:{turns:[{items:[{type:'agentMessage',text:'Use keyboard-first navigation for accessibility'}]}]}};return original(cmd,args);};});
 await page.getByText('Search all chat contents',{exact:true}).click();await page.getByLabel('Search messages, code, and errors',{exact:true}).fill('keyboard-first');await page.getByRole('button',{name:'Search all projects',exact:true}).click();await page.getByRole('button',{name:/Old decision/}).waitFor();await page.getByRole('button',{name:/Old decision/}).click();assert.equal(await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');return s.getState().activeThreadId;}),'search-thread');
 await page.reload();await page.getByRole('button',{name:'Project launchpad',exact:true}).waitFor();
 const saved=await page.evaluate(async()=>{const {useWorkflowStore:s}=await import('/src/workflow/state.ts');return s.getState();});assert(saved.recipes.some(r=>r.name==='My polish'));assert.equal(saved.timeline[0].summary,'Keyboard controls fixed');assert.equal(saved.releases['/tmp/ui-fixture'].screenshots.length,1);assert(saved.comparisons.checkpoint.before);
 console.log('PASS: recipe edit/save/run/queue/persistence, timeline, comparison slider, release notes/screenshot/export, focus/restore, full message search across projects.');

}finally{await browser?.close();server.kill();}
