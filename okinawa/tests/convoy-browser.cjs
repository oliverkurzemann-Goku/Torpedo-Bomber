/* Build 246: the delivered column vehicles, the fuel-truck blast and the Flakvierling wagon in the real Rhine game (real GLBs).
 * Checked: the road recce column is Panzer IV / Sd.Kfz. 251 / Opel Blitz fuel truck / Opel Blitz cargo with their real models (one merged
 * draw each, wreck hidden); a destroyed fuel truck shows its own wreck, takes the neighbouring vehicles with it (bonus, objective count),
 * spares the armour two vehicles away and hurts a low aeroplane directly above it; the train sortie couples a Flakvierling wagon behind
 * the locomotive that shoots at low flyers, is an optional target (secondary bonus, no objective) and stops with a destroyed train.
 * Writes app/release/convoy-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Convoy WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote','--in-process-gpu']});
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=convoy&surprises=off');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['p47','bf109'].map(ensureModel));
   renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;});


  // wait for the delivered vehicle templates (they load one after the other once the menu is open)
  await page.waitForFunction(()=>worldVehicles&&['panzer4','halftrack','blitz','blitzTanker','flakwagen'].every(k=>worldVehicles.templates.has(k)),null,{polling:300});
  const start=(id)=>page.evaluate((id)=>{diffIdx=1;const index=MISSIONS.findIndex(m=>m.id===id);selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;P.alive=true;P.onGround=false;radioQ.length=0;return index;},id);

  // ---- 1. the road recce column ----
  await start('convoy');
  report.column=await page.evaluate(()=>{
   const ts=targets.filter(t=>t.kind==='truck'),ents=livingWorld.missionTargets('convoy');
   const vis=e=>{const i=e.visual.getObjectByName('IntactMerged'),w=e.visual.getObjectByName('Wreck');let meshes=0;if(i)i.traverse(o=>{if(o.isMesh)meshes++;});return {intact:!!i&&i.visible,wreck:!!w&&!w.visible,meshes};};
   return {names:ts.map(t=>t.name),models:ents.map(e=>e.visual.userData.sourceModel),hp:ts.map(t=>t.hp),pts:ts.map(t=>t.pts),vis:ents.map(vis),
    primary:ts.every(t=>t.primary),left:objectiveLeft(),text:objectiveText(),spacing:ents.slice(1).map((e,i)=>Math.hypot(e.last.x-ents[i].last.x,e.last.z-ents[i].last.z))};
  });
  const C=report.column;
  assert.deepEqual(C.models,['panzer4','halftrack','blitzTanker','blitz'],'the column carries the delivered vehicles: '+C.models);
  assert.deepEqual(C.names,['PANZER IV','SD.KFZ. 251','FUEL TRUCK','OPEL BLITZ']);
  assert.equal(C.hp[0],4,'the Panzer IV is armoured (double hit points)');assert.deepEqual(C.hp.slice(1),[2,2,2]);assert.equal(C.pts[0],400);
  assert.ok(C.vis.every(v=>v.intact&&v.wreck&&v.meshes===1),'one merged draw each, wreck hidden: '+JSON.stringify(C.vis));
  assert.deepEqual(C.left,{truck:4});assert.ok(/TRUCKS 4/.test(C.text));
  assert.ok(C.spacing.every(d=>d>20&&d<34),'vehicles are about 31 m apart: '+C.spacing);

  // ---- 2. the fuel truck: its own wreck, the neighbours go with it, the armour two vehicles away does not ----
  report.blast=await page.evaluate(()=>{
   const ts=targets.filter(t=>t.kind==='truck'),tank=ts[2],pan=ts[0],half=ts[1],cargo=ts[3];
   P.pos.set(tank.group.position.x+700,groundY(tank.group.position.x+700,tank.group.position.z)+900,tank.group.position.z);P.hull=100;
   const s0=score;damageTarget(tank,99,false);
   const wreckShown=!tank.entity.visual.getObjectByName('IntactMerged').visible&&tank.entity.visual.getObjectByName('Wreck').visible;
   const bonusScore=score-s0;
   return {tankAlive:tank.alive,halfAlive:half.alive,cargoAlive:cargo.alive,panAlive:pan.alive,panHp:pan.hp,wreckShown,rot:tank.entity.model.rotation.z,
    kills:sortieKills.truck,left:objectiveLeft(),score:bonusScore,expect:tank.pts+half.pts+cargo.pts+FUEL_BLAST.bonus*2,radio:radioQ.join('|'),hull:P.hull,
    wreckLive:ts.map(t=>[t.alive,t.entity.visual.getObjectByName('Wreck').visible])};
  });
  const B=report.blast;
  assert.ok(!B.tankAlive&&B.wreckShown&&Math.abs(B.rot)<.1,'the fuel truck shows its own wreck (no legacy .18 rad tilt; only the lean the road gave it)');
  assert.ok(!B.halfAlive&&!B.cargoAlive,'both neighbouring vehicles are caught by the fireball');assert.ok(B.panAlive&&B.panHp===4,'the Panzer IV, two vehicles away, is untouched');
  assert.equal(B.kills,3);assert.deepEqual(B.left,{truck:1});assert.equal(B.score,B.expect,'points for three vehicles plus the chain bonus');
  assert.ok(/THE COLUMN GOES UP WITH IT/.test(B.radio),'radio: '+B.radio);assert.equal(B.hull,100,'a high aeroplane is not hurt');
  // a low aeroplane directly above a fuel truck is hurt; the tanker of another column serves as the victim
  report.low=await page.evaluate(()=>{
   const e=livingWorld.entities.find(x=>x.kind==='truck'&&x.meta.vehicleModel==='blitzTanker'&&x.alive);
   const t=spawnLivingTarget(e,{primary:false});const p=t.group.position;
   P.alive=true;P.hull=100;P.pos.set(p.x+10,groundY(p.x+10,p.z)+40,p.z);damageTarget(t,99,false);
   return {hull:P.hull,radio:radioQ.join('|')};
  });
  assert.ok(report.low.hull<100&&/FIREBALL ON YOUR WING/.test(report.low.radio),'low overhead: '+JSON.stringify(report.low));

  // ---- 3. the train sortie: Flakvierling wagon ----
  await start('train');
  report.train=await page.evaluate(()=>{
   const loco=livingWorld.entities.find(e=>e.kind==='train'),car=livingWorld.entities.find(e=>e.kind==='flakcar');
   const ct=targets.find(t=>t.kind==='flakcar');
   const vis=car.visual,i=vis.getObjectByName('IntactMerged');
   return {model:vis.userData.sourceModel,intact:!!i&&i.visible,coupled:car.coupledTo===loco,gap:Math.hypot(loco.last.x-car.last.x,loco.last.z-car.last.z),
    target:!!ct,primary:ct&&ct.primary,secondary:ct&&ct.secondary,heavy:ct&&ct.heavy,inFlak:flakUnits.includes(ct),left:objectiveLeft(),name:ct&&ct.name,hp:ct&&ct.hp,
    kinds:targets.map(t=>t.kind)};
  });
  const T=report.train;
  assert.equal(T.model,'flakwagen');assert.ok(T.intact&&T.coupled);assert.ok(T.gap>10&&T.gap<=19.2,'the wagon trails the locomotive: '+T.gap);
  assert.ok(T.target&&!T.primary&&T.secondary&&T.heavy===false&&T.inFlak,'optional light-flak target');assert.deepEqual(T.left,{train:1},'the wagon is not part of the objective');
  // it shoots at a low flyer in range, not at one below 15 m or far away, and it rides with the train
  report.fire=await page.evaluate(()=>{
   const car=livingWorld.entities.find(e=>e.kind==='flakcar'),ct=targets.find(t=>t.kind==='flakcar'),p=car.model.position;
   P.alive=true;P.hull=100;state=ST.FLIGHT;P.pos.set(p.x+900,groundY(p.x+900,p.z)+120,p.z);tracers.length=0;ct.cool=0;
   let shots=0;for(let i=0;i<120;i++){const n=tracers.length;updateFlak(.05);if(tracers.length>n)shots++;}
   const near=shots;
   P.pos.set(p.x+3500,groundY(p.x+3500,p.z)+120,p.z);tracers.length=0;ct.cool=0;let far=0;for(let i=0;i<60;i++){const n=tracers.length;updateFlak(.05);if(tracers.length>n)far++;}
   P.pos.set(p.x+600,groundY(p.x+600,p.z)+8,p.z);tracers.length=0;ct.cool=0;let low=0;for(let i=0;i<60;i++){const n=tracers.length;updateFlak(.05);if(tracers.length>n)low++;}
   const before=car.model.position.clone();livingWorld.update(5,p.x,p.z);const moved=car.model.position.distanceTo(before);
   return {near,far,low,moved};
  });
  assert.ok(report.fire.near>=5,'it fires bursts at a flyer in range: '+report.fire.near);assert.equal(report.fire.far,0);assert.equal(report.fire.low,0,'flak cannot touch a flyer on the deck');assert.ok(report.fire.moved>50,'it rides with the train: '+report.fire.moved);
  report.kill=await page.evaluate(()=>{
   const ct=targets.find(t=>t.kind==='flakcar'),s0=score;damageTarget(ct,99,false);
   const car=ct.entity;return {alive:ct.alive,score:score-s0,expect:ct.pts+300,inFlak:flakUnits.includes(ct),wreck:car.visual.getObjectByName('Wreck').visible,left:objectiveLeft(),
    radio:radioQ.join('|')};
  });
  assert.ok(!report.kill.alive&&report.kill.score===report.kill.expect&&!report.kill.inFlak&&report.kill.wreck,'the wagon dies for its points plus the secondary bonus and leaves the flak list');
  assert.deepEqual(report.kill.left,{train:1},'the train is still the objective');
  report.stop=await page.evaluate(()=>{
   const loco=livingWorld.entities.find(e=>e.kind==='train'),t=targets.find(x=>x.kind==='train');damageTarget(t,99,false);
   const ph=livingWorld.entities.find(e=>e.kind==='flakcar').phase;livingWorld.update(6,loco.model.position.x,loco.model.position.z);
   return {train:!loco.alive,same:livingWorld.entities.find(e=>e.kind==='flakcar').phase===ph,left:objectiveLeft()};
  });
  assert.ok(report.stop.train&&report.stop.same&&Object.keys(report.stop.left).length===0,'a destroyed train ends the objective');
  assert.deepEqual(errors,[]);
  // ---- 5. ground fit (iPad report: vehicles half in the road, telegraph poles hanging in the air near the targets) ----
  // The topmost rendered surface under each vehicle (road ribbon or terrain mesh, by raycast) must be within a few cm of its wheels, and after the
  // terrain refined around the column (a far tile starts coarse) every telegraph pole must still stand on the ground.
  await start('convoy');
  report.ground=await page.evaluate(()=>{
   const col=livingWorld.missionTargets('convoy'),fx=col[0].last.x,fz=col[0].last.z;
   livingWorld.update(.016,fx,fz);
   const flight=(x,z,n)=>{for(let i=0;i<n;i++){osmMgr.advanceSurfacePreparation();terrain.updateLOD(x,z,.05);osmMgr.syncTerrainSurfacesBudgeted(x,z,8);if(i%10===0)livingWorld.update(.5,x,z);}};
   const before={};for(const t of terrain.tiles.values())before[t._renderSeg]=(before[t._renderSeg]||0)+1;
   flight(fx,fz,1500);
   const after={};for(const t of terrain.tiles.values())after[t._renderSeg]=(after[t._renderSeg]||0)+1;
   const ray=new THREE.Raycaster(),meshes=[];scene.updateMatrixWorld(true);
   scene.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||!o.visible)return;if(o.geometry.boundingSphere===null)o.geometry.computeBoundingSphere();
    for(let a=o;a;a=a.parent)if(a===livingWorld.group||a===planeGroup||a.name==='sky')return;meshes.push(o);});
   const hit=(x,z,y0)=>{ray.set(new THREE.Vector3(x,y0,z),new THREE.Vector3(0,-1,0));ray.far=400;const h=ray.intersectObjects(meshes,false);return h.length?h[0].point.y:null;};
   const veh=[];
   for(const e of livingWorld.entities.filter(e=>e.kind!=='ferry'&&e.model.visible)){
    e.model.updateMatrixWorld(true);const f=livingWorld._footprint(e),w=new THREE.Vector3();
    let worst=0;
    for(const [lx,lz] of [[-f.hw,f.cz-f.hl],[f.hw,f.cz-f.hl],[-f.hw,f.cz+f.hl],[f.hw,f.cz+f.hl],[0,f.cz]]){
     w.set(lx,0,lz).applyMatrix4(e.model.matrixWorld);const g=hit(w.x,w.z,w.y+60);if(g!==null)worst=Math.max(worst,Math.abs(g-w.y));}
    veh.push({kind:e.kind,model:e.visual.userData.sourceModel||e.meta.vehicleModel||'',off:+worst.toFixed(2)});
   }
   const poles=livingWorld.details.children.find(c=>c.name==='telegraphPoles'),m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),gaps=[];
   for(let i=0;i<poles.count;i++){poles.getMatrixAt(i,m);m.decompose(p,q,s);const g=hit(p.x,p.z,p.y+80);if(g!==null)gaps.push(p.y-5.75*s.y-g);}
   gaps.sort((a,b)=>a-b);
   return {before,after,veh,poles:{n:gaps.length,min:+gaps[0].toFixed(2),max:+gaps[gaps.length-1].toFixed(2),floating:gaps.filter(g=>g>.5).length,sunk:gaps.filter(g=>g<-1.5).length}};
  });
  const G=report.ground;
  assert.ok(G.veh.length>=8,'vehicles near the column are measured: '+G.veh.length);
  assert.ok(G.veh.every(v=>v.off<=.25),'every vehicle rides on the rendered road / terrain surface (was 1.3 m inside the road): '+JSON.stringify(G.veh.filter(v=>v.off>.25)));
  assert.ok(G.poles.n===180&&G.poles.floating===0&&G.poles.sunk===0,'no telegraph pole floats above or sinks into the ground after the terrain refined: '+JSON.stringify(G.poles));
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/convoy-browser.json'),JSON.stringify(report,null,1));
  console.log('Convoy browser: OK',JSON.stringify({models:C.models,blastScore:B.score,fire:report.fire.near,gap:+T.gap.toFixed(1)}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
