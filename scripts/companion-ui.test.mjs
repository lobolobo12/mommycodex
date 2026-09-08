// Isolated UI fixture. Uses mock native IPC; never starts Codex or calls Fish.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=spawn('./node_modules/.bin/vite',['--host','127.0.0.1','--port','1427','--strictPort'],{stdio:'ignore'});
let browser;
try {
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:1427')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:980}});
  await page.addInitScript(()=>{
    window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{
      if(cmd==='project_memory_load')return {stack:'',preferences:'',runCommand:'',checkCommand:'',previewUrl:'http://localhost:3000'};
      if(cmd==='browser_action')return {};
      if(cmd==='checkpoint_list')return [{id:'1',label:'Make the game violet',threadId:'goth',createdAt:1,status:window.proposalStatus??'pending',changed:['game.css'],error:null}];
      if(cmd==='checkpoint_files')return [{path:'game.css',kind:'modified',before:'color: pink;',after:'color: violet;',binary:false}];
      if(cmd==='checkpoint_review'){window.proposalStatus=args.action==='accept'?'accepted':'discarded';return {};}
      throw Error('Native service disabled in isolated UI test');
    }};
  });
  await page.goto('http://127.0.0.1:1427');
  await page.evaluate(async()=>{
    const {useAppStore:s}=await import('/src/codex/store.ts');
    s.setState({connection:{state:'ready',binary:'fixture'},cwd:'/tmp/ui-fixture',settings:{...s.getState().settings,character:'nyx',threadCharacters:{goth:'nyx',sweet:'mommy'}},threads:{goth:{id:'goth',cwd:'/tmp/ui-fixture',preview:'Goth game',createdAt:1,updatedAt:1},sweet:{id:'sweet',cwd:'/tmp/ui-fixture',preview:'Sweet game',createdAt:1,updatedAt:1}}});
  });
  await page.getByRole('button',{name:'Send',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Open thread: Goth game').count(),1);
  assert.equal(await page.getByLabel('Open thread: Sweet game').count(),0);
  await page.getByRole('button',{name:'Switch to Mommy-chan',exact:true}).click();
  assert.equal(await page.getByLabel('Open thread: Sweet game').count(),1);
  await page.getByRole('button',{name:'Switch to Nyx',exact:true}).click();
  await page.locator('.composer').evaluate(el=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0))],'reference.png',{type:'image/png'}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:d}));});
  await page.getByText('Build with this visual style · /reference to change',{exact:true}).waitFor();
  assert.equal(await page.getByAltText('reference.png').count(),1);
  await page.evaluate(async()=>{
    const {useAppStore:s}=await import('/src/codex/store.ts');
    s.setState({activeThreadId:'goth',activeTurn:{threadId:'goth',turnId:'turn',status:'inProgress'}});
    s.getState().applyNotification('turn/plan/updated',{threadId:'goth',turnId:'turn',plan:[{step:'Inspect the project',status:'completed'},{step:'Update the game',status:'inProgress'},{step:'Verify controls',status:'pending'}]});
  });
  await page.getByText('1/3 complete').waitFor();
  await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');s.setState({activeTurn:null,lastTurnStatus:'completed'});});
  await page.getByText('Your task is finished, darling. Come inspect my work.',{exact:true}).waitFor();
  await mkdir('output/verification',{recursive:true});
  await page.screenshot({path:'output/verification/nyx-companion-features.png'});
  await page.evaluate(async()=>{const {useHarnessStore:h}=await import('/src/harness/state.ts');h.setState({open:true,tab:'checkpoints'});});
  await page.getByText('Proposal ready.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Accept changes',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Review 1 changed files',exact:true}).click();
  await page.getByText('modified',{exact:true}).click();
  await page.getByText('color: violet;', {exact:true}).waitFor();
  await page.screenshot({path:'output/verification/nyx-file-review.png'});
  await page.getByRole('button',{name:'Accept changes',exact:true}).click();
  await page.getByRole('button',{name:'Undo this task',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.proposalStatus),'accepted');
  console.log('PASS: companion chat isolation, switch, image drop, live checklist, Nyx reaction, review comparison and accept UI.');
} finally {await browser?.close();server.kill();}
