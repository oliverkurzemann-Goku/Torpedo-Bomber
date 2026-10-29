/* The computed flight core for the four Pacific types inside the shipped torpedo-carrier.html: real deck
 * launch with the mission load (ship at launch wind, take-off flap, bow exit and climb-out), full-stick
 * turn, AERO loop (Zero/SBD), stall with recovery, idle deceleration and 20/60/120 FPS.
 * Writes app/release/flight-core-pacific-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Pacific core WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname==='/torpedo-carrier.html'){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});

const KINDS={avenger:m=>!m.sbd&&!m.corsair&&!m.defend&&!m.free&&!m.qual&&m.torps>0,sbd:m=>m.sbd&&m.torps>0,corsair:m=>m.corsair&&!m.shoreStrike,zero:m=>m.defend};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(600000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?campaign=1&v=220');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:250});
  await page.evaluate(()=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;const orig=crash;window.__crash=null;crash=(t,m)=>{window.__crash=t+': '+m;orig(t,m);};});
  const report={};
  for(const [kind,pick] of Object.entries(KINDS)){
   const index=await page.evaluate(src=>MISSIONS.findIndex(eval(src)),pick.toString());
   await page.evaluate(async index=>{selectedMission=index;await launchCampaignMission(index);launch();},index);
   await page.waitForFunction(()=>{updatePlaneMesh(0);return carrierAircraftReady();},null,{polling:250});
   report[kind]=await page.evaluate(kind=>{
    const r1=v=>+(+v).toFixed(1),unwrap=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
    finishCarrierIntro();clock.getDelta=()=>1/60;const render=GameRuntime.render;GameRuntime.render=()=>true;
    const res={mission:MISSIONS[mission].title,kind:pacificKind(),core:coreOn(),flap:P.flapTgt};
    const lo=FlightCore.loadout(FlightCore.model(kind),coreLoadout());res.massKg=Math.round(lo.mass);
    try{
     // 1. deck launch: full power, pull at 0.95 x the rotation airspeed, leaves at the bow if not before
     P.throttle=1;setThrottleUI(1);const x0=P.pos.x-carrierX;let t=0,off=null,wod=null;
     for(;t<40&&P.alive&&state!==ST.DEAD;t+=1/60){
      const stall=CarrierRecovery.envelope(P,STALL_SPD,APP_SPD).stall;
      if(state===ST.LAUNCH){wod=deckWind();if(P.spd+wod>stall*1.0)inputPitch=.5;}
      animateFrame();
      if(state===ST.FLIGHT&&off==null){off={t:r1(t),deckRun:Math.round(P.pos.x-carrierX-x0),airKmh:Math.round(P.spd*3.6),stallKmh:Math.round(stall*3.6),y:r1(P.pos.y)};inputPitch=.3;}
      if(off&&P.pos.y>60)P.gearTgt=0;
      if(off&&t-off.t>25)break;
     }
     res.launch={...off,wodMs:r1(wod),alive:P.alive,death:window.__crash,after25s:{kmh:Math.round(P.spd*3.6),y:Math.round(P.pos.y),climb:r1(P.vSpeed)}};
     const m=FlightCore.model(kind);
     const setup=(speed,alt,throttle=1)=>{state=ST.FLIGHT;P.alive=true;window.__crash=null;P.hull=100;SortieFeatures.Damage.reset(P);P.torps=0;P.rockets=0;P.fuel=50;
      P.deckRun=null;P.arrestRun=null;P.onDeck=false;P.touchResolved=false;P.pos.set(carrierX-6000,alt,3000);P.gear=P.gearTgt=P.flap=P.flapTgt=0;P.nLoad=1;P.core=null;P.coreStall=0;P.coreDrop=0;P.pitchRef=null;
      P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;P.heading=Math.PI/2;P.spd=speed;P.throttle=throttle;P.groundPower=throttle;P.departureAge=null;inputRoll=inputPitch=0;aeroMode=false;};
     const vmax=FlightCore.levelMaxSpeed(m,1500,m.mass*FlightCore.G);res.vmax1500=Math.round(vmax*3.6);
     res.turn={};
     for(const f of [.45,.7]){setup(f*vmax,1500);inputRoll=1;let travelled=0,last=P.heading,time=null;
      for(let i=0;i<60*90;i++){updateFlight(1/60);travelled+=Math.abs(unwrap(P.heading,last));last=P.heading;if(travelled>=2*Math.PI){time=(i+1)/60;break;}}
      res.turn[f]={startKmh:Math.round(f*vmax*3.6),seconds:time&&r1(time),endKmh:Math.round(P.spd*3.6),altChange:Math.round(P.pos.y-1500),bankDeg:Math.round(P.roll*57.3),alive:P.alive};}
     if(kind==='zero'||kind==='sbd'){const gate=FlightControl.aeroGate(kind,Core.gain);setup(gate*1.1,2000);aeroMode=true;inputPitch=1;let turned=0,prev=P.pitch,minV=P.spd,time=null;
      for(let i=0;i<60*40;i++){updateFlight(1/60);turned+=Math.abs(unwrap(P.pitch,prev));prev=P.pitch;minV=Math.min(minV,P.spd);if(turned>=2*Math.PI){time=(i+1)/60;break;}}
      res.loop={entryKmh:Math.round(gate*1.1*3.6),seconds:time&&r1(time),minKmh:Math.round(minV*3.6),altChange:Math.round(P.pos.y-2000),alive:P.alive};aeroMode=false;}
     const vs=FlightCore.stallSpeed(m,2000,FlightCore.loadout(m,{fuel:50}).ratio);setup(1.25*vs,2000,0);inputPitch=.6;let peak=0,bankMax=0,onset=null;
     for(let i=0;i<60*20&&peak<.6;i++){updateFlight(1/60);peak=Math.max(peak,P.coreStall||0);if(onset==null&&peak>.3)onset=(i+1)/60;}
     for(let i=0;i<60;i++){updateFlight(1/60);peak=Math.max(peak,P.coreStall||0);bankMax=Math.max(bankMax,Math.abs(P.roll));}
     inputPitch=0;P.throttle=1;let rec=null;const y0=P.pos.y;for(let i=0;i<60*8;i++){updateFlight(1/60);bankMax=Math.max(bankMax,Math.abs(P.roll));if(rec==null&&(P.coreStall||0)<.05)rec=(i+1)/60;}
     res.stall={entryKmh:Math.round(1.25*vs*3.6),onset:onset&&r1(onset),peak:+peak.toFixed(2),dropBankDeg:Math.round(bankMax*57.3),recoveredAfter:rec&&r1(rec),alive:P.alive,heightLostInRecovery:Math.round(y0-P.pos.y)};
     setup(.75*vmax,1000,0);for(let i=0;i<60;i++)updateFlight(1/60);res.idleDecel1s=+(.75*vmax-P.spd).toFixed(2);
     res.fps={};for(const fps of [20,60,120]){setup(.6*vmax,1200);inputRoll=.7;inputPitch=.4;for(let i=0;i<8*fps;i++)updateFlight(1/fps);
      res.fps[fps]={spd:+P.spd.toFixed(2),heading:+P.heading.toFixed(3),alt:+P.pos.y.toFixed(1)};}
    }finally{GameRuntime.render=render;}
    return res;
   },kind);
   console.log(kind,JSON.stringify(report[kind]));
   await page.evaluate(()=>{state=ST.MENU;});
  }
  assert.deepEqual(errors,[]);
  for(const [kind,r] of Object.entries(report)){
   assert.ok(r.core,kind+': core active');
   assert.ok(r.launch.alive&&r.launch.t>0,kind+': deck launch survives '+JSON.stringify(r.launch));
   assert.ok(r.launch.after25s.y>60,kind+': climbs away from the deck '+JSON.stringify(r.launch));
   for(const f of ['0.45','0.7'])assert.ok(r.turn[f].seconds&&r.turn[f].alive,kind+': full turn at '+f);
   if(r.loop)assert.ok(r.loop.seconds&&r.loop.alive,kind+': loop from the AERO gate');
   assert.ok(r.stall.peak>.5&&r.stall.recoveredAfter&&r.stall.alive,kind+': stalls and recovers '+JSON.stringify(r.stall));
   assert.ok(r.idleDecel1s>0,kind+': idle slows the aeroplane');
   const f=r.fps;for(const k of ['spd','heading','alt'])assert.ok(Math.abs(f[20][k]-f[120][k])<=(k==='alt'?6:k==='heading'?.06:.4),kind+': frame-rate independent '+k+' '+JSON.stringify(f));
  }
  fs.writeFileSync(path.join(root,'app/release/flight-core-pacific-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('Pacific core browser: OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
