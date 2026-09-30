/* Real-browser integration. GitHub's runner supplies Chrome; local runs may opt
 * in with GAME_TEST_CHROME=/path/to/chrome. Never substitute a mocked DOM/GPU. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium','/opt/google/chrome/chrome'].find(p=>p&&fs.existsSync(p));
if(!executable){
 if(process.env.CI)throw Error('Browser smoke test requires Chrome (set GAME_TEST_CHROME).');
 console.log('Browser smoke: skipped locally (no installed Chrome); required in CI.');process.exit(0);
}
const mime={'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary','.bin':'application/octet-stream'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
});
const deps=path.join(root,'node_modules');
const cdn={
 'three.min.js':path.join(deps,'three/build/three.min.js'),
 'FBXLoader.js':path.join(deps,'three/examples/js/loaders/FBXLoader.js'),
 'SkeletonUtils.js':path.join(deps,'three/examples/js/utils/SkeletonUtils.js'),
 'index.js':path.join(deps,'fflate/umd/index.js')
};
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  for(const campaign of ['torpedo-carrier.html','remagen-mission.html']){
   const eu=campaign.startsWith('remagen'),context=await browser.newContext({viewport:{width:1024,height:768},deviceScaleFactor:1,hasTouch:true});
   await context.route('https://**',async route=>{
    const file=cdn[new URL(route.request().url()).pathname.split('/').pop()];
    if(file)await route.fulfill({path:file,contentType:'application/javascript'});else await route.abort();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
   await page.goto('http://127.0.0.1:'+server.address().port+'/'+campaign,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>typeof state!=='undefined'&&state===ST.MENU&&document.querySelector('#menu:not(.hidden)'));
   await page.locator('#flightHints').uncheck();
   assert.equal(await page.evaluate(()=>GameRuntime.storage.getItem('flightHints')),'0');
   await page.locator('#flightHints').check();
   if(eu){await page.locator('#missionSel .chip').first().click();await page.locator('#startBtn').click();await page.locator('#brGo').click();}
   else{
    const defence=await page.evaluate(()=>MISSIONS.findIndex(m=>m.defend));
    await page.locator('#missionSel .chip').nth(defence).click();await page.locator('#startBtn').click();await page.locator('#launchBtn').click();
   }
   await page.waitForFunction(()=>state===ST.FLIGHT);
   // Actual user keyboard events: release must clear a keyboard-owned command.
   await page.keyboard.down('ArrowLeft');await page.waitForTimeout(150);await page.keyboard.up('ArrowLeft');await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>inputRoll),0,'keyboard release clears roll');
   await page.keyboard.down('ArrowRight');await page.keyboard.down('f');
   await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
   const paused=await page.evaluate(()=>({paused:state===ST.PAUSED,roll:inputRoll,pitch:inputPitch,firing,frame:renderer.info.render.frame,pos:P.pos.toArray()}));
   assert(paused.paused);assert.deepEqual([paused.roll,paused.pitch,paused.firing],[0,0,false]);
   await page.waitForTimeout(250);
   assert.deepEqual(await page.evaluate(()=>P.pos.toArray()),paused.pos,'paused sortie cannot move');
   assert.equal(await page.evaluate(()=>renderer.info.render.frame),paused.frame,'pause does not redraw the GPU');
   assert.match(await page.locator('#pauseReason').innerText(),/inactive/);
   assert.match(await page.locator('#pauseOrders').innerText(),/FUEL/);
   await page.keyboard.up('ArrowRight');await page.keyboard.up('f');
   await page.locator(eu?'#pmResume':'#resumeBtn').click();
   assert(await page.evaluate(()=>state===ST.FLIGHT));
   // A real context loss, not an imitation event: Three rebuilds its own GPU state.
   const canLose=await page.evaluate(()=>{window.__gpuLoss=renderer.getContext().getExtension('WEBGL_lose_context');if(!window.__gpuLoss)return false;window.__gpuLoss.loseContext();return true;});
   assert(canLose,'Chrome exposes the WebGL context-loss test extension');
   await page.locator('#graphicsRecovery').waitFor({state:'visible'});
   await page.keyboard.press('p');assert(await page.evaluate(()=>state===ST.PAUSED&&runtimeSession.graphicsLost));
   await page.waitForTimeout(300);await page.evaluate(()=>window.__gpuLoss.restoreContext());
   await page.waitForFunction(()=>!runtimeSession.graphicsLost);
   assert(await page.evaluate(()=>state===ST.PAUSED),'restoration does not restart the sortie silently');
   await page.locator(eu?'#pmResume':'#resumeBtn').click();
   // The compact tip really fits the iPad viewport and does not cover input controls.
   await page.evaluate(()=>flash('FLIGHT TIP: RECOVERY — GEAR AND FLAPS DOWN; FOLLOW THE LANDING SIGNAL.',3600));
   const tip=await page.locator('#flash').boundingBox();assert(tip.x>=0&&tip.x+tip.width<=1024&&tip.height<130);
   await page.locator('#pauseBtn').click();
   const memory=await page.evaluate(()=>{
    renderer.render(scene,camera);const before=renderer.info.memory.geometries;
    for(let i=0;i<12;i++){spawnDebris(P.pos.x,P.pos.y+200,P.pos.z,12);renderer.render(scene,camera);updateDebris(10);renderer.render(scene,camera);}
    return {before,after:renderer.info.memory.geometries};
   });
   assert(memory.after<=memory.before,'repeated debris does not retain GPU geometry');
   assert.deepEqual(errors,[],campaign+' has no uncaught browser errors');
   console.log('Browser '+campaign+': iPad layout, keyboard release, auto-pause, frozen GPU, real context restoration; geometry '+memory.before+' → '+memory.after);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
