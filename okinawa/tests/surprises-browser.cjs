/* Build 231: the Rhine surprise events in the real game (remagen-mission.html) - hidden flak, the flak trap at the
 * target, the rifle squad, the fighters out of the sun and the ammunition truck. Checked: hidden until they open fire
 * (not in targets / flakUnits / minimap before), they really shoot, they never count for an objective, the fighters do
 * not hold up the return, the blast hurts when close, difficulty changes the guns, nothing survives a restart, the
 * checkpoint layout ignores them, and ?surprises=off switches everything off.
 * Writes app/release/surprises-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Surprises WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
const GAMES=process.env.GAME_TEST_RHINE_ONLY?['rhine']:process.env.GAME_TEST_PACIFIC_ONLY?['pac']:['pac','rhine'];
if(process.env.GAME_TEST_PACIFIC_ONLY){console.log('Rhine surprises: skipped (Pacific only).');process.exit(0);}

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote','--in-process-gpu']});
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  const base='http://127.0.0.1:'+server.address().port+'/remagen-mission.html?';
  await page.goto(base+'&v=surprises');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['p47','bf109'].map(ensureModel));renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;});
  for(const diff of [0,1,2]){
   report['diff'+diff]=await page.evaluate(async diff=>{
    diffIdx=diff;
    const index=MISSIONS.findIndex(m=>m.id==='convoy');
    startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
    for(const e of enemyAir)e.alive=false;
    const r={level:D().id,have:!!surprises};
    // in the air, low, heading east, near the first primary target
    const prim=targets.find(t=>t.primary);
    P.onGround=false;P.gear=P.gearTgt=0;P.spd=130;P.throttle=.8;P.heading=Math.PI/2;P.pitch=0;P.roll=0;
    P.pos.set(prim.group.position.x-3600,groundY(prim.group.position.x-3600,prim.group.position.z)+180,prim.group.position.z);
    const ctx=()=>surpriseContext();
    const killsBefore=JSON.stringify(sortieKills),leftBefore=JSON.stringify(objectiveLeft());
    // --- hidden flak
    r.f1=surprises.force('hiddenFlak',ctx());
    const a=ambushes[0];
    r.hidden={n:ambushes.length,visible:a.group.visible,inTargets:targets.includes(a.t),inFlak:flakUnits.includes(a.t),kind:a.t.kind,coolBase:+a.t.coolBase.toFixed(2),spread:+a.t.spread.toFixed(2),trigger:a.trigger};
    r.ahead=Math.hypot(a.x-P.pos.x,a.z-P.pos.z);
    r.dry=!livingWorld._pointOnWater(a.x,a.z);
    // fly up to it: it opens fire
    P.pos.set(a.x-700,groundY(a.x-700,a.z)+150,a.z);P.heading=Math.PI/2;
    const tr0=tracers.length;
    updateSurprises(.016);
    r.revealed={visible:a.group.visible,inTargets:targets.includes(a.t),inFlak:flakUnits.includes(a.t)};
    for(let i=0;i<120;i++){updateFlak(.016);updateTracers(.016);}
    r.shots=tracers.length-tr0;
    // kill it: it must not count for the flak objective
    damageTarget(a.t,99,true);
    r.killed={alive:a.t.alive,inFlak:flakUnits.includes(a.t),kills:JSON.stringify(sortieKills)===killsBefore,left:JSON.stringify(objectiveLeft())===leftBefore,score:score>0};
    // --- the trap at the target
    const nAmb=ambushes.length;
    P.pos.set(prim.group.position.x-2400,groundY(prim.group.position.x-2400,prim.group.position.z)+220,prim.group.position.z);
    r.trapReady=surprises.lvl&&surpriseContext().primaryDist;
    r.f2=surprises.force('trap',surpriseContext());
    const trap=ambushes.slice(nAmb);
    r.trap={n:trap.length,near:trap.every(t=>Math.hypot(t.x-prim.group.position.x,t.z-prim.group.position.z)<=310),hidden:trap.every(t=>!t.revealed&&!targets.includes(t.t))};
    // --- infantry
    const nA2=ambushes.length;
    r.f3=surprises.force('infantry',surpriseContext());
    const sq=ambushes[nA2];
    r.squad={kind:sq.t.kind,figures:sq.group.children.filter(c=>c.userData.figure).length,hidden:!sq.group.visible};
    P.pos.set(sq.x-500,groundY(sq.x-500,sq.z)+60,sq.z);P.heading=Math.PI/2;
    updateSurprises(.016);
    const trc=tracers.length;
    for(let i=0;i<200;i++){updateFlak(.016);}
    r.squadFire={revealed:sq.revealed,tracers:tracers.length-trc,damages:tracers.slice(trc).map(t=>t.damage).filter(d=>d!=null).slice(0,6)};
    damageTarget(sq.t,99,true);
    r.squadKilled={alive:sq.t.alive,figuresHidden:sq.group.children.filter(c=>c.userData.figure).every(c=>!c.visible)};
    // --- fighters out of the sun
    const air0=enemyAir.filter(e=>e.alive).length,block0=blockingEnemyAir().length;
    r.f4=surprises.force('bounce',surpriseContext());
    const fresh=enemyAir.filter(e=>e.surprise);
    r.bounce={n:fresh.length,nonBlocking:blockingEnemyAir().length===block0,behind:fresh.every(e=>{const dx=e.pos.x-P.pos.x,dz=e.pos.z-P.pos.z;return dx*Math.sin(P.heading)+dz*Math.cos(P.heading)<-1500;}),high:fresh.every(e=>e.pos.y>P.pos.y+200)};
    // --- the ammunition truck
    const truck=targets.find(t=>t.kind==='truck'&&t.alive);
    P.pos.set(truck.group.position.x-70,groundY(truck.group.position.x-70,truck.group.position.z)+30,truck.group.position.z);
    const hull0=P.hull;let tries=0,ok=false;
    const victim={group:truck.group,kind:'truck'};
    while(!ok&&tries++<80)ok=surprises.trigger('ammoBlast',{victim,dist:70,agl:30});
    for(let i=0;i<20;i++)surprises.update(.1,surpriseContext());
    r.blast={fired:ok,tries,hullLost:+(hull0-P.hull).toFixed(1)};
    // --- the scheduler drives it: 14 flight minutes near the target, wherever it puts things, the counts stay in budget
    startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;for(const e of enemyAir)e.alive=false;
    P.onGround=false;P.gear=P.gearTgt=0;P.spd=130;
    const p2=targets.find(t=>t.primary);
    const nearIt=()=>{P.pos.set(p2.group.position.x-2600,groundY(p2.group.position.x-2600,p2.group.position.z)+220,p2.group.position.z);P.heading=Math.PI/2;P.hull=P.systemDamage?.maxHull||100;};
    for(let t=0;t<840;t+=.05){nearIt();updateSurprises(.05);}
    r.scheduled=surprises.report();
    r.layout=targets.filter(t=>!t.surprise).length;
    // --- a restart leaves nothing behind
    const groups=ambushes.map(a=>a.group);
    startMission(index);finishLaunchIntro(false);
    r.cleanup={ambushes:ambushes.length,inScene:groups.filter(g=>g.parent).length,surpriseTargets:targets.filter(t=>t.surprise).length,flak:flakUnits.filter(t=>t.surprise).length,time:surprises.time,fired:surprises.report().fired.length};
    return r;
   },diff);
   const r=report['diff'+diff];console.log(JSON.stringify(r));
   assert.ok(r.have,'the scheduler exists');
   assert.ok(r.f1&&r.hidden.n===1,'hidden flak placed');
   assert.equal(r.hidden.visible,false,'hidden: not drawn');assert.equal(r.hidden.inTargets,false,'hidden: not on the minimap / nav list');assert.equal(r.hidden.inFlak,false,'hidden: does not shoot yet');
   assert.equal(r.hidden.kind,'ambush');assert.ok(r.ahead>1000&&r.ahead<3600,'placed ahead on the route '+r.ahead);assert.ok(r.dry,'on dry ground');
   assert.equal(r.revealed.visible,true);assert.equal(r.revealed.inTargets,true);assert.equal(r.revealed.inFlak,true,'it opens up when the player is on top of it');
   assert.ok(r.shots>0,'it really shoots ('+r.shots+' tracers)');
   assert.equal(r.killed.alive,false);assert.equal(r.killed.inFlak,false);assert.ok(r.killed.kills,'it does not count as a flak kill for the objective');assert.ok(r.killed.left,'the objective is unchanged');assert.ok(r.killed.score,'but it scores');
   assert.ok(r.f2&&r.trap.n>=1&&r.trap.near&&r.trap.hidden,'the trap around the target '+JSON.stringify(r.trap));
   assert.ok(r.f3&&r.squad.kind==='troops'&&r.squad.figures===6&&r.squad.hidden,'a squad of six, hidden');
   assert.ok(r.squadFire.revealed&&r.squadFire.tracers>0&&r.squadFire.damages.includes(1.6),'small arms: weak tracers '+JSON.stringify(r.squadFire));
   assert.ok(r.squadKilled.alive===false&&r.squadKilled.figuresHidden,'the squad can be strafed');
   assert.ok(r.f4&&r.bounce.n===(diff===0?1:2)&&r.bounce.nonBlocking&&r.bounce.behind&&r.bounce.high,'fighters out of the sun, not blocking the return '+JSON.stringify(r.bounce));
   assert.ok(r.blast.fired&&r.blast.hullLost>0,'the blast hurts when close '+JSON.stringify(r.blast));
   assert.ok(r.scheduled.fired.length>=1&&r.scheduled.fired.length<=[2,3,4][diff],'the scheduler stays in the budget '+JSON.stringify(r.scheduled));
   assert.equal(r.cleanup.ambushes,0);assert.equal(r.cleanup.inScene,0);assert.equal(r.cleanup.surpriseTargets,0);assert.equal(r.cleanup.flak,0);assert.equal(r.cleanup.time,0);assert.equal(r.cleanup.fired,0,'a restart starts a new plan');
  }
  const a0=report.diff0.hidden,a2=report.diff2.hidden;
  assert.ok(a0.coolBase>a2.coolBase&&a0.spread>a2.spread&&a0.trigger<a2.trigger,'the Rookie gun is slower, less accurate and opens up later than the Ace gun '+JSON.stringify([a0,a2]));
  // ?surprises=off
  await page.goto(base+'&surprises=off&v=surprises');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  report.off=await page.evaluate(async()=>{await ensureModel('p47');startMission(MISSIONS.findIndex(m=>m.id==='convoy'));return {surprises:surprises};});
  assert.equal(report.off.surprises,null,'?surprises=off');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'app/release/surprises-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('Surprises browser: OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
