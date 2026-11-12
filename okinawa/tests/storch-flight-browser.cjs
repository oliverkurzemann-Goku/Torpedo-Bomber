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
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=249&surprises=off&sortie='+sortie);
  // the hangar sortie opens the briefing at once: wait for the world, not for the menu
  await page.waitForFunction(()=>realWorldReady&&(state===ST.MENU||state===ST.BRIEF),null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['fi156','p47'].map(ensureModel));renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;
   const orig=crash;window.__crash=null;crash=(t,m)=>{window.__crash=t+': '+m;orig(t,m);};window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.frame=dt=>{SortieFeatures.Damage.tick(P,dt);updateFlight(dt);updateStorchGunner(dt);updateFlak(dt);updateSites(dt);updateTargets(dt);updateEnemyAir(dt);updateBullets(dt);updateTracers(dt);updateOrdnance(dt);updateExplosions(dt);updateSmoke(dt);updateDebris(dt);};
   window.begin=(id,diff=1)=>{diffIdx=diff;const i=id?MISSIONS.findIndex(m=>m.id===id):0;selectedMission=i;briefPlan=chooseEuropePlan(i);startMission(i);if(launchIntro)finishLaunchIntro(false);show('menu',false);show('brief',false);show('result',false);state=ST.FLIGHT;P.alive=true;inputRoll=inputPitch=0;window.__crash=null;said.length=0;return i;};
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

  // ---- 2. Bonus Rescue Run: land at the yellow smoke, the pilot runs and boards (6 s), fighters come, take off again from the meadow ----
  const R=await page.evaluate(()=>{
   const dt=1/60,r1=v=>+(+v).toFixed(1),out={};begin('rescue');
   out.start={onGround:P.onGround,text:objectiveText(),kind:sts&&sts.kind,fig:!!(sts&&sts.fig)};const lz=sts.plan.lz;
   const ys=[-190,-100,0,100,190].map(d=>groundY(lz.x+d,lz.z));out.slopePct=r1((Math.max(...ys)-Math.min(...ys))/380*100);
   P.onGround=false;P.landingRoll=null;P.departureAge=null;P.touchResolved=false;P.throttle=.3;P.gear=P.gearTgt=1;P.flap=P.flapTgt=1;P.heading=Math.PI/2;P.pitch=.02;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;inputPitch=inputRoll=0;
   // a 3.5 degree path to a point 30 m short of the meadow's middle: the wind of the start (random) must not decide whether the test works
   const aim=lz.x-30,slope=Math.tan(3.5*Math.PI/180);P.pos.set(aim-450,Math.max(groundY(aim,lz.z)+450*slope,groundY(aim-450,lz.z)+25),lz.z);const sp=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app);P.spd=sp.reference;P.vSpeed=-1.5;
   let touch=null;for(let t=0;t<120&&P.alive&&!missionOver;t+=dt){const agl=P.pos.y-groundY(P.pos.x,P.pos.z),gy=groundY(aim,lz.z),pathAlt=Math.max(0,(aim-P.pos.x))*slope+gy,err=P.pos.y-pathAlt;
    const tvs=agl<4?-.4:Math.max(-3,Math.min(-.3,-1.2-err*.25)),tspd=sp.reference*(agl>4?1:.85);
    if(!P.onGround){inputPitch=Math.max(-.5,Math.min(.5,(tvs-P.vSpeed)*.18));P.throttle=agl<2?0:Math.max(0,Math.min(1,.35+(tspd-P.spd)*.12));}else{if(touch==null)touch={kmh:Math.round(P.spd*3.6),dx:Math.round(P.pos.x-lz.x),dz:Math.round(P.pos.z-lz.z)};inputPitch=0;P.throttle=0;}
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
  assert.ok(R.touch&&Math.abs(R.touch.dx)<120&&Math.abs(R.touch.dz)<60&&R.touch.kmh<75,'touchdown at the smoke: '+JSON.stringify(R.touch));assert.ok(R.landed.phase==='run'&&!R.landed.over&&R.landed.alive&&!R.landed.crash,'the pickup begins instead of ending the sortie: '+JSON.stringify(R.landed));
  assert.ok(R.boarded.phase==='home'&&R.boarded.rescued===1&&R.boarded.t>6&&R.boarded.t<30&&R.boarded.score>=600&&!R.boarded.fig&&/PILOT ABOARD/.test(R.boarded.text),'the pilot is aboard: '+JSON.stringify(R.boarded));
  assert.ok(R.hunters.n===2&&R.hunters.escape&&/BANDITS 2/.test(R.hunters.text),'two bandits that never hold up the return: '+JSON.stringify(R.hunters));assert.ok(R.takeoff&&R.takeoff.run<190&&R.alive,'off the meadow again: '+JSON.stringify(R.takeoff));

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
