/* Build 296: Tank Hunt and Armed Patrol in the real Rhine game (plan = briefing, tanks hidden until seen, scatter on a hit, crews fire, patrol points bring contact reports, objective). Writes app/release/hunt-browser.json. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Hunt WebGL: skipped locally (no Chrome).');process.exit(0);}
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
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote']});
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.__intel=true;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=hunt&surprises=off');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  await page.waitForFunction(()=>['panzer4','jagdpanther','tigerGrey','blitz','halftrack'].every(k=>worldVehicles?.templates?.has(k)),null,{polling:500,timeout:300000}).catch(()=>{});
  await page.evaluate(async()=>{await ensureModel('p47');renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;
   window.said=[];const r=radioSay;radioSay=m=>{said.push(m);r(m);};
   window.begin=(id,diff)=>{diffIdx=diff;const i=MISSIONS.findIndex(m=>m.id===id);selectedMission=i;showBrief(i);const brief=(briefPlan.intelAreas||[]).map(a=>({key:a.key,x:a.x,z:a.z,r:a.r}));
    const plan=JSON.parse(JSON.stringify(briefPlan.hunt));startMission(i);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;said.length=0;return {i,brief,plan};};
   window.step=(sec,dt=.05)=>{for(let k=0;k<sec/dt;k++){updateEuropeOperation(dt);updateIntel(dt);updateHunt(dt);updateFlak(dt);updateTracers(dt);}};
   window.hover=(x,z,agl)=>{P.pos.set(x,groundY(x,z)+agl,z);P.onGround=false;P.alive=true;P.hull=1e6;};});

  // ---- Tank Hunt, all three difficulties ----
  for(const [diff,name] of [[0,'rookie'],[1,'veteran'],[2,'ace']]){
   const R=await page.evaluate((diff)=>{const b=begin('hunt',diff),tanks=targets.filter(t=>t.kind==='tank');
    const planned=b.plan.groups.flatMap(g=>g.vehicles);
    const real=tanks.filter(t=>!t.sub.userData.fallback).length,areas=intel.areas();updateHUD();
    return {brief:b.brief,areas:areas.map(a=>({key:a.key,x:a.x,z:a.z,r:a.r})),tanks:tanks.length,planned:planned.length,real,
     samePos:tanks.every((t,k)=>Math.hypot(t.group.position.x-planned[k].x,t.group.position.z-planned[k].z)<1),
     hidden:europeContacts().filter(c=>c.kind==='TANK').length,search:intel.search,nav:document.getElementById('navKind').textContent,obj:document.getElementById('objText').textContent,
     guards:ambushes.filter(a=>a.guard).length,ground:Math.max(...tanks.map(t=>Math.abs(t.group.position.y-groundY(t.group.position.x,t.group.position.z)))),
     wet:tanks.filter(t=>livingWorld._pointOnWater(t.group.position.x,t.group.position.z)).length,
     baseDist:Math.min(...tanks.map(t=>Math.hypot(t.group.position.x-AF_X,t.group.position.z-AF_Z)))|0,
     inside:tanks.map(t=>{const e=intel.entries().find(e=>e.ref===t),a=areas.find(a=>a.key===e.group);return a?Math.hypot(t.group.position.x-a.x,t.group.position.z-a.z)/a.r:9;})};},diff);
   assert.equal(R.tanks,R.planned,name+': every planned tank spawned');assert.ok(R.samePos,name+': at the briefing positions');
   assert.equal(R.tanks,{rookie:5,veteran:6,ace:6}[name],name+': tank count');
   assert.ok(R.search,name+': search mission at every difficulty');assert.equal(R.hidden,0,name+': no tank shown before it is seen');
   assert.deepEqual(R.areas.map(a=>[a.key,Math.round(a.x),Math.round(a.z)]),R.brief.map(a=>[a.key,Math.round(a.x),Math.round(a.z)]),name+': briefing rings = sortie rings');
   assert.ok(R.inside.every(f=>f<=1),name+': every tank inside its ring '+R.inside);
   assert.equal(R.nav,'SEARCH');assert.match(R.obj,/TANKS 4/);
   assert.equal(R.guards,name==='rookie'?0:R.areas.length,name+': guard guns');
   assert.equal(R.wet,0,name+': none on water');assert.ok(R.ground<1.5,name+': on the ground '+R.ground);assert.ok(R.baseDist>3200);
   report[name]=R;
  }
  // spotting: camouflage - the tank is seen later than a truck; seen at 70 % of its own range
  const S=await page.evaluate(()=>{begin('hunt',1);const t=targets.find(t=>t.kind==='tank'),p=t.group.position,e=intel.entries().find(e=>e.ref===t);
   const range=TargetIntel.sightRange(e,intel.level,{vis:intelVisAt(p),agl:300}),truck=TargetIntel.sightRange({size:'small'},intel.level,{vis:intelVisAt(p),agl:300});
   hover(p.x+range*1.3,p.z,300);step(2);const far=intel.known(t);
   hover(p.x+Math.sqrt(Math.max(0,(range*.7)**2-300*300)),p.z,300);step(2);
   return {range:range|0,truck:truck|0,far,near:intel.known(t),radio:said.filter(m=>/TARGET IN SIGHT/.test(m)),firing:t.firing,inFlak:flakUnits.includes(t)};});
  assert.ok(S.range<S.truck,'camouflaged tank seen later than a truck');assert.equal(S.far,false);assert.equal(S.near,'live');
  assert.ok(S.radio.length>=1);assert.ok(S.firing&&S.inFlak,'a found tank crew fires its machine gun');
  report.spot=S;
  // the crew shoots: low pass at 500 m costs hull
  const F=await page.evaluate(()=>{const t=targets.find(t=>t.kind==='tank'&&t.firing),p=t.group.position;hover(p.x+450,p.z,60);P.hull=100;const h0=P.hull;
   let shots=0;const n0=tracers.length;for(let k=0;k<200;k++){P.pos.set(p.x+450,groundY(p.x+450,p.z)+60,p.z);step(.05);shots=Math.max(shots,tracers.length);}
   return {lost:h0-P.hull,shots};});
  assert.ok(F.shots>0,'tracers from the tank');report.fire=F;
  // a kill scatters the rest of the group, the wreck stays (Wreck node shown)
  const K=await page.evaluate(()=>{const t=targets.find(t=>t.kind==='tank'&&t.alive),mates=targets.filter(m=>m.kind==='tank'&&m.alive&&m!==t&&m.groupKey===t.groupKey);
   const before=mates.map(m=>({x:m.group.position.x,z:m.group.position.z}));damageTarget(t,99,false);
   const moving=mates.filter(m=>m.move).length;step(40,.1);
   const moved=mates.map((m,k)=>Math.hypot(m.group.position.x-before[k].x,m.group.position.z-before[k].z)|0);
   const w=t.sub.getObjectByName('Wreck'),intact=t.sub.getObjectByName('IntactMerged');
   return {alive:t.alive,kills:sortieKills.tank,mates:mates.length,moving,moved,wreck:w?w.visible:'darkened',intact:intact?intact.visible:null,radio:said.filter(m=>/BREAKING FOR COVER/.test(m)).length,
     ground:Math.max(0,...mates.map(m=>Math.abs(m.group.position.y-groundY(m.group.position.x,m.group.position.z)))),obj:objectiveText()};});
  assert.equal(K.alive,false);assert.equal(K.kills,1);assert.ok(K.mates===0||K.moving>=1,'the group scatters');
  if(K.mates)assert.ok(K.moved.some(d=>d>=100),'moved at least 100 m '+K.moved);assert.ok(K.ground<1.5);
  assert.match(K.obj,/TANKS 3/);report.kill=K;
  // four kills -> RTB
  const W=await page.evaluate(()=>{for(const t of targets.filter(t=>t.kind==='tank'&&t.alive).slice(0,3))damageTarget(t,99,false);step(1);checkObjective();return {rtb:P.rtb,obj:objectiveText(),ready:europeOps?.ready(),phase:europeOps?.phase()?.id,left:objectiveLeft(),air:blockingEnemyAir().length,over:missionOver};});
  assert.ok(W.rtb,'four tanks: RTB '+JSON.stringify(W));report.done=W;

  // ---- Armed Patrol ----
  for(const [diff,name] of [[0,'rookie'],[2,'ace']]){
   const P0=await page.evaluate((diff)=>{const b=begin('patrol',diff);updateHUD();
    const res={points:b.plan.points.length,targets:targets.filter(t=>t.alive&&t.primary).length,nav:document.getElementById('navKind').textContent,obj:objectiveText(),legs:[]};
    for(let i=0;i<3;i++){const q=hunt.plan.points[i],n0=targets.length,a0=intel.areas().length,e0=enemyAir.length;hover(q.x,q.z,400);step(.5);
     const fresh=targets.slice(n0);
     res.legs.push({leg:hunt.leg,newTargets:fresh.length,kinds:[...new Set(fresh.map(t=>t.kind))],areas:intel.allAreas().filter(a=>/^patrol#/.test(a.key)).length,bandits:enemyAir.length-e0,
      report:said.filter(m=>/CONTACT REPORT/.test(m)).length,hidden:europeContacts().filter(c=>fresh.includes(c.ref)).length,
      ground:Math.max(0,...fresh.map(t=>Math.abs(t.group.position.y-groundY(t.group.position.x,t.group.position.z))))});}
    updateHUD();res.navAfter=document.getElementById('navKind').textContent;
    const fresh=targets.filter(t=>t.patrol&&t.alive);for(const t of fresh.slice(0,4))damageTarget(t,99,false);step(1);checkObjective();
    res.hunt=sortieKills.hunt;res.leg=sortieKills.leg;res.rtb=P.rtb;res.objEnd=objectiveText();return res;},diff);
   assert.equal(P0.points,3);assert.equal(P0.targets,0,name+': nothing known at take-off');assert.equal(P0.nav,'PATROL POINT 1'.split(' ')[0]);
   assert.match(P0.obj,/PATROL POINTS 3/);
   P0.legs.forEach((l,i)=>{assert.equal(l.leg,i+1);assert.ok(l.newTargets>=1,name+' leg '+(i+1)+': a contact report brings targets');assert.equal(l.report,i+1);
    assert.equal(l.areas,i+1,name+': each report has its own search ring '+JSON.stringify(P0.legs));assert.ok(l.ground<1.5);});
   assert.deepEqual([...new Set(P0.legs.flatMap(l=>l.kinds))].sort(),['ambush','lorry','tank'],name+': column, tanks and a flak battery');
   assert.equal(P0.legs[1].bandits,name==='rookie'?0:2,name+': fighters at the second point');
   assert.equal(P0.hunt,4);assert.equal(P0.leg,3);assert.ok(P0.rtb,name+': all done -> RTB '+JSON.stringify([P0.hunt,P0.leg,P0.objEnd]));
   report['patrol_'+name]=P0;
  }
  // checkpoint: not saved in these missions
  report.checkpoint=await page.evaluate(()=>{begin('hunt',1);return sortieCheckpoint&&sortieCheckpoint.canSave?sortieCheckpoint.canSave():'n/a';});
  assert.ok(report.checkpoint===false||report.checkpoint==='n/a');
  assert.deepEqual(errors,[],'page errors');
  fs.writeFileSync(path.join(root,'app/release/hunt-browser.json'),JSON.stringify(report,null,1));
  console.log('Hunt browser: OK',JSON.stringify({tanks:[report.rookie.tanks,report.veteran.tanks,report.ace.tanks],real:report.veteran.real,spot:report.spot,fire:report.fire,kill:report.kill,patrol:report.patrol_ace.legs}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
