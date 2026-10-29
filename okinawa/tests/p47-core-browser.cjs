/* The computed P-47 flight core (flight-core.js) inside the shipped remagen-mission.html updateFlight():
 * real take-off from the strip, full-stick turn, AERO loop, idle deceleration, 20/60/120 FPS, no page
 * errors. Compares the old model (?p47core=off) on the same manoeuvres. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('P-47 core WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname==='/remagen-mission.html'){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
async function run(browser,query){
 const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
 page.setDefaultTimeout(300000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
 await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=217'+query);
 await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:250});
 await page.evaluate(async()=>{await ensureModel('p47');renderer.setPixelRatio(.3);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;});
 const out=await page.evaluate(()=>{
  const index=MISSIONS.findIndex(m=>(m.ac||'p47')==='p47'&&!m.free&&!m.circuits&&!m.qual);
  startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);
  const res={core:typeof P47Core!=='undefined'&&P47Core.on,mission:MISSIONS[index].title};
  const unwrap=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  // 1. take-off from the strip: full power, rotate with half back stick, gear up at 40 m
  state=ST.FLIGHT;P.throttle=1;inputRoll=inputPitch=0;aeroMode=false;
  let t=0,liftoff=null,roll=null;const x0=P.pos.x,z0=P.pos.z,y0=P.pos.y;
  for(;t<60&&P.alive;t+=1/60){
   if(P.onGround&&P.spd>45)inputPitch=.5;
   updateFlight(1/60);
   if(!P.onGround&&liftoff==null){liftoff=t;roll=Math.hypot(P.pos.x-x0,P.pos.z-z0);inputPitch=.35;}
   if(liftoff!=null&&P.pos.y-groundY(P.pos.x,P.pos.z)>40)P.gearTgt=0;
  }
  res.takeoff={alive:P.alive,liftoff:+(liftoff??-1).toFixed(2),groundRun:+(roll??-1).toFixed(0),after60s:{spd:+P.spd.toFixed(1),agl:+(P.pos.y-groundY(P.pos.x,P.pos.z)).toFixed(0),climb:+P.vSpeed.toFixed(1)}};
  const setup=(speed,alt,throttle=1)=>{state=ST.FLIGHT;P.alive=true;P.hull=acDef().hull;SortieFeatures.Damage.reset(P,P.hull);P.bombs=P.rockets=0;P.fuel=50;P.tankAttached=false;
   P.onGround=false;P.landingRoll=null;P.touchResolved=false;P.pos.set(AF_X,alt,AF_Z);P.gear=P.gearTgt=P.flap=P.flapTgt=0;P.nLoad=1;
   P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;P.heading=0;P.spd=speed;P.throttle=throttle;P.groundPower=throttle;P.departureAge=null;inputRoll=inputPitch=0;aeroMode=false;};
  // 2. full-stick turn, Normal mode, 2000 m
  res.turn={};
  for(const v of [90,130]){setup(v,2000);inputRoll=1;let travelled=0,last=P.heading,time=null;
   for(let i=0;i<60*60;i++){updateFlight(1/60);travelled+=Math.abs(unwrap(P.heading,last));last=P.heading;if(travelled>=2*Math.PI){time=(i+1)/60;break;}}
   res.turn[v]={seconds:time&&+time.toFixed(1),endSpd:+P.spd.toFixed(0),altChange:+(P.pos.y-2000).toFixed(0),bankDeg:+(P.roll*180/Math.PI).toFixed(0),n:+(P.nLoad||1).toFixed(2)};}
  // 3. AERO loop, full pull from 150 m/s at 2000 m
  setup(150,2000);aeroMode=true;inputPitch=1;let turned=0,prev=P.pitch,minV=P.spd,time=null;
  for(let i=0;i<60*40;i++){updateFlight(1/60);updateCamera(1/60);turned+=Math.abs(unwrap(P.pitch,prev));prev=P.pitch;minV=Math.min(minV,P.spd);if(turned>=2*Math.PI){time=(i+1)/60;break;}}
  res.loop={seconds:time&&+time.toFixed(1),minSpd:+minV.toFixed(0),altChange:+(P.pos.y-2000).toFixed(0),alive:P.alive};
  aeroMode=false;
  // 4. idle deceleration from 120 m/s, level
  setup(120,1500,0);for(let i=0;i<60;i++)updateFlight(1/60);res.idleDecel1s=+(120-P.spd).toFixed(2);
  // 5. frame-rate independence: 8 s climbing turn
  res.fps={};for(const fps of [20,60,120]){setup(120,1500);inputRoll=.7;inputPitch=.4;for(let i=0;i<8*fps;i++)updateFlight(1/fps);
   res.fps[fps]={spd:+P.spd.toFixed(2),heading:+P.heading.toFixed(3),alt:+P.pos.y.toFixed(1)};}
  return res;
 });
 out.errors=errors;await page.close();return out;
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const core=await run(browser,''),old=process.env.P47_CORE_COMPARE?await run(browser,'&p47core=off'):null;
  const report={core,old};console.log(JSON.stringify(report,null,1));
  fs.writeFileSync(path.join(root,'app/release/flight-core-p47-browser.json'),JSON.stringify(report,null,1)+'\n');
  assert.deepEqual(core.errors,[]);assert.ok(core.core,'core active for the P-47');
  assert.ok(core.takeoff.alive&&core.takeoff.liftoff>0,'take-off completes');
  assert.ok(core.takeoff.after60s.agl>150,'climbs away after take-off');
  assert.ok(core.loop.seconds&&core.loop.alive,'loop completes');
  for(const v of [90,130])assert.ok(core.turn[v].seconds&&Math.abs(core.turn[v].altChange)<150,'level full-stick turn at '+v);
  // The core itself is exact at any frame rate (120 Hz substeps, see derive-p47.cjs); the per-frame roll
  // spring it shares with the old model leaves the same ~0.035 rad heading spread after 8 s at 20 vs 120 FPS.
  const f=core.fps;for(const k of ['spd','heading','alt'])assert.ok(Math.abs(f[20][k]-f[120][k])<=(k==='alt'?4:k==='heading'?.05:.3),'frame-rate independent '+k);
  console.log('P-47 core browser: OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
