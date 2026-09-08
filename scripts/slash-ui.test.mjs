// Isolated app fixture; never sends Codex tasks, plays speech, or records audio.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1428','--strictPort'],{stdio:'ignore'});
let browser;
try {
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:1428')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:980}});
 await page.addInitScript(()=>{window.__TAURI_INTERNALS__={invoke:async cmd=>{if(cmd==='speech_key_status')return false;if(cmd==='project_memory_load')return {};if(cmd==='checkpoint_list')return [];throw Error('Native service disabled in fixture');}};});
 await page.goto('http://127.0.0.1:1428');
 const input=page.getByRole('textbox',{name:'Message',exact:true});await input.waitFor();
 assert.equal(await page.getByRole('switch').count(),1);
 assert.equal(await page.getByRole('switch',{name:'Mommy mode'}).count(),1);
 assert.equal(await page.getByRole('button',{name:'Review changes',exact:true}).count(),0);
 await input.fill('/building');await input.press('Enter');
 await page.getByRole('option',{name:'/building on On'}).waitFor();
 await input.press('Enter');
 assert.equal(await input.inputValue(),'');
 assert.equal(await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');return s.getState().settings.mommyBuilding;}),true);
 await input.fill('/building ');await input.press('ArrowDown');await input.press('Enter');
 assert.equal(await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');return s.getState().settings.mommyBuilding;}),false);
 await input.fill('/unknown-command');await input.press('Enter');assert.equal(await input.inputValue(),'/unknown-command');
 await input.fill('/settings');await input.press('Enter');assert.equal(await page.locator('.settings-pop').getAttribute('open'),'');
 await page.locator('.settings-pop summary').click();
 await input.fill('/preview');await input.press('Enter');await page.getByRole('button',{name:'Close workbench'}).waitFor();
 await page.evaluate(async()=>{const {useHarnessStore:h}=await import('/src/harness/state.ts');h.setState({open:false});});
 await input.fill('/');await input.press('Escape');assert.equal(await page.getByRole('listbox',{name:'Slash commands'}).count(),0);
 await input.fill('/reasoning');await page.locator('.slash-menu').getByRole('option').first().waitFor();await input.press('Tab');assert.equal(await input.inputValue(),'/reasoning ');
 await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');s.setState({toasts:[]});});
 await mkdir('output/verification',{recursive:true});
 await page.screenshot({path:'output/verification/slash-commands-mommy.png'});
 await page.evaluate(async()=>{const {useAppStore:s}=await import('/src/codex/store.ts');s.getState().updateSettings({character:'nyx'});});
 await input.fill('/');await page.screenshot({path:'output/verification/slash-commands-nyx.png'});
 console.log('PASS: personality-only switch, slash discovery, keyboard choices, local execution offline, unknown command preservation, settings and preview commands, both themes.');
}finally{await browser?.close();server.kill();}
