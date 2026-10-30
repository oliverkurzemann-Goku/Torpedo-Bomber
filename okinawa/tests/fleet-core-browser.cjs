/* The computed flight core (flight-core.js + flight-control.js) for all six Rhine types inside the shipped
 * remagen-mission.html (loaded with ?arcade=core: since Build 229 the default ARCADE flies the previous physics,
 * this test is about the player's core Normal law): real take-off from the strip with the mission load (and the worst case of every bomb
 * the type carries), full-stick turn, AERO loop, accelerated stall with recovery, idle deceleration and
 * 20/60/120 FPS. Writes app/release/flight-core-fleet-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Fleet core WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname==='/remagen-mission.html'){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
const KINDS=['p47','bf109','fw190','ju87','me262','me163'];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(600000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=220&arcade=core');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:250});
  await page.evaluate(async kinds=>{for(const k of kinds)await ensureModel(k);renderer.setPixelRatio(.3);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;},KINDS);
  const report={};
  for(const kind of KINDS){
   report[kind]=await page.evaluate(kind=>{
    const unwrap=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b)),r1=v=>+(+v).toFixed(1);
    const missionIndex=MISSIONS.findIndex(m=>m.ac===kind&&!m.free&&!m.circuits&&!m.qual);
    const begin=()=>{startMission(missionIndex);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
     for(const e of enemyAir)e.alive=false;inputRoll=inputPitch=0;aeroMode=false;};
    const res={mission:MISSIONS[missionIndex].title,core:coreOn(kind)};
    // 1. take-off: full power, half back stick from 0.95 x rotation speed, gear up at 40 m
    const takeoff=worst=>{begin();if(worst){P.bombs=FlightCore.CAPACITY[kind]?.bomb??P.bombs;}
     const lo=FlightCore.loadout(FlightCore.model(kind),coreLoadout());
     if(!P.onGround)return {airborneStart:true,alive:P.alive,spd:r1(P.spd),agl:r1(P.pos.y-groundY(P.pos.x,P.pos.z))};
     P.throttle=1;let t=0,liftoff=null,run=null;const x0=P.pos.x,z0=P.pos.z,stripEnd=AF_X+RWY_LEN/2;
     for(;t<70&&P.alive;t+=1/60){
      const vr=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall*1.1;
      if(P.onGround&&P.spd>.95*vr)inputPitch=.5;
      updateFlight(1/60);
      if(!P.onGround&&liftoff==null){liftoff=t;run=Math.hypot(P.pos.x-x0,P.pos.z-z0);inputPitch=.3;}
      if(liftoff!=null&&P.pos.y-groundY(P.pos.x,P.pos.z)>40){P.gearTgt=0;if(P.flapTgt>0&&P.spd>1.4*SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall)P.flapTgt=0;}
      if(liftoff!=null&&t-liftoff>40)break;
     }
     return {massKg:Math.round(lo.mass),bombs:P.bombs,alive:P.alive,death:P.alive?null:document.getElementById('rsTitle').textContent,liftoff:r1(liftoff??-1),groundRun:Math.round(run??-1),
      stripLeft:Math.round(stripEnd-(x0+(run||0))),rato:P.rato!=null&&P.rato!==undefined?r1(P.rato):null,
      after40s:{spd:r1(P.spd),agl:Math.round(P.pos.y-groundY(P.pos.x,P.pos.z)),climb:r1(P.vSpeed)}};};
    res.takeoff=takeoff(false);res.takeoffAllBombs=takeoff(true);
    const m=FlightCore.model(kind);
    const setup=(speed,alt,throttle=1)=>{begin();P.alive=true;P.hull=acDef().hull;SortieFeatures.Damage.reset(P,P.hull);P.bombs=P.rockets=0;P.fuel=50;P.tankAttached=false;
     P.onGround=false;P.landingRoll=null;P.touchResolved=false;P.pos.set(AF_X,alt,AF_Z);P.gear=P.gearTgt=P.flap=P.flapTgt=0;P.nLoad=1;P.core=null;P.coreStall=0;P.coreDrop=0;
     P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;P.heading=0;P.spd=speed;P.throttle=throttle;P.groundPower=throttle;P.departureAge=null;inputRoll=inputPitch=0;aeroMode=false;};
    const vmax=FlightCore.levelMaxSpeed(m,2000,m.mass*FlightCore.G);res.vmax2000=r1(vmax*3.6);
    // 2. full-stick turn, Normal mode
    res.turn={};
    for(const f of [.45,.7]){const v=f*vmax;setup(v,2000);inputRoll=1;let travelled=0,last=P.heading,time=null;
     for(let i=0;i<60*90;i++){updateFlight(1/60);travelled+=Math.abs(unwrap(P.heading,last));last=P.heading;if(travelled>=2*Math.PI){time=(i+1)/60;break;}}
     res.turn[f]={startKmh:Math.round(v*3.6),seconds:time&&r1(time),endKmh:Math.round(P.spd*3.6),altChange:Math.round(P.pos.y-2000),bankDeg:Math.round(P.roll*180/Math.PI),n:+(P.nLoad||1).toFixed(2),alive:P.alive};}
    // 3. AERO loop, full pull from the AERO gate x 1.1
    const gate=FlightControl.aeroGate(kind,FlightCore.GAME.manoeuvreGain);setup(gate*1.1,2500);aeroMode=true;inputPitch=1;let turned=0,prev=P.pitch,minV=P.spd,time=null;
    for(let i=0;i<60*40;i++){updateFlight(1/60);turned+=Math.abs(unwrap(P.pitch,prev));prev=P.pitch;minV=Math.min(minV,P.spd);if(turned>=2*Math.PI){time=(i+1)/60;break;}}
    res.loop={entryKmh:Math.round(gate*1.1*3.6),seconds:time&&r1(time),minKmh:Math.round(minV*3.6),altChange:Math.round(P.pos.y-2500),alive:P.alive};
    // 4. stall: idle, hold the nose up (Normal mode) until the wing quits, then let go with full power
    const vs=FlightCore.stallSpeed(m,2500,FlightCore.loadout(m,{fuel:50}).ratio);setup(1.25*vs,2500,0);inputPitch=.6;let peak=0,bankMax=0,onset=null;
    for(let i=0;i<60*20&&peak<.6;i++){updateFlight(1/60);peak=Math.max(peak,P.coreStall||0);if(onset==null&&peak>.3)onset=(i+1)/60;}
    let buffeted=false;for(let i=0;i<60;i++){updateFlight(1/60);peak=Math.max(peak,P.coreStall||0);bankMax=Math.max(bankMax,Math.abs(P.roll));buffeted=buffeted||(P.core?.buffet||0)>.35;}
    inputPitch=0;P.throttle=1;let rec=null;const y0=P.pos.y;for(let i=0;i<60*8;i++){updateFlight(1/60);bankMax=Math.max(bankMax,Math.abs(P.roll));if(rec==null&&(P.coreStall||0)<.05)rec=(i+1)/60;}
    res.stall={entryKmh:Math.round(1.25*vs*3.6),onset:onset&&r1(onset),peak:+peak.toFixed(2),buffeted,dropBankDeg:Math.round(bankMax*180/Math.PI),recoveredAfter:rec&&r1(rec),
     endStall:+(P.coreStall||0).toFixed(2),alive:P.alive,heightLostInRecovery:Math.round(y0-P.pos.y)};
    // 5. idle deceleration at 75 % Vmax, 1 s
    setup(.75*vmax,1500,0);for(let i=0;i<60;i++)updateFlight(1/60);res.idleDecel1s=+(.75*vmax-P.spd).toFixed(2);
    // 6. frame-rate independence: 8 s climbing turn
    res.fps={};for(const fps of [20,60,120]){setup(.6*vmax,1500);inputRoll=.7;inputPitch=.4;for(let i=0;i<8*fps;i++)updateFlight(1/fps);
     res.fps[fps]={spd:+P.spd.toFixed(2),heading:+P.heading.toFixed(3),alt:+P.pos.y.toFixed(1)};}
    return res;
   },kind);
   console.log(kind,JSON.stringify(report[kind]));
  }
  assert.deepEqual(errors,[]);
  for(const [kind,r] of Object.entries(report)){
   assert.ok(r.core,kind+': core active');
   for(const t of [r.takeoff,r.takeoffAllBombs]){
    assert.ok(t.alive,kind+': take-off survives '+JSON.stringify(t));
    if(!t.airborneStart){assert.ok(t.liftoff>0&&t.stripLeft>0,kind+': lifts off on the strip '+JSON.stringify(t));assert.ok(t.after40s.agl>60,kind+': climbs away '+JSON.stringify(t));}
   }
   for(const f of ['0.45','0.7'])assert.ok(r.turn[f].seconds&&r.turn[f].alive,kind+': full turn at '+f);
   assert.ok(r.loop.seconds&&r.loop.alive,kind+': loop from the AERO gate');
   assert.ok(r.stall.peak>.5,kind+': full pull at low speed stalls the wing');
   assert.ok(r.stall.recoveredAfter&&r.stall.alive,kind+': letting go recovers');
   assert.ok(r.idleDecel1s>0,kind+': idle slows the aeroplane');
   const f=r.fps;for(const k of ['spd','heading','alt'])assert.ok(Math.abs(f[20][k]-f[120][k])<=(k==='alt'?6:k==='heading'?.06:.4),kind+': frame-rate independent '+k+' '+JSON.stringify(f));
  }
  fs.writeFileSync(path.join(root,'app/release/flight-core-fleet-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('Fleet core browser (Rhine): OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
