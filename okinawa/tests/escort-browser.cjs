/* Build 237: bombers fly with an escort (remagen-mission.html) in the real game.
 * Checked: a bomber sortie without authored fighters gets an optional escort (fewer on Rookie, none for a tiny box on Rookie);
 * authored fighters (enemyAir) of a bomber sortie become the escort of the box and stay objective-blocking; the escorts
 * fly an orbit around the box a little above it while you are far away (20 s at 60 FPS, no NaN, no ground contact);
 * they break away when you come near the box, when a bomber is hit (even from further out), or when you come close to one
 * of them; once released they dogfight with the brain; the optional escorts never hold up the objective.
 * Writes app/release/escort-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Escort WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=escort&surprises=off');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['p47','bf109','me262','me163'].map(ensureModel));renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;});

  // ---- 1. who gets an escort ----
  report.counts=await page.evaluate(()=>{
   const out={};
   for(const [id,diff] of [['boxes',0],['boxes',1],['boxes',2],['komet',0],['komet',1],['libs',1],['jetstrike',1],['jetboxes',1],['jetambush',1],['fighter',1],['free',1]]){
    diffIdx=diff;const index=MISSIONS.findIndex(m=>m.id===id);selectedMission=index;briefPlan=chooseEuropePlan(index);
    startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
    const f=enemyAir.filter(e=>!e.bomber);
    out[id+'/'+D().id]={bombers:enemyAir.filter(e=>e.bomber).length,fighters:f.length,escorts:f.filter(e=>e.escort).length,optional:f.filter(e=>e.optional).length,
     blockingFighters:blockingEnemyAir().filter(e=>!e.bomber).length,modes:[...new Set(f.map(e=>e.mode))].join(',')};
   }
   return out;
  });
  const C=report.counts;
  assert.equal(C['boxes/rookie'].escorts,1,'Rookie: three bombers get one escort '+JSON.stringify(C['boxes/rookie']));
  assert.equal(C['boxes/vet'].escorts,2,'Veteran: two escorts '+JSON.stringify(C['boxes/vet']));
  assert.equal(C['boxes/ace'].escorts,2);
  assert.equal(C['boxes/vet'].optional,2,'the added escorts are optional');assert.equal(C['boxes/vet'].blockingFighters,0,'and do not hold up the objective');
  assert.equal(C['komet/rookie'].escorts,0,'Rookie Komet: no escort');assert.equal(C['komet/vet'].escorts,1);
  for(const id of ['libs','jetstrike','jetboxes','jetambush']){const c=C[id+'/vet'];
   assert.ok(c.bombers>0&&c.fighters>0&&c.escorts===c.fighters&&c.optional===0&&c.blockingFighters===c.fighters,id+': the authored fighters are the escort of the box and still block the objective '+JSON.stringify(c));}
  assert.equal(C['fighter/vet'].escorts,0,'a fighter sweep without bombers has no escort');assert.equal(C['free/vet'].fighters,0);
  assert.ok(Object.values(C).every(c=>!/engage/.test(c.modes)||c.escorts===0),'escorts start in escort mode');

  // ---- 2. they escort while you are far away, 20 s ----
  report.orbit=await page.evaluate(async()=>{
   diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='boxes');selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
   const fps=60,dt=1/fps;clock.getDelta=()=>dt;const render=GameRuntime.render;GameRuntime.render=()=>true;
   const bx=bomberBox(P.pos),esc=enemyAir.filter(e=>e.escort);
   // the player flies away from the box at a distance far beyond the break-away range
   const away=new THREE.Vector3(bx.c.x-bx.c.x,0,0);const dirAway=new THREE.Vector3(Math.sin(bx.lead.heading+Math.PI),0,Math.cos(bx.lead.heading+Math.PI));
   P.onGround=false;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;P.spd=140;P.throttle=.9;setThrottleUI(.9);
   P.pos.copy(bx.c).addScaledVector(dirAway,11000);P.pos.y=bx.c.y+100;P.heading=bx.lead.heading+Math.PI;P.pitch=0;P.roll=0;
   const dist=[],rel=[];let minAgl=1e9,nan=false,released=0;
   for(let i=0;i<fps*20;i++){inputPitch=inputRoll=0;P.fuel=100;P.hull=130;P.pos.y=Math.max(P.pos.y,groundY(P.pos.x,P.pos.z)+300);animate();
    const b=bomberBox(esc[0].pos);if(!b)break;
    if(i%30===0)for(const e of esc){if(!e.alive)continue;dist.push(Math.hypot(e.pos.x-b.c.x,e.pos.z-b.c.z));rel.push(e.pos.y-b.c.y);}
    for(const e of esc){minAgl=Math.min(minAgl,e.pos.y-groundY(e.pos.x,e.pos.z));if(!Number.isFinite(e.pos.x+e.pos.y+e.pos.z))nan=true;}}
   released=esc.filter(e=>!e.escort).length;
   GameRuntime.render=render;
   const modes=[...new Set(esc.map(e=>e.mode))].join(',');
   return {n:esc.length,released,maxDist:+Math.max(...dist).toFixed(0),minRel:+Math.min(...rel).toFixed(0),maxRel:+Math.max(...rel).toFixed(0),minAgl:+minAgl.toFixed(0),nan,modes,
    bombersAlive:enemyAir.filter(e=>e.bomber&&e.alive).length,speeds:esc.map(e=>+e.spd.toFixed(0))};
  });
  const O=report.orbit;
  assert.ok(O.n===2&&O.released===0&&O.modes==='escort','the escorts stay escorts while you are 11 km away '+JSON.stringify(O));
  assert.ok(O.maxDist<2800,'and stay with the box '+O.maxDist);assert.ok(O.minRel>-150&&O.maxRel<700,'a little above it '+O.minRel+'..'+O.maxRel);
  assert.ok(O.minAgl>70&&!O.nan,'never near the ground '+O.minAgl);assert.ok(O.speeds.every(v=>v>60&&v<200),'at a sane speed '+O.speeds);assert.equal(O.bombersAlive,3);

  // ---- 3. you come near the box: they break away; 4. a bomber is hit from afar: they break away; 5. you come close to an escort ----
  report.breakaway=await page.evaluate(async()=>{
   const out={};const fps=60,dt=1/fps;clock.getDelta=()=>dt;const render=GameRuntime.render;GameRuntime.render=()=>true;
   const start=(far)=>{diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='boxes');selectedMission=index;briefPlan=chooseEuropePlan(index);
    startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
    const bx=bomberBox(P.pos),dirAway=new THREE.Vector3(Math.sin(bx.lead.heading+Math.PI),0,Math.cos(bx.lead.heading+Math.PI));
    P.onGround=false;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;P.spd=140;P.throttle=.9;setThrottleUI(.9);
    P.pos.copy(bx.c).addScaledVector(dirAway,far);P.pos.y=bx.c.y+100;P.heading=bx.lead.heading;P.pitch=0;P.roll=0;
    return {bx,esc:enemyAir.filter(e=>e.escort)};};
   const run=(secs)=>{for(let i=0;i<fps*secs;i++){inputPitch=inputRoll=0;P.fuel=100;P.hull=130;P.pos.y=Math.max(P.pos.y,groundY(P.pos.x,P.pos.z)+300);animate();}};
   // 3. fly at the box from 5 km: out of range at first, released when inside 2.8 km
   {const s=start(5200);run(2);out.farStill=s.esc.every(e=>e.escort);let t=0;while(t<40&&s.esc.some(e=>e.escort)){run(1);t++;}out.nearReleasedAfter=t;out.nearRadio=!!escortCalled;
    out.nearDist=+P.pos.distanceTo(bomberBox(P.pos).c).toFixed(0);out.nearModes=[...new Set(s.esc.map(e=>e.mode))].join(',');run(6);out.fight=s.esc.some(e=>e.tac&&typeof e.tac.rng==='function');}
   // 4. a bomber is hit while you are 5.4 km away (inside the alarm range, outside the quiet range)
   {const s=start(5400);run(1);out.quiet=s.esc.every(e=>e.escort);damageEnemyAir(s.bx.lead,1);run(2);out.alarmReleased=s.esc.every(e=>!e.escort);out.alarmFlag=bomberAlarm;}
   // 5. you fly up to one of the escorts: it and its wingman break at once
   {const s=start(9000);run(1);P.pos.copy(s.esc[0].pos).add(new THREE.Vector3(900,-40,0));run(1);out.closeReleased=s.esc.some(e=>!e.escort);}
   GameRuntime.render=render;
   return out;
  });
  const B=report.breakaway;
  assert.ok(B.farStill&&B.nearReleasedAfter>5&&B.nearReleasedAfter<40&&B.nearDist<3200&&!/escort/.test(B.nearModes),'they break away when you come near the box '+JSON.stringify(B));
  assert.ok(B.nearRadio,'with a radio call');assert.ok(B.fight,'and then fight with the brain '+JSON.stringify(B));
  assert.ok(B.quiet&&B.alarmReleased&&B.alarmFlag,'a hit bomber calls them in from further out '+JSON.stringify(B));
  assert.ok(B.closeReleased,'coming close to an escort breaks it away '+JSON.stringify(B));

  // ---- 6. a second bomber wave comes with its own optional escort (the plan event path) ----
  report.wave=await page.evaluate(async()=>{
   const out={};
   for(const diff of [0,1]){diffIdx=diff;const index=MISSIONS.findIndex(m=>m.id==='boxes');selectedMission=index;briefPlan=chooseEuropePlan(index);
    startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
    const before=enemyAir.length;const e={bombers:2,type:'b17'};
    spawnBombers(e.bombers,e.type);const n=D().id==='rookie'?0:Math.max(1,Math.round(e.bombers/2));if(n>0)spawnEnemyAir(n,undefined,{escort:true,optional:true});
    out[D().id]={added:enemyAir.length-before,escorts:enemyAir.slice(before).filter(x=>x.escort).length};}
   return out;
  });
  assert.equal(report.wave.vet.escorts,1);assert.equal(report.wave.rookie.escorts,0);
  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/escort-browser.json'),JSON.stringify(report,null,1));
  console.log('Escort browser: OK',JSON.stringify({counts:Object.keys(report.counts).length,orbit:{maxDist:O.maxDist,rel:[O.minRel,O.maxRel]},breakaway:B.nearReleasedAfter}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
