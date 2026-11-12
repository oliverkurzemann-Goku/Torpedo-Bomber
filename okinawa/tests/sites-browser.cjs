/* Build 243: radar, searchlights and the V-1 ramp as real ground targets in remagen-mission.html (real game, real GLBs).
 * Checked: the factory sortie carries one optional Wuerzburg radar (model loaded, dry flat spot near the works, ground-fitted, rotating dish,
 * not an objective, not in a checkpoint) that degrades the heavy flak until it is destroyed (wreck swapped in, radio, bonus); the night sortie
 * adds three searchlights that sweep, find a player above 25 m AGL, light him (beam axis on target, brighter beam, flak quicker and more
 * accurate), and go dark when shot out; placement is deterministic per mission id and a mission change leaves no models or beams behind.
 * The V-1 sortie (index 22) adds the ramp as the primary target and flying bombs: launched from the rail's rear end, shot down for a bonus,
 * flown out of the area otherwise; the launches stop when the ramp falls and the objective completes.
 * Writes app/release/sites-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Sites WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=sites&surprises=off');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['p47','bf109'].map(ensureModel));await loadMissionSites({radar:true,searchlights:3,ramp:true,depot:true});
   renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;});

  const start=(id)=>page.evaluate((id)=>{diffIdx=1;const index=MISSIONS.findIndex(m=>m.id===id);selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;return index;},id);

  // ---- 1. the radar in the factory sortie ----
  await start('factory');
  report.radar=await page.evaluate(()=>{
   const t=siteRecs.find(s=>s.kind==='radar'),p=t.group.position,f=realFactory.userData;
   const water=[[0,0],[9,0],[-9,0],[0,9],[0,-9]].some(([dx,dz])=>livingWorld._pointOnWater(p.x+dx,p.z+dz));
   const intact=t.group.getObjectByName('Intact'),wreck=t.group.getObjectByName('Wreck');
   return {count:siteRecs.length,kinds:siteRecs.map(s=>s.kind),alive:t.alive,secondary:t.secondary,primary:t.primary,optional:t.optionalSite,fallback:t.usedFallback,
    inTargets:targets.includes(t),inFlak:flakUnits.includes(t),distFactory:Math.hypot(p.x-f.x,p.z-f.z),water,
    yErr:Math.abs(p.y-terrain.getRenderedHeight(p.x,p.z)),intactVisible:intact.visible,wreckScale:wreck.scale.toArray(),
    dish:!!t.dish,model:t.group.children.length,checkpointTargets:targets.filter(x=>!x.surprise&&!x.optionalSite).length,allTargets:targets.length,
    boostHeavy:siteFlakBoost({heavy:true}),boostLight:siteFlakBoost({heavy:false}),top:targetTop(t)};
  });
  const R=report.radar;
  assert.deepEqual(R.kinds,['radar'],'the factory sortie has one radar and no searchlights');
  assert.ok(R.alive&&R.secondary&&!R.primary&&R.optional&&!R.fallback&&R.inTargets&&!R.inFlak,'an optional secondary target with the real model: '+JSON.stringify(R));
  assert.ok(R.distFactory>=700&&R.distFactory<=1800,'near the works: '+R.distFactory);assert.ok(!R.water,'dry ground');assert.ok(R.yErr<.1,'on the rendered ground: '+R.yErr);
  assert.ok(R.intactVisible&&R.wreckScale.every(v=>v===0),'intact shown, wreck hidden (zero scale)');assert.ok(R.dish);
  assert.equal(R.allTargets-R.checkpointTargets,1,'the radar is not part of a checkpoint');
  assert.deepEqual(R.boostHeavy,{cool:.8,err:.85});assert.deepEqual(R.boostLight,{cool:1,err:1},'the radar only directs the heavy guns');assert.equal(R.top,11);

  // the dish turns while you are near and alive
  report.dish=await page.evaluate(()=>{
   const t=siteRecs.find(s=>s.kind==='radar'),p=t.group.position;P.pos.set(p.x+900,p.y+400,p.z);P.alive=true;state=ST.FLIGHT;
   const a=t.dish.rotation.y;for(let i=0;i<20;i++)updateSites(.05);return {turned:t.dish.rotation.y-a};
  });
  assert.ok(report.dish.turned>.5&&report.dish.turned<.7,'the dish sweeps at 0.6 rad/s: '+report.dish.turned);

  // a gun burst on the model hits it, destroying it swaps in the wreck and lifts the heavy-flak penalty
  report.kill=await page.evaluate(()=>{
   const t=siteRecs.find(s=>s.kind==='radar'),p=t.group.position,before=score;
   const dir=new THREE.Vector3(0,-.05,1).normalize(),mesh=new THREE.Mesh(new THREE.SphereGeometry(.2,4,3),new THREE.MeshBasicMaterial());scene.add(mesh);
   mesh.position.set(p.x,p.y+8,p.z-60);bullets.push({mesh,dir,speed:600,life:2,dmg:1.2});
   // one bullet crosses the radar volume in a 0.2 s step
   const hp0=t.hp;updateBullets(.2);const hitHp=t.hp;
   damageTarget(t,99,false);
   const intact=t.group.getObjectByName('Intact'),wreck=t.group.getObjectByName('Wreck');
   return {bulletDamage:hp0-hitHp,alive:t.alive,score:score-before,intactVisible:intact.visible,wreckScale:wreck.scale.toArray(),
    radio:radioQ.join('|'),boostHeavy:siteFlakBoost({heavy:true}),kills:{...sortieKills},bonus:radioQ.some(x=>/BONUS 300/.test(x))};
  });
  const K=report.kill;
  assert.ok(K.bulletDamage>0,'a bullet through the radar damages it');assert.ok(!K.alive&&K.score>=600+300,'destroyed, score '+K.score);
  assert.ok(!K.intactVisible&&K.wreckScale.every(v=>v===1),'the wreck replaces the intact model');
  assert.ok(/RADAR DOWN/.test(K.radio)&&K.bonus,'radio: '+K.radio);assert.deepEqual(K.boostHeavy,{cool:1,err:1},'no radar, no penalty');
  assert.ok(!Object.keys(K.kills).includes('radar'),'the optional radar is not an objective');

  // ---- 2. the night sortie: three searchlights ----
  await start('nightworks');
  report.lights=await page.evaluate(()=>{
   const L=siteRecs.filter(s=>s.kind==='searchlight'),f=realFactory.userData,pts=L.map(s=>s.group.position);
   let minApart=1e9;for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)minApart=Math.min(minApart,Math.hypot(pts[i].x-pts[j].x,pts[i].z-pts[j].z));
   return {count:L.length,radar:siteRecs.some(s=>s.kind==='radar'),minApart,fallback:L.some(s=>s.usedFallback),
    dist:pts.map(p=>Math.hypot(p.x-f.x,p.z-f.z)),water:pts.some(p=>livingWorld._pointOnWater(p.x,p.z)),beamHidden:L.every(s=>s.beam&&!s.beam.visible),
    night:!!M().night,nodes:L.every(s=>s.mount&&s.proj&&s.beamOrigin),hp:L[0].hp};
  });
  const Lg=report.lights;
  assert.equal(Lg.count,3);assert.ok(Lg.radar);assert.ok(Lg.minApart>=300,'lights keep 300 m apart: '+Lg.minApart);assert.ok(!Lg.fallback&&!Lg.water&&Lg.night&&Lg.nodes&&Lg.beamHidden);
  assert.ok(Lg.dist.every(d=>d>=450&&d<=1300),'around the works: '+Lg.dist);

  // the beam finds the player and a held beam sharpens every gun
  report.beam=await page.evaluate(()=>{
   const t=siteRecs.find(s=>s.kind==='searchlight'),p=t.group.position;
   P.pos.set(p.x+1200,groundY(p.x+1200,p.z)+500,p.z+600);P.alive=true;P.hull=100;state=ST.FLIGHT;radioQ.length=0;
   let litAt=null;
   for(let i=0;i<400;i++){updateSites(.05);if(siteLit>0&&litAt===null)litAt=i*.05;}
   const origin=new THREE.Vector3();t.beamOrigin.getWorldPosition(origin);
   const axis=new THREE.Vector3(0,1,0).applyQuaternion(t.beam.quaternion),want=P.pos.clone().sub(t.beam.position).normalize();
   const boost=siteFlakBoost({heavy:false}),boostHeavy=siteFlakBoost({heavy:true});
   return {litAt,lit:siteLit,warned:siteLitWarned,radio:radioQ.join('|'),angleDeg:Math.acos(Math.min(1,axis.dot(want)))*180/Math.PI,
    originErr:origin.distanceTo(t.beam.position),visible:t.beam.visible,opacity:t.beam.material.opacity,boost,boostHeavy};
  });
  const B=report.beam;
  assert.ok(B.litAt!==null&&B.litAt<10,'the beam holds the player within seconds: '+B.litAt);assert.ok(B.warned&&/SEARCHLIGHT HAS YOU/.test(B.radio));
  assert.ok(B.angleDeg<2.6,'the beam axis points at the player: '+B.angleDeg+' deg');assert.ok(B.originErr<.01,'the beam starts at the lens');
  assert.ok(B.visible&&B.opacity>.2,'a held beam is brighter');
  assert.deepEqual(B.boost,{cool:.72,err:.62});assert.ok(B.boostHeavy.cool<.6,'radar and beam stack on the heavy guns '+JSON.stringify(B.boostHeavy));
  // out of range or below 25 m AGL the lamp sweeps and the boost fades
  report.sweep=await page.evaluate(()=>{
   const t=siteRecs.find(s=>s.kind==='searchlight'),p=t.group.position;P.pos.set(p.x+9000,groundY(p.x+9000,p.z)+500,p.z);
   const az0=t.az;for(let i=0;i<10;i++)updateSites(.05);
   P.pos.set(p.x+500,groundY(p.x+500,p.z)+10,p.z);t.holding=false;siteLit=0;for(let i=0;i<60;i++)updateSites(.05);
   return {lit:siteLit,boost:siteFlakBoost({heavy:false})};
  });
  assert.equal(report.sweep.lit,0,'a low flier under 25 m is not picked up');assert.deepEqual(report.sweep.boost,{cool:1,err:1});
  // shooting a lamp out hides its beam
  report.lampKill=await page.evaluate(()=>{const t=siteRecs.find(s=>s.kind==='searchlight');damageTarget(t,99,false);return {alive:t.alive,beam:t.beam.visible,wreck:t.group.getObjectByName('Wreck').scale.x};});
  assert.ok(!report.lampKill.alive&&!report.lampKill.beam&&report.lampKill.wreck===1);

  // ---- 4. the V-1 sortie: ramp, flying bombs ----
  await start('buzz');
  report.ramp=await page.evaluate(()=>{
   const t=siteRecs.find(s=>s.kind==='ramp'),g=t.group,p=g.position,yaw=g.rotation.y,ax=Math.sin(yaw)*24,az=Math.cos(yaw)*24;
   const want=Math.atan2(ALLIED_AF_X-p.x,ALLIED_AF_Z-p.z);
   const lp=g.getObjectByName('LaunchPoint'),lw=new THREE.Vector3();g.updateMatrixWorld(true);lp.getWorldPosition(lw);
   return {index:MISSIONS.findIndex(m=>m.id==='buzz'),rotte:MISSIONS.findIndex(m=>m.id==='rotte'),count:MISSIONS.length,plan:String(chooseEuropePlan(MISSIONS.findIndex(m=>m.id==='buzz')).config.notes||'').slice(0,80),
    primary:t.primary,secondary:t.secondary,fallback:t.usedFallback,kills:M().kills,inTargets:targets.includes(t),checkpointTargets:targets.filter(x=>!x.surprise&&!x.optionalSite).length,allTargets:targets.length,
    yawErr:Math.abs(Math.atan2(Math.sin(yaw-want),Math.cos(yaw-want))),clear:siteClear(p.x+ax,p.z+az,6)&&siteClear(p.x,p.z,6)&&siteClear(p.x-ax,p.z-az,6),
    slope:Math.abs(groundY(p.x+ax,p.z+az)-groundY(p.x-ax,p.z-az)),launchBehind:Math.hypot(lw.x-p.x,lw.z-p.z),launchAbove:lw.y-p.y,
    distAllied:Math.hypot(p.x-ALLIED_AF_X,p.z-ALLIED_AF_Z),top:targetTop(t),text:objectiveText()};
  });
  const Rp=report.ramp;
  assert.equal(Rp.rotte,21,'old mission indices are unchanged');assert.equal(Rp.index,22,'the V-1 sortie appends at the end');assert.equal(Rp.count,32,'the depot sortie follows the V-1 sortie; the Storch, the Night Hunt and the three Storch sorties come after it');assert.ok(/V-1/.test(Rp.plan));
  assert.ok(Rp.primary&&!Rp.secondary&&!Rp.fallback&&Rp.inTargets&&Rp.kills.ramp===1,'the ramp is the primary target with the real model');
  assert.equal(Rp.allTargets,Rp.checkpointTargets,'the primary ramp is part of a checkpoint');
  assert.ok(Rp.yawErr<1e-6,'the rail points at the Allied strip');assert.ok(Rp.clear,'clear of water and buildings along the rail');assert.ok(Rp.slope<=6,'level enough along the rail: '+Rp.slope);
  assert.ok(Math.abs(Rp.launchBehind-23.4)<.5&&Rp.launchAbove>1,'the launch point sits at the rear end of the rail: '+Rp.launchBehind);assert.ok(Rp.distAllied>6000);assert.equal(Rp.top,8);
  assert.ok(/V-1 RAMP 1/.test(Rp.text)&&/V-1 DOWN 0/.test(Rp.text),'objective line: '+Rp.text);
  // launches: none on the ground or before the grace period, then at the Veteran gap, at most three in the air, and a bomb flies the rail heading
  report.launch=await page.evaluate(()=>{
   const t=siteRecs.find(s=>s.kind==='ramp'),p=t.group.position;
   P.alive=true;P.hull=100;P.onGround=false;state=ST.FLIGHT;P.pos.set(p.x-4000,groundY(p.x-4000,p.z)+900,p.z);radioQ.length=0;
   const log=[];let first=null,maxAir=0;
   for(let i=0;i<2400;i++){updateSites(.05);const air=buzzBombs.filter(v=>v.alive).length;maxAir=Math.max(maxAir,air);
    if(buzzLaunched&&first===null){first=buzzClock;}if(i%200===0)log.push([i*.05,buzzLaunched,air]);}
   const v=buzzBombs.find(b=>b.alive);
   return {first,launched:buzzLaunched,maxAir,heading:v?v.heading:null,rampYaw:t.group.rotation.y,radio:radioQ.join('|'),log,
    ahead:v?Math.hypot(v.pos.x-v.from.x,v.pos.z-v.from.z):0,aglV:v?v.pos.y-groundY(v.pos.x,v.pos.z):0,climbed:v?v.pos.y-v.y0:0,minimap:typeof drawMinimap};
  });
  const Ln=report.launch;
  assert.ok(Ln.first>=24&&Ln.first<25,'the first bomb after the Veteran grace period: '+Ln.first);assert.ok(Ln.launched>=3&&Ln.launched<=10,'launched '+Ln.launched);assert.ok(Ln.maxAir<=3,'at most three in the air: '+Ln.maxAir);
  assert.ok(/V-1 LAUNCH — \d+ O'CLOCK/.test(Ln.radio),'radio call: '+Ln.radio);
  assert.ok(Math.abs(Ln.heading-Ln.rampYaw)<1e-9,'a bomb flies the rail heading');assert.ok(Ln.aglV>=150,'never below 150 m over the ground: '+Ln.aglV);assert.ok(Ln.climbed>100,'it climbs after the launch: '+Ln.climbed);
  // shooting one: a bullet through the bomb damages it, four hits (hp 4) bring it down for 250 points
  report.shoot=await page.evaluate(()=>{
   let v=buzzBombs.find(b=>b.alive);if(!v){buzzNext=0;buzzClock=1e3;updateSites(.05);v=buzzBombs.find(b=>b.alive);}
   radioQ.length=0;   // the launch calls of the loop above fill the (capped) radio queue
   const hp0=v.hp,before=score,k0=sortieKills.v1||0;
   const dir=new THREE.Vector3(Math.sin(v.heading),0,Math.cos(v.heading)),mesh=new THREE.Mesh(new THREE.SphereGeometry(.2,4,3),new THREE.MeshBasicMaterial());scene.add(mesh);
   mesh.position.copy(v.pos).addScaledVector(dir,-50);bullets.push({mesh,dir,speed:900,life:2,dmg:1.5});
   // the bomb stays put for this check (the update is not run), the bullet crosses it in a 0.1 s step
   updateBullets(.1);const hit=hp0-v.hp;
   damageBuzz(v,99);
   return {hit,alive:v.alive,score:score-before,kills:(sortieKills.v1||0)-k0,radio:radioQ.join('|'),parent:!!v.group.parent,text:objectiveText(),flying:buzzBombs.filter(b=>b.alive).length};
  });
  const Sh=report.shoot;
  assert.ok(Sh.hit>0,'a bullet through the bomb damages it');assert.ok(!Sh.alive&&Sh.score===250&&Sh.kills===1&&!Sh.parent,'down: '+JSON.stringify(Sh));
  assert.ok(/FLYING BOMB DOWN/.test(Sh.radio)&&/V-1 DOWN [1-9]/.test(Sh.text),'radio/text: '+Sh.radio+' / '+Sh.text);
  // a bomb that nobody stops leaves the area; destroying the ramp ends the launches; the sortie is then complete
  report.end=await page.evaluate(()=>{
   const t=siteRecs.find(s=>s.kind==='ramp'),p=t.group.position;
   for(let i=0;i<3000;i++)updateSites(.05);   // 150 s: bombs fly on and leave
   const through=buzzThrough,launchedBefore=buzzLaunched;
   damageTarget(t,99,false);
   const wreck=t.group.getObjectByName('Wreck').scale.toArray(),intact=t.group.getObjectByName('Intact').visible;
   for(let i=0;i<4000;i++)updateSites(.05);
   for(let i=0;i<60;i++)updateEuropeOperation(.1);   // the operation phases advance once everything is clear
   checkObjective();const dbg={missionOver,free:isFree(),ready:europeOps?europeOps.ready():null,air:blockingEnemyAir().length,left:objectiveLeft()};
   return {dbg,through,launchedBefore,launchedAfter:buzzLaunched,wreck,intact,left:objectiveLeft(),rtb:P.rtb,leftover:buzzBombs.filter(b=>b.alive).length,kills:{...sortieKills}};
  });
  const En=report.end;
  assert.ok(En.through>=1,'bombs that nobody stops fly out of the area: '+En.through);assert.equal(En.launchedAfter,En.launchedBefore,'no launches once the ramp is down');
  assert.ok(En.wreck.every(v=>v===1)&&!En.intact,'the wreck replaces the ramp');assert.deepEqual(En.left,{},'the objective is complete');assert.equal(En.kills.ramp,1);
  assert.ok(En.rtb,'return to base is called: '+JSON.stringify(En.dbg));

  // ---- 4b. the depot sortie: the eight stores burn in chains ----
  const dIdx=await start('depot');
  report.depot=await page.evaluate(()=>{
   const parts=siteRecs.filter(t=>t.part),kinds={};for(const t of parts)kinds[t.kind]=(kinds[t.kind]||0)+1;
   const exp=parts.filter(t=>t.chain);
   const minGap=Math.min(...parts.flatMap((a,i)=>parts.slice(i+1).map(b=>Math.hypot(a.group.position.x-b.group.position.x,a.group.position.z-b.group.position.z))));
   const c=parts.reduce((o,t)=>({x:o.x+t.group.position.x/parts.length,z:o.z+t.group.position.z/parts.length}),{x:0,z:0});
   const spread=Math.max(...parts.map(t=>Math.hypot(t.group.position.x-c.x,t.group.position.z-c.z)));
   return {index:MISSIONS.findIndex(m=>m.id==='depot'),count:MISSIONS.length,kinds,n:parts.length,exp:exp.length,primary:parts.filter(t=>t.primary).map(t=>t.kind).sort(),optional:parts.filter(t=>t.optionalSite).length,
    fallback:parts.some(t=>t.usedFallback),left:objectiveLeft(),text:objectiveText(),checkpointTargets:targets.filter(t=>!t.optionalSite).length,minGap,spread,
    airfieldGap:Math.min(Math.hypot(c.x-GERMAN_AF_X,c.z-GERMAN_AF_Z),Math.hypot(c.x-ALLIED_AF_X,c.z-ALLIED_AF_Z)),
    dry:parts.every(t=>!livingWorld._pointOnWater(t.group.position.x,t.group.position.z)),
    ground:Math.max(...parts.map(t=>Math.abs(t.group.position.y-terrain.getRenderedHeight(t.group.position.x,t.group.position.z)))),
    wrecksHidden:parts.every(t=>{const w=t.group.getObjectByName(t.part+'_Wreck'),i=t.group.getObjectByName(t.part+'_Intact');return w&&i&&i.visible&&w.scale.x===0;}),
    tops:Object.fromEntries(parts.map(t=>[t.kind,targetTop(t)])),plan:(()=>{const p=sitePlan(M());return !!p.depot;})(),
    marker:europeBriefTargets(M()).some(o=>/dump/.test(o.label))};
  });
  const Dp=report.depot;
  assert.equal(Dp.index,23);assert.equal(Dp.count,32,'the depot sortie appends after the V-1 sortie (the Storch, Night Hunt and Storch-sortie entries follow it: 29 in all)');assert.ok(Dp.plan,'a spot was found for the dump');
  assert.deepEqual(Dp.kinds,{depotTank:2,depotDrums:3,depotCrates:3,depotNet:1,depotHut:2,depotBerm:2});
  assert.equal(Dp.exp,8);assert.deepEqual(Dp.primary,['depotCrates','depotCrates','depotCrates','depotDrums','depotDrums','depotDrums','depotTank','depotTank']);assert.equal(Dp.optional,5);
  assert.ok(!Dp.fallback,'real models');assert.deepEqual(Dp.left,{depot:6});assert.ok(/STORES 6/.test(Dp.text),Dp.text);assert.equal(Dp.checkpointTargets,8,'the eight stores are part of a checkpoint');
  assert.ok(Dp.minGap>2.5,'parts do not overlap: '+Dp.minGap);assert.ok(Dp.spread<30,'one compact dump: '+Dp.spread);assert.ok(Dp.airfieldGap>2500);assert.ok(Dp.dry);assert.ok(Dp.ground<.5,'ground-fitted: '+Dp.ground);
  assert.ok(Dp.wrecksHidden,'each part has its own hidden wreck');assert.ok(Dp.marker,'the dump is marked on the briefing map');assert.equal(Dp.tops.depotTank,4.2);
  // chain reaction: one tank, then the clock runs
  report.chain=await page.evaluate(()=>{
   const parts=siteRecs.filter(t=>t.part),tanks=parts.filter(t=>t.kind==='depotTank'),tankA=tanks[0],tankB=tanks[1],berms=parts.filter(t=>t.kind==='depotBerm');
   const p=tankA.group.position;P.alive=true;P.hull=100;state=ST.FLIGHT;P.pos.set(p.x+900,groundY(p.x+900,p.z)+700,p.z);radioQ.length=0;
   const s0=score;damageTarget(berms[0],99,true);const bermAfterGun=berms[0].alive;
   damageTarget(tankA,99,false);
   const queued=siteChainQ.length,tAfter0=parts.filter(t=>t.alive).length;
   const log=[];for(let i=0;i<120;i++){updateSites(.05);if(i%20===19)log.push(parts.filter(t=>t.alive).length);}
   const wreckShown=parts.filter(t=>!t.alive).every(t=>{const w=t.group.getObjectByName(t.part+'_Wreck'),i=t.group.getObjectByName(t.part+'_Intact');return w.scale.x===1&&!i.visible;});
   return {bermAfterGun,queued,tAfter0,log,tankBAlive:tankB.alive,tankBhp:tankB.hp,kills:sortieKills.depot||0,left:objectiveLeft(),bermsAlive:berms.every(t=>t.alive),wreckShown,
    others:parts.filter(t=>!t.chain&&t.kind!=='depotBerm').map(t=>[t.kind,t.alive]),score:score-s0,radio:radioQ.join('|'),hull:P.hull};
  });
  const Ch=report.chain;
  assert.ok(Ch.bermAfterGun,'an earth berm shrugs off gun fire');assert.ok(Ch.queued>=5,'the dump is set off in a chain: '+Ch.queued);assert.equal(Ch.tAfter0,12,'nothing else goes up in the same instant');
  assert.ok(Ch.log[Ch.log.length-1]<Ch.log[0]&&Ch.log[0]<12||Ch.log[0]<=12,'it burns down over a few seconds: '+Ch.log);
  assert.ok(Ch.kills>=6&&Object.keys(Ch.left).length===0,'six or more stores gone from one hit: '+Ch.kills);assert.ok(Ch.tankBhp<4,'the second tank is hit by the blast too: '+Ch.tankBhp);
  assert.ok(Ch.bermsAlive,'berms are not chained');assert.ok(Ch.others.every(([,alive])=>!alive),'nets and huts around the blast are gone: '+JSON.stringify(Ch.others));
  assert.ok(Ch.wreckShown,'every destroyed part shows its own wreck');assert.ok(/DUMP IS BURNING/.test(Ch.radio),Ch.radio);assert.equal(Ch.hull,100,'a high aeroplane is not hurt');
  // a low aeroplane directly over a tank is hurt by the fireball; one far above is not
  await start('depot');
  report.dumpLow=await page.evaluate(()=>{
   const tankB=siteRecs.find(t=>t.kind==='depotTank'&&t.alive),p=tankB.group.position;
   P.alive=true;P.onGround=false;P.hull=100;P.pos.set(p.x+10,groundY(p.x+10,p.z)+40,p.z);radioQ.length=0;damageTarget(tankB,99,false);
   return {hull:P.hull,radio:radioQ.join('|')};
  });
  assert.ok(report.dumpLow.hull<100&&/FIREBALL/.test(report.dumpLow.radio),'low over the dump: '+JSON.stringify(report.dumpLow));
  // the sortie completes: objective met, return to base
  report.depotEnd=await page.evaluate(()=>{for(let i=0;i<60;i++){updateSites(.1);updateEuropeOperation(.1);}checkObjective();return {rtb:P.rtb,left:objectiveLeft(),kills:sortieKills.depot||0,alive:siteRecs.filter(t=>t.part).map(t=>t.kind+':'+t.alive),q:siteChainQ.length};});
  assert.ok(report.depotEnd.rtb&&Object.keys(report.depotEnd.left).length===0,'objective met: return to base is called');

  // ---- 3. the plan is deterministic, missions clean up, restored checkpoints find the same sites ----
  report.again=await page.evaluate(()=>{
   const m=M(),a=JSON.stringify(sitePlan(m));delete sitePlanCache[m.id];const b=JSON.stringify(sitePlan(m));
   const nodes=siteRecs.map(s=>s.group);
   const idx=MISSIONS.findIndex(x=>x.id==='free');selectedMission=idx;briefPlan=chooseEuropePlan(idx);startMission(idx);finishLaunchIntro(false);
   return {same:a===b,after:siteRecs.length,orphans:nodes.filter(g=>g.parent).length,beams:scene.children.filter(o=>o.material&&o.material.blending===THREE.AdditiveBlending&&o.geometry===siteBeamGeo).length};
  });
  assert.ok(report.again.same,'the site plan is deterministic per mission');assert.equal(report.again.after,0);assert.equal(report.again.orphans,0,'old site models leave the scene');assert.equal(report.again.beams,0);
  // ---- 5. a saved V-1 sortie comes back with the ramp where it was: damaged-alive and destroyed (wreck swapped in) ----
  report.checkpoint=[];
  for(const kill of [false,true]){
   await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=sites&surprises=off');
   await page.waitForFunction(()=>state===ST.MENU&&realWorldReady&&window.sortieCheckpoint?.ready,null,{polling:200});
   const before=await page.evaluate(async kill=>{
    renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;await ensureModel('p47');await ensureModel('bf109');
    const index=MISSIONS.findIndex(m=>m.id==='buzz');diffIdx=1;selectedMission=index;briefPlan=chooseEuropePlan(index);startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);
    state=ST.FLIGHT;P.alive=true;P.onGround=false;const t=siteRecs.find(s=>s.kind==='ramp'),p=t.group.position;
    P.pos.set(p.x-3000,groundY(p.x-3000,p.z)+700,p.z);P.spd=85;P.throttle=.6;P.heading=0;P.fuel=80;
    if(kill)damageTarget(t,99,false);else{t.hp=3;}
    const saved=window.sortieCheckpoint.save();if(!saved.ok)throw Error('save failed '+JSON.stringify(saved));
    return {x:p.x,z:p.z,hp:t.hp,alive:t.alive,score,kills:{...sortieKills}};
   },kill);
   await page.reload();
   await page.waitForFunction(()=>state===ST.MENU&&realWorldReady&&window.sortieCheckpoint?.ready,null,{polling:200});
   await page.locator('#continueFlight').click();
   await page.waitForFunction(()=>state===ST.PAUSED&&!window.sortieCheckpoint.restoring,null,{polling:200});
   const after=await page.evaluate(async()=>{
    const t=siteRecs.find(s=>s.kind==='ramp'),p=t.group.position,g=t.group;
    const ws=g.getObjectByName('Wreck').scale.toArray(),intact=g.getObjectByName('Intact').visible;
    return {x:p.x,z:p.z,hp:t.hp,alive:t.alive,score,kills:{...sortieKills},wreck:ws,intact,sites:siteRecs.length,targets:targets.length,primary:t.primary,launchedAtRestore:buzzLaunched};
   });
   assert.ok(Math.abs(after.x-before.x)<1e-6&&Math.abs(after.z-before.z)<1e-6,'the ramp stands in the same place after the reload');
   assert.equal(after.alive,before.alive);assert.equal(after.hp,before.hp);assert.equal(after.score,before.score,'no award is replayed');assert.deepEqual(after.kills,before.kills);
   assert.equal(after.primary,true);assert.equal(after.targets,1);
   if(kill){assert.ok(after.wreck.every(v=>v===1)&&!after.intact,'the destroyed ramp is shown as its wreck');}
   else {assert.ok(after.wreck.every(v=>v===0)&&after.intact,'the damaged ramp is still intact');}
   // after Resume: an intact ramp keeps launching, a destroyed one does not
   await page.locator('#pmResume').click();
   const run=await page.evaluate(()=>{const t=siteRecs.find(s=>s.kind==='ramp');P.pos.set(t.group.position.x-3000,groundY(t.group.position.x-3000,t.group.position.z)+700,t.group.position.z);
    for(let i=0;i<2400;i++)updateSites(.05);return {launched:buzzLaunched};});
   if(kill)assert.equal(run.launched,0,'a destroyed ramp launches nothing after the restore');else assert.ok(run.launched>=3,'an intact ramp keeps launching after the restore: '+run.launched);
   report.checkpoint.push({kill,before,after:{hp:after.hp,alive:after.alive,wreck:after.wreck},launched:run.launched});
  }

  // ---- 6. a saved depot sortie: the eight stores come back with their hp / wrecks (the chain in flight and the optional parts are not saved) ----
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=sites&surprises=off');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady&&window.sortieCheckpoint?.ready,null,{polling:200});
  const dBefore=await page.evaluate(async()=>{
   renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;await ensureModel('p47');await ensureModel('bf109');await loadMissionSites({depot:true});
   const index=MISSIONS.findIndex(m=>m.id==='depot');diffIdx=1;selectedMission=index;briefPlan=chooseEuropePlan(index);startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);
   state=ST.FLIGHT;P.alive=true;P.onGround=false;
   const parts=siteRecs.filter(t=>t.part&&t.primary),tanks=parts.filter(t=>t.kind==='depotTank'),drums=parts.filter(t=>t.kind==='depotDrums'),p=tanks[0].group.position;
   P.pos.set(p.x-3000,groundY(p.x-3000,p.z)+700,p.z);P.spd=85;P.throttle=.6;P.heading=0;P.fuel=80;
   damageTarget(tanks[0],99,false);drums[1].hp=.7;
   const saved=window.sortieCheckpoint.save();if(!saved.ok)throw Error('save failed '+JSON.stringify(saved));
   return {state:parts.map(t=>[t.kind,t.alive,+t.hp.toFixed(3),+t.group.position.x.toFixed(3),+t.group.position.z.toFixed(3)]),score,kills:{...sortieKills},n:siteRecs.length};
  });
  await page.reload();
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady&&window.sortieCheckpoint?.ready,null,{polling:200});
  await page.locator('#continueFlight').click();
  await page.waitForFunction(()=>state===ST.PAUSED&&!window.sortieCheckpoint.restoring,null,{polling:200});
  const dAfter=await page.evaluate(()=>{
   const parts=siteRecs.filter(t=>t.part&&t.primary);
   return {state:parts.map(t=>[t.kind,t.alive,+t.hp.toFixed(3),+t.group.position.x.toFixed(3),+t.group.position.z.toFixed(3)]),score,kills:{...sortieKills},n:siteRecs.length,targets:targets.filter(t=>!t.optionalSite).length,
    wrecks:parts.map(t=>{const w=t.group.getObjectByName(t.part+'_Wreck'),i=t.group.getObjectByName(t.part+'_Intact');return [t.alive,w.scale.x,i.visible];}),fallback:siteRecs.some(t=>t.usedFallback),queue:siteChainQ.length};
  });
  assert.deepEqual(dAfter.state,dBefore.state,'the eight stores stand where they stood, with the same hp');
  assert.equal(dAfter.score,dBefore.score,'no award is replayed');assert.deepEqual(dAfter.kills,dBefore.kills);assert.equal(dAfter.targets,8,'only the stores are restored from the checkpoint');
  assert.equal(dAfter.n,13,'the optional net, huts and berms are rebuilt after Continue');assert.ok(!dAfter.fallback,'real models after the restore');assert.equal(dAfter.queue,0);
  assert.ok(dAfter.wrecks.every(([alive,ws,iv])=>alive?(ws===0&&iv):(ws===1&&!iv)),'a destroyed store is shown as its own wreck, the others are intact: '+JSON.stringify(dAfter.wrecks));
  await page.locator('#pmResume').click();
  const dRun=await page.evaluate(()=>{for(let i=0;i<200;i++)updateSites(.05);return {alive:siteRecs.filter(t=>t.part&&t.primary&&t.alive).length};});
  assert.equal(dRun.alive,7,'nothing else burns by itself after the restore');
  report.depotCheckpoint={before:dBefore,after:dAfter};

  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/sites-browser.json'),JSON.stringify(report,null,1));
  console.log('Sites browser: OK',JSON.stringify({radar:R.distFactory|0,lights:Lg.dist.map(d=>d|0),litAfter:B.litAt,beamDeg:+B.angleDeg.toFixed(2)}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
