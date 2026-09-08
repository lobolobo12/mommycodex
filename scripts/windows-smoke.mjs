// Exercise the actual installed WebView2 app without sending a task or using a microphone.
import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const dir=await mkdtemp(join(tmpdir(),'mommy-windows-smoke-'));
const child=spawn(process.argv[2],[dir],{env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9223'}});
let browser;
try {
 for(let i=0;i<60;i++){
  if(child.exitCode!==null)throw Error(`App exited: ${child.exitCode}`);
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223');break;}catch{await new Promise(r=>setTimeout(r,1000));}
 }
 assert.ok(browser,'Installed WebView2 did not become ready');
 const page=browser.contexts()[0].pages()[0];
 await page.locator('.composer-project').waitFor({timeout:30000});
 await page.waitForFunction(()=>document.body.innerText.includes('Mommy'));
 assert.match(await page.locator('.composer-project').innerText(),/mommy-windows-smoke-/);
 assert.ok((await page.locator('body').innerText()).length>200,'App should render its controls');
 console.log('Installed Windows app opened and rendered the selected project in WebView2.');
} finally {
 await browser?.close();
 await new Promise(r=>{const stop=spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore'});stop.on('exit',r);stop.on('error',r);});
 await rm(dir,{recursive:true,force:true});
}
