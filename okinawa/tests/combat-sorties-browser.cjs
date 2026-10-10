/* Real aircraft, real mission selection, service/departure camera and terrain.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Combat sorties WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 if(['/remagen-mission.html','/torpedo-carrier.html'].includes(url.pathname)){const html=fs.readFileSync(path.join(root,url.pathname.slice(1)),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.GAME_TEST_SINGLE_PROCESS?['--single-process','--no-zygote','--in-process-gpu']:[])]});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:780}}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>{errors.push(e.message);console.error(e);});page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  async function proof(name,pose){await page.evaluate(pose);const data=await page.evaluate(()=>{scene.updateMatrixWorld(true);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');});fs.writeFileSync(path.join(out,'build177-'+name+'.png'),Buffer.from(data.split(',')[1],'base64'));}
  for(const game of ['remagen-mission.html','torpedo-carrier.html']){
   const pacific=game.startsWith('torpedo');await page.goto('http://127.0.0.1:'+server.address().port+'/'+game+'?v=177');
   await page.waitForFunction(p=>state===ST.MENU&&(p||realWorldReady),pacific,{polling:200});
   await page.evaluate(()=>{renderer.setPixelRatio(.75);renderer.shadowMap.enabled=false;});
   if(pacific){await page.evaluate(async()=>{await prepareOkinawa();await preparePacificModels(MISSIONS[0]);});await page.waitForFunction(()=>planeModelLoaded,null,{polling:200});}
   else {await page.evaluate(async()=>{await Promise.all([ensureModel('p47'),ensureModel('b17')]);});await page.waitForFunction(()=>modelTpl.p47&&modelTpl.b17,null,{polling:200});}
   await page.evaluate(()=>{startMission(0);state=ST.FLIGHT;if(typeof launchIntro!=='undefined')launchIntro=null;if(typeof carrierIntro!=='undefined')carrierIntro=null;document.querySelectorAll('.overlay').forEach(o=>o.classList.add('hidden'));clock.getDelta=()=>1/60;P.pos.set(typeof ALLIED_AF_X==='number'?ALLIED_AF_X:-1000,900,typeof ALLIED_AF_Z==='number'?ALLIED_AF_Z:0);P.spd=105;P.onGround=false;P.gear=0;P.gearTgt=0;P.pitch=0;P.roll=0;if(typeof posePlayerAircraft==='function'){posePlayerAircraft(0);damagePlayer(P.hull*.8,'QA actual damage');}else{updatePlaneMesh(0);P.hull=20;registerHit();}aircraftDamage.update(.05);});
   const damage=await page.evaluate(()=>{const rig=planeGroup.getObjectByName('aircraftBattleDamage');if(!rig?.getObjectByName('skinBulletHole')||!rig.getObjectByName('localEngineFire'))throw Error('Original plane skin damage/fire missing');for(const h of rig.children.filter(o=>o.name==='skinBulletHole'))if(h.position.length()>30)throw Error('Normalized skin decoded incorrectly');return aircraftDamage.stats;});assert(damage.holes>0);
   await proof((pacific?'pacific':'europe')+'-damage',()=>{camera.fov=43;camera.updateProjectionMatrix();camera.position.copy(P.pos).add(new THREE.Vector3(8,9,10));camera.lookAt(P.pos);});
   const holePixels=await page.evaluate(()=>{const rig=planeGroup.getObjectByName('aircraftBattleDamage'),holes=rig.children.filter(c=>c.name==='skinBulletHole'),fire=rig.getObjectByName('localEngineFire'),gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height,a=new Uint8Array(w*h*4),b=new Uint8Array(w*h*4);fire.visible=false;holes.forEach(h=>h.visible=false);renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);holes.forEach(h=>h.visible=true);renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);fire.visible=true;let count=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8)count++;return count;});assert(holePixels>3,'skin bullet holes must reach the framebuffer');
   const crew=await page.evaluate(p=>{if(p){spawnZero(0,1);const z=zeros[zeros.length-1];z.pos.copy(P.pos).add(new THREE.Vector3(0,130,80));z.mesh.position.copy(z.pos);killZero(z);}else{spawnBombers(1,'b17');const e=enemyAir[enemyAir.length-1];e.pos.copy(P.pos).add(new THREE.Vector3(0,130,80));e.group.position.copy(e.pos);damageEnemyAir(e,e.hp+1);}for(let i=0;i<240;i++){enemyBailouts.update(1/60,camera);aircraftDamage.update(1/60);aircraftSmoke.update(1/60);}return {count:enemyBailouts.count,deployed:enemyBailouts.deployed,wrecks:aircraftDamage.stats.wrecks};},pacific);assert.equal(crew.count,pacific?1:10);assert.equal(crew.deployed,crew.count);assert.equal(crew.wrecks,1);
   await proof((pacific?'fighter':'bomber')+'-chutes',()=>{const entries=enemyBailouts.entries,centre=entries.reduce((v,c)=>v.add(c.chute.position),new THREE.Vector3()).divideScalar(entries.length);camera.position.copy(centre).add(new THREE.Vector3(25,12,35));camera.lookAt(centre);});
   if(!pacific){
    const fighter=await page.evaluate(()=>{enemyBailouts.clear();spawnEnemyAir(1,'bf109');const e=enemyAir.at(-1);e.pos.copy(P.pos).add(new THREE.Vector3(0,130,80));e.group.position.copy(e.pos);damageEnemyAir(e,e.hp+1);damageEnemyAir(e,10);for(let i=0;i<90;i++)enemyBailouts.update(1/60,camera);const high={count:enemyBailouts.count,deployed:enemyBailouts.deployed};spawnEnemyAir(1,'bf109');const low=enemyAir.at(-1);low.pos.copy(P.pos);low.pos.y=groundY(low.pos.x,low.pos.z)+20;low.group.position.copy(low.pos);damageEnemyAir(low,low.hp+1);return {...high,afterLow:enemyBailouts.count};});
    assert.deepEqual(fighter,{count:1,deployed:1,afterLow:1});console.log('Actual enemy fighter kill: one chute, no duplicate and no unsafe low-altitude deploy',fighter);
    await proof('europe-fighter-chute',()=>{const p=enemyBailouts.entries[0].chute.position;camera.position.copy(p).add(new THREE.Vector3(10,6,14));camera.lookAt(p);});
   }
   const paused=await page.evaluate(()=>{state=ST.PAUSED;const p=enemyBailouts.entries[0].chute.position.clone();animate();return p.distanceTo(enemyBailouts.entries[0].chute.position);});assert.equal(paused,0);
   await page.evaluate(()=>{startMission(0);if(enemyBailouts.count||aircraftDamage.stats.rigs||aircraftDamage.stats.wrecks)throw Error('Restart retains damage or parachutes');});
   // Select the new Rhine night sortie / existing carrier night strike and use
   // the actual touch button. Test its illumination in the framebuffer.
   if(pacific)await page.evaluate(async()=>{await preparePacificModels(MISSIONS.find(m=>m.time==='night'));});
   await page.evaluate(p=>{const i=MISSIONS.findIndex(m=>p?m.time==='night':m.id==='nightworks');startMission(i);state=ST.FLIGHT;if(p)carrierIntro=null;else launchIntro=null;document.body.classList.remove(p?'carrierPreview':'launchPreview');document.querySelectorAll('.overlay').forEach(o=>o.classList.add('hidden'));const target=p?ships[0].group.position:targets.find(t=>t.kind==='factory').group.position;P.pos.copy(target).add(new THREE.Vector3(0,350,0));P.onGround=false;P.spd=0;P.alive=true;updateFlareUI();},pacific);
   await page.locator('#flareBtn').dispatchEvent('pointerdown',{pointerId:91,clientX:100,clientY:260});
   const light=await page.evaluate(()=>{if(flareSupport.active!==1||flareSupport.remaining!==3)throw Error('Actual flare button did not release');flareSupport.update(.1);const p=flareSupport.slots.find(s=>s.live).g.position;camera.position.copy(p).add(new THREE.Vector3(210,-80,250));camera.lookAt(p.x,p.y-300,p.z);if(typeof updateContentVisibility==='function')updateContentVisibility(p.x,p.z);const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height,a=new Uint8Array(w*h*4),b=new Uint8Array(w*h*4),slot=flareSupport.slots.find(s=>s.live),intensity=slot.light.intensity;slot.light.intensity=0;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);slot.light.intensity=intensity;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);let pixels=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8)pixels++;return pixels;});assert(light>150,'flare must light original ship/buildings and ground');
   await proof((pacific?'pacific':'europe')+'-night',()=>{});
   if(pacific){
    const flooding=await page.evaluate(()=>{const s=ships.find(s=>s.def.type==='cruiser');window.__ship=s;const pt=s.group.localToWorld(new THREE.Vector3(10,1,30));hitShip(s,true,pt,'torpedo');for(let i=0;i<240;i++){updateShips(1/60);updateExplosions(1/60);updateSmoke(1/60);updateDebris(1/60);updateSplashes(1/60);combatFX.update(1/60);}s.group.updateWorldMatrix(true,false);const damage=shipDamage.get(s),bow=s.group.localToWorld(new THREE.Vector3(0,0,30)).y,stern=s.group.localToWorld(new THREE.Vector3(0,0,-30)).y;if(!damage||s.group.rotation.z>=0||bow>=stern)throw Error('Actual hull hit must lower the hit side and flooded bow');return {compartments:damage.compartments,roll:s.group.rotation.z,pitch:s.group.rotation.x,bow,stern};});
    await proof('ship-flooding',()=>{const p=window.__ship.group.position;camera.position.copy(p).add(new THREE.Vector3(110,65,130));camera.lookAt(p.clone().add(new THREE.Vector3(0,7,0)));});console.log('Local ship flooding:',flooding);
   }
   // An actual valid ground/deck contact reaches the turnaround path. Keep the
   // same targets, operation state and accumulated score across the next start.
   await page.evaluate(p=>{window.__targets=p?ships.slice():targets.slice();window.__operation=p?pacificOps:europeOps;window.__score=score;P.fuel=15;P.hull=40;P.ammo=0;P.alive=true;P.roll=P.pitch=0;P.gear=P.gearTgt=1;P.spd=40;P.throttle=0;P.vSpeed=-1;P.touchResolved=false;if(p){P.torps=0;P.heading=0;P.hook=P.hookTgt=1;P.pos.set(carrierX+(WIRE_X0+WIRE_X1)/2,DECK_Y+1.4,0);resolveGroundAndDeck(1/60);}else{P.bombs=P.rockets=0;P.heading=RWY_HDG;P.pos.set(AF_X,groundY(AF_X,AF_Z)+1.5,AF_Z);resolveGround(1/60);for(let i=0;i<120&&!sortieService.active;i++)updateFlight(1/60);}if(!sortieService.active)throw Error('Landing did not begin service');},pacific);
   const servicePause=await page.evaluate(()=>{togglePause();const t=sortieService.elapsed;animate();if(state!==ST.PAUSED||sortieService.elapsed!==t)throw Error('Service continues while paused');togglePause();return true;});assert(servicePause);
   await page.evaluate(()=>{const draw=GameRuntime.render;GameRuntime.render=()=>{};try{for(let i=0;i<800;i++)animate();}finally{GameRuntime.render=draw;}if(!sortieService.ready||P.fuel!==100||P.ammo<=0||P.hull!==(P.systemDamage?.maxHull||100))throw Error('Fuel/armament/repair did not complete');});
   await page.locator('#serviceLaunch').click();
   const continuation=await page.evaluate(p=>{const live=p?ships:targets;if(!live.every((t,i)=>t===window.__targets[i])||(p?pacificOps:europeOps)!==window.__operation||score<window.__score)throw Error('Next start reset the current mission');if(sortieService.active||flareSupport.remaining!==4)throw Error('Turnaround did not finish');return {score,targets:live.length,flaring:flareSupport.remaining};},pacific);console.log('Night flare pixels and continued sortie:',{light,continuation});
   console.log(game,{damage,crew,paused});
  }
  assert.deepEqual(errors,[]);console.log('Actual original aircraft damage, delayed wreck impact and full enemy crews: passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
