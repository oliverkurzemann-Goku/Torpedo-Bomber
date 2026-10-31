/* Build 232: the ARCADE Me 262 (the default, previous flight physics) climbs and pitches properly at low speed - real game, real Me 262.
 * Before: the nose was held at 10-15 degrees (a fixed slow-speed cap of 14.8 deg at 60 m/s falling to 8.8 deg at 140, plus the
 * departure envelope) and took 20 s to reach 15 degrees at 65 m/s. Now the ceiling is the energy model's own (me262-performance.js
 * pitchCeiling: thrust surplus + the speed above 1.2 x stall spent over 10 s) and the nose rate is no longer the slowest in the fleet.
 *  1. take-off, stick fully back from lift-off: ~21 deg after 3 s, ~26 deg after 10 s, never a stall, the speed stays above the stall margin;
 *  2. slow flight in the air (engine running): 15 deg inside 1.5 s at 65-100 m/s, a clearly steeper zoom with more speed, no stall, 20/60/120 FPS alike;
 *  3. half stick stays proportional; idle engine with gear down still gets the old flare angle; fast flight (160 m/s) unchanged;
 *  4. nothing else changed: REALISTIC (the flight core, ?arcade=core) gives the Build 231 numbers, and P-47 / Bf 109 climb out as before.
 * Writes app/release/me262-arcade-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Me 262 ARCADE WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname==='/remagen-mission.html'){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
// In-page helpers, shared by every scenario: start a mission of a type, take off with the stick back, or hang in the air.
const HELPERS=`
 window.__start=kind=>{const i=MISSIONS.findIndex(m=>(m.ac||'p47')===kind&&!m.free&&!m.circuits&&!m.qual);startMission(i);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;for(const e of enemyAir)e.alive=false;inputRoll=0;inputPitch=0;aeroMode=false;};
 window.__takeoff=(kind,seconds)=>{
  const dt=1/60,deg=v=>v*180/Math.PI,r1=v=>+(+v).toFixed(1);__start(kind);P.throttle=1;
  const stallNow=()=>SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall;
  let t=0,off=null,peak=0,minRatio=9;const row={};
  for(;t<90&&P.alive;t+=dt){
   const vr=stallNow()*1.1;if(P.onGround&&P.spd>.95*vr)inputPitch=.5;updateFlight(dt);
   if(!P.onGround&&off==null){off=t;inputPitch=1;}
   if(off!=null){const since=t-off,agl=P.pos.y-groundY(P.pos.x,P.pos.z);if(agl>40)P.gearTgt=0;if(agl>60)P.flapTgt=0;
    peak=Math.max(peak,deg(P.pitch));if(since>8)minRatio=Math.min(minRatio,P.spd/stallNow());
    for(const s of [1,3,5,10,20,30])if(since>=s&&!(s in row))row[s]={pitch:r1(deg(P.pitch)),climb:r1(P.vSpeed),ms:r1(P.spd),agl:Math.round(agl)};
    if(since>seconds)break;}
  }
  return {coreOn:coreOn(),alive:P.alive,liftoffS:off==null?null:r1(off),peak:r1(peak),minRatio:r1(minRatio),row};
 };
 window.__air=(kind,v0,stick,fps,opt)=>{
  const dt=1/fps,deg=v=>v*180/Math.PI,r1=v=>+(+v).toFixed(1);opt=opt||{};__start(kind);
  P.onGround=false;P.landingRoll=null;P.pos.y=groundY(P.pos.x,P.pos.z)+1500;P.spd=v0;P.pitch=0;P.roll=0;P.pitchVel=0;P.rollVel=0;P.vSpeed=0;
  P.gear=opt.gear?1:0;P.gearTgt=P.gear;P.flap=opt.flaps||0;P.flapTgt=P.flap;P.throttle=opt.idle?0:1;P.groundPower=opt.idle?0:1;P.departureAge=null;P.pitchRef=null;P.fuel=Math.max(P.fuel||0,60);
  const stall=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall;
  const row={};let peak=0,minV=1e9,t15=null,stalled=0;
  for(let t=0;t<12&&P.alive;t+=dt){inputPitch=stick;updateFlight(dt);peak=Math.max(peak,deg(P.pitch));minV=Math.min(minV,P.spd);if(P.spd<stall)stalled++;
   if(t15==null&&deg(P.pitch)>=15)t15=t;for(const s of [1,3,8])if(t>=s&&!(s in row))row[s]={pitch:r1(deg(P.pitch)),climb:r1(P.vSpeed),ms:r1(P.spd)};}
  return {stall:r1(stall),alive:P.alive,peak:r1(peak),minRatio:r1(minV/stall),stalled,t15:t15==null?null:r1(t15),row};
 };`;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote','--in-process-gpu']});
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  for(const law of ['classic','core']){
   await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=me262arcade'+(law==='core'?'&arcade=core':''));
   await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
   await page.evaluate(async h=>{(0,eval)(h);await Promise.all(['me262','p47','bf109'].map(ensureModel));renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;},HELPERS);
   const take=await page.evaluate(()=>__takeoff('me262',45));report[law+'-me262-takeoff']=take;console.log(law,'Me 262 take-off',JSON.stringify(take));
   assert.ok(take.alive&&take.liftoffS!=null,law+': the Me 262 takes off and lives');
   if(law==='classic'){
    assert.equal(take.coreOn,false,'ARCADE flies the previous physics');
    assert.ok(take.row[3].pitch>=18&&take.row[3].climb>=15,'3 s after lift-off the nose is at 18+ deg and she climbs 15+ m/s (it was 14 deg / 12.9 m/s): '+JSON.stringify(take.row[3]));
    assert.ok(take.row[10].pitch>=22&&take.row[10].climb>=20,'10 s: 22+ deg and 20+ m/s (it was 12.8 deg / 16 m/s): '+JSON.stringify(take.row[10]));
    assert.ok(take.row[20].pitch>=22&&take.row[30].agl>=650,'she keeps climbing (it was 13.7 deg at 20 s and 581 m at 30 s): '+JSON.stringify(take.row[30]));
    assert.ok(take.peak<=33,'but not beyond a plausible jet climb: '+take.peak);
    assert.ok(take.minRatio>=1.12,'the speed stays above the stall margin all the way: '+take.minRatio);
    // 2. slow flight in the air, engine running, at three frame rates
    const fast=[];
    for(const v0 of [65,80,100])for(const fps of [20,60,120]){
     const r=await page.evaluate(({v0,fps})=>__air('me262',v0,1,fps),{v0,fps});report[law+'-me262-air-v'+v0+'-'+fps+'fps']=r;
     assert.ok(r.alive&&r.stalled===0,v0+' m/s '+fps+' FPS: no stall '+JSON.stringify(r));
     assert.ok(r.t15!=null&&r.t15<1.5,v0+' m/s '+fps+' FPS: 15 deg inside 1.5 s (it took 20 s at 65 m/s, 11.5 s at 80 m/s): '+r.t15);
     assert.ok(r.minRatio>=1.12,v0+' m/s '+fps+' FPS: the speed stays above the stall margin: '+r.minRatio);
     if(fps===60)fast.push(r);
    }
    const [r65,r80,r100]=fast;
    assert.ok(r65.peak>=25&&r65.peak<=34,'65 m/s: 25-34 deg ('+r65.peak+')');
    assert.ok(r80.row[3].pitch>=r65.row[3].pitch&&r100.row[3].pitch>=r80.row[3].pitch,'more speed to spend, a steeper zoom: '+[r65,r80,r100].map(r=>r.row[3].pitch).join(' / '));
    assert.ok(r100.row[3].pitch>=40&&r100.row[3].pitch<=60,'100 m/s: a real zoom climb ('+r100.row[3].pitch+')');
    for(const v0 of [65,80,100]){const a=report[law+'-me262-air-v'+v0+'-20fps'].row[3].pitch,b=report[law+'-me262-air-v'+v0+'-120fps'].row[3].pitch;assert.ok(Math.abs(a-b)<2.5,v0+' m/s: the frame rate does not change the climb ('+a+' vs '+b+')');}
    // 3. half stick stays proportional; an idle engine with the gear down keeps the landing-flare angle; fast flight unchanged
    const half=await page.evaluate(()=>__air('me262',100,.5,60));report[law+'-me262-half-stick']=half;
    assert.ok(half.peak>=28&&half.peak<=33,'half stick commands half of the pitch range, not the ceiling ('+half.peak+')');
    const idle=await page.evaluate(()=>__air('me262',62,1,60,{idle:true,gear:true,flaps:.5}));report[law+'-me262-idle-dirty']=idle;
    assert.ok(idle.alive&&idle.peak>=14&&idle.peak<=27,'idle, gear down, half flaps: the old flare angle is kept, no more than the energy allows ('+idle.peak+')');
    const high=await page.evaluate(()=>__air('me262',160,1,60));report[law+'-me262-fast']=high;
    assert.ok(high.peak>=58&&high.row[3].climb>=110,'160 m/s: the full fast climb, as before ('+high.peak+' deg, '+high.row[3].climb+' m/s)');
    // 4. other types untouched: P-47 and Bf 109 climb out as in Build 231 (3 s after lift-off: 7.1 deg / 16.6 deg)
    const p47=await page.evaluate(()=>__takeoff('p47',6)),bf=await page.evaluate(()=>__takeoff('bf109',6));report[law+'-p47-takeoff']=p47;report[law+'-bf109-takeoff']=bf;
    assert.ok(Math.abs(p47.row[3].pitch-7.1)<=1.2,'P-47 still climbs out gently (departure envelope): '+p47.row[3].pitch);
    assert.ok(Math.abs(bf.row[3].pitch-16.6)<=1.8,'Bf 109 climbs out as before: '+bf.row[3].pitch);
   }else{
    // REALISTIC / the flight core: untouched - the Build 231 numbers (20.2 deg / 21.9 m/s after 3 s, 25.6 deg at 30 s)
    assert.equal(take.coreOn,true,'?arcade=core flies the computed core');
    assert.ok(Math.abs(take.row[3].pitch-20.2)<=1.2&&Math.abs(take.row[3].climb-21.9)<=1.5,'the core take-off is the Build 231 one: '+JSON.stringify(take.row[3]));
    assert.ok(Math.abs(take.row[30].pitch-25.6)<=1.5,'and so is the steady climb: '+JSON.stringify(take.row[30]));
   }
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'app/release/me262-arcade-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('Me 262 ARCADE browser: OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
