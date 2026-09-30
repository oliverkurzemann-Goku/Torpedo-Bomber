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
  for(const scenario of [
   {campaign:'torpedo-carrier.html',kind:'defend',ordinal:0},
   {campaign:'torpedo-carrier.html',kind:'sbd',ordinal:0},
   {campaign:'torpedo-carrier.html',kind:'sbd',ordinal:1},
   {campaign:'torpedo-carrier.html',kind:'defend',ordinal:1},
   {campaign:'remagen-mission.html'}
  ]){
   const {campaign}=scenario;
   const eu=campaign.startsWith('remagen'),context=await browser.newContext({viewport:{width:1024,height:768},deviceScaleFactor:1,hasTouch:true});
   await context.route('https://**',async route=>{
    const file=cdn[new URL(route.request().url()).pathname.split('/').pop()];
    if(file)await route.fulfill({path:file,contentType:'application/javascript'});else await route.abort();
   });
   const page=await context.newPage(),errors=[],modelRequests=[];
   page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('.glb'))modelRequests.push(decodeURIComponent(new URL(r.url()).pathname));});
   page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error '+campaign+': '+e.stack);});page.setDefaultTimeout(120000);
   page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))console.error('Browser console '+campaign+': '+m.text());});
   await page.goto('http://127.0.0.1:'+server.address().port+'/'+campaign,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>typeof state!=='undefined'&&state===ST.MENU&&document.querySelector('#menu:not(.hidden)'));
   // Keep the real scene and WebGL renderer, but lower GPU fill cost on the
   // CPU-only CI runner. CSS still uses the full iPad viewport; no FPS claim.
   async function reduceSceneryCost(){await page.evaluate(()=>{
    renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;
    // Static instanced vegetation is covered by the geometry regressions. It
    // is not part of this controls/context-lifecycle test on a CPU-only GPU.
    scene.traverse(o=>{if(o.isInstancedMesh)o.visible=false;});
   });}
   await reduceSceneryCost();
   await page.locator('#flightHints').uncheck();
   assert.equal(await page.evaluate(()=>GameRuntime.storage.getItem('flightHints')),'0');
   await page.locator('#flightHints').check();
   if(eu){await page.locator('#missionSel .chip').first().click();await page.locator('#startBtn').click();await page.locator('#brGo').click();}
   else{
    assert.equal(modelRequests.length,0,'menu must not eagerly decode every GLB');
    const selected=await page.evaluate(s=>MISSIONS.map((m,i)=>m[s.kind]?i:-1).filter(i=>i>=0)[s.ordinal],scenario);
    await page.locator('#missionSel .chip').nth(selected).click();await page.locator('#startBtn').click();
    await page.locator('#launchBtn').waitFor({state:'visible'});await reduceSceneryCost();await page.locator('#launchBtn').click();
   }
   if(!eu){
    await page.waitForFunction(()=>state===ST.FLIGHT||state===ST.PAUSED||runtimeFault);
    assert(await page.evaluate(()=>state===ST.FLIGHT&&!runtimeFault),'launch must enter flight before the duration test');
    // Exercise the live update/render path well beyond the reported six-second
    // freeze, including hints, join-up, attack AI, gear and SBD dive brakes.
    // A fixed 20-Hz clock is deliberate on CPU WebGL; this is not an FPS test.
    await page.evaluate(()=>{clock.getDelta=()=>.05;P.pos.y=300;P.spd=80;P.gearTgt=0;});
    const label=await page.evaluate(()=>MISSIONS[mission].sub);
    const ammo=await page.evaluate(()=>P.ammo);
    const fire=await page.locator('#fireBtn').boundingBox();
    await page.mouse.move(fire.x+fire.width/2,fire.y+fire.height/2);await page.mouse.down();
    await page.waitForFunction(()=>pacificOps.elapsed>=15||runtimeFault||state!==ST.FLIGHT,{},{timeout:180000});
    await page.mouse.up();
    assert(await page.evaluate(()=>state===ST.FLIGHT&&P.alive&&!runtimeFault&&pacificOps.elapsed>=15),label+' must keep flying past 15 simulated seconds');
    assert(await page.evaluate(a=>P.ammo<a-100,ammo),'actual fire button must produce sustained gunfire');
    assert(await page.evaluate(()=>isSBD()?!!playerSBD?.userData.fromTemplate:!!playerZero?.userData.fromTemplate),'selected original aircraft must be attached');
    if(scenario.kind==='sbd'){
     assert.equal(await page.evaluate(()=>wingmen.length),2,'Dauntless join-up completes');
     await page.evaluate(()=>{P.diveBrake=true;});
     await page.waitForFunction(()=>sbdDiveFlapL?.visible&&sbdDiveFlapL.getObjectByName('sbdDiveUpper').rotation.x>.2);
     assert(!modelRequests.some(p=>p.includes('avenger')),'SBD sortie must not load unused Avenger');
    }else{
     assert(!modelRequests.some(p=>p.includes('dauntless')||p.includes('midway')||p.includes('merchant')),'Zero defence loads no unused US deck, SBD or merchant');
    }
    assert.equal(modelRequests.filter(p=>p.includes('merchant')).length,scenario.kind==='sbd'?1:0,'escort and freighter share one model decode');
    console.log('Browser Pacific '+label+': 15 simulated seconds with sustained fire, original aircraft and live AI; requests '+modelRequests.join(', '));
    if(scenario.ordinal===0){
     const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
     const png=await page.evaluate(()=>{
      const studio=new THREE.Scene();studio.background=new THREE.Color(0x8faec0);
      studio.add(new THREE.HemisphereLight(0xe8f3ff,0x524b39,1.2));
      const sun=new THREE.DirectionalLight(0xffecd4,.9);sun.position.set(5,12,-10);studio.add(sun);
      const frame=(isSBD()?playerSBD:playerZero).clone(true);studio.add(frame);frame.rotation.z=.9;
      const fx=CombatFX.create(studio);fx.muzzle(frame,pacificGunMuzzles(),false,new THREE.Vector3(0,0,-1));
      const bomb=Ordnance.create('bomb'),torp=Ordnance.create('torpedo');
      bomb.rotation.y=torp.rotation.y=Math.PI;bomb.position.set(-3,-3,-1);torp.position.set(2,-3,-1);studio.add(bomb,torp);
      const cam=new THREE.PerspectiveCamera(42,1024/768,.1,100);cam.position.set(12,6,-18);cam.lookAt(0,-.5,0);
      renderer.setPixelRatio(1);renderer.render(studio,cam);
      const png=renderer.domElement.toDataURL('image/png');renderer.setPixelRatio(.25);fx.clear();return png;
     });
     fs.writeFileSync(path.join(out,scenario.kind+'-banked-guns-ordnance.png'),Buffer.from(png.split(',')[1],'base64'));
    }

   }
   try{await page.waitForFunction(()=>state===ST.FLIGHT||state===ST.PAUSED||state===ST.RESULT);
    assert(await page.evaluate(()=>state===ST.FLIGHT),'launch must enter flight');
   }catch(e){
    console.error('Launch diagnostic '+campaign,await page.evaluate(()=>({state,hidden:document.hidden,graphicsLost:runtimeSession?.graphicsLost,
      reason:document.getElementById('pauseReason').textContent,timer:typeof launchTimer==='undefined'?null:launchTimer,
      frame:renderer.info.render.frame,alive:P.alive,hull:P.hull,model:typeof planeModelLoaded==='undefined'?null:planeModelLoaded})),errors);throw e;
   }
   // Actual user keyboard events: release must clear a keyboard-owned command.
   await page.keyboard.down('ArrowLeft');await page.waitForTimeout(150);await page.keyboard.up('ArrowLeft');
   await page.waitForFunction(()=>inputRoll===0,{},{timeout:5000});
   assert.equal(await page.evaluate(()=>inputRoll),0,'keyboard release clears roll');
   await page.keyboard.down('ArrowRight');await page.keyboard.down('f');
   await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
   const paused=await page.evaluate(()=>({paused:state===ST.PAUSED,roll:inputRoll,pitch:inputPitch,firing,frame:renderer.info.render.frame,pos:P.pos.toArray()}));
   assert(paused.paused);assert.deepEqual([paused.roll,paused.pitch,paused.firing],[0,0,false]);
   await page.waitForTimeout(250);
   assert.deepEqual(await page.evaluate(()=>P.pos.toArray()),paused.pos,'paused sortie cannot move');
   assert.equal(await page.evaluate(()=>renderer.info.render.frame),paused.frame,'pause does not redraw the GPU');
   assert.match(await page.locator('#pauseReason').innerText(),/inactive/i);
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
    for(let i=0;i<12;i++){spawnDebris(P.pos.x,P.pos.y+200,P.pos.z,12);renderer.render(scene,camera);updateDebris(10);
      if(typeof updateSplashes==='function')updateSplashes(10);renderer.render(scene,camera);}
    return {before,after:renderer.info.memory.geometries};
   });
   assert(memory.after<=memory.before,'repeated debris does not retain GPU geometry');
   assert.deepEqual(errors,[],campaign+' has no uncaught browser errors');
   console.log('Browser '+campaign+': iPad layout, keyboard release, auto-pause, frozen GPU, real context restoration; geometry '+memory.before+' → '+memory.after);
   if(!eu&&scenario.kind==='defend'&&scenario.ordinal===0){
    // A real JS frame failure is visible and remains observable, not hidden.
    await page.evaluate(()=>{animateFrame=()=>{throw Error('TEST FRAME FAULT');};});
    await page.locator('#simulationRecovery').waitFor({state:'visible'});
    assert.match(await page.locator('#simulationRecovery').innerText(),/BUILD 154.*TEST FRAME FAULT/);
    assert.equal(await page.locator('#simulationRecovery button').innerText(),'Reload game');
    assert.deepEqual(errors,['TEST FRAME FAULT'],'unexpected runtime errors cannot be swallowed');
   }
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
