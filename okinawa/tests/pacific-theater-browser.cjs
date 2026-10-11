/* Real selected models + actual game functions. No simplified substitute simulation. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Pacific theater WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname==='/torpedo-carrier.html'){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|not compiled/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=185');await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{await prepareOkinawa();for(const m of MISSIONS.filter(m=>m.theater))await preparePacificModels(m);renderer.setPixelRatio(.65);renderer.shadowMap.enabled=false;PacificTheater.resetEffects();});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  const port=await page.evaluate(()=>{
   startMission(MISSIONS.findIndex(m=>m.theater==='harbor'));state=ST.FLIGHT;hideOverlays();P.pos.set(4080,210,-4140);P.heading=0;P.spd=90;P.pitch=0;P.gear=P.gearTgt=0;updatePlaneMesh(0);
   const moored=ships.filter(s=>s.def.moored),positions=moored.map(s=>s.group.position.clone());
   for(let i=0;i<120;i++){updateShips(1/60);updateSmoke(1/60);operationalScenery.update(1/60,P.pos);}
   const stillMoored=moored.every((s,i)=>s.group.position.clone().setY(0).distanceTo(positions[i].setY(0))<.001);
   const merchant=ships.find(s=>s.def.optional);hitShip(merchant,true,merchant.group.position,'bomb');
   for(let i=0;i<600;i++){updateShips(1/60);updateSmoke(1/60);updateExplosions(1/60);updateDebris(1/60);updateSplashes(1/60);combatFX.update(1/60);}const slowdown=merchant.speed;
   const screen=smokes.some(s=>s.max===12&&s.mesh.scale.x>40);
   return {stillMoored,slowdown,screen,cranes:operationalScenery.cranes.length,trucks:operationalScenery.trucks.length,primary:shoreTargets.filter(t=>!t.def.optional).length,realSBD:playerSBD?.userData.fromTemplate===true};
  });assert(port.stillMoored&&port.realSBD&&port.screen&&port.slowdown<3);assert.equal(port.primary,2);console.log('Working harbor:',port);
  await page.evaluate(()=>{killCam=null;flashTimer=0;updateFlash(1);updateHUD();updateNav();updateMinimap();camera.position.set(4280,230,-4090);camera.lookAt(4940,12,-4500);camera.fov=52;camera.updateProjectionMatrix();scene.fog.far=12000;scene.updateMatrixWorld(true);updateSea(1);renderer.render(scene,camera);});await page.screenshot({path:path.join(out,'build185-harbor.png')});
  const harborDone=await page.evaluate(()=>{
   // Actual gravity/impact path for bombs on moored ships and fuel stores.
   for(const s of ships.filter(s=>s.def.moored)){const mesh=Ordnance.create('bomb');mesh.position.copy(s.group.position).setY(40);scene.add(mesh);bombs.push({mesh,vel:new THREE.Vector3(0,-30,0),life:8});for(let i=0;i<120;i++)updateBombs(1/60);}
   checkObjectiveCleared();const premature=P.rtb;
   for(const t of shoreTargets.filter(t=>!t.def.optional)){const mesh=Ordnance.create('bomb');mesh.position.copy(t.group.position).add(new THREE.Vector3(0,40,0));scene.add(mesh);bombs.push({mesh,vel:new THREE.Vector3(0,-30,0),life:8});for(let i=0;i<120;i++)updateBombs(1/60);}
   for(let i=0;i<240;i++)updatePacificOperation(1/60);
   const before=PacificTheater.effects().fuelDenied,clear=P.rtb;trap(carrierX+(WIRE_X0+WIRE_X1)/2);return {premature,before,clear,success:state===ST.RESULT,effect:PacificTheater.effects().fuelDenied};
  });assert.deepEqual(harborDone,{premature:false,before:false,clear:true,success:true,effect:true});console.log('Actual four-target harbor impacts/recovery:',harborDone);
  for(const fps of [20,60,120]){
   const escort=await page.evaluate(fps=>{
    startMission(MISSIONS.findIndex(m=>m.theater==='escort'));state=ST.FLIGHT;hideOverlays();P.pos.set(-1700,320,2400);P.heading=Math.PI/2;P.spd=90;P.gear=P.gearTgt=0;
    const secondWave=pacificOps.config.events[1].raiders,early=pacificTargetsClear();
    let peak=0;for(let i=0;i<fps*300;i++){
     updateShips(1/fps);updatePacificOperation(1/fps);peak=Math.max(peak,raiders.length);
     // Real swept cannon projectile path into the selected raider model.
     for(const r of raiders.filter(r=>r.alive)){for(let k=0;k<4;k++){const mesh=CombatFX.round('cannon');const dir=r.vel.clone().normalize();mesh.position.copy(r.pos).addScaledVector(dir,-5);scene.add(mesh);bullets.push({mesh,dir,life:.7,speed:650,weapon:'cannon'});}updateGuns(1/fps);}
    }
    const proof=convoyProof();checkObjectiveCleared();const success=P.rtb&&proof.clear;trap(carrierX+(WIRE_X0+WIRE_X1)/2);
    return {fps,early,secondWave,peak,arrived:proof.arrived,success,result:state===ST.RESULT,reinforced:PacificTheater.effects().reinforced,corsair:playerSBD.userData.corsair,usCarrier:carrierModel.visible&&!ijnCarrierModel?.visible};
   },fps);assert(!escort.early&&escort.success&&escort.result&&escort.reinforced&&escort.corsair&&escort.usCarrier);assert.equal(escort.arrived,2);assert.equal(escort.secondWave,1);assert.equal(escort.peak,3);console.log('Protected convoy:',escort);
  }
  const failed=await page.evaluate(()=>{
   PacificTheater.resetEffects();startMission(MISSIONS.findIndex(m=>m.theater==='escort'));state=ST.FLIGHT;P.pos.set(-1700,350,2400);
   let drops=0,hits=0,maxBombs=0;for(let i=0;i<60*420&&state!==ST.RESULT;i++){
    const before=enemyBombs.length;updateRaiders(1/60);drops+=Math.max(0,enemyBombs.length-before);updateEnemyBombs(1/60);updateShips(1/60);updatePacificOperation(1/60);maxBombs=Math.max(maxBombs,enemyBombs.length);
    hits=Math.max(hits,...supportFleet.filter(s=>s.def.transport).map(s=>100-s.hp));
   }
   return {drops,hits,maxBombs,failed:state===ST.RESULT&&pacificOps.failed,reinforced:PacificTheater.effects().reinforced};
  });console.log('Unprotected convoy actual bombing/failure:',failed);assert(failed.drops>=3&&failed.hits>=40&&failed.failed&&!failed.reinforced);
  const fleet=await page.evaluate(()=>{
   PacificTheater.record(PacificTheater.missions[0],PacificTheater.harborTargets.map(def=>({def,alive:false})),[]);
   PacificTheater.record(PacificTheater.missions[1],[],PacificTheater.missions[1].support.map(def=>({def,alive:true,arrived:true})));
   startMission(MISSIONS.findIndex(m=>m.theater==='fleet'));state=ST.FLIGHT;hideOverlays();P.pos.set(carrierX-900,300,500);P.spd=90;P.heading=0;
   const ready=playerSBD.userData.corsair&&carrierModel.visible&&!ijnCarrierModel?.visible,aaSupport=supportFleet.some(s=>s.def.model==='fletcher');
   for(const r of raiders)killRaider(r,true);checkObjectiveCleared();const waits=P.rtb===false;
   for(let i=0;i<60*180;i++){updatePacificOperation(1/60);for(const r of raiders.filter(r=>r.alive))killRaider(r,true);updatePatrolRecovery(1/60);updateExplosions(1/60);updateSmoke(1/60);}
   const patrol=patrolRecovery?.recovered===true,clear=P.rtb;carrierHP=50;
   trap(carrierX+(WIRE_X0+WIRE_X1)/2);const result=state===ST.RESULT;
   startMission(0);return {ready,aaSupport,waits,patrol,clear,result,reset:enemyBombs.length===0&&operationalScenery===null&&patrolRecovery===null};
  });assert(Object.values(fleet).every(Boolean));console.log('US fleet, optional patrol and attacked-deck recovery:',fleet);
  // Actual falling bomb damage to US carrier, without waiting for player defeat.
  const deck=await page.evaluate(()=>{startMission(MISSIONS.findIndex(m=>m.theater==='fleet'));state=ST.FLIGHT;const mesh=Ordnance.create('bomb');mesh.position.set(carrierX,30,0);scene.add(mesh);enemyBombs.push({mesh,vel:new THREE.Vector3(0,-30,0),life:8});for(let i=0;i<90;i++)updateEnemyBombs(1/60);return {hp:carrierHP,bombs:enemyBombs.length,usCarrier:carrierModel.visible};});assert.deepEqual(deck,{hp:75,bombs:0,usCarrier:true});
  await page.evaluate(()=>{P.pos.set(-500,140,50);P.gear=0;updatePlaneMesh(0);camera.position.set(carrierX-370,110,240);camera.lookAt(carrierX,20,0);updateSea(3);renderer.render(scene,camera);});await page.screenshot({path:path.join(out,'build185-us-fleet.png')});
  const pause=await page.evaluate(()=>{const t=pacificOps.elapsed,pos=raiders[0].pos.clone(),trucks=operationalScenery.time;togglePause();animate();const same=pacificOps.elapsed===t&&raiders[0].pos.equals(pos)&&operationalScenery.time===trucks;resumeGame();exitToMenu();return {same,disposed:operationalScenery===null&&enemyBombs.length===0};});assert(pause.same&&pause.disposed);
  assert.deepEqual(errors,[]);console.log('Pacific theater actual model/weapon/arrival/recovery/pause WebGL checks passed.');
  const undefendedDeck=await page.evaluate(async()=>{
   await prepareOkinawa();PacificTheater.resetEffects();startMission(MISSIONS.findIndex(m=>m.theater==='fleet'));state=ST.FLIGHT;P.pos.set(-2500,500,-2000);let drops=0;
   for(let i=0;i<60*380&&state!==ST.RESULT;i++){
    CARRIER_SPD=Math.max(0,Math.min(5,(1800-carrierX)*.02));carrierX+=CARRIER_SPD/60;
    const n=enemyBombs.length;updateRaiders(1/60);drops+=Math.max(0,enemyBombs.length-n);updateEnemyBombs(1/60);updatePacificOperation(1/60);
   }return {hp:carrierHP,drops,lost:state===ST.RESULT};
  });console.log('Unprotected moving US deck:',undefendedDeck);assert(undefendedDeck.drops>=4&&undefendedDeck.lost&&undefendedDeck.hp===0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
