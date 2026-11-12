/* Build 236: your own wingmen on the Rhine sorties (remagen-mission.html + squad.js) in the real game.
 * Checked: which sorties have a section and which stay solo; the wingman waits beside and behind you on the strip,
 * rolls only after you do, lifts off on the same forces (the run is the same at 20/60/120 FPS), pulls the gear up and
 * joins; he attacks a ground target by himself (rockets/guns, never below the safe height); he fights in the air; enemy
 * fighters pick him as a target too; he can be hit and go down; a hurt wingman flies home, lands and taxis off the
 * runway; everything is released on a restart; a checkpoint with a wingman and enemy fighters comes back and flies
 * on (the DogfightAI brain is not part of the save - the old "r is not a function" after Continue); the debrief lists
 * the section. Writes app/release/squad-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Squad WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  const base='http://127.0.0.1:'+server.address().port+'/remagen-mission.html?';
  const boot=async()=>{
   await page.goto(base+'&v=squad&surprises=off');
   await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
   await page.evaluate(async()=>{await Promise.all(['p47','bf109'].map(ensureModel));renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;});
  };
  await boot();

  // ---- 1. which sorties have a section ----
  report.plans=await page.evaluate(()=>{
   diffIdx=1;const out={};
   MISSIONS.forEach((m,i)=>{out[m.id]=Squad.plan(m,{difficulty:D().id,seed:7,side:isGermanMission(m)?'axis':'allied'}).map(s=>s.role).join('+');});
   const rotte=MISSIONS.findIndex(m=>m.id==='rotte');const libs=MISSIONS.findIndex(m=>m.id==='libs');
   return {out,rotte:chooseEuropePlan(rotte).squad.length,libs:chooseEuropePlan(libs).squad.length,count:MISSIONS.length,
    brief:(()=>{const i=MISSIONS.findIndex(m=>m.id==='convoy');selectedMission=i;briefPlan=chooseEuropePlan(i);showBrief(i);return document.documentElement.innerHTML.includes('<b>FLIGHT</b>');})()};
  });
  for(const id of ['free','circ','train','factory','bridge','komet','kometdash','nightworks','jetjabo','stuka','jetambush'])assert.equal(report.plans.out[id],'','solo sortie: '+id);
  for(const id of ['convoy','flak','ferry','fighter','boxes','libs','jabo','jetstrike','final','jetboxes','rotte'])assert.ok(report.plans.out[id],'section on '+id);
  assert.equal(report.plans.out.libs,'hunter+cover');assert.equal(report.plans.out.final,'strike+cover');
  assert.equal(report.plans.rotte,1,'the two-ship bonus sortie flies with one wingman');assert.equal(report.plans.libs,2,'a flight of three over the bombers');
  assert.equal(report.plans.count,32,'new sorties are appended: indices stay');
  assert.ok(report.plans.brief,'the briefing names the flight');

  // ---- 2. take-off on the strip at 20 / 60 / 120 FPS ----
  report.takeoff={};
  for(const fps of [20,60,120]){
   report.takeoff[fps]=await page.evaluate(async fps=>{
    diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='rotte');selectedMission=index;briefPlan=chooseEuropePlan(index);
    startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
    for(const e of enemyAir)e.alive=false;
    const w0pos=q=>q.pos.clone();
    const dt=1/fps;clock.getDelta=()=>dt;const render=GameRuntime.render;GameRuntime.render=()=>true;
    P.throttle=1;setThrottleUI(1);
    const w=squad[0],start=w0pos(squad[0]),fwd=new THREE.Vector3(Math.sin(P.heading),0,Math.cos(P.heading)),right=new THREE.Vector3(Math.cos(P.heading),0,-Math.sin(P.heading));
    const rel=w.pos.clone().sub(P.pos);
    const r={n:squad.length,phase0:w.phase,side:Math.abs(rel.dot(right)),back:-rel.dot(fwd),sameKind:w.kind===P.ac,visible:w.group.parent===scene&&w.group.visible,
      gridAgl:w.pos.y-groundY(w.pos.x,w.pos.z)};
    let tMove=null,tRoll=null,tLift=null,tClimb=null,tFly=null,liftDist=null,restedBeforeMove=true,gearAtFly=null,minAgl=1e9,bad=false,lastPhase='grid',sawParked=false;
    for(let i=0;i<fps*80;i++){
     const t=i*dt;
     if(P.onGround&&P.spd>45)inputPitch=.4;
     if(!P.onGround){const a=P.pos.y-groundY(P.pos.x,P.pos.z);inputPitch=a<350?.3:0;P.gearTgt=0;}
     animate();
     if(tMove===null&&P.spd>6)tMove=t;
     if(tMove===null&&(w.phase!=='grid'||w.spd>0.01))restedBeforeMove=false;
     if(tRoll===null&&w.phase==='roll')tRoll=t;
     if(tLift===null&&!P.onGround)tLift=t;
     if(tClimb===null&&w.phase==='climb'){tClimb=t;liftDist=Math.hypot(w.pos.x-start.x,w.pos.z-start.z);r.liftSpeed=w.spd;}
     if(tFly===null&&w.phase==='fly'){tFly=t;gearAtFly=w.gear;}
     if(!Number.isFinite(w.pos.x+w.pos.y+w.pos.z))bad=true;
     if(w.phase!=='grid')minAgl=Math.min(minAgl,w.pos.y-groundY(w.pos.x,w.pos.z));
     if(tFly!==null&&t>tFly+10)break;
    }
    GameRuntime.render=render;
    return {...r,tMove,tRoll,tLift,tClimb,tFly,liftDist,restedBeforeMove,gearAtFly,minAgl:+minAgl.toFixed(1),bad,phase:w.phase,alive:w.alive,
     gap:+w.pos.distanceTo(P.pos).toFixed(0)};
   },fps);
   const r=report.takeoff[fps];
   assert.equal(r.n,1);assert.equal(r.phase0,'grid','waits on the grid');assert.ok(r.sameKind,'same type as the leader');assert.ok(r.visible,'drawn on the strip');
   assert.ok(r.side>=14&&r.side<=40,'beside the leader '+r.side);assert.ok(r.back>=15&&r.back<=60,'behind the leader '+r.back);assert.ok(Math.abs(r.gridAgl-2)<4,'on the ground '+r.gridAgl);
   assert.ok(r.restedBeforeMove,'he does not move before you do');
   assert.ok(r.tRoll!==null&&r.tRoll>=r.tMove&&r.tRoll-r.tMove<4,'he rolls right after you '+JSON.stringify([r.tMove,r.tRoll]));
   assert.ok(r.tClimb!==null&&r.tClimb>r.tRoll,'he lifts off ('+JSON.stringify(r)+')');
   assert.ok(r.liftDist<900,'the take-off run is shorter than the strip '+r.liftDist);
   assert.ok(r.tFly!==null&&r.tFly<75,'he climbs out and joins within 75 s '+r.tFly);assert.ok(r.gearAtFly<.05,'gear up');
   assert.ok(r.minAgl>-1&&!r.bad,'never below the ground, no NaN '+r.minAgl);assert.ok(r.alive);
  }
  for(const fps of [20,120])assert.ok(Math.abs(report.takeoff[fps].liftDist-report.takeoff[60].liftDist)<=report.takeoff[60].liftDist*.08+8,
   'the take-off run is the same at '+fps+' FPS '+JSON.stringify([report.takeoff[fps].liftDist,report.takeoff[60].liftDist]));

  // ---- 3. a ground attack by himself ----
  report.ground=await page.evaluate(async()=>{
   diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='convoy');selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
   for(const e of enemyAir)e.alive=false;
   const fps=60,dt=1/fps;clock.getDelta=()=>dt;const render=GameRuntime.render;GameRuntime.render=()=>true;
   const prim=targets.find(t=>t.primary)||targets[0];
   P.onGround=false;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;P.spd=125;P.throttle=.8;setThrottleUI(.8);
   const tx=prim.group.position.x,tz=prim.group.position.z;
   P.heading=Math.PI/2;P.pitch=0;P.roll=0;P.pos.set(tx-3500,groundY(tx-3500,tz)+260,tz);
   const w=squad[0];
   w.phase='fly';w.task='form';w.gear=0;w.flap=0;w.pos.set(P.pos.x-30,P.pos.y-4,P.pos.z+34);w.heading=P.heading;w.pitch=0;w.roll=0;w.spd=125;w.vel.set(125,0,0);w.core=null;w.slotOffset=null;
   const rockets0=w.rockets,bombs0=w.bombs,ammo0=w.ammo,hp0=targets.map(t=>t.hp),nRockets=[];
   let volleys=0,rocketShots=0,minAgl=1e9,sawGround=false,formErr=[];
   const origB=bullets.push.bind(bullets);bullets.push=(...a)=>{for(const b of a)if(b.by===w.callsign)volleys++;return origB(...a);};
   const origR=rockets.push.bind(rockets);rockets.push=(...a)=>{rocketShots+=a.length;return origR(...a);};
   for(let i=0;i<fps*75;i++){
    inputPitch=0;inputRoll=0;const a=P.pos.y-groundY(P.pos.x,P.pos.z);if(a<200)inputPitch=.2;else if(a>300)inputPitch=-.2;
    P.fuel=100;P.hull=130;animate();
    if(w.alive){minAgl=Math.min(minAgl,w.pos.y-groundY(w.pos.x,w.pos.z));if(w.task==='ground')sawGround=true;if(i>fps*8&&i<fps*14&&w.task==='form')formErr.push(w.pos.distanceTo(P.pos));}
   }
   bullets.push=origB;rockets.push=origR;GameRuntime.render=render;
   const hurt=targets.some((t,i)=>t.hp<hp0[i]-1e-6||!t.alive);
   return {sawGround,volleys,rocketShots,rocketsUsed:rockets0-w.rockets,bombsUsed:bombs0-w.bombs,ammoUsed:ammo0-w.ammo,hurt,kills:sortieKills.truck||0,squadKills:squadStats.kills,
    minAgl:+minAgl.toFixed(0),alive:w.alive,pAlive:P.alive,formMax:formErr.length?+Math.max(...formErr).toFixed(0):null,nan:!Number.isFinite(w.pos.x+w.pos.y+w.pos.z),
    status:squadStatusText()};
  });
  assert.ok(report.ground.sawGround,'he went for the column by himself '+JSON.stringify(report.ground));
  assert.ok(report.ground.rocketsUsed>0||report.ground.ammoUsed>0,'he shot (rockets '+report.ground.rocketsUsed+', rounds '+report.ground.ammoUsed+')');
  assert.ok(report.ground.volleys>0||report.ground.rocketShots>0,'his rounds are real projectiles');
  assert.ok(report.ground.hurt,'the column was hit');assert.ok(report.ground.minAgl>35,'never below the safe height '+report.ground.minAgl);assert.ok(!report.ground.nan);
  assert.ok(report.ground.formMax===null||report.ground.formMax<900,'he held the wing before the attack '+report.ground.formMax);

  // ---- 3b. orders (Build 237): the WING button / O key, and what the wingman does under each order ----
  report.orders=await page.evaluate(async()=>{
   diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='convoy');selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
   for(const e of enemyAir)e.alive=false;
   const fps=60,dt=1/fps;clock.getDelta=()=>dt;const render=GameRuntime.render;GameRuntime.render=()=>true;
   const prim=targets.find(t=>t.primary)||targets[0],tx=prim.group.position.x,tz=prim.group.position.z,w=squad[0],out={};
   const btn=document.getElementById('wingBtn');
   const setup=()=>{P.onGround=false;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;P.spd=125;P.throttle=.8;setThrottleUI(.8);P.heading=Math.PI/2;P.pitch=0;P.roll=0;P.pos.set(tx-6600,groundY(tx-6600,tz)+260,tz);
    w.phase='fly';w.task='form';w.target=null;w.run=Squad.newRun();w.cool=0;w.gear=0;w.flap=0;w.pos.set(P.pos.x-30,P.pos.y-4,P.pos.z+34);w.heading=P.heading;w.pitch=0;w.roll=0;w.spd=125;w.vel.set(125,0,0);w.core=null;w.slotOffset=null;w.decideT=.2;};
   const run=(order,secs)=>{setup();setSquadOrder(order,true);const seen={ground:false,cover:false,form:false};
    for(let i=0;i<fps*secs;i++){inputPitch=inputRoll=0;const a=P.pos.y-groundY(P.pos.x,P.pos.z);if(a<200)inputPitch=.2;else if(a>300)inputPitch=-.2;P.fuel=100;P.hull=130;animate();if(w.alive)seen[w.task]=true;}
    return {...seen,task:w.task,btn:btn.innerText.replace(/\s+/g,' '),shown:getComputedStyle(btn).display,status:squadStatusText(),ops:document.getElementById('opsStatus').textContent.split('\n').pop()};};
   P.onGround=false;P.fuel=100;animate();   // one frame: updateSquad runs and shows the button
   out.start={btn:btn.innerText.replace(/\s+/g,' '),shown:getComputedStyle(btn).display,order:squadOrder};
   out.free=run('free',8);out.form=run('form',30);out.cover=run('cover',10);out.attack=run('attack',12);
   // the key cycles free -> attack -> cover -> form -> free, with a radio acknowledgement
   const heard=[],origSay=radioSay;radioSay=t=>{heard.push(String(t));return origSay(t);};
   setSquadOrder('free',true);const cycle=[];for(let i=0;i<5;i++){window.dispatchEvent(new KeyboardEvent('keydown',{key:'o'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'o'}));cycle.push(squadOrder);}
   out.cycle=cycle;radioSay=origSay;out.radio=heard.join(' | ');
   // the order is saved and restored with the checkpoint state fields
   setSquadOrder('cover',true);out.saved=squadOrder;clearSquad();out.afterClear={order:squadOrder,shown:getComputedStyle(btn).display};
   GameRuntime.render=render;
   // a solo sortie has no button at all
   const solo=MISSIONS.findIndex(m=>m.id==='factory');selectedMission=solo;briefPlan=chooseEuropePlan(solo);startMission(solo);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
   animate();out.solo={n:squad.length,shown:getComputedStyle(btn).display};
   return out;
  });
  {const o=report.orders;
   assert.ok(o.start.shown==='flex'&&o.start.btn==='WING FREE'&&o.start.order==='free','the WING button shows with a squad '+JSON.stringify(o.start));
   assert.ok(!o.free.ground,'FREE: a column 6.6 km away is not attacked yet '+JSON.stringify(o.free));
   assert.ok(!o.form.ground&&o.form.task==='form'&&o.form.btn==='WING FORM'&&/HOLDING ON YOU/.test(o.form.status)&&/\[ORDER FORM\]/.test(o.form.status),'FORM: he stays on the leader '+JSON.stringify(o.form));
   assert.ok(o.cover.cover&&/HIGH COVER/.test(o.cover.status),'COVER: high cover '+JSON.stringify(o.cover));
   assert.ok(o.attack.ground&&/ATTACKING/.test(o.attack.status)||o.attack.task==='ground','ATTACK: he goes for the column from far out '+JSON.stringify(o.attack));
   assert.deepEqual(o.cycle,['attack','cover','form','free','attack'],'the O key cycles the orders');
   assert.ok(/WILCO|ROGER/.test(o.radio),'the wingman acknowledges: '+o.radio);
   assert.ok(o.afterClear.order==='free'&&o.afterClear.shown==='none','clearing the squad resets the order and hides the button');
   assert.ok(o.solo.n===0&&o.solo.shown==='none','a solo sortie has no WING button');}

  // ---- 4. an air fight, the enemy answers him, he can be hit ----
  report.air=await page.evaluate(async()=>{
   diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='libs');selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
   const fps=60,dt=1/fps;clock.getDelta=()=>dt;const render=GameRuntime.render;GameRuntime.render=()=>true;
   const lead=enemyAir.find(e=>e.bomber);
   P.onGround=false;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;P.spd=140;P.throttle=.9;setThrottleUI(.9);
   P.pos.set(lead.pos.x+Math.sin(lead.heading)*2600+400,lead.pos.y+150,lead.pos.z+Math.cos(lead.heading)*2600);
   P.heading=Math.atan2(lead.pos.x-P.pos.x,lead.pos.z-P.pos.z);P.pitch=0;P.roll=0;
   squad.forEach((w,i)=>{w.phase='fly';w.task='form';w.gear=0;w.flap=0;w.pos.set(P.pos.x-30+i*60,P.pos.y-4,P.pos.z-30);w.heading=P.heading;w.pitch=0;w.roll=0;w.spd=140;w.vel.set(Math.sin(P.heading)*140,0,Math.cos(P.heading)*140);w.core=null;w.slotOffset=null;});
   const hp0=enemyAir.map(e=>e.hp),ammo0=squad.map(w=>w.ammo),n0=squad.length;
   let airTask=0,pickedWingman=0,pickedPlayer=0,minAgl=1e9,hit=false;const trace=[];
   for(let i=0;i<fps*100;i++){
    inputPitch=0;inputRoll=0;P.fuel=100;P.hull=130;P.pos.y=Math.max(P.pos.y,groundY(P.pos.x,P.pos.z)+300);
    animate();
    for(const w of squad){if(!w.alive)continue;minAgl=Math.min(minAgl,w.pos.y-groundY(w.pos.x,w.pos.z));if(w.task==='air')airTask++;if(w.hp<w.maxhp)hit=true;}
    if(i%240===0)trace.push({t:i/fps,w:squad.map(w=>({ph:w.phase,tk:w.task,ammo:w.ammo,hp:+w.hp.toFixed(0),d:+w.pos.distanceTo(P.pos).toFixed(0)})),foes:enemyAir.filter(e=>e.alive).length});
    if(i%30===0)for(const e of enemyAir){if(!e.alive||e.bomber)continue;if(e.tgt)pickedWingman++;else pickedPlayer++;}
   }
   GameRuntime.render=render;
   // the enemy's choice: close to a wingman and far from the player he picks the wingman
   const probe=enemyAir.find(e=>e.alive&&!e.bomber)||enemyAir[0];
   const w0=squad.find(w=>w.alive)||squad[0];
   const saved={e:probe.pos.clone()};
   w0.phase='fly';w0.alive=true;probe.pos.set(w0.pos.x+500,w0.pos.y,w0.pos.z);P.pos.set(w0.pos.x-5000,w0.pos.y,w0.pos.z);probe.focusT=0;
   let picks=0;for(let k=0;k<40;k++){probe.focusT=0;const st=enemyTargetState(probe,.016);if(st.ref===w0)picks++;}
   P.pos.set(w0.pos.x+300,w0.pos.y,w0.pos.z);probe.pos.set(w0.pos.x+3000,w0.pos.y,w0.pos.z);
   let farPicks=0;for(let k=0;k<40;k++){probe.focusT=0;const st=enemyTargetState(probe,.016);if(st.ref===w0)farPicks++;}
   // hits: hull points, radio, and finally down
   const before=w0.hp;squadHit(w0,Math.min(5,before*.2),'test');const afterHit=w0.hp;
   squadHit(w0,1e6,'test');
   return {trace,ammo0,hpDrop:enemyAir.some((e,i)=>e.hp<hp0[i]-1e-6||!e.alive),ammoUsed:squad.some((w,i)=>w.ammo<ammo0[i]),airTask,pickedWingman,pickedPlayer,minAgl:+minAgl.toFixed(0),hit,
    picks,farPicks,hitWorks:afterHit<before,down:!w0.alive,lost:squadStats.lost,n0,
    minimap:(()=>{try{drawMinimap();return true;}catch(e){return String(e);}})(),status:squadStatusText(),stats:{...squadStats}};
  });
  assert.ok(report.air.airTask>200,'the wingmen engaged ('+report.air.airTask+' frames in the air task)');
  assert.ok(report.air.ammoUsed,'they fired '+JSON.stringify(report.air));   // whether a burst hits is up to the sky: reported, not asserted
  assert.ok(report.air.minAgl>30,'height kept '+report.air.minAgl);
  assert.ok(report.air.picks>=30,'a fighter next to a wingman and far from you picks him '+report.air.picks);
  assert.ok(report.air.farPicks<=24,'but not when he is far away '+report.air.farPicks);
  assert.ok(report.air.hitWorks&&report.air.down&&report.air.lost>=1,'a wingman can be hit and shot down '+JSON.stringify(report.air.stats));
  assert.equal(report.air.minimap,true,'the minimap draws the section');

  // ---- 5. a hurt wingman flies home, lands and taxis off the runway ----
  report.home=await page.evaluate(async()=>{
   diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='rotte');selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
   for(const e of enemyAir)e.alive=false;
   const fps=60,dt=1/fps;clock.getDelta=()=>dt;const render=GameRuntime.render;GameRuntime.render=()=>true;
   // both in the air a few km west of the strip, flying east
   P.onGround=false;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;P.spd=110;P.throttle=.6;setThrottleUI(.6);P.heading=Math.PI/2;P.pitch=0;P.roll=0;
   P.pos.set(AF_X-4200,groundY(AF_X-4200,AF_Z)+420,AF_Z+400);
   const w=squad[0];w.phase='fly';w.task='form';w.gear=0;w.flap=0;w.pos.set(P.pos.x-40,P.pos.y,P.pos.z+30);w.heading=P.heading;w.pitch=0;w.roll=0;w.spd=110;w.vel.set(110,0,0);w.core=null;w.slotOffset=null;
   w.hp=w.maxhp*.2;
   let tLand=null,tRoll=null,tPark=null,minAgl=1e9,bad=false,seen=new Set();
   for(let i=0;i<fps*240;i++){
    const t=i*dt;
    // the leader just flies on, away from the field
    inputPitch=0;inputRoll=0;P.fuel=100;P.hull=130;P.pos.y=Math.max(P.pos.y,groundY(P.pos.x,P.pos.z)+420);
    animate();
    seen.add(w.phase+'/'+w.task);
    if(!Number.isFinite(w.pos.x+w.pos.y+w.pos.z))bad=true;
    if(w.phase!=='rollout'&&w.phase!=='parked')minAgl=Math.min(minAgl,w.pos.y-groundY(w.pos.x,w.pos.z));
    if(tLand===null&&w.phase==='land')tLand=t;if(tRoll===null&&w.phase==='rollout')tRoll=t;
    if(w.phase==='parked'){if(tPark===null)tPark=t;if(t>tPark+24)break;}
   }
   GameRuntime.render=render;
   return {tLand,tRoll,tPark,phase:w.phase,alive:w.alive,bad,dz:+(w.pos.z-AF_Z).toFixed(1),dx:+(w.pos.x-AF_X).toFixed(0),spd:+w.spd.toFixed(1),
    agl:+(w.pos.y-groundY(w.pos.x,w.pos.z)).toFixed(1),seen:[...seen],landed:squadStats.landed||0,minAgl:+minAgl.toFixed(0),status:squadStatusText()};
  });
  assert.ok(report.home.tLand!==null,'a hurt wingman turns for home '+JSON.stringify(report.home));
  assert.ok(report.home.tRoll!==null&&report.home.tPark!==null,'he lands and stops '+JSON.stringify(report.home));
  assert.ok(Math.abs(report.home.dz)>30,'parked off the runway '+report.home.dz);assert.ok(report.home.agl<5&&report.home.spd<3);
  assert.ok(!report.home.bad&&report.home.alive&&report.home.landed===1&&report.home.minAgl>-1&&report.home.dx>-450,'a clean approach, down inside the strip '+JSON.stringify(report.home));

  // ---- 6. debrief: the section is listed, restart releases everything ----
  report.debrief=await page.evaluate(async()=>{
   diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='libs');selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
   const grids=squad.length;
   const captured=[];const orig=showResult;showResult=function(...a){captured.push(a);return orig.apply(this,a);};
   for(const w of squad){w.phase='fly';w.alive=true;}
   for(const e of enemyAir)e.alive=false;
   const m=M();for(const k in (m.kills||{}))sortieKills[k]=m.kills[k];
   if(europeOps)europeOps.ready=()=>true;
   const groups=squad.map(w=>w.group);
   const s0=score;P.onGround=false;landed(true);showResult=orig;
   const text=captured.length?String(captured[0][3]):'';
   const first=squad.length;
   clearWorld();
   const meshes=groups.filter(g=>g.parent===scene);
   return {grids,text:text.replace(/<[^>]+>/g,' ').slice(0,900),gain:score-s0,left:squad.length,first,done:captured.length?captured[0][0]:null,meshes:meshes.length};
  });
  assert.ok(/wingm/i.test(report.debrief.text)&&/flight/i.test(report.debrief.text),'the debrief names the flight: '+report.debrief.text);
  assert.equal(report.debrief.left,0,"clearWorld releases the section");assert.equal(report.debrief.meshes,0,"and their models leave the scene");
  if(report.debrief.done)assert.ok(report.debrief.gain>=400+150*2,'+150 per wingman brought home '+report.debrief.gain);

  // ---- 7. checkpoint with a wingman and enemy fighters: restore, and fly on ----
  const saved=await page.evaluate(async()=>{
   diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='libs');selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
   const fps=60,dt=1/fps;clock.getDelta=()=>dt;const render=GameRuntime.render;GameRuntime.render=()=>true;
   const lead=enemyAir.find(e=>e.bomber);
   P.onGround=false;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;P.spd=140;P.throttle=.9;setThrottleUI(.9);
   P.pos.set(lead.pos.x+Math.sin(lead.heading)*1800+400,lead.pos.y+150,lead.pos.z+Math.cos(lead.heading)*1800);
   P.heading=Math.atan2(lead.pos.x-P.pos.x,lead.pos.z-P.pos.z);P.pitch=0;P.roll=0;
   squad.forEach((w,i)=>{w.phase='fly';w.task='form';w.gear=0;w.flap=0;w.pos.set(P.pos.x-30+i*60,P.pos.y-4,P.pos.z-30);w.heading=P.heading;w.pitch=0;w.roll=0;w.spd=140;w.vel.set(Math.sin(P.heading)*140,0,Math.cos(P.heading)*140);w.core=null;w.slotOffset=null;});
   for(let i=0;i<fps*25;i++){inputPitch=0;inputRoll=0;P.fuel=100;P.hull=130;P.pos.y=Math.max(P.pos.y,groundY(P.pos.x,P.pos.z)+300);animate();}
   GameRuntime.render=render;
   setSquadOrder('attack',true);
   const brains=enemyAir.filter(e=>e.alive&&e.tac).length;
   const ok=window.sortieCheckpoint.save();if(!ok.ok)throw Error('Checkpoint save failed '+JSON.stringify(ok));
   const data=window.sortieCheckpoint.read().data;
   return {brains,alive:squad.filter(w=>w.alive).length,n:squad.length,savedSquad:(data.mission?.squad||data.squad||[]).length,
    snapshot:JSON.stringify(Object.keys(data)).slice(0,200),positions:squad.map(w=>({pos:w.pos.toArray(),hp:w.hp,phase:w.phase,ammo:w.ammo})),kills:{...squadStats}};
  });
  assert.ok(saved.alive>=1,'a wingman is flying when the checkpoint is written '+JSON.stringify(saved));
  await page.reload();
  await page.waitForFunction(()=>state===ST.MENU&&window.sortieCheckpoint?.ready&&realWorldReady,null,{polling:200});
  await page.locator('#continueFlight').click();
  await page.waitForFunction(()=>state===ST.PAUSED&&!window.sortieCheckpoint.restoring,null,{polling:200});
  report.restored=await page.evaluate(()=>({n:squad.length,alive:squad.filter(w=>w.alive).length,inScene:squad.filter(w=>w.group.parent===scene).length,
   positions:squad.map(w=>({pos:w.pos.toArray(),hp:w.hp,phase:w.phase,ammo:w.ammo})),kills:{...squadStats},
   order:squadOrder,btn:document.getElementById('wingBtn').innerText.replace(/\s+/g,' '),brainsKept:enemyAir.filter(e=>e.tac&&typeof e.tac.rng!=='function').length,run:squad.every(w=>w.run&&typeof w.run==='object')}));
  assert.equal(report.restored.alive,saved.alive,'the living wingmen come back');assert.equal(report.restored.inScene,report.restored.n,'drawn');
  assert.equal(report.restored.order,'attack','the order is restored with the squad');assert.equal(report.restored.btn,'WING ATTACK');
  assert.equal(report.restored.brainsKept,0,'no half-restored brain without its random function');assert.ok(report.restored.run);
  for(let i=0;i<report.restored.positions.length;i++){
   const a=report.restored.positions[i],b=saved.positions[i];
   if(!a||!b)continue;
   assert.ok(Math.hypot(a.pos[0]-b.pos[0],a.pos[1]-b.pos[1],a.pos[2]-b.pos[2])<2,'position held');assert.equal(a.hp,b.hp);assert.equal(a.ammo,b.ammo);assert.equal(a.phase,b.phase);
  }
  assert.deepEqual(report.restored.kills,saved.kills,'the section tally is kept');
  await page.locator('#pmResume').click();
  const flown=await page.evaluate(()=>{
   const dt=1/60;clock.getDelta=()=>dt;const render=GameRuntime.render;GameRuntime.render=()=>true;
   for(let i=0;i<60*20;i++){inputPitch=0;inputRoll=0;P.fuel=100;P.hull=130;P.pos.y=Math.max(P.pos.y,groundY(P.pos.x,P.pos.z)+300);animate();}
   GameRuntime.render=render;
   return {alive:squad.filter(w=>w.alive).length,nan:squad.some(w=>!Number.isFinite(w.pos.x+w.pos.y+w.pos.z)),tac:enemyAir.filter(e=>e.alive&&e.tac&&typeof e.tac.rng==='function').length,pAlive:P.alive};
  });
  assert.ok(!flown.nan&&flown.pAlive,'twenty more seconds flown after Continue');
  report.flownAfterContinue=flown;

  assert.deepEqual(errors.filter(e=>!/404/.test(e)),[],'no page errors');
  fs.writeFileSync(path.join(root,'app/release/squad-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('Squad browser: OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
