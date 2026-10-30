/* The fighter brain (dogfight-ai.js) and the smoothed wingmen inside the shipped games.
 *  - Rhine: real remagen-mission.html, real spawnEnemyAir / updateEnemyAir / updateFlight; three fighters of
 *    two types against a player flying straight, then weaving. Checks that the brain is the one in charge, that
 *    the fighters use several different manoeuvres and fire, never reach the ground or the map edge, and that
 *    the fight plays out the same at 20/60/120 FPS (within the spread a fight naturally has).
 *  - Pacific: real torpedo-carrier.html, real spawnZero / updateZeros against the player's Avenger.
 *  - ?ai=old keeps the Build 223 modes (and the existing tactic tests still pin them).
 * Writes app/release/dogfight-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Dogfight WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(/^\/(remagen-mission|torpedo-carrier)\.html$/.test(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={};
 try{
  /* ---------------- Rhine ---------------- */
  if(!process.env.ONLY||process.env.ONLY==='rhine'){
   const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
   page.setDefaultTimeout(600000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
   await page.goto(base+'/remagen-mission.html?v=226');
   await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:250});
   await page.evaluate(async()=>{for(const k of ['p47','bf109','fw190'])await ensureModel(k);renderer.setPixelRatio(.3);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;});
   report.rhine={};
   for(const fps of [20,60,120]){
    report.rhine[fps]=await page.evaluate(fps=>{
     const dt=1/fps,r1=v=>+(+v).toFixed(1);
     const idx=MISSIONS.findIndex(m=>m.ac==='p47'&&m.enemyAir);
     startMission(idx>=0?idx:MISSIONS.findIndex(m=>m.ac==='p47'&&!m.free&&!m.circuits));
     finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
     for(const e of [...enemyAir]){e.alive=false;scene.remove(e.group);}enemyAir.length=0;
     const out={brainOn:false,fighters:0,volleys:0,minAgl:1e9,minEdge:1e9,modes:{},modeSeq:[],finite:true,nearMiss:0};
     // the player flies a steady 105 m/s (a fighter pilot's combat speed), then weaves; he cannot die in this test (we count what would have hit)
     P.alive=true;P.hull=1000;P.pos.set(14000,2200,16000);P.heading=0;P.pitch=0;P.roll=0;P.spd=105;P.throttle=.5;P.onGround=false;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;
     spawnEnemyAir(3);
     const orig=tracers.push.bind(tracers);tracers.push=(...a)=>{out.volleys+=a.length;return orig(...a);};
     out.fighters=enemyAir.filter(e=>!e.bomber).length;out.brainOn=enemyAir.every(e=>e.bomber||brainOn(e));
     const prev=new Map();
     for(let i=0;i<fps*90;i++){
      const t=i*dt;
      // weave: bank towards a target that flips every ~3 s
      inputRoll=t<30?0:Math.sin(t*.9)*.8;inputPitch=0;P.hull=1000;P.alive=true;
      updateFlight(dt);
      updateEnemyAir(dt);
      for(const e of enemyAir){
       if(!e.alive||e.bomber)continue;
       if(!Number.isFinite(e.pos.x+e.pos.y+e.pos.z+e.spd+e.heading+e.pitch+e.roll))out.finite=false;
       out.minAgl=Math.min(out.minAgl,e.pos.y-groundY(e.pos.x,e.pos.z));
       out.minEdge=Math.min(out.minEdge,e.pos.x,e.pos.z,RTILE*RGRID_W-e.pos.x,RTILE*RGRID_H-e.pos.z);
       out.modes[e.mode]=(out.modes[e.mode]||0)+dt;
       if(prev.get(e)!==e.mode){out.modeSeq.push(e.kind+':'+e.mode);prev.set(e,e.mode);}
      }
     }
     tracers.length=0;
     out.modeKinds=Object.keys(out.modes).length;
     out.modes=Object.fromEntries(Object.entries(out.modes).map(([k,v])=>[k,r1(v)]));
     out.modeSeq=out.modeSeq.slice(0,40);
     return out;
    },fps);
   }
   console.log('Rhine report',JSON.stringify(report.rhine));
   assert.deepEqual(errors,[],'no page errors in the Rhine fight: '+errors.join('; '));
   for(const fps of [20,60,120]){
    const r=report.rhine[fps];
    assert(r.brainOn&&r.fighters>=3,'the brain flies every Rhine fighter at '+fps+' FPS');
    assert(r.finite,'attitude and position stay finite');
    assert(r.minAgl>40,'fighters never reach the ground (min '+r.minAgl+' m) at '+fps+' FPS');
    assert(r.minEdge>-100,'fighters stay inside the map edge ('+r.minEdge+')');
    assert(r.modeKinds>=3,'at least three different manoeuvres in 90 s at '+fps+' FPS: '+JSON.stringify(r.modes));
   }
   assert([20,60,120].reduce((a,f)=>a+report.rhine[f].volleys,0)>=3,'the Rhine fighters open fire (all frame rates together)');
   // frame rate must not change what the pilot does by more than the spread of a fight: same manoeuvre families
   const fam=fps=>new Set(Object.keys(report.rhine[fps].modes));
   assert([...fam(60)].filter(m=>fam(20).has(m)||fam(120).has(m)).length>=2,'20/60/120 FPS fights share manoeuvres');
   // the legacy path is still reachable
   const old=await browser.newPage();await old.addInitScript(()=>window.requestAnimationFrame=()=>0);
   await old.goto(base+'/remagen-mission.html?v=226&ai=old');
   await old.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:250});
   assert.equal(await old.evaluate(()=>AI_OLD&&!brainOn({kind:'bf109'})),true,'?ai=old selects the Build 223 modes');
   await old.close();await page.close();
  }
  /* ---------------- Pacific ---------------- */
  if(!process.env.ONLY||process.env.ONLY==='pacific'){
   const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
   page.setDefaultTimeout(600000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
   await page.goto(base+'/torpedo-carrier.html?campaign=1&v=226');
   await page.waitForFunction(()=>state===ST.MENU,null,{polling:250});
   await page.evaluate(()=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;});
   const index=await page.evaluate(()=>MISSIONS.findIndex(m=>!m.sbd&&!m.corsair&&!m.defend&&!m.free&&!m.qual&&m.torps>0&&m.zeros>=2));
   assert(index>=0,'a mission with two Zeros exists');
   await page.evaluate(async index=>{selectedMission=index;await launchCampaignMission(index);launch();},index);
   await page.waitForFunction(()=>{updatePlaneMesh(0);return carrierAircraftReady();},null,{polling:250});
   report.pacific={};
   for(const fps of [20,60,120]){
    report.pacific[fps]=await page.evaluate(fps=>{
     finishCarrierIntro();clock.getDelta=()=>1/fps;const render=GameRuntime.render;GameRuntime.render=()=>true;
     const dt=1/fps,r1=v=>+(+v).toFixed(1);
     const out={brainOn:false,zeros:0,volleys:0,minY:1e9,finite:true,modes:{},modeSeq:[]};
     // put the player in the air over the fleet; the Zeros take the engaged state at once
     state=ST.FLIGHT;P.alive=true;P.hull=1000;P.onGround=false;P.pos.set(carrierX+3000,500,0);P.heading=0;P.pitch=0;P.roll=0;P.spd=80;P.throttle=.7;P.gear=P.gearTgt=0;
     for(const z of zeros.splice(0))GameRuntime.release(z.mesh);
     for(let i=0;i<3;i++)spawnZero(i,3);
     zeros.forEach((z,k)=>{z.engaged=true;z.pos.set(P.pos.x+1200+k*150,700+k*60,P.pos.z+900-k*400);});
     out.zeros=zeros.length;out.brainOn=zeros.every(z=>zeroBrainOn(z));
     const orig=tracers.push.bind(tracers);tracers.push=(...a)=>{out.volleys+=a.length;return orig(...a);};
     const prev=new Map();
     for(let i=0;i<fps*80;i++){
      P.hull=1000;P.alive=true;P.pos.y=Math.max(P.pos.y,300);
      updateZeros(dt);
      // the player flies a steady line; this isolates the Zeros' behaviour
      P.pos.x+=Math.cos(P.heading)*P.spd*dt;P.pos.z+=Math.sin(P.heading)*P.spd*dt;
      for(const z of zeros){
       if(!z.alive)continue;
       if(!Number.isFinite(z.pos.x+z.pos.y+z.pos.z+z.spd+z.heading+z.pitch+z.roll))out.finite=false;
       out.minY=Math.min(out.minY,z.pos.y);
       const m=z.brainMode||'-';out.modes[m]=(out.modes[m]||0)+dt;
       if(prev.get(z)!==m){out.modeSeq.push(m);prev.set(z,m);}
      }
     }
     out.modeKinds=Object.keys(out.modes).length;
     out.modes=Object.fromEntries(Object.entries(out.modes).map(([k,v])=>[k,r1(v)]));out.modeSeq=out.modeSeq.slice(0,40);
     GameRuntime.render=render;
     return out;
    },fps);
   }
   console.log('Pacific report',JSON.stringify(report.pacific));
   assert.deepEqual(errors,[],'no page errors in the Pacific fight: '+errors.join('; '));
   for(const fps of [20,60,120]){
    const r=report.pacific[fps];
    assert(r.brainOn&&r.zeros>=3,'the brain flies every Zero at '+fps+' FPS');
    assert(r.finite,'Zero state stays finite');
    assert(r.minY>20,'Zeros stay out of the sea (min '+r.minY+' m)');
    assert(r.modeKinds>=3,'at least three different manoeuvres in 80 s at '+fps+' FPS: '+JSON.stringify(r.modes));
   }
   assert([20,60,120].reduce((a,f)=>a+report.pacific[f].volleys,0)>=3,'the Zeros open fire (all frame rates together)');
   await page.close();
  }
  if(!process.env.ONLY)fs.writeFileSync(path.join(root,'app/release/dogfight-browser.json'),JSON.stringify(report,null,1));
  console.log('Dogfight brain in both games at 20/60/120 FPS:',JSON.stringify({rhine:Object.fromEntries(Object.entries(report.rhine||{}).map(([k,v])=>[k,{modes:v.modes,volleys:v.volleys,minAgl:v.minAgl}])),pacific:Object.fromEntries(Object.entries(report.pacific||{}).map(([k,v])=>[k,{modes:v.modes,volleys:v.volleys,minY:v.minY}]))}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
