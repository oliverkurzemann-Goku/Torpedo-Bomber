/* Build 284: "no sound at all in the Pacific" (iPad). The real game, real Web Audio, a touch device and real taps:
 * the engine is heard after Begin Sortie / launch; a context that stops running is resumed without a tap; a closed
 * context and a 'running' context whose clock does not advance (lost audio output) are rebuilt on the next tap, and
 * the engine, radio click and sounds play again; pause still mutes the rebuilt graph. Writes app/release/pacific-audio-browser.json. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
const launchOpts=executable?{executablePath:executable}:{};
if(!executable&&!process.env.PW_BUNDLED){if(process.env.CI)throw Error('Chrome required');console.log('Pacific audio: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname.endsWith('.html')){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.json':'application/json','.wav':'audio/wav','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,out={};
 const browser=await chromium.launch({...launchOpts,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1180,height:820},isMobile:true,hasTouch:true,deviceScaleFactor:1,
   userAgent:'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'});
  page.setDefaultTimeout(600000);
  // Headless rAF barely fires in this sandbox: drive the game's real animate() loop with a timer instead.
  await page.addInitScript(()=>{window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),40);});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/torpedo-carrier.html?v=284&scenery=ultra&graphics=high');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:500});
  await page.tap('#startBtn');
  await page.waitForFunction(()=>document.getElementById('launchBtn').offsetParent,null,{polling:500});
  await page.waitForTimeout(1500);await page.tap('#launchBtn');
  // The level of what actually leaves the master bus.
  const level=()=>page.evaluate(async()=>{
   const an=actx.createAnalyser();an.fftSize=2048;eng.master.connect(an);let sum=0,n=0;
   for(let k=0;k<6;k++){await new Promise(r=>setTimeout(r,250));const a=new Float32Array(2048);an.getFloatTimeDomainData(a);for(const v of a){sum+=v*v;n++;}}
   eng.master.disconnect(an);return {state:actx.state,rms:Math.sqrt(sum/n),dead:audioDead,kind:eng.piston.state.kind,loaded:eng.piston.state.loaded};});
  await page.waitForFunction(()=>eng&&eng.piston.state.loaded,null,{polling:250});
  out.launch=await level();assert.equal(out.launch.state,'running');assert.ok(out.launch.rms>.02,'engine audible after launch '+out.launch.rms);
  // 1) A context that stops running (iOS: 'interrupted' / 'suspended') comes back without a tap.
  await page.evaluate(()=>actx.suspend());await page.waitForFunction(()=>actx.state==='suspended');
  await page.waitForFunction(()=>actx.state==='running',null,{timeout:8000,polling:200});
  out.resumed=await level();assert.ok(out.resumed.rms>.02,'engine back after suspend '+out.resumed.rms);
  // 2) A closed context: the next tap builds a new one.
  const first=await page.evaluate(()=>{window.__oldCtx=actx;actx.close();return actx.state;});
  await page.waitForFunction(()=>audioDead,null,{timeout:8000,polling:200});
  await page.touchscreen.tap(590,300);
  await page.waitForFunction(()=>actx&&actx!==window.__oldCtx&&actx.state==='running'&&eng.piston.state.loaded,null,{timeout:20000,polling:200});
  out.closedRebuilt=await level();assert.ok(out.closedRebuilt.rms>.02,'engine back after a closed context '+out.closedRebuilt.rms);
  // 3) 'running' but the clock stands still (lost output): found within a few seconds, rebuilt on the next tap.
  await page.evaluate(()=>{window.__oldCtx=actx;const t=actx.currentTime;Object.defineProperty(actx,'currentTime',{get:()=>t});});
  await page.waitForFunction(()=>audioDead,null,{timeout:30000,polling:200}).catch(async e=>{console.log(await page.evaluate(()=>JSON.stringify({dead:audioDead,same:actx===window.__oldCtx,audioClock,st:actx.state,ct:actx.currentTime,fault:String(runtimeFault),el:clock.elapsedTime})));throw e;});
  out.stallFound=true;
  await page.touchscreen.tap(590,300);
  await page.waitForFunction(()=>actx&&actx!==window.__oldCtx&&actx.state==='running'&&eng.piston.state.loaded,null,{timeout:20000,polling:200});
  out.stallRebuilt=await level();assert.ok(out.stallRebuilt.rms>.02,'engine back after a stalled clock '+out.stallRebuilt.rms);
  // Radio click and an explosion play on the new context without an error; pause mutes the new master.
  out.sfx=await page.evaluate(()=>{sfxRadio?.();sfxBoom(1);togglePause('test');return {state,gain:eng.master.gain.value};});
  await page.waitForTimeout(600);out.paused=await page.evaluate(()=>eng.master.gain.value);assert.ok(out.paused<.01,'paused master '+out.paused);
  await page.evaluate(()=>resumeGame());await page.waitForTimeout(600);out.resumedGain=await page.evaluate(()=>eng.master.gain.value);assert.ok(out.resumedGain>.8);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'app/release/pacific-audio-browser.json'),JSON.stringify(out,null,1)+'\n');
  console.log('Pacific audio:',JSON.stringify(out));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
