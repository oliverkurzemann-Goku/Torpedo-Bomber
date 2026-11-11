/* Build 247: "Bonus Stork" (Rhine, index 24), real game and the real Fi 156 / Opel Blitz GLBs. Three Storches patrol a long stretch of the mapped road (one is the
 * staff Storch, two are liaison flights that cost points); they launch when the player nears the road. The staff Storch sets down on the road when he sees the
 * player (or after 150 s), the crew runs for an Opel truck, the objective moves to the truck, which drives off; shot in the air = bonus; killing the truck or the
 * Storch completes the sortie, a liaison flight costs points, a truck that gets away is "no credit". Writes app/release/storch-browser.json on success. */
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
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=247&surprises=off');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['p47','bf109'].map(ensureModel));await loadMissionSites({storch:true});
   renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;});


  const startM=()=>page.evaluate(()=>{diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='storch');selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;P.alive=true;P.onGround=false;P.pos.set(ALLIED_AF_X,1800,ALLIED_AF_Z);window.said=[];
   const say=radioSay;if(!window.__sayWrapped){window.__sayWrapped=true;radioSay=t=>{said.push(t);say(t);};}
   window.shoot=(t,dmg=1.5,n=6)=>{const p=t.group.position,mesh=new THREE.Mesh(new THREE.SphereGeometry(.2,4,3),new THREE.MeshBasicMaterial());scene.add(mesh);mesh.position.set(p.x,p.y+2,p.z-30);
    bullets.push({mesh,dir:new THREE.Vector3(0,0,1),speed:600,life:2,dmg});for(let i=0;i<n;i++)updateBullets(.05);};
   window.step=(sec,keep=true)=>{for(let i=0;i<Math.round(sec/.05);i++){if(keep){P.alive=true;state=ST.FLIGHT;P.onGround=false;}updateSites(.05);}};
   return index;});

  // ---- 1. set-up: nothing flies yet, the plan is deterministic and the mission is wired in ----
  const idx=await startM();
  const S=await page.evaluate(()=>{
   const run=storchRun,plan=run.plan,q=storchBriefPoint(M());
   return {idx:MISSIONS.findIndex(m=>m.id==='storch'),title:M().title,pending:run.phase,planes:run.planes.length,sites:siteRecs.length,targets:targets.length,text:objectiveText(),
    dist:Math.hypot(plan.startPoint.x-ALLIED_AF_X,plan.startPoint.z-ALLIED_AF_Z),L:plan.L,brief:q,same:storchPlan(M())===plan,kills:M().kills,
    plan:FlightPlans.europe[MISSIONS.findIndex(m=>m.id==='storch')],briefLabels:europeBriefTargets(M()).map(t=>t.label),
    models:[typeof siteTpl.storch,typeof siteTpl.blitz],checkpointCore:targets.filter(t=>!t.optionalSite).length};
  });
  report.setup=S;
  assert.equal(S.idx,24,'appended: older indices unchanged');assert.equal(S.title,'Bonus Stork');assert.equal(S.pending,'pending');assert.equal(S.planes,0);assert.equal(S.sites,0);assert.equal(S.targets,0);
  assert.ok(/FIND THE ROAD/.test(S.text));assert.ok(S.dist>=3500&&S.dist<=13000,'the road starts 3.5-13 km from the strip: '+S.dist);assert.ok(S.L>=1800);assert.ok(S.same,'plan is cached and deterministic');
  assert.deepEqual(S.kills,{storch:1});assert.ok(S.plan&&S.plan.deadline,'FlightPlans.europe[24] exists');assert.ok(S.briefLabels.some(l=>/Staff Storch/.test(l)),'the briefing map marks him: '+S.briefLabels);
  assert.deepEqual(S.models,['object','object'],'both real models are loaded');assert.equal(S.checkpointCore,0);

  // ---- 2. launch when the player nears the road: three Storches, real models, only the staff Storch is a primary target ----
  const L=await page.evaluate(()=>{
   const run=storchRun,sp=run.plan.startPoint;P.pos.set(sp.x+9600,2000,sp.z);P.alive=true;state=ST.FLIGHT;P.onGround=false;
   step(.1);const near=run.phase;
   P.pos.set(sp.x+8400,2000,sp.z);step(.1);
   const rec=a=>({kind:a.t.kind,primary:a.t.primary,opt:a.t.optionalSite,fallback:a.t.usedFallback,free:a.t.free,agl:+(a.t.group.position.y-groundY(a.t.group.position.x,a.t.group.position.z)).toFixed(1),prop:!!a.spin,
     name:a.t.name,hp:a.t.hp,pts:a.t.pts});
   const out={farPhase:near,phase:run.phase,planes:run.planes.map(rec),targets:targets.length,said:said.join('|'),text:objectiveText(),
    primaries:targets.filter(t=>t.primary).length,checkpointCore:targets.filter(t=>!t.optionalSite).length};
   return out;
  });
  report.launch=L;
  assert.equal(L.farPhase,'pending','beyond 9 km nothing starts');assert.equal(L.phase,'cruise');assert.deepEqual(L.planes.map(a=>a.kind),['storch','liaison','liaison']);
  assert.ok(L.planes.every(a=>!a.fallback&&a.opt&&a.free&&a.prop),'real models, not in a checkpoint, propeller found');assert.equal(L.primaries,1,'only the staff Storch is a primary target');
  assert.ok(Math.abs(L.planes[0].agl-34)<4,'the staff Storch flies at tree height: '+L.planes[0].agl);assert.ok(L.planes[1].agl>95&&L.planes[2].agl>120,'the liaison flights fly higher');
  assert.equal(L.planes[1].pts,-600);assert.equal(L.planes[0].pts,1000);assert.ok(/AIRBORNE/.test(L.said));assert.ok(/RED MARKER/.test(L.text));assert.equal(L.checkpointCore,0,'no Storch target is part of a checkpoint');

  // ---- 3. patrol: speed, the road, the turn at the end ----
  const T=await page.evaluate(()=>{
   const run=storchRun,real=run.planes[0],L=run.plan.L,out={L,samples:[],turned:false,minRoad:1e9,maxRoad:-1e9,roadErr:0};
   const far=()=>{P.pos.set(run.plan.startPoint.x+8500,2500,run.plan.startPoint.z);};
   let last=real.t.group.position.clone(),lastInc=storchFold(L,real.d).inc;
   for(let i=0;i<1600;i++){far();step(.05,false);P.alive=true;state=ST.FLIGHT;P.onGround=false;
    const p=real.t.group.position,f=storchFold(L,real.d);out.minRoad=Math.min(out.minRoad,f.road);out.maxRoad=Math.max(out.maxRoad,f.road);
    if(f.inc!==lastInc){out.turned=true;lastInc=f.inc;}
    if(i%100===99){out.samples.push(+(p.distanceTo(last)/5).toFixed(1));last=p.clone();}
    const s=livingWorld._sample(run.plan.route,real.d);out.roadErr=Math.max(out.roadErr,Math.hypot(p.x-s.x,p.z-s.z));}
   out.mode=real.mode;out.alive=real.t.alive;return out;
  });
  report.patrol=T;
  assert.ok(T.turned,'he patrols the road end to end and turns round');assert.ok(T.minRoad>=-1&&T.maxRoad<=T.L+1,'stays on the road');assert.ok(T.maxRoad-T.minRoad>T.L*.6,'and covers most of it: '+(T.maxRoad-T.minRoad));
  assert.ok(T.samples.every(v=>v>31&&v<39),'about 36 m/s: '+T.samples);assert.ok(T.roadErr<.5,'he flies on the road line (the real Storch has no lateral offset): '+T.roadErr);assert.equal(T.mode,'cruise');

  // ---- 4. the staff Storch sees the player: he sets down on the road, the crew runs for the truck, the objective moves to the truck ----
  const D=await page.evaluate(()=>{
   const run=storchRun,real=run.planes[0],p=real.t.group.position;
   // wait until there is road ahead of him (he never lands in the last 380 m)
   for(let i=0;i<400&&(()=>{const f=storchFold(run.plan.L,real.d);return (f.inc?run.plan.L-f.road:f.road)<500;})();i++){P.pos.set(p.x+9000,2500,p.z);step(.05,false);}
   P.pos.set(p.x+900,p.y+120,p.z);P.alive=true;state=ST.FLIGHT;P.onGround=false;said.length=0;
   updateSites(.05);const afterSeen={mode:real.mode,said:said.join('|')};
   const log=[];let spawnDist=null;
   for(let i=0;i<560;i++){P.pos.set(p.x+900,p.y+120,p.z);updateSites(.05);if(run.car&&spawnDist===null)spawnDist=+run.car.group.position.distanceTo(p).toFixed(1);if(i%40===0)log.push([real.mode,run.phase,+(p.y-groundY(p.x,p.z)).toFixed(1)]);}
   return {spawnDist,afterSeen,mode:real.mode,phase:run.phase,aglStopped:+(p.y-groundY(p.x,p.z)).toFixed(2),roadLift:LivingWorld.ROAD_LIFT,log,
    car:run.car&&{kind:run.car.kind,primary:run.car.primary,opt:run.car.optionalSite,fallback:run.car.usedFallback,dist:+run.car.group.position.distanceTo(p).toFixed(1),intact:!!run.car.group.getObjectByName('Intact'),wreckScale:run.car.group.getObjectByName('Wreck').scale.toArray()},
    storchKind:real.t.kind,storchPrimary:real.t.primary,text:objectiveText(),said:said.join('|'),figs:run.figs&&run.figs.map(f=>f.visible)};
  });
  report.landing=D;
  assert.equal(D.afterSeen.mode,'land','he sets down at once when he sees the player');assert.ok(/SEEN YOU/.test(D.afterSeen.said));
  assert.equal(D.mode,'stopped');assert.ok(Math.abs(D.aglStopped-D.roadLift)<.25,'he stands on the road surface (1.4 m above the terrain): '+D.aglStopped);
  assert.ok(D.car&&D.car.kind==='staffcar'&&D.car.primary&&D.car.opt&&!D.car.fallback,'the truck appears as the new primary target: '+JSON.stringify(D.car));assert.ok(D.spawnDist>25&&D.spawnDist<45,'it waits about 34 m away: '+D.spawnDist);
  assert.ok(D.car.intact&&D.car.wreckScale.every(v=>v===0),'the truck model carries its hidden wreck');
  assert.equal(D.phase,'drive');assert.equal(D.storchKind,'storchEmpty','the abandoned Storch is no longer the target');assert.ok(!D.storchPrimary);assert.ok(/STAFF CAR/.test(D.text));assert.ok(/OPEL TRUCK/.test(D.said)&&/IN THE TRUCK/.test(D.said));
  assert.ok(D.figs&&D.figs.every(v=>v===false),'the crew has boarded');

  // ---- 5. the truck drives off along the road; the abandoned Storch gives no credit; killing the truck completes the sortie ----
  const E=await page.evaluate(()=>{
   const run=storchRun,real=run.planes[0],car=run.car,p0=car.group.position.clone();
   step(10);const moved=car.group.position.distanceTo(p0);
   const y=car.group.position.y-groundY(car.group.position.x,car.group.position.z);
   const kills0=sortieKills.storch||0,s0=score;shoot(real.t,3);const abandoned={dead:!real.t.alive,kills:sortieKills.storch||0,score:score-s0};
   const s1=score;shoot(car,2.5);
   const w=car.group.getObjectByName('Wreck'),i=car.group.getObjectByName('Intact');
   return {moved:+moved.toFixed(1),y:+y.toFixed(2),abandoned,carDead:!car.alive,kills:sortieKills.storch||0,score:score-s1,wreck:w.scale.toArray(),intact:i.visible,left:objectiveLeft(),text:objectiveText(),rtb:P.rtb,said:said.join('|')};
  });
  report.car=E;
  assert.ok(E.moved>85&&E.moved<115,'the truck drives at about 10 m/s: '+E.moved);assert.ok(Math.abs(E.y-1.4)<.3,'on the road surface: '+E.y);
  assert.ok(E.abandoned.dead&&E.abandoned.kills===0,'shooting the abandoned Storch gives no credit: '+JSON.stringify(E.abandoned));assert.equal(E.abandoned.score,150);
  assert.ok(E.carDead&&E.kills===1&&E.score===800,'the truck is the objective: '+JSON.stringify([E.kills,E.score]));assert.ok(E.wreck.every(v=>v===1)&&!E.intact,'the wreck is swapped in');assert.deepEqual(E.left,{});assert.ok(/RTB/.test(E.text),E.text);

  // ---- 6. a kill in the air: bonus, he falls, wreck, no truck ----
  await startM();
  const F=await page.evaluate(()=>{
   const run=storchRun,sp=run.plan.startPoint;P.pos.set(sp.x+8400,2000,sp.z);step(.1);const real=run.planes[0];
   P.pos.set(sp.x+8400,2000,sp.z);step(2,false);P.alive=true;state=ST.FLIGHT;P.onGround=false;
   const s0=score;said.length=0;shoot(real.t,3,8);
   const afterShot={alive:real.t.alive,falling:!!real.falling,kills:sortieKills.storch||0,score:score-s0,said:said.join('|')};
   step(8,false);P.alive=true;state=ST.FLIGHT;
   const p=real.t.group.position,agl=p.y-groundY(p.x,p.z);
   return {afterShot,landed:!real.falling,agl:+agl.toFixed(2),phase:run.phase,car:!!run.car,intactShown:real.t.group.getObjectByName('Propeller')?true:false,left:objectiveLeft(),text:objectiveText()};
  });
  report.air=F;
  assert.ok(!F.afterShot.alive&&F.afterShot.falling&&F.afterShot.kills===1,'killed in the air: '+JSON.stringify(F.afterShot));assert.equal(F.afterShot.score,1500,'1000 points plus the 500 air bonus');assert.ok(/STAFF STORCH DOWN IN THE AIR/.test(F.afterShot.said));
  assert.ok(F.landed&&F.agl<2,'the wreck has hit the road: '+F.agl);assert.ok(!F.car&&F.phase==='cruise','no truck appears: '+F.phase);assert.deepEqual(F.left,{});

  // ---- 7. a liaison flight: first hit warns and costs 150, a kill costs 600 more, no credit ----
  await startM();
  const G=await page.evaluate(()=>{
   const run=storchRun,sp=run.plan.startPoint;P.pos.set(sp.x+8400,2000,sp.z);step(.1);const dec=run.planes[1];
   const s0=score;said.length=0;shoot(dec.t,1.2,4);const hit={score:score-s0,alive:dec.t.alive,said:said.join('|')};
   const s1=score;shoot(dec.t,3,4);step(8,false);P.alive=true;state=ST.FLIGHT;
   return {hit,kill:{score:score-s1,alive:dec.t.alive,kills:sortieKills.storch||0,said:said.join('|')},left:objectiveLeft(),flash:document.getElementById('flash')?.textContent||''};
  });
  report.decoy=G;
  assert.ok(G.hit.alive&&G.hit.score===-150&&/LIAISON FLIGHT/.test(G.hit.said),'the first hit warns: '+JSON.stringify(G.hit));
  assert.ok(!G.kill.alive&&G.kill.score===-600&&G.kill.kills===0,'a kill costs 600 and counts for nothing: '+JSON.stringify(G.kill));assert.ok(/PENALTY 600/.test(G.kill.said));assert.deepEqual(G.left,{storch:1});

  // ---- 8. nobody comes: he lands by himself after 150 s; a truck that gets away is "no credit" and the pilot may go home ----
  await startM();
  const H=await page.evaluate(()=>{
   const run=storchRun,sp=run.plan.startPoint;P.pos.set(sp.x+8400,2000,sp.z);step(.1);const real=run.planes[0];
   const far=()=>{P.pos.set(sp.x+8800,2500,sp.z);};
   let t=0;while(real.mode==='cruise'&&t<400){far();step(.5,false);t+=.5;}
   const landedAt=run.flown;
   while(run.phase!=='drive'&&t<500){far();step(.5,false);t+=.5;}
   const drive=run.phase;let carT=0;
   while(!run.escaped&&carT<260){far();step(.5,false);carT+=.5;}
   return {landedAt:+landedAt.toFixed(0),drive,escaped:run.escaped,carT:+carT.toFixed(0),rtb:P.rtb,text:objectiveText(),carVisible:run.car.group.visible,carAlive:run.car.alive,kills:sortieKills.storch||0,said:said.join('|')};
  });
  report.escape=H;
  assert.ok(H.landedAt>=150&&H.landedAt<170,'he lands by himself after 150 s of flying: '+H.landedAt);assert.equal(H.drive,'drive');assert.ok(H.escaped,'the truck gets away');assert.ok(H.carT>10&&H.carT<=222,'after '+H.carT+' s');
  assert.ok(H.rtb&&/ESCAPED/.test(H.text)&&!H.carVisible&&!H.carAlive&&H.kills===0&&/OFFICER GOT AWAY/.test(H.said));

  // ---- 9. a mission change leaves nothing behind ----
  const Z=await page.evaluate(()=>{const i=MISSIONS.findIndex(m=>m.id==='convoy');selectedMission=i;briefPlan=chooseEuropePlan(i);startMission(i);finishLaunchIntro(false);state=ST.FLIGHT;
   return {run:storchRun===null,sites:siteRecs.length,storchSprites:scene.children.filter(o=>o.userData&&o.userData.storchFig).length,planes:targets.filter(t=>t.storch).length};});
  assert.ok(Z.run&&Z.sites===0&&Z.planes===0);
  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/storch-browser.json'),JSON.stringify(report,null,1));
  console.log('Storch WebGL: OK',JSON.stringify({land:H.landedAt,air:F.afterShot.score,decoy:G.kill.score}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
