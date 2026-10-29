/* Run the shared native browser checks in CI or a Chrome-equipped checkout. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Linear engine response: skipped locally (no Chrome).');process.exit(0);}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/__linear-audio-test'){
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Linear throttle checks</title><script src="/audio/throttle-response.js"></script><script src="/audio/aircraft-engine.js"></script><script src="/audio/jet-engine.js"></script><script src="/audio/tests/linear-throttle-checks.js"></script>');return;
 }
 const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':'application/javascript');res.end(b);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/__linear-audio-test');
  const result=await page.evaluate(()=>runLinearThrottleChecks());assert.equal(result.build,218);
  fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build218-linear-audio.json'),JSON.stringify(result,null,2));console.log('Linear engine response:',result.checks.join('; '));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
