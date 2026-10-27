/* Actual carrier models, aircraft tyres, camera and frozen rolling departure sequence.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Carrier departure WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 if(url.pathname==='/torpedo-carrier.html'){const html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true}),errors=[],requests=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=208');
  await page.waitForFunction(()=>state===ST.MENU);await page.evaluate(()=>{renderer.setPixelRatio(.3);renderer.shadowMap.enabled=false;});
  const index=await page.evaluate(()=>MISSIONS.findIndex(m=>m.corsair&&m.shoreStrike));
  for(const kind of ['bombs','rockets','mixed']){
   await page.locator('#missionSel .chip').nth(index).click();assert(await page.locator('#corsairLoadoutRow').isVisible());await page.locator('#corsairLoadout').selectOption(kind);
   for(const size of [{width:1024,height:600},{width:1194,height:834}]){await page.setViewportSize(size);const rect=await page.locator('#startBtn').boundingBox();assert(rect.y+rect.height<=size.height,'launch button fits iPad viewport');}
   await page.setViewportSize({width:1024,height:768});
   await page.locator('#startBtn').click();await page.locator('#launchBtn').click();
   await page.waitForFunction(()=>{updatePlaneMesh(0);return carrierAircraftReady()&&carrierIntro&&state===ST.LAUNCH;},null,{polling:200});
   await page.evaluate(()=>{finishCarrierIntro();state=ST.FLIGHT;P.onDeck=false;P.pos.set(carrierX+900,300,200);P.pitch=-.5;P.roll=0;P.heading=0;P.spd=80;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;updatePlaneMesh(0);planeGroup.updateMatrixWorld(true);});
   const report=await page.evaluate(kind=>{
    const check=(v,label)=>{if(!v)throw Error(label);},c=corsairConfig(),n=name=>playerSBD.getObjectByName(name);
    check(CorsairRig.isNative(playerSBD),'native Corsair');check(P.torps===c.bombs&&P.rockets===c.rockets,'loadout counts');check(n('BombLeft').visible===(c.bombs>0)&&n('Rocket0').visible===(c.rockets>0),'attached stores');
    let atlas=0;playerSBD.traverse(o=>{if(o.isMesh&&o.material.map)atlas=Math.max(atlas,o.material.map.image.width);});check(atlas===2048,'touch paint atlas');
    document.getElementById('diveBtn').dispatchEvent(new Event('pointerdown'));for(let i=0;i<120;i++)updatePlaneMesh(1/60);
    check(n('GearLeft').rotation.x<.001&&n('GearRight').rotation.x<.001&&!n('TailGear').visible,'main-only dive brake');check(P.gear===0,'dive brake preserves landing gear selector');
    P.diveBrake=false;P.diveBrakeVisual=0;P.flap=P.flapTgt=1;inputRoll=.8;inputPitch=.4;updatePlaneMesh(0);
    check(n('InnerFlapLeft').quaternion.angleTo(new THREE.Quaternion())>.86,'full flaps');check(n('AileronLeft').quaternion.angleTo(n('AileronRight').quaternion)>.35,'opposite ailerons');
    const ammo=P.ammo;firing=true;gunCool=0;const start=bullets.length;updateGuns(0);firing=false;check(bullets.length-start===6&&ammo-P.ammo===6,'six MGs');check(bullets.slice(start).every(b=>b.weapon==='rifle'),'MG ammunition');
    const ports=CorsairRig.muzzles(playerSBD);check(bullets.slice(start).every(b=>ports.some(p=>p.distanceTo(b.mesh.position)<.001)),'rounds at model muzzles');
    let releaseDistance=null;
    if(c.bombs){P.corsairWeapon='bombs';applyLoadoutUI();const pos=CorsairRig.position(playerSBD,'BombRight');dropTorpedo();check(P.torps===c.bombs-1&&!n('BombRight').visible,'bomb release/store');check(bombs.at(-1).mesh.position.distanceTo(pos)<.001,'bomb origin');}
    if(c.rockets){P.corsairWeapon='bombs';selectCorsairWeapon();const pos=CorsairRig.position(playerSBD,'Rocket7');dropTorpedo();const shot=bombs.at(-1);releaseDistance=shot.mesh.position.distanceTo(pos);check(shot.rocket&&releaseDistance<.001&&P.rockets===7&&!n('Rocket7').visible,'rocket release/store');check(document.getElementById('hTorp').textContent==='7','rocket HUD');
     const saved=SortieCheckpoint.projectiles([shot]),copy=SortieCheckpoint.restoreProjectiles(saved,'bomb',scene)[0];check(copy.rocket&&copy.mesh.userData.ordnance==='rocket'&&copy.vel.distanceTo(shot.vel)<.001,'rocket checkpoint');GameRuntime.release(copy.mesh);
     for(const fps of [20,60,120]){const t=shoreTargets.find(t=>t.alive),hp=t.hp,mesh=Ordnance.create('rocket'),x=t.def.x,z=t.def.z,gy=shoreHeight(x,z);GameRuntime.own(mesh);mesh.position.set(x-8,gy+5,z);scene.add(mesh);bombs.push({mesh,vel:new THREE.Vector3(100,-75,0),life:1,rocket:true});for(let i=0;i<fps;i++)updateBombs(1/fps);check(t.hp<hp,'rocket collision at '+fps+' FPS');}
    }
    P.torps=P.rockets=P.ammo=0;beginDeckService();sortieService.update(13);check(P.torps===c.bombs&&P.rockets===c.rockets&&P.ammo===2400,'selected loadout rearmed');sortieService.clear();state=ST.FLIGHT;updatePlaneMesh(0);updateHUD();
    return {kind,atlas,releaseDistance,bombs:P.torps,rockets:P.rockets,ammo:P.ammo};
   },kind);console.log(report);
   if(kind==='mixed'){
    const saved=await page.evaluate(()=>{P.gear=P.gearTgt=0;P.flap=P.flapTgt=.6;P.diveBrake=true;P.diveBrakeVisual=1;P.torps=1;P.rockets=7;P.corsairWeapon='rockets';P.rocketCooldown=0;updatePlaneMesh(0);dropTorpedo();const r=sortieCheckpoint.save();if(!r.ok||!r.persistent)throw Error('Save failed '+JSON.stringify(r));return {bombs:P.torps,rockets:P.rockets,ammo:P.ammo,projectiles:bombs.length};});
    await page.reload();await page.waitForFunction(()=>state===ST.MENU&&sortieCheckpoint.ready,null,{polling:200});await page.locator('#continueFlight').click();await page.waitForFunction(()=>state===ST.PAUSED&&!sortieCheckpoint.restoring,null,{polling:200});
    const restored=await page.evaluate(()=>({bombs:P.torps,rockets:P.rockets,ammo:P.ammo,projectiles:bombs.length,loadout:P.corsairLoadout,weapon:P.corsairWeapon,flap:P.flap,tail:playerSBD.getObjectByName('TailGear').visible,rocket:!!bombs.find(b=>b.rocket&&b.mesh.userData.ordnance==='rocket')}));
    for(const k of Object.keys(saved))assert.equal(restored[k],saved[k],k+' after cold reload');assert.equal(restored.loadout,'mixed');assert.equal(restored.weapon,'rockets');assert.equal(restored.flap,.6);assert(!restored.tail);assert(restored.rocket);console.log('Cold reload checkpoint: passed',restored);
   }
   await page.evaluate(()=>exitToMenu());
  }
  assert(!requests.some(u=>u.includes('f4u-1c_corsair_war_thunder')),'no WT fallback/request');assert.deepEqual(errors,[]);
  console.log('Corsair loadouts, native controls, six MGs, releases, collisions, rearm and cold reload passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
