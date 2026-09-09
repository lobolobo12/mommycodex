// Exercise the actual installed WebView2 app without sending a task or using a microphone.
import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const dir=await mkdtemp(join(tmpdir(),'mommy-windows-smoke-'));
const child=spawn(process.argv[2],[dir],{env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9223 --force-renderer-accessibility',WEBVIEW2_USER_DATA_FOLDER:join(dir,'webview-profile')}});
let startupError; child.on('error',error=>{startupError=error;});
child.stderr?.on('data',bytes=>process.stderr.write(bytes));
let browser;
try {
 for(let i=0;i<20;i++){
  if(startupError)throw startupError;
  if(child.exitCode!==null)throw Error(`App exited: ${child.exitCode}`);
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:9223');break;}catch{await new Promise(r=>setTimeout(r,1000));}
 }
 if(!browser){
  console.log('CDP unavailable; checking the same installed app through native Windows UI Automation.');
  await new Promise((resolve,reject)=>{const check=spawn('powershell.exe',['-NoProfile','-File','scripts/windows-ui-check.ps1','-AppProcessId',String(child.pid)],{stdio:'inherit'});check.on('error',reject);check.on('exit',code=>code===0?resolve():reject(Error(`Native UI check failed: ${code}`)));});
 } else {
 const page=browser.contexts()[0].pages()[0];
 await page.locator('.composer-project').waitFor({timeout:30000});
 await page.waitForFunction(()=>document.body.innerText.includes('Mommy'));
 assert.match(await page.locator('.composer-project').innerText(),/mommy-windows-smoke-/);
 assert.ok((await page.locator('body').innerText()).length>200,'App should render its controls');
 console.log('Installed Windows app opened and rendered the selected project in WebView2.');
 }
} finally {
 // Kill the tree while the app still owns its WebView children, then allow Windows to release file handles.
 if(child.pid)await new Promise(r=>{const stop=spawn('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{stdio:'ignore'});stop.on('exit',r);stop.on('error',r);});
 await browser?.close().catch(()=>{});
 await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:300}).catch(error=>{
  if(!['EBUSY','EPERM','ENOTEMPTY'].includes(error.code))throw error;
  // A locked runner temp profile is a cleanup warning, not a failed UI assertion.
  console.warn(`Temporary WebView profile remains locked after cleanup retries: ${dir}`);
 });
}
