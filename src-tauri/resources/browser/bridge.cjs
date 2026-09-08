/* One browser shared by the desktop preview and the coding agent. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

if (process.argv[2] === 'client') {
  const session = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const input = JSON.parse(process.argv[4] || '{"action":"snapshot"}');
  fetch(`http://127.0.0.1:${session.port}/action`, { method:'POST', headers:{authorization:`Bearer ${session.token}`,'content-type':'application/json'}, body:JSON.stringify(input) })
    .then(r=>r.json()).then(r=>{ if(r.screenshot) delete r.screenshot; process.stdout.write(JSON.stringify(r)+'\n'); if(r.error)process.exitCode=1; }).catch(e=>{console.error(e.message);process.exitCode=1;});
} else {
  const { chromium } = require('playwright-core');
  let browser, page, context, serverProcess, checkProcess, project = null, sessionDir, serverCommand;
  let assertions = [], interactionCount=0;
  let logs = [], consoleLog = [], check = null, serverExit = null, chain = Promise.resolve();
  const token = crypto.randomBytes(32).toString('hex');
  const bounded = (array, value) => { array.push(value); if(array.length>150) array.shift(); };
  const server = http.createServer(async(req,res)=>{
    if(req.method!=='POST'||req.url!=='/action'||req.headers.authorization!==`Bearer ${token}`){res.writeHead(403);res.end();return;}
    let data=''; for await(const chunk of req){data+=chunk;if(data.length>64000){res.writeHead(413);res.end();return;}}
    try {const input=JSON.parse(data);
      if(!["snapshot","status","navigate","reload","click","fill","press","scroll","resize","assert","restart_server"].includes(input.action))throw Error("Agent browser API cannot execute shell commands or manage processes");
      const result=await enqueue(input);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}
    catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
  });
  function stopChild(child){ if(!child)return; try{process.kill(-child.pid,'SIGTERM');}catch{} setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},1000).unref(); }
  async function terminate(child){
    if(!child||child.exitCode!==null||child.signalCode!==null)return;
    const exited=new Promise(r=>child.once('exit',r));stopChild(child);
    await Promise.race([exited,new Promise(r=>setTimeout(r,1500))]);
  }
  function cwd(value){const result=fs.realpathSync(value);if(!fs.statSync(result).isDirectory())throw Error('Choose a project folder');return result;}
  function localUrl(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password)throw Error('Preview accepts localhost URLs only');return u.href;}
  async function openBrowser(){
    if(page&&!page.isClosed())return;
    browser=await chromium.launch({channel:'chrome',headless:true});
    context=await browser.newContext({viewport:{width:1000,height:650},deviceScaleFactor:1});
    // No Codex IPC or user cookies exist in this isolated browser context.
    page=await context.newPage(); page.setDefaultTimeout(8000);
    page.on('console',m=>bounded(consoleLog,{type:m.type(),text:m.text().slice(0,4000),time:Date.now()}));
    page.on('pageerror',e=>bounded(consoleLog,{type:'error',text:e.message.slice(0,4000),time:Date.now()}));
    page.on('requestfailed',r=>bounded(consoleLog,{type:'network',text:`${r.url()} ${r.failure()?.errorText}`.slice(0,4000),time:Date.now()}));
    page.on('dialog',d=>d.dismiss());
    context.on('page',p=>{if(p!==page)void p.close();});
  }
  async function snapshot(image=true){
    if(!page||page.isClosed())return {project,url:'',logs,console:consoleLog,serverRunning:!!serverProcess,serverExit,check};
    const result={project,url:page.url(),logs,console:consoleLog,serverRunning:!!serverProcess,serverExit,check,assertions,interactionCount,width:page.viewportSize().width,height:page.viewportSize().height};
    if(image){
      const bytes=await page.screenshot({type:'png',timeout:8000});const file=path.join(sessionDir,'last-preview.png');fs.writeFileSync(file,bytes,{mode:0o600});
      result.screenshot='data:image/png;base64,'+bytes.toString('base64');result.screenshotPath=file;
      result.text=(await page.locator('body').innerText({timeout:2000}).catch(()=>'' )).slice(0,16000);
      result.accessibility=await page.locator('body').ariaSnapshot({timeout:2000}).catch(()=> '');
    }
    return result;
  }
  async function action(a){
    switch(a.action){
      case 'init': {
        sessionDir=fs.realpathSync(a.directory);
        if(!server.listening)await new Promise(r=>server.listen(0,'127.0.0.1',r));
        const sessionFile=path.join(sessionDir,'browser-session.json');fs.writeFileSync(sessionFile,JSON.stringify({port:server.address().port,token}),{mode:0o600});
        return {sessionFile,script:__filename,node:process.execPath};
      }
      case 'status': return snapshot(false);
      case 'reset_evidence': assertions=[];interactionCount=0;consoleLog=[];return {ok:true};
      case 'assert': {
        const label=String(a.label||a.selector||'Browser assertion');
        let passed=false,detail='';
        try { const locator=page.locator(a.selector);
          if(a.text!==undefined){await locator.filter({hasText:String(a.text)}).first().waitFor({state:'visible',timeout:8000});}
          else {await locator.first().waitFor({state:a.visible===false?'hidden':'visible',timeout:8000});}
          passed=true;detail='Observed expected page state';
        } catch(e){detail=e.message.slice(0,1500);}
        assertions.push({label,passed,detail});return {assertion:assertions.at(-1)};
      }
      case 'snapshot': return snapshot();
      case 'restart_server': if(!serverCommand||!project)throw Error('Start the managed server from the workbench first');return action({action:'server_start',cwd:project,command:serverCommand});
      case 'server_start': {
        if(!a.command?.trim()||a.command.length>16000)throw Error('Enter a run command in project memory');
        const next=cwd(a.cwd);if(checkProcess&&project!==next)throw Error('Stop project checks before changing the server project');serverCommand=a.command;await terminate(serverProcess);serverProcess=null;logs=[];consoleLog=[];project=next;serverExit=null;
        serverProcess=spawn('/bin/zsh',['-lc',a.command],{cwd:next,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,FORCE_COLOR:'0',BROWSER:'none'}});
        const child=serverProcess;
        for(const stream of [child.stdout,child.stderr])stream.on('data',b=>bounded(logs,b.toString().slice(-8000)));
        child.on('error',e=>{bounded(logs,e.message);if(serverProcess===child){serverProcess=null;serverExit=-1;}});
        child.on('exit',code=>{if(serverProcess===child){serverProcess=null;serverExit=code;}});
        return snapshot(false);
      }
      case 'navigate': await openBrowser();consoleLog=[];await page.goto(localUrl(a.url),{waitUntil:'domcontentloaded',timeout:30000});return snapshot();
      case 'reload': if(!page)throw Error('Open a preview first');await page.reload({waitUntil:'domcontentloaded',timeout:30000});return snapshot();
      case 'click': interactionCount++;if(a.selector)await page.locator(a.selector).click();else await page.mouse.click(Number(a.x),Number(a.y));return snapshot();
      case 'fill': interactionCount++;await page.locator(a.selector).fill(a.text);return snapshot();
      case 'press': interactionCount++;await page.keyboard.press(a.key);return snapshot();
      case 'keydown': await page.keyboard.down(a.key);return {ok:true};
      case 'keyup': await page.keyboard.up(a.key);return {ok:true};
      case 'scroll': await page.mouse.wheel(Number(a.x)||0,Number(a.y)||0);return snapshot();
      case 'resize': await page.setViewportSize({width:Math.max(320,Math.min(1600,Number(a.width)||1000)),height:Math.max(300,Math.min(1200,Number(a.height)||650))});return snapshot();
      case 'check_start': {
        if(checkProcess)throw Error('Checks already running');if(!a.command?.trim())throw Error('Enter a check command in project memory');
        const next=cwd(a.cwd);if(project&&project!==next)throw Error('Preview is attached to another project');project=next;
        const run={id:crypto.randomUUID(),command:a.command,status:'running',output:'',exitCode:null,startedAt:Date.now()};check=run;
        const child=spawn('/bin/zsh',['-lc',a.command],{cwd:next,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',FORCE_COLOR:'0'}});checkProcess=child;
        const timer=setTimeout(()=>{if(checkProcess===child){run.status='timedOut';stopChild(child);}},120000);
        for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{run.output=(run.output+b.toString()).slice(-32000);});
        child.on('error',e=>{run.output+=e.message;run.status='failed';checkProcess=null;clearTimeout(timer);});
        child.on('exit',code=>{clearTimeout(timer);run.exitCode=code;if(run.status==='running')run.status=code===0?'passed':'failed';if(checkProcess===child)checkProcess=null;});
        return {check:run};
      }
      case 'check_stop': if(check){check.status='cancelled';}stopChild(checkProcess);checkProcess=null;return {check};
      case 'stop': await Promise.all([terminate(serverProcess),terminate(checkProcess)]);serverProcess=null;checkProcess=null;if(check?.status==='running')check.status='cancelled';if(browser)await browser.close();browser=null;page=null;return snapshot(false);
      default: throw Error('Unknown browser action');
    }
  }
  function enqueue(a){const result=chain.then(()=>action(a));chain=result.catch(()=>{});return result;}
  readline.createInterface({input:process.stdin}).on('line',line=>{
    let request;try{request=JSON.parse(line);}catch{return;}
    enqueue(request.params).then(result=>process.stdout.write(JSON.stringify({id:request.id,result})+'\n'),e=>process.stdout.write(JSON.stringify({id:request.id,error:e.message})+'\n'));
  }).on('close',cleanup);
  let closing=false;
  async function cleanup(){if(closing)return;closing=true;await Promise.all([terminate(serverProcess),terminate(checkProcess)]);if(browser)await browser.close().catch(()=>{});server.close();process.exit(0);}
  process.on('SIGTERM',cleanup);process.on('SIGINT',cleanup);
}
