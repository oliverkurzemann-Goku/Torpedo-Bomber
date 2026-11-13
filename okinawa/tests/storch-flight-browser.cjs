/* Build 249: the Fieseler Fi 156 C-2 Storch as a PLAYER aircraft (Rhine game, German side, solo), real game and the real GLB. The take-off from the grass, level speed, the tight
 * turn, the stall and the idle glide are flown through the ordinary updateFlight on the flight core (data sheet of L.Dv.T. 2601/1: 62/51 km/h stall, 175 km/h, 4.6 m/s at 10 deg
 * flap - the ARCADE law gives it more climb as it does for every type). Then the three Storch sorties: Bonus Rescue Run (land at the yellow smoke, the pilot runs and boards,
 * fighters, take off again), Bonus Spotter (three zones, low and slow for 12 s, barrage), Bonus Rat Flight (airborne deep behind the line, hunters). The observer is an automatic
 * rear gunner. Writes app/release/storch-flight-browser.json. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Storch flight WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  const sortie=encodeURIComponent(JSON.stringify({version:1,theatre:'europe',task:'free',ac:'fi156',kit:'rear',weather:'clear',time:'day',start:'ground',difficulty:'vet',enemies:0,fuel:100}));
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/404/.test(m.text()))errors.push('console: '+m.text());});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=261&surprises=off&sortie='+sortie);
  // the hangar sortie opens the briefing at once: wait for the world, not for the menu
  await page.waitForFunction(()=>realWorldReady&&(state===ST.MENU||state===ST.BRIEF),null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['fi156','p47'].map(ensureModel));renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;
   const orig=crash;window.__crash=null;crash=(t,m)=>{window.__crash=t+': '+m;orig(t,m);};window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.frame=dt=>{SortieFeatures.Damage.tick(P,dt);updateFlight(dt);updateStorchGunner(dt);updateFlak(dt);updateSites(dt);updateTargets(dt);updateEnemyAir(dt);updateBullets(dt);updateTracers(dt);updateOrdnance(dt);updateExplosions(dt);updateSmoke(dt);updateDebris(dt);};
   window.begin=(id,diff=1,wx='clear')=>{diffIdx=diff;const i=id?MISSIONS.findIndex(m=>m.id===id):0;selectedMission=i;briefPlan=chooseEuropePlan(i);briefPlan.weather=wx;startMission(i);if(launchIntro)finishLaunchIntro(false);show('menu',false);show('brief',false);show('result',false);state=ST.FLIGHT;P.alive=true;inputRoll=inputPitch=0;window.__crash=null;said.length=0;return i;};
   window.takeoffTo=agl=>{const dt=1/60;let t=0;P.throttle=1;for(;t<80&&P.alive;t+=dt){const vr=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall*1.1;if(P.onGround&&P.spd>.95*vr)inputPitch=.5;else if(!P.onGround)inputPitch=.6;updateFlight(dt);if(!P.onGround&&P.pos.y-groundY(P.pos.x,P.pos.z)>agl)break;}return t;};
   window.holdLevel=(sec,thr)=>{const dt=1/60;P.throttle=thr;for(let t=0;t<sec&&P.alive;t+=dt){inputPitch=Math.max(-.6,Math.min(.6,-P.vSpeed*.06-P.pitch*.8));updateFlight(dt);}};
  });

  // ---- 1. the aeroplane: free flight from the strip, flown on the data sheet of L.Dv.T. 2601/1 (62/51 km/h stall, 175 km/h, 4.6 m/s) ----
  const T=await page.evaluate(()=>{
   const dt=1/60,deg=v=>v*180/Math.PI,r1=v=>+(+v).toFixed(1);begin(null);
   const res={ac:P.ac,onGround:P.onGround,core:coreOn(),gear:document.getElementById('gearBtn').textContent,fire:getComputedStyle(document.getElementById('fireBtn')).display,gun:document.getElementById('gunLabel')?document.getElementById('gunLabel').textContent:null,ammo:P.ammo,hull:P.hull};
   inputRoll=inputPitch=0;P.throttle=1;const x0=P.pos.x,z0=P.pos.z;let t=0,off=null,run=null,rows={};
   for(;t<60&&P.alive;t+=dt){const vr=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall*1.1;if(P.onGround&&P.spd>.95*vr)inputPitch=.5;updateFlight(dt);
    if(!P.onGround&&off==null){off=t;run=Math.hypot(P.pos.x-x0,P.pos.z-z0);inputPitch=.6;}
    if(off!=null){const since=t-off;for(const s of [2,5,10])if(since>=s&&!(s in rows))rows[s]={kmh:Math.round(P.spd*3.6),climb:r1(P.vSpeed),pitch:r1(deg(P.pitch))};if(since>10)break;}}
   res.liftoffS=r1(off);res.runM=Math.round(run);res.rows=rows;res.alive=P.alive;
   // level flight, half power, idle glide
   begin(null);takeoffTo(300);P.flapTgt=0;P.flap=0;holdLevel(60,1);res.levelFull=Math.round(P.spd*3.6);holdLevel(25,.5);res.levelHalf=Math.round(P.spd*3.6);holdLevel(30,.05);res.idle={kmh:Math.round(P.spd*3.6),sink:r1(-P.vSpeed)};
   // 45 degree bank at cruise
   begin(null);takeoffTo(300);holdLevel(30,.7);const h0=P.heading;inputRoll=.5;for(let k=0;k<8/dt;k++){inputPitch=Math.max(-.6,Math.min(.6,-P.vSpeed*.06));updateFlight(dt);}
   res.turn={rollDeg:Math.round(deg(P.roll)),degPerS:r1(deg(Math.abs(Math.atan2(Math.sin(P.heading-h0),Math.cos(P.heading-h0))))/8),alive:P.alive};inputRoll=0;
   // the wing stalls but does not drop out of the sky: power off, nose up
   begin(null);takeoffTo(400);P.throttle=0;let minK=1e9,stall=0;for(let k=0;k<40/dt&&P.alive;k++){inputPitch=.6;updateFlight(dt);minK=Math.min(minK,P.spd*3.6);stall=Math.max(stall,P.coreStall||0);}
   res.stall={minKmh:Math.round(minK),coreStall:+stall.toFixed(2),alive:P.alive,crash:window.__crash};
   return res;
  });
  report.flight=T;
  assert.equal(T.ac,'fi156');assert.equal(T.core,true,'the Storch flies on the flight core');assert.ok(/FIXED/i.test(T.gear),'fixed legs: '+T.gear);assert.equal(T.fire,'none','no player gun: the observer shoots by himself');assert.equal(T.ammo,450);assert.equal(T.hull,60);
  assert.ok(T.liftoffS>3&&T.liftoffS<10&&T.runM>35&&T.runM<130,'a Storch is off the grass in about 65 m: '+T.liftoffS+' s / '+T.runM+' m');
  assert.ok(T.rows[5].climb>3&&T.rows[5].kmh>60&&T.rows[5].kmh<110,'it climbs: '+JSON.stringify(T.rows));
  assert.ok(T.levelFull>=160&&T.levelFull<=185,'175 km/h at full power: '+T.levelFull);assert.ok(T.levelHalf>110&&T.levelHalf<T.levelFull,'half power: '+T.levelHalf+' of '+T.levelFull);assert.ok(T.idle.kmh<85&&T.idle.sink>1.2&&T.idle.sink<4,'the idle glide: '+JSON.stringify(T.idle));
  assert.ok(T.turn.degPerS>10&&T.turn.degPerS<26&&T.turn.alive,'it turns tightly: '+JSON.stringify(T.turn));assert.ok(T.stall.minKmh<65&&T.stall.alive&&!T.stall.crash,'the wing stalls below 60 km/h and the aeroplane stays alive: '+JSON.stringify(T.stall));

  // ---- 1b. Build 259: the stick's middle is soft. Half stick pulls / pushes the nose about half as far and the climb / sink rate about half as fast as in Build 256
  //      (measured then: ARCADE half back 22.7 deg, 14.9 m/s climb, half forward 20.5 m/s sink; REALISTIC half pull 45 deg after 1 s); full stick still gets the type's limit ----
  const PS=await page.evaluate(()=>{
   const dt=1/60,deg=v=>v*180/Math.PI,r1=v=>+(+v).toFixed(1),out={};
   const run=(label,aero,stick,sec)=>{begin(null);if(aero!==aeroMode){aeroMode=aero;if(typeof switchFlightModel==='function')switchFlightModel();}
    takeoffTo(300);P.flapTgt=0;P.flap=0;holdLevel(40,.7);const p0=P.pitch;let peakPitch=0,peakV=0,p1=null;P.throttle=.7;
    for(let t=0;t<sec;t+=dt){inputPitch=stick;updateFlight(dt);peakPitch=Math.max(peakPitch,Math.abs(deg(P.pitch-p0)));peakV=Math.max(peakV,Math.abs(P.vSpeed));if(p1==null&&t>=1)p1=deg(P.pitch-p0);}
    out[label]={peakPitch:r1(peakPitch),peakV:r1(peakV),pitch1s:r1(p1)};inputPitch=0;};
   run('arcadeUp',false,.5,3);run('arcadeDown',false,-.5,3);run('arcadeFull',false,1,3);run('realUp',true,.5,1.5);aeroMode=false;return out;
  });
  report.pitchResponse=PS;console.log('storch pitch response',JSON.stringify(PS));
  assert.ok(PS.arcadeUp.peakPitch<=15&&PS.arcadeUp.peakV<=10,'half back in ARCADE: nose '+PS.arcadeUp.peakPitch+' deg, climb '+PS.arcadeUp.peakV+' m/s (Build 256: 22.7 deg / 14.9 m/s)');
  assert.ok(PS.arcadeDown.peakV<=12.5,'half forward in ARCADE: sink '+PS.arcadeDown.peakV+' m/s (Build 256: 20.5 m/s)');
  assert.ok(PS.arcadeFull.peakPitch>=18,'full stick still gives the type its steep climb: '+PS.arcadeFull.peakPitch+' deg');
  assert.ok(PS.realUp.pitch1s<=26,'half pull in REALISTIC: nose '+PS.realUp.pitch1s+' deg after 1 s (Build 256: 45 deg)');
  // ---- 2a. Build 250: a human flare is not the scripted one - idle power, the nose pulled up at 5 m, the wing mushes at the stall speed and the nose drops (measured -17 degrees, 4 m/s) -
  //      that used to be "CRASHED: hit the ground away from the strip"; the Storch is rugged (AC.fi156.field) and the pickup zone is the pilot's neighbourhood ----
  const H=await page.evaluate(()=>{
   const dt=1/60,res=[];
   for(const [thr,pf,fa] of [[.15,.24,5],[.15,.32,5],[0,.08,5],[.3,.24,5]]){
    begin('rescue');const lz=sts.plan.lz;
    P.onGround=false;P.landingRoll=null;P.departureAge=null;P.touchResolved=false;P.throttle=.3;P.gear=P.gearTgt=1;P.flap=P.flapTgt=1;P.heading=Math.PI/2;P.pitch=.02;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;inputPitch=inputRoll=0;
    const aim=lz.x-60,slope=Math.tan(3.5*Math.PI/180);P.pos.set(aim-450,Math.max(groundY(aim,lz.z)+450*slope,groundY(aim-450,lz.z)+25),lz.z);const sp=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app);P.spd=sp.reference;P.vSpeed=-1.5;
    for(let t=0;t<120&&P.alive&&!missionOver;t+=dt){const agl=P.pos.y-groundY(P.pos.x,P.pos.z),gy=groundY(aim,lz.z),pathAlt=Math.max(0,(aim-P.pos.x))*slope+gy,err=P.pos.y-pathAlt;
     if(!P.onGround){if(agl>fa){const tvs=Math.max(-3,Math.min(-.3,-1.2-err*.25));inputPitch=Math.max(-.9,Math.min(.9,(tvs-P.vSpeed)*.36));P.throttle=Math.max(0,Math.min(1,.35+(sp.reference-P.spd)*.12));}
      else{inputPitch=Math.max(-.6,Math.min(.6,(pf-P.pitch)*1.6+(-.5-P.vSpeed)*.05));P.throttle=thr;}}else{inputPitch=0;P.throttle=0;}
     updateFlight(dt);updateSites(dt);if(sts.phase!=='fly')break;}
    res.push({thr,pf,fa,alive:P.alive,phase:sts.phase,crash:window.__crash,over:missionOver});
   }
   return res;
  });
  report.flare=H;
  for(const h of H)assert.ok(h.alive&&h.phase==='run'&&!h.crash&&!h.over,'a flare that stalls a metre or two above the grass is survivable and starts the pickup: '+JSON.stringify(h));

  // ---- 2. Bonus Rescue Run: land at the yellow smoke, the pilot runs and boards (6 s), fighters come, take off again from the meadow ----
  const R=await page.evaluate(()=>{
   const dt=1/60,r1=v=>+(+v).toFixed(1),out={};begin('rescue');
   out.start={onGround:P.onGround,text:objectiveText(),kind:sts&&sts.kind,fig:!!(sts&&sts.fig),
    roles:[sts.fig.userData.role,...sts.aidTeam.children.map(o=>o.userData.role).filter(Boolean)]};const lz=sts.plan.lz;
   const ys=[-190,-100,0,100,190].map(d=>groundY(lz.x+d,lz.z));out.slopePct=r1((Math.max(...ys)-Math.min(...ys))/380*100);
   P.onGround=false;P.landingRoll=null;P.departureAge=null;P.touchResolved=false;P.throttle=.3;P.gear=P.gearTgt=1;P.flap=P.flapTgt=1;P.heading=Math.PI/2;P.pitch=.02;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;inputPitch=inputRoll=0;
   // a 3.5 degree path to a point 30 m short of the meadow's middle: the wind of the start (random) must not decide whether the test works
   const aim=lz.x-30,slope=Math.tan(3.5*Math.PI/180);P.pos.set(aim-450,Math.max(groundY(aim,lz.z)+450*slope,groundY(aim-450,lz.z)+25),lz.z);const sp=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app);P.spd=sp.reference;P.vSpeed=-1.5;
   let touch=null;for(let t=0;t<120&&P.alive&&!missionOver;t+=dt){const agl=P.pos.y-groundY(P.pos.x,P.pos.z),gy=groundY(aim,lz.z),pathAlt=Math.max(0,(aim-P.pos.x))*slope+gy,err=P.pos.y-pathAlt;
    const tvs=agl<4?-.4:Math.max(-3,Math.min(-.3,-1.2-err*.25)),tspd=sp.reference*(agl>4?1:.85);
    if(!P.onGround){inputPitch=Math.max(-.9,Math.min(.9,(tvs-P.vSpeed)*.36));P.throttle=agl<2?0:Math.max(0,Math.min(1,.35+(tspd-P.spd)*.12));}else{if(touch==null)touch={kmh:Math.round(P.spd*3.6),dx:Math.round(P.pos.x-lz.x),dz:Math.round(P.pos.z-lz.z)};inputPitch=0;P.throttle=0;}
    updateFlight(dt);updateSites(dt);if(sts.phase!=='fly')break;}
   out.touch=touch;out.landed={phase:sts.phase,over:missionOver,text:objectiveText(),alive:P.alive,crash:window.__crash};
   let t2=0;for(;t2<40&&sts.phase!=='home';t2+=dt){P.spd=0;updateFlight(dt);updateSites(dt);}
   out.boarded={t:r1(t2),phase:sts.phase,rescued:sortieKills.rescued||0,score,fig:sts.fig&&sts.fig.visible,text:objectiveText()};
   for(let t3=0;t3<12;t3+=dt)updateSites(dt);
   const hs=enemyAir.filter(e=>e.alive&&e.sortie);out.hunters={n:hs.length,escape:hs.every(e=>e.escapeThreat),text:objectiveText()};
   P.throttle=1;inputPitch=0;let off=null;const x0=P.pos.x,z0=P.pos.z;
   for(let t4=0;t4<40&&P.alive;t4+=dt){if(P.onGround&&P.spd>.95*sp.stall*1.1)inputPitch=.5;else if(!P.onGround)inputPitch=.4;updateFlight(dt);updateSites(dt);if(!P.onGround){off={t:r1(t4),run:Math.round(Math.hypot(P.pos.x-x0,P.pos.z-z0))};break;}}
   out.takeoff=off;out.alive=P.alive;return out;
  });
  report.rescue=R;
  assert.equal(R.start.kind,'rescue');assert.ok(R.start.fig&&/YELLOW SMOKE/.test(R.start.text),JSON.stringify(R.start));assert.ok(R.slopePct<4,'the meadow is flat enough to land and take off: '+R.slopePct+' %');
  assert.deepEqual(R.start.roles,['wounded','medic','bearer']);
  assert.ok(R.touch&&Math.abs(R.touch.dx)<120&&Math.abs(R.touch.dz)<60&&R.touch.kmh<75,'touchdown at the smoke: '+JSON.stringify(R.touch));assert.ok(R.landed.phase==='run'&&!R.landed.over&&R.landed.alive&&!R.landed.crash,'the pickup begins instead of ending the sortie: '+JSON.stringify(R.landed));
  assert.ok(R.boarded.phase==='home'&&R.boarded.rescued===1&&R.boarded.t>6&&R.boarded.t<30&&R.boarded.score>=600&&!R.boarded.fig&&/PILOT ABOARD/.test(R.boarded.text),'the pilot is aboard: '+JSON.stringify(R.boarded));
  assert.ok(R.hunters.n===2&&R.hunters.escape&&/BANDITS 2/.test(R.hunters.text),'two bandits that never hold up the return: '+JSON.stringify(R.hunters));assert.ok(R.takeoff&&R.takeoff.run<190&&R.alive,'off the meadow again: '+JSON.stringify(R.takeoff));

  // ---- 2d. Build 261: the pickups get teeth - infantry that run at the standing aeroplane, nests along the way, decoy smokes with an ambush, a power line across the approach ----
  const TH=await page.evaluate(()=>{
   const dt=1/60,r1=v=>+(+v).toFixed(1),out={};
   // plan: nests, decoys, white parachute, wire (Veteran)
   begin('rescue',1);const lz=sts.plan.lz;
   out.plan={nests:sts.units.filter(u=>!u.decoy&&!u.mobile).length,decoys:(sts.decoys||[]).length,chute:!!sts.chute,wire:!!sts.wire,hidden:sts.units.every(u=>!u.revealed),
    decoyDist:(sts.decoys||[]).map(u=>Math.round(Math.hypot(u.x-lz.x,u.z-lz.z))),nestDist:sts.units.filter(u=>!u.decoy).map(u=>Math.round(Math.hypot(u.x-GERMAN_AF_X,u.z-GERMAN_AF_Z))),weather:weather,radio:null};
   // difficulty counts
   out.counts=[0,1,2].map(d=>{begin('rescue',d);return {nests:sts.units.filter(u=>!u.decoy).length,decoys:(sts.decoys||[]).length};});
   // a nest shows itself when the aeroplane comes near and low, a decoy is an ambush
   begin('rescue',1);said.length=0;{const nest=sts.units.find(u=>!u.decoy&&!u.mobile),dec=sts.decoys[0];
    P.onGround=false;P.pos.set(nest.x+500,groundY(nest.x+500,nest.z)+60,nest.z);P.heading=-Math.PI/2;P.spd=40;P.pitch=0;updateSites(dt);
    out.nestSeen={revealed:nest.revealed,inFlak:flakUnits.includes(nest.t),radio:said.some(t=>/SMALL ARMS FIRE FROM A NEST/.test(t))};
    said.length=0;P.pos.set(dec.x+380,groundY(dec.x+380,dec.z)+60,dec.z);updateSites(dt);
    out.decoySeen={revealed:dec.revealed,radio:said.some(t=>/DECOY SMOKE, AN AMBUSH/.test(t))};}
   // landed at a decoy: not the end of the sortie, an ambush (stsGroundStop is what the end of the landing roll calls)
   begin('rescue',1);said.length=0;{const dec=sts.decoys[0];P.onGround=true;P.pos.set(dec.x+40,groundY(dec.x+40,dec.z)+2,dec.z);P.spd=0;
    const handled=stsGroundStop();out.decoyLanded={handled,revealed:dec.revealed,phase:sts.phase,over:missionOver,radio:said.some(t=>/NO PILOT HERE/.test(t))};}
   // the infantry: they come once the aeroplane stands and the pickup has begun, they run at it and fire; measured standing still for 70 s (the board timer is held by P.spd 3)
   out.troops=[0,1,2].map(d=>{
    begin('rescue',d);const l=sts.plan.lz;P.onGround=true;P.landingRoll=null;P.pos.set(l.x+10,groundY(l.x+10,l.z+34)+1.5,l.z+34);P.heading=Math.PI/2;P.spd=0;P.throttle=0;
    stsBeginPickup(sts,0);const hull0=P.hull;let first=null,spawnT=null,minD=1e9,tr=0;
    for(let t=0;t<70&&P.alive;t+=dt){P.spd=3;updateSites(dt);updateFlak(dt);const before=tracers.length;updateTracers(dt);
     if(spawnT==null&&sts.troops.on)spawnT=r1(t);
     for(const u of sts.units)if(u.mobile&&u.revealed)minD=Math.min(minD,Math.hypot(u.x-P.pos.x,u.z-P.pos.z));
     if(first==null&&P.hull<hull0)first=r1(t);}
    const mob=sts.units.filter(u=>u.mobile);
    return {d,squads:mob.length,spawnT,minD:Math.round(minD),firstHit:first,loss:r1(hull0-P.hull),alive:P.alive,tracers:tracers.length};});
   // the power line: struck on a flat low approach, cleared forty feet above it, announced from afar
   begin('rescue',1);said.length=0;{const w=sts.wire,mid=w.pts[0][6],hull0=P.hull;P.onGround=false;P.heading=0;P.spd=40;
    P.pos.set(w.cx,groundY(w.cx,w.cz)+40,w.cz);updateSites(dt);out.wireWarn=said.some(t=>/POWER LINE ACROSS THE APPROACH/.test(t));
    P.pos.set(mid.x,mid.y+25,mid.z);updateSites(dt);out.wireAbove={broken:w.broken,loss:r1(hull0-P.hull)};
    P.pos.set(mid.x,mid.y,mid.z);const hull1=P.hull;updateSites(dt);out.wireStruck={broken:w.broken,loss:r1(hull1-P.hull),radio:said.some(t=>/WIRE STRIKE/.test(t)),hidden:w.group.children.filter(o=>o.isLine).every(o=>!o.visible)};}
   // which pickups carry what
   out.kinds={};for(const id of ['rescue','courier','rock','moon','spotter','rats']){begin(id,1);out.kinds[id]={units:sts.units.length,wire:!!sts.wire,decoys:(sts.decoys||[]).length};}
   // the weather of the Storch sorties: fog, rain, low overcast and haze instead of clear skies (the plan's list; each start draws one)
   out.wx={};for(const id of ['rescue','spotter','rats','courier','rock','moon']){const i=MISSIONS.findIndex(m=>m.id===id),pl=FlightPlans.europe[i];out.wx[id]={list:pl.weather,events:(pl.events||[]).filter(e=>e.weather).map(e=>e.weather)};}
   // reset leaves nothing behind
   begin('rescue',1);const grp=sts.wire.group,ch=sts.chute,us=sts.units.map(u=>u.group);begin(null);out.reset={wire:!!grp.parent,chute:!!ch.parent,units:us.some(g=>!!g.parent)};
   return out;
  });
  report.threats=TH;
  assert.deepEqual(TH.counts,[{nests:1,decoys:1},{nests:2,decoys:1},{nests:2,decoys:2}],'nests and decoys by difficulty (Rookie, Veteran, Ace): '+JSON.stringify(TH.counts));
  assert.ok(TH.plan.nests===2&&TH.plan.decoys===1&&TH.plan.chute&&TH.plan.wire&&TH.plan.hidden,'a Veteran rescue run: two nests, one decoy, the pilot\'s white parachute, a power line, everything hidden: '+JSON.stringify(TH.plan));
  assert.ok(TH.plan.decoyDist.every(d=>d>=600&&d<=1500),'decoys 650-1450 m from the real meadow: '+JSON.stringify(TH.plan.decoyDist));
  assert.ok(TH.nestSeen.revealed&&TH.nestSeen.inFlak&&TH.nestSeen.radio,'a nest shows itself and fires: '+JSON.stringify(TH.nestSeen));
  assert.ok(TH.decoySeen.revealed&&TH.decoySeen.radio,'the decoy is an ambush: '+JSON.stringify(TH.decoySeen));
  assert.ok(TH.decoyLanded.handled&&TH.decoyLanded.revealed&&TH.decoyLanded.radio&&!TH.decoyLanded.over,'down at a decoy is not the end of the sortie: '+JSON.stringify(TH.decoyLanded));
  assert.deepEqual(TH.troops.map(t=>t.squads),[1,1,2],'one squad on Rookie and Veteran, two on Ace: '+JSON.stringify(TH.troops));
  assert.ok(TH.troops.every(t=>t.spawnT>=2&&t.spawnT<=8&&((t.minD<=190&&t.minD>=140)||!t.alive)),'the infantry come a few seconds after the aeroplane stands and stop 170 m from it: '+JSON.stringify(TH.troops));
  assert.ok(TH.troops[1].firstHit!=null&&TH.troops[1].loss>2,'a Veteran who dawdles is hit: '+JSON.stringify(TH.troops[1]));
  assert.ok(!TH.troops[2].alive||TH.troops[2].loss>TH.troops[0].loss,'the Ace infantry hurt more than the Rookie squad: '+JSON.stringify(TH.troops));
  assert.ok(!TH.wireAbove.broken&&TH.wireAbove.loss===0&&TH.wireWarn,'forty feet above the line is clear, and it is announced: '+JSON.stringify(TH.wireAbove));
  assert.ok(TH.wireStruck.broken&&TH.wireStruck.loss>8&&TH.wireStruck.radio&&TH.wireStruck.hidden,'a flat low approach takes the line: '+JSON.stringify(TH.wireStruck));
  assert.deepEqual([TH.kinds.rescue.wire,TH.kinds.courier.wire,TH.kinds.rock.wire,TH.kinds.moon.wire,TH.kinds.spotter.wire,TH.kinds.rats.wire],[true,true,false,false,false,false],'wires on rescue and courier only: '+JSON.stringify(TH.kinds));
  assert.ok(TH.kinds.rescue.units>=3&&TH.kinds.courier.units>=2&&TH.kinds.rock.units>=2&&TH.kinds.moon.units>=2&&TH.kinds.spotter.units>=1&&TH.kinds.rats.units>=2&&TH.kinds.rescue.decoys===1&&TH.kinds.courier.decoys===0,'nests on every Storch sortie, decoys on the rescue run only: '+JSON.stringify(TH.kinds));
  assert.ok(TH.wx.rescue.list.includes('fog')&&TH.wx.rescue.events.includes('fog')&&TH.wx.spotter.events.includes('rain')&&TH.wx.rats.list.includes('lowcloud')&&TH.wx.rock.list.includes('rain')&&TH.wx.courier.events.includes('rain')&&!TH.wx.rescue.list.includes('clear'),'weather instead of clear skies: '+JSON.stringify(TH.wx));
  assert.ok(!TH.reset.wire&&!TH.reset.chute&&!TH.reset.units,'a new sortie leaves no wire, parachute or squad behind: '+JSON.stringify(TH.reset));

  // ---- 2b. Build 251: the other three pickups - courier (low overcast, fighters above the cloud base), ridge landing (short, high, precision bonus), moonlight (three lanterns) ----
  const K=await page.evaluate(()=>{
   const dt=1/60,r1=v=>+(+v).toFixed(1),out={};
   const land=(shortBy,thr)=>{   // a close, low final: 14 m, reference speed, flare at 3 m
    const lz=sts.plan.lz;P.onGround=false;P.landingRoll=null;P.departureAge=null;P.touchResolved=false;P.throttle=.3;P.gear=P.gearTgt=1;P.flap=P.flapTgt=1;const dir=windZ>0?-1:1;P.heading=dir>0?Math.PI/2:-Math.PI/2;P.pitch=.02;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;inputPitch=inputRoll=0;   // into the wind: windZ blows along +x
    const aim=lz.x-dir*shortBy,sp=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app);P.pos.set(aim-dir*260,groundY(aim-dir*260,lz.z)+16,lz.z);P.spd=sp.reference;P.vSpeed=-1.2;
    for(let t=0;t<90&&P.alive&&!missionOver;t+=dt){const agl=P.pos.y-groundY(P.pos.x,P.pos.z);
     if(!P.onGround){{const tvs=-Math.min(2.4,.35+agl*.13);inputPitch=Math.max(-.9,Math.min(.9,(tvs-P.vSpeed)*.36));P.throttle=agl>6?Math.max(0,Math.min(1,.3+(sp.reference-P.spd)*.12)):0;}}else{inputPitch=0;P.throttle=0;}
     updateFlight(dt);updateSites(dt);if(sts.phase!=='fly')break;}
    return {alive:P.alive,phase:sts.phase,crash:window.__crash,over:missionOver,gnd:P.onGround,spd:r1(P.spd),roll:!!P.landingRoll,fig:!!sts.fig,dFig:sts.figPos?Math.round(Math.hypot(P.pos.x-sts.figPos.x,P.pos.z-sts.figPos.z)):null,agl:r1(P.pos.y-groundY(P.pos.x,P.pos.z)),x:Math.round(P.pos.x-sts.plan.lz.x),text:objectiveText()};};
   const board=()=>{let t=0;if(sts.phase==='fly'||!P.onGround)return -1;for(;t<60&&sts.phase!=='home'&&P.alive;t+=dt){P.spd=0;updateFlight(dt);updateSites(dt);}return r1(t);};
   // courier
   begin('courier',1,'lowcloud');const cz=sts.plan.lz;out.courier={weather:weather,text:objectiveText(),dist:Math.round(Math.hypot(cz.x-GERMAN_AF_X,cz.z-GERMAN_AF_Z)),night:!!M().night};
   P.onGround=false;P.spd=40;state=ST.FLIGHT;
   for(let t=0;t<8;t+=dt){P.alive=true;P.pos.set(GERMAN_AF_X-3000,groundY(GERMAN_AF_X-3000,GERMAN_AF_Z)+120,GERMAN_AF_Z);updateSites(dt);}out.courier.lowOk={high:r1(sts.high),hunters:enemyAir.filter(e=>e.alive&&e.sortie).length};
   for(let t=0;t<9;t+=dt){P.alive=true;P.pos.set(GERMAN_AF_X-3000,groundY(GERMAN_AF_X-3000,GERMAN_AF_Z)+420,GERMAN_AF_Z);updateSites(dt);}
   for(let t=0;t<4;t+=dt)updateSites(dt);
   out.courier.spotted={hunters:enemyAir.filter(e=>e.alive&&e.sortie).length,escape:enemyAir.filter(e=>e.sortie).every(e=>e.escapeThreat),said:said.filter(x=>/ABOVE THE CLOUD BASE/.test(x)).length,text:objectiveText()};
   begin('courier');out.courier.landed=land(40,.15);out.courier.boardT=board();out.courier.done={phase:sts.phase,courier:sortieKills.courier||0,rescued:sortieKills.rescued||0,score,text:objectiveText(),left:objectiveLeft()};
   // rock
   begin('rock');const rz=sts.plan.lz,ys=[-30,-15,0,15,30].map(d=>groundY(rz.x+d,rz.z)),yh=groundY(GERMAN_AF_X,GERMAN_AF_Z);
   out.rock={text:objectiveText(),slope:r1((Math.max(...ys)-Math.min(...ys))/60*100),above:Math.round(groundY(rz.x,rz.z)-yh),dist:Math.round(Math.hypot(rz.x-GERMAN_AF_X,rz.z-GERMAN_AF_Z)),observer:!!sts.fig.getObjectByName('observerFieldKit')};
   const sc0=score;out.rock.landed=land(20,.2);out.rock.bonus=score-sc0;out.rock.boardT=board();for(let t=0;t<11;t+=dt)updateSites(dt);out.rock.hunters=enemyAir.filter(e=>e.alive&&e.sortie).length;out.rock.done={phase:sts.phase,rescued:sortieKills.rescued||0};
   // moon
   begin('moon');out.moon={night:!!M().night,lamps:sts.lamps&&sts.lamps.length,lampsInScene:sts.lamps&&sts.lamps.every(l=>l.parent===scene),text:objectiveText(),agent:!!sts.fig.getObjectByName('agentSatchel')};
   out.moon.landed=land(40,.15);out.moon.boardT=board();for(let t=0;t<8;t+=dt)updateSites(dt);out.moon.hunters=enemyAir.filter(e=>e.alive&&e.sortie).length;out.moon.done={phase:sts.phase,rescued:sortieKills.rescued||0,text:objectiveText()};
   begin('rescue');out.reset={lamps:!(sts.lamps&&sts.lamps.length),kind:sts.kind};
   return out;
  });
  report.pickups=K;
  assert.equal(K.rock.observer,true);assert.equal(K.moon.agent,true);
  assert.ok(K.courier.weather==='lowcloud'&&K.courier.dist>8500&&/UNDER THE CLOUDS/.test(K.courier.text),'courier: low overcast, the command post far behind the line: '+JSON.stringify(K.courier));
  assert.ok(K.courier.lowOk.hunters===0&&K.courier.lowOk.high===0,'under the cloud base nobody sees you: '+JSON.stringify(K.courier.lowOk));
  assert.ok(K.courier.spotted.hunters>=1&&K.courier.spotted.escape&&K.courier.spotted.said>=1,'above the cloud base the fighters dive on you (and never hold up the return): '+JSON.stringify(K.courier.spotted));
  assert.ok(K.courier.landed.alive&&K.courier.landed.phase==='run'&&!K.courier.landed.over,'the courier lands at the smoke and the officer comes: '+JSON.stringify(K.courier.landed));
  assert.ok(K.courier.done.phase==='home'&&K.courier.done.courier===1&&K.courier.done.rescued===0&&K.courier.done.score>=600&&Object.keys(K.courier.done.left).length===0&&/ANSWER ABOARD/.test(K.courier.done.text),'the handover: '+JSON.stringify(K.courier.done));
  assert.ok(K.rock.slope<=14&&K.rock.above>-20,'the ridge clearing is a gentle, high spot: '+JSON.stringify(K.rock));
  assert.ok(K.rock.landed.alive&&K.rock.landed.phase==='run'&&K.rock.done.phase==='home'&&K.rock.done.rescued===1,'the observer boards on the ridge: '+JSON.stringify(K.rock));
  assert.ok(K.rock.hunters===1+(1)&&K.rock.bonus>=0,'a pair after nine seconds: '+JSON.stringify(K.rock.hunters));
  assert.ok(K.moon.night&&K.moon.lamps===3&&K.moon.lampsInScene&&/LANTERNS/.test(K.moon.text),'three lanterns at night: '+JSON.stringify(K.moon));
  assert.ok(K.moon.landed.alive&&K.moon.landed.phase==='run'&&K.moon.done.phase==='home'&&K.moon.done.rescued===1&&K.moon.hunters>=1,'the agent boards, the intruders follow: '+JSON.stringify(K.moon));
  assert.ok(K.reset.lamps&&K.reset.kind==='rescue','the lanterns are taken away with the sortie: '+JSON.stringify(K.reset));

  // ---- 2c. Build 253: no yellow dot - a search area (briefing map with distance and course, ring on the minimap), arrow and distance lead to the area, a real person at the meadow,
  // Rookie gets two hunters too, no red sight for an aeroplane without a forward gun ----
  const N=await page.evaluate(()=>{
   const out={},r1=v=>+(+v).toFixed(1);
   begin('rescue',0);const plan=sts.plan,lz=plan.lz,sr=plan.search;
   out.search={r:sr.r,off:Math.round(Math.hypot(sr.x-lz.x,sr.z-lz.z))};
   out.marks=stsMapMarks().map(m=>({kind:m.kind,r:m.r,onLz:Math.hypot(m.x-lz.x,m.z-lz.z)<5}));
   out.brief=stsBriefPoints(M()).map(b=>({r:b.radius,label:b.label,onLz:Math.hypot(b.x-lz.x,b.z-lz.z)<5}));
   P.onGround=false;P.pos.set(sr.x-5000,groundY(sr.x-5000,sr.z)+300,sr.z);state=ST.FLIGHT;updateHUD();
   out.nav={dist:parseFloat(document.getElementById('navDist').textContent),kind:document.getElementById('navKind').textContent,want:r1(5000/MI),base:r1(Math.hypot(P.pos.x-GERMAN_AF_X,P.pos.z-GERMAN_AF_Z)/MI)};
   out.hunt=[0,1,2].map(d=>{diffIdx=d;return stsHuntCount();});diffIdx=0;
   // the people at the pickup are the articulated CrewFigures of the shared set (patient with a stretcher team for the rescue run), not a cylinder with a ball
   const fig=sts.fig;out.person={team:!!sts.aidTeam,arms:fig&&fig.userData&&fig.userData.arms&&fig.userData.arms.length,legs:fig&&fig.userData&&fig.userData.legs&&fig.userData.legs.length,crewFigures:typeof CrewFigures};
   // the red sight: hidden for the Storch (the observer's gun is automatic), still there for a fighter
   P.pos.set(lz.x-3000,groundY(lz.x-3000,lz.z)+300,lz.z);P.spd=45;P.onGround=false;state=ST.FLIGHT;animate();out.sightStorch=document.getElementById('gunsight').style.display;
   return out;
  });
  report.search=N;
  assert.ok(N.search.r>=1000&&N.search.off>=100&&N.search.off<=N.search.r,'the search circle is about a kilometre wide and the meadow lies inside it, not at its middle: '+JSON.stringify(N.search));
  assert.ok(N.marks.length===1&&N.marks[0].kind==='SEARCH'&&N.marks[0].r>=1000&&!N.marks[0].onLz,'the minimap shows the circle, not the yellow point: '+JSON.stringify(N.marks));
  assert.ok(N.brief.length===1&&N.brief[0].r>=1000&&!N.brief[0].onLz&&/Search area, about \d+ km [NESW]{1,2} of the strip, course \d{3} deg/.test(N.brief[0].label),'the briefing map shows the search area with distance and course: '+JSON.stringify(N.brief));
  assert.ok(Math.abs(N.nav.dist-N.nav.want)<.3&&Math.abs(N.nav.dist-N.nav.base)>1&&/SEARCH|AREA/i.test(N.nav.kind),'the arrow and the distance lead to the search area, not to the base: '+JSON.stringify(N.nav));
  assert.deepEqual(N.hunt,[2,2,3],'Rookie gets two hunters as well (one used to look as if nobody attacked): '+JSON.stringify(N.hunt));
  assert.ok(N.person.crewFigures==='object'&&N.person.team&&N.person.arms===2&&N.person.legs===2,'articulated people with an aid team, not a cylinder with a ball: '+JSON.stringify(N.person));
  assert.equal(N.sightStorch,'none','no red sight for an aeroplane without a forward gun');

  // ---- 3. Bonus Spotter: low and slow in a circle for 12 s, then fire for effect; too fast / too high / outside counts for nothing ----
  const S=await page.evaluate(()=>{
   const dt=1/60,r1=v=>+(+v).toFixed(1),out={};begin('spotter');const zs=sts.plan.zones;
   out.start={text:objectiveText(),n:zs.length,dist:zs.map(z=>Math.round(Math.hypot(z.x-GERMAN_AF_X,z.z-GERMAN_AF_Z)))};
   const hold=(i,agl,kmh,sec,off=0)=>{const z=zs[i];P.onGround=false;P.spd=kmh/3.6;for(let t=0;t<sec;t+=dt){P.alive=true;state=ST.FLIGHT;P.pos.set(z.x+off,groundY(z.x,z.z)+agl,z.z);P.heading=Math.PI/2;updateSites(dt);}};
   hold(0,100,200,8);out.fast=sts.hold;hold(0,400,100,8);out.high=sts.hold;hold(0,100,100,8,700);out.outside=sts.hold;
   hold(0,100,100,6);out.half=r1(sts.hold);hold(0,100,100,7);out.marked={zone:sts.zone,kills:sortieKills.zone,shell:!!sts.shell,said:said.slice(-1)[0]};
   const sc0=score;P.pos.set(zs[0].x+2500,groundY(zs[0].x+2500,zs[0].z)+150,zs[0].z);for(let t=0;t<14;t+=dt)updateSites(dt);out.barrage={score:score-sc0,left:sts.blasts.length};
   P.hull=60;hold(1,100,100,12);const h0=P.hull,z1=zs[1];for(let t=0;t<14&&P.alive;t+=dt){P.pos.set(z1.x,groundY(z1.x,z1.z)+60,z1.z);updateSites(dt);}out.careless={zone:sts.zone,lost:r1(h0-P.hull),alive:P.alive};
   for(let t=0;t<14;t+=dt){P.pos.set(z1.x+3000,groundY(z1.x+3000,z1.z)+150,z1.z);P.alive=true;updateSites(dt);}out.hunters=enemyAir.filter(e=>e.alive&&e.sortie).length;
   P.hull=60;hold(2,100,100,13);out.done={zone:sts.zone,kills:sortieKills.zone,text:objectiveText(),left:objectiveLeft()};return out;
  });
  report.spotter=S;
  assert.equal(S.start.n,3);assert.ok(S.start.dist.every((d,i)=>d>3500&&(i===0||d>S.start.dist[i-1])),'zones farther and farther from the strip: '+S.start.dist);assert.ok(/OBSERVE ZONE 1\/3/.test(S.start.text));
  assert.deepEqual([S.fast,S.high,S.outside],[0,0,0],'too fast, too high or outside the circle counts for nothing');assert.ok(S.half>5&&S.half<7);assert.ok(S.marked.zone===1&&S.marked.kills===1&&S.marked.shell&&/TARGET RECEIVED/.test(S.marked.said),JSON.stringify(S.marked));
  assert.ok(S.barrage.score===300&&S.barrage.left===0,'the barrage lands and pays 300: '+JSON.stringify(S.barrage));assert.ok(S.careless.lost>10&&S.careless.zone===2,'staying in the circle under the barrage costs hull: '+JSON.stringify(S.careless));
  assert.equal(S.hunters,2,'fighters come after the second zone');assert.ok(S.done.zone===3&&S.done.kills===3&&/FIRE MISSION DONE/.test(S.done.text)&&Object.keys(S.done.left).length===0,'all three zones: '+JSON.stringify(S.done));

  // ---- 4. Bonus Rat Flight: airborne deep behind the line, hunters after 22 s that never hold up the return; the observer shoots by himself ----
  const Q=await page.evaluate(()=>{
   const dt=1/60,r1=v=>+(+v).toFixed(1),out={};begin('rats');
   out.start={onGround:P.onGround,agl:Math.round(P.pos.y-groundY(P.pos.x,P.pos.z)),kmh:Math.round(P.spd*3.6),text:objectiveText(),dist:Math.round(Math.hypot(P.pos.x-GERMAN_AF_X,P.pos.z-GERMAN_AF_Z)),hunt:sts.hunt&&sts.hunt.n};
   for(let t=0;t<30&&P.alive;t+=dt){let top=-1e9;const f=noseDir();for(const d of [0,250,500,800,1100])top=Math.max(top,groundY(P.pos.x+f.x*d,P.pos.z+f.z*d));inputPitch=Math.max(-.5,Math.min(.5,(top+70-P.pos.y)*.02-P.vSpeed*.07));P.throttle=.7;frame(dt);}
   const hs=enemyAir.filter(e=>e.alive&&e.sortie);out.hunters={n:hs.length,escape:hs.every(e=>e.escapeThreat),text:objectiveText(),alive:P.alive};
   const e=hs[0],pf=noseDir(),a0=P.ammo;let hp0=e.hp;
   for(let k=0;k<8/dt;k++){P.alive=true;state=ST.FLIGHT;P.hull=60;e.pos.copy(P.pos).addScaledVector(pf,-280).add(new THREE.Vector3(0,12,0));e.heading=P.heading;e.vel.copy(pf).multiplyScalar(e.spd);P.throttle=.7;updateFlight(dt);updateStorchGunner(dt);updateBullets(dt);updateTracers(dt);}
   out.gunner={ammoUsed:a0-P.ammo,hp:[hp0,e.hp],down:!e.alive};return out;
  });
  report.rats=Q;
  assert.ok(!Q.start.onGround&&Q.start.agl>=50&&Q.start.agl<=75&&Q.start.kmh>100&&Q.start.dist>11000&&Q.start.hunt===3,'airborne at tree height, 13 km behind the line: '+JSON.stringify(Q.start));
  assert.ok(Q.hunters.n===3&&Q.hunters.escape&&/BANDITS 3/.test(Q.hunters.text)&&Q.hunters.alive,'three bandits after 22 s: '+JSON.stringify(Q.hunters));assert.ok(Q.gunner.ammoUsed>8&&Q.gunner.hp[1]<Q.gunner.hp[0],'the observer fires at a fighter in his cone: '+JSON.stringify(Q.gunner));

  assert.deepEqual(errors,[],'page errors: '+errors.slice(0,4).join(' | '));
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/storch-flight-browser.json'),JSON.stringify(report,null,1));
  console.log('Storch flight WebGL: OK',JSON.stringify({run:T.runM,level:T.levelFull,turn:T.turn.degPerS,boarded:R.boarded.t,zones:S.done.zone,hunters:Q.hunters.n}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
