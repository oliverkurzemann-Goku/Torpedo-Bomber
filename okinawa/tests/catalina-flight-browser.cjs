/* Build 252: the Consolidated PBY-5A Catalina as a PLAYER aircraft (Rhine game, Allied side), real game and the real GLB. */
'use strict';
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Catalina flight WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  const sortie=encodeURIComponent(JSON.stringify({version:1,theatre:'europe',task:'free',ac:'pby',kit:'guns',weather:'clear',time:'day',start:'ground',difficulty:'vet',enemies:0,fuel:100}));
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/404/.test(m.text()))errors.push('console: '+m.text());});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=253&surprises=off&sortie='+sortie);
  // the hangar sortie opens the briefing at once: wait for the world, not for the menu
  await page.waitForFunction(()=>realWorldReady&&(state===ST.MENU||state===ST.BRIEF),null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['pby','p47'].map(ensureModel));renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;
   const orig=crash;window.__crash=null;crash=(t,m)=>{window.__crash=t+': '+m;orig(t,m);};window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.frame=dt=>{SortieFeatures.Damage.tick(P,dt);updateFlight(dt);updateStorchGunner(dt);updateFlak(dt);updateSites(dt);updateTargets(dt);updateEnemyAir(dt);updateBullets(dt);updateTracers(dt);updateOrdnance(dt);updateExplosions(dt);updateSmoke(dt);updateDebris(dt);};
   window.begin=(id,diff=1)=>{diffIdx=diff;const i=id?MISSIONS.findIndex(m=>m.id===id):0;selectedMission=i;briefPlan=chooseEuropePlan(i);startMission(i);if(launchIntro)finishLaunchIntro(false);show('menu',false);show('brief',false);show('result',false);state=ST.FLIGHT;P.alive=true;inputRoll=inputPitch=0;window.__crash=null;said.length=0;return i;};
   window.takeoffTo=agl=>{const dt=1/60;let t=0;P.throttle=1;for(;t<80&&P.alive;t+=dt){const vr=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall*1.1;if(P.onGround&&P.spd>.95*vr)inputPitch=.5;else if(!P.onGround)inputPitch=.6;updateFlight(dt);if(!P.onGround&&P.pos.y-groundY(P.pos.x,P.pos.z)>agl)break;}return t;};
   window.holdLevel=(sec,thr)=>{const dt=1/60;P.throttle=thr;for(let t=0;t<sec&&P.alive;t+=dt){inputPitch=Math.max(-.6,Math.min(.6,-P.vSpeed*.06-P.pitch*.8));updateFlight(dt);}};
  });

  // ---- 1. the aeroplane: free flight from the strip, flown on the data sheet (35 420 lb, 179 mph, 610 ft/min, 58 kt stall at 27 000 lb) ----
  const T=await page.evaluate(()=>{
   const dt=1/60,deg=v=>v*180/Math.PI,r1=v=>+(+v).toFixed(1),fold=n=>{const q=new THREE.Quaternion().fromArray(n.userData.rigRest);return q.angleTo(n.quaternion);};
   begin(null);
   const res={ac:P.ac,onGround:P.onGround,core:coreOn(),gear:document.getElementById('gearBtn').textContent,fire:getComputedStyle(document.getElementById('fireBtn')).display,flapBtn:getComputedStyle(document.getElementById('flapBtn')).display,ammo:P.ammo,hull:P.hull,bombs:P.bombs,key:modelKey('pby'),tpl:!!modelTpl.pby};
   res.parts=['PropellerLeft','PropellerRight','FloatLeft','FloatRight','GearLeft','NoseGear','BlisterHatchRight'].filter(n=>!playerModel.getObjectByName(n));
   posePlayerAircraft(dt);for(let k=0;k<30;k++)posePlayerAircraft(dt);
   res.rest={float:r1(deg(fold(playerModel.getObjectByName('FloatLeft')))),gear:r1(deg(fold(playerModel.getObjectByName('GearLeft'))))};
   inputRoll=inputPitch=0;P.throttle=1;const x0=P.pos.x,z0=P.pos.z;let t=0,off=null,run=null,rows={};
   for(;t<90&&P.alive;t+=dt){const vr=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall*1.1;if(P.onGround&&P.spd>.95*vr)inputPitch=.5;updateFlight(dt);
    if(!P.onGround&&off==null){off=t;run=Math.hypot(P.pos.x-x0,P.pos.z-z0);inputPitch=.5;P.gearTgt=0;}
    if(off!=null){const since=t-off;for(const s of [3,8,15])if(since>=s&&!(s in rows))rows[s]={kmh:Math.round(P.spd*3.6),climb:r1(P.vSpeed),pitch:r1(deg(P.pitch)),gear:r1(P.gear)};if(since>15)break;}}
   res.liftoffS=r1(off);res.runM=Math.round(run);res.rows=rows;res.alive=P.alive;res.vr=r1(SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall*1.1);
   // level flight, half power, idle glide, floats fold in cruise
   begin(null);takeoffTo(300);P.gearTgt=0;holdLevel(60,1);res.levelFull=Math.round(P.spd*3.6);for(let k=0;k<420;k++)posePlayerAircraft(dt);
   res.cruise={float:r1(deg(fold(playerModel.getObjectByName('FloatLeft')))),floatR:r1(deg(fold(playerModel.getObjectByName('FloatRight')))),gear:r1(deg(fold(playerModel.getObjectByName('GearLeft')))),nose:r1(deg(fold(playerModel.getObjectByName('NoseGear'))))};
   holdLevel(25,.5);res.levelHalf=Math.round(P.spd*3.6);holdLevel(30,.05);res.idle={kmh:Math.round(P.spd*3.6),sink:r1(-P.vSpeed)};
   // 30 degree bank at cruise
   begin(null);takeoffTo(300);P.gearTgt=0;holdLevel(30,.8);const h0=P.heading;inputRoll=.4;for(let k=0;k<10/dt;k++){inputPitch=Math.max(-.6,Math.min(.6,-P.vSpeed*.06));updateFlight(dt);}
   res.turn={rollDeg:Math.round(deg(P.roll)),degPerS:r1(deg(Math.abs(Math.atan2(Math.sin(P.heading-h0),Math.cos(P.heading-h0))))/10),alive:P.alive};inputRoll=0;
   // the wing stalls but the aeroplane stays alive
   begin(null);takeoffTo(500);P.gearTgt=0;P.throttle=0;let minK=1e9,stall=0;for(let k=0;k<40/dt&&P.alive;k++){inputPitch=.6;updateFlight(dt);minK=Math.min(minK,P.spd*3.6);stall=Math.max(stall,P.coreStall||0);}
   res.stall={minKmh:Math.round(minK),coreStall:+stall.toFixed(2),alive:P.alive,crash:window.__crash};
   return res;
  });
  report.flight=T;console.log(JSON.stringify(T));
  assert.equal(T.ac,'pby');assert.equal(T.core,true,'the Catalina flies on the flight core');assert.equal(T.parts.length,0,'the contract parts exist: '+T.parts);assert.equal(T.fire,'none','no player gun: the gunners shoot by themselves');assert.equal(T.flapBtn,'none','no wing flaps');
  assert.equal(T.ammo,600);assert.equal(T.hull,150);assert.ok(T.rest.float<1&&T.rest.gear<1,'floats out and wheels down on the strip: '+JSON.stringify(T.rest));
  assert.ok(T.liftoffS>12&&T.liftoffS<45&&T.runM>250&&T.runM<900,'the Catalina is off the strip: '+T.liftoffS+' s / '+T.runM+' m');
  assert.ok(T.rows[8].climb>.5&&T.rows[8].kmh>110,'she climbs: '+JSON.stringify(T.rows));
  assert.ok(T.levelFull>=225&&T.levelFull<=300,'about 179 mph (288 km/h) at 7 000 ft, less at 300 m with the full load: '+T.levelFull);assert.ok(T.levelHalf<T.levelFull,'half power: '+T.levelHalf);
  assert.ok(T.cruise.float>1.4&&T.cruise.floatR>1.4,'the wing-tip floats fold up in cruise: '+JSON.stringify(T.cruise));assert.ok(T.cruise.gear>1.2&&T.cruise.nose>1.2,'the wheels are up: '+JSON.stringify(T.cruise));
  assert.ok(T.turn.degPerS>4&&T.turn.degPerS<26&&T.turn.alive,'she turns at the pace of a heavy boat: '+JSON.stringify(T.turn));assert.ok(T.stall.alive&&!T.stall.crash,'the stall does not kill her: '+JSON.stringify(T.stall));

  // ---- 2. the river: a flat straight stretch, an approach with the wheels up, the alighting, the water run, a take-off from the water ----
  const W=await page.evaluate(()=>{
   const dt=1/60,deg=v=>v*180/Math.PI,r1=v=>+(+v).toFixed(1);
   begin(null);
   const strip=findWaterStrip(13800,15770,3500,1100);const res={strip};if(!strip)return res;
   const hdg=strip.heading,sx=Math.sin(hdg),sz=Math.cos(hdg),sp0=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app),ref=sp0.reference;
   const startX=strip.x-sx*strip.len/2,startZ=strip.z-sz*strip.len/2;
   const ap=(dist)=>{P.onGround=false;P.onWater=false;P.landingRoll=null;P.departureAge=null;P.touchResolved=false;P.throttle=.4;P.gear=P.gearTgt=0;P.heading=hdg;P.pitch=.02;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;inputPitch=inputRoll=0;P.pitchRef=null;P.coreStall=0;P.coreDrop=0;P.core=null;P.nLoad=1;P.groundPose=null;P.takeoffRotation=0;
    const x=startX-sx*dist,z=startZ-sz*dist,slope=Math.tan(3*Math.PI/180);P.pos.set(x,waterY(x,z)+(dist<0?5.3:dist*slope+8),z);P.spd=ref;P.vSpeed=-1.5;};   // the valley walls rise steeply beside the river: the test starts inside the stretch, a metre above the water at the end of the flare
   // flown approach: 3 degree glide to the near end, flare at 7 m of keel height to a nose-up attitude, idle
   const fly=(opt={})=>{ap(opt.dist??-100);const log={t0:0};let t=0,touch=null,stop=null;P.gear=P.gearTgt=opt.gear??0;if(opt.fast)P.spd=ref+opt.fast;
    for(;t<150&&P.alive&&!missionOver;t+=dt){
     const wy=waterY(P.pos.x,P.pos.z),agl=P.pos.y+waterlineOffset()-.84-wy;
     if(!P.onGround){if(agl>7){const tvs=-1.8;inputPitch=Math.max(-.5,Math.min(.5,(tvs-P.vSpeed)*.18+(opt.nose||0)));P.throttle=Math.max(0,Math.min(1,.4+(ref-P.spd)*.1));}
      else{inputPitch=Math.max(-.6,Math.min(.6,((opt.flare??.05)-P.pitch)*1.6+(-1.2-P.vSpeed)*.08));P.throttle=0;}}
     else{if(touch==null){touch={t,spd:r1(P.spd),pitch:r1(deg(P.pitch)),wet:waterAt(P.pos.x,P.pos.z),x:P.pos.x,z:P.pos.z};}inputPitch=0;P.throttle=0;}
     updateFlight(dt);posePlayerAircraft(dt);resolveGround(dt);
     if(P.onGround&&P.spd<.7&&P.landingRoll==null&&touch){stop={t:r1(t-touch.t),dist:Math.round(Math.hypot(P.pos.x-touch.x,P.pos.z-touch.z))};break;}
     if(!P.alive)break;}
    return {touch,stop,alive:P.alive,crash:window.__crash,onWater:P.onWater,onGround:P.onGround,rideErr:r1(P.pos.y+waterlineOffset()-waterY(P.pos.x,P.pos.z)),pitch:r1(deg(P.pitch)),over:missionOver};};
   res.landing=fly();
   // taxi: the engines turn her at a crawl, then the take-off run on the hull
   if(P.alive&&P.onWater){
    res.taxi={};P.throttle=.5;inputRoll=.6;const h1=P.heading;for(let k=0;k<4/dt;k++){updateFlight(dt);}res.taxi.turnDeg=r1(deg(Math.abs(Math.atan2(Math.sin(P.heading-h1),Math.cos(P.heading-h1)))));res.taxi.spd=r1(P.spd);inputRoll=0;
    P.throttle=0;for(let k=0;k<25/dt&&P.spd>.3;k++)updateFlight(dt);res.taxi.stopped=r1(P.spd);
    // point her along the strip again and take off
    P.heading=hdg;P.pos.x=startX;P.pos.z=startZ;P.spd=0;P.takeoffRotation=0;P.gear=P.gearTgt=0;const x0=P.pos.x,z0=P.pos.z;let off=null,t=0,maxHump=0;
    P.throttle=1;for(;t<120&&P.alive;t+=dt){const vr=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall*1.1;if(P.onGround&&P.spd>.95*vr)inputPitch=.5;updateFlight(dt);posePlayerAircraft(dt);
     if(!P.onGround&&off==null){off=t;res.run={t:r1(t),dist:Math.round(Math.hypot(P.pos.x-x0,P.pos.z-z0)),len:strip.len};inputPitch=.4;}
     if(off!=null&&t-off>10)break;}
    res.takeoff={off:r1(off),alive:P.alive,crash:window.__crash,spd:Math.round(P.spd*3.6),climb:r1(P.vSpeed),agl:r1(P.pos.y-groundY(P.pos.x,P.pos.z))};
   }
   return res;
  });
  report.water=W;console.log(JSON.stringify(W));
  assert.ok(W.strip&&W.strip.len>=1100,'a straight, flat stretch of the Rhine exists near the bridge: '+JSON.stringify(W.strip));
  assert.ok(W.landing.alive&&W.landing.touch&&W.landing.touch.wet&&!W.landing.crash,'a gentle alighting on the river is survived: '+JSON.stringify(W.landing));
  assert.ok(W.landing.onWater&&W.landing.stop&&W.landing.stop.dist<700&&W.landing.stop.t<40,'the water run stops the boat inside the stretch: '+JSON.stringify(W.landing.stop));
  assert.ok(Math.abs(W.landing.rideErr)<.5,'she floats on the design waterline: '+W.landing.rideErr);
  assert.ok(W.taxi.turnDeg>8&&W.taxi.spd<14,'the engines and the rudders turn her on the water: '+JSON.stringify(W.taxi));
  assert.ok(W.run&&W.takeoff.alive&&!W.takeoff.crash&&W.run.dist<W.run.len&&W.takeoff.climb>-1,'she takes off from the water inside the stretch: '+JSON.stringify([W.run,W.takeoff]));

  // ---- 3. the water bites: wheels down, too fast, nose first ----
  const F=await page.evaluate(()=>{
   const dt=1/60,out={};begin(null);
   const strip=findWaterStrip(13800,15770,3500,1100),hdg=strip.heading,sx=Math.sin(hdg),sz=Math.cos(hdg),ref=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).reference;
   const attempt=(name,{gear=0,spd=ref,pitch=.05,vs=-2,roll=0})=>{
    begin(null);window.__crash=null;P.onGround=false;P.onWater=false;P.landingRoll=null;P.touchResolved=false;P.gear=P.gearTgt=gear;P.heading=hdg;P.pitch=pitch;P.roll=roll;P.pitchVel=P.rollVel=0;P.throttle=.2;
    P.pos.set(strip.x-sx*300,waterY(strip.x-sx*300,strip.z-sz*300)+3,strip.z-sz*300);P.spd=spd;P.vSpeed=vs;P.alive=true;inputPitch=inputRoll=0;
    const rg=resolveGround;resolveGround=d=>{P.vSpeed=Math.min(P.vSpeed,vs);rg(d);};   // updateFlight resolves the touch-down itself; the core re-derives the climb rate from the attitude, so hold the sink for the check
    for(let k=0;k<4/dt&&P.alive&&!P.onGround;k++)updateFlight(dt);
    resolveGround=rg;
    out[name]={alive:P.alive,crash:window.__crash,onGround:P.onGround};};
   attempt('wheelsDown',{gear:1});attempt('tooFast',{spd:ref+30});attempt('noseFirst',{pitch:-.25});attempt('hard',{vs:-5.5});attempt('stove',{vs:-8});attempt('wing',{roll:.5});
   return out;
  });
  report.failures=F;console.log(JSON.stringify(F));
  assert.ok(!F.wheelsDown.alive&&/GEAR DOWN ON THE WATER/.test(F.wheelsDown.crash),'wheels down on the water: '+JSON.stringify(F.wheelsDown));
  assert.ok(!F.tooFast.alive&&/TOO FAST/.test(F.tooFast.crash),JSON.stringify(F.tooFast));assert.ok(!F.noseFirst.alive&&/NOSE FIRST/.test(F.noseFirst.crash),JSON.stringify(F.noseFirst));
  assert.ok(F.hard.alive&&F.hard.onGround,'a firm alighting damages but survives: '+JSON.stringify(F.hard));assert.ok(!F.stove.alive&&/HARD LANDING/.test(F.stove.crash),JSON.stringify(F.stove));assert.ok(!F.wing.alive&&/FLOAT DUG IN/.test(F.wing.crash),JSON.stringify(F.wing));
  assert.deepEqual(errors,[],'no page error: '+errors.join(' | '));
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/catalina-flight-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('Catalina flight WebGL: strip take-off, flight, river alighting, water run, water take-off and the water failures passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
