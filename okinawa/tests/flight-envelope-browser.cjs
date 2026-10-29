/* The shipped updateFlight()/updateCamera() of both campaigns against the analytic envelope. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Flight envelope WebGL: skipped locally (no Chrome).');process.exit(0);}
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
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.GAME_TEST_SINGLE_PROCESS?['--single-process','--no-zygote','--in-process-gpu']:[])]});
 const all={};
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(240000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  for(const pacific of process.env.GAME_TEST_RHINE_ONLY?[false]:[true,false]){
   await page.goto('http://127.0.0.1:'+server.address().port+'/'+(pacific?'torpedo-carrier.html':'remagen-mission.html')+'?v=219');
   await page.waitForFunction(p=>state===ST.MENU&&(p||realWorldReady),pacific,{polling:200});
   await page.evaluate(async p=>{
    if(p){await prepareOkinawa();for(const kind of ['avenger','sbd','corsair','zero']){const m=MISSIONS.find(m=>kind==='zero'?m.defend:kind==='corsair'?m.corsair:kind==='sbd'?m.sbd&&!m.corsair:!m.sbd&&!m.defend&&!m.free&&!m.qual);await preparePacificModels(m);}}
    else await Promise.all(['p47','bf109','fw190','ju87','me262','me163'].map(ensureModel));
    renderer.setPixelRatio(.3);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;
   },pacific);
   await page.locator('#startBtn').click();
   await page.locator(pacific?'#launchBtn':'#brGo').click();
   await page.waitForFunction(()=>!!eng&&actx.state==='running',null,{polling:100});
   const kinds=pacific?['avenger','sbd','corsair','zero']:['p47','bf109','fw190','ju87','me262','me163'];
   for(const kind of kinds){
    all[kind]=await page.evaluate(({kind,pacific})=>{
     const index=MISSIONS.findIndex(m=>pacific?(kind==='zero'?m.defend:kind==='corsair'?m.corsair:kind==='sbd'?m.sbd&&!m.corsair:!m.sbd&&!m.defend&&!m.free&&!m.qual):(m.ac||'p47')===kind&&!m.free);
     startMission(index);if(pacific){finishCarrierIntro();hideOverlays();}else{finishLaunchIntro(false);show('menu',false);show('brief',false);}
     const E=FlightEnvelope,DEG=E.DEG,vmax=FlightDynamics.profile(kind).max,unwrap=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
     const setup=(speed,throttle=1)=>{
      state=ST.FLIGHT;P.alive=true;P.hull=pacific?100:acDef().hull;SortieFeatures.Damage.reset(P,P.hull);
      P.bombs=P.rockets=P.torps=0;P.fuel=50;P.tankAttached=false;
      P.onGround=P.onDeck=false;P.deckRun=P.arrestRun=null;P.touchResolved=false;P.pos.set(pacific?-4500:AF_X,2400,pacific?0:AF_Z);
      P.gear=P.gearTgt=P.flap=P.flapTgt=P.hook=P.hookTgt=0;P.diveBrake=false;P.nLoad=1;
      P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;P.heading=0;P.spd=speed;P.throttle=throttle;P.groundPower=throttle;P.departureAge=null;inputRoll=inputPitch=0;aeroMode=false;
     };
     const out={vmax};
     // roll: measured peak rate against the published curve (game-compressed), at two speeds, 60 FPS
     out.roll={};
     for(const v of [Math.round(vmax*.45),Math.round(vmax*.7)]){
      setup(v);inputRoll=1;let peak=0,prev=P.roll;
      for(let i=0;i<60*3;i++){updateFlight(1/60);peak=Math.max(peak,Math.abs(P.roll-prev)*60);prev=P.roll;}
      out.roll[v]={measured:peak/DEG,expected:E.rollRate(kind,v)/DEG};
     }
     // 360 degree turn, full stick, time and speed lost
     out.turn={};
     for(const v of [90]){
      setup(Math.min(v,Math.round(vmax*.85)));inputRoll=1;let travelled=0,last=P.heading,t=null;const v0=P.spd;
      for(let i=0;i<60*40;i++){updateFlight(1/60);travelled+=Math.abs(unwrap(P.heading,last));last=P.heading;if(travelled>=2*Math.PI){t=(i+1)/60;break;}}
      out.turn[v]={t,v0:+v0.toFixed(0),vEnd:+P.spd.toFixed(0),predicted:2*Math.PI/E.turn(kind,P.roll,v0,{loadSpeed:1}).rate};
     }
     // closed throttle
     out.idle={};
     for(const f of [.5,.75]){const v=Math.round(vmax*f);setup(v,0);for(let i=0;i<60*6;i++)updateFlight(1/60);out.idle[f]=(v-P.spd)/6;}
     // AERO gate and loop from the gate speed, camera sampled every frame
     // The game's own gate (the computed P-47 core simulates its loop; other types use the envelope).
     const gate=typeof aeroGateSpeed==='function'?aeroGateSpeed(kind):E.aeroGate(kind);out.gate=gate;
     out.core=typeof coreOn==='function'&&coreOn(kind);
     const loopFrom=(v,fps)=>{
      setup(v);aeroMode=true;for(let i=0;i<fps;i++){updateFlight(1/fps);updateCamera(1/fps);}setup(v);aeroMode=true;for(let i=0;i<fps;i++)updateCamera(1/fps);
      inputPitch=1;let travelled=0,last=P.pitch,t=null,minV=P.spd,front=0,frames=0,maxStep=0,lastCam=camera.position.clone(),lastPos=P.pos.clone();
      for(let i=0;i<fps*30;i++){
       updateFlight(1/fps);updateCamera(1/fps);if(!P.alive)break;
       travelled+=Math.abs(unwrap(P.pitch,last));last=P.pitch;minV=Math.min(minV,P.spd);
       const toCam=camera.position.clone().sub(P.pos).normalize();frames++;if(toCam.dot(noseDir())>.25)front++;
       maxStep=Math.max(maxStep,camera.position.clone().sub(lastCam).sub(P.pos.clone().sub(lastPos)).length());lastCam=camera.position.clone();lastPos=P.pos.clone();
       if(travelled>=2*Math.PI){t=(i+1)/fps;break;}
      }
      return {t,minV,front,frames,maxStep,alive:P.alive,stall:E.derived[kind].vs};
     };
     out.loop={};
     for(const fps of [20,60,120])out.loop[fps]=loopFrom(Math.ceil(gate)+1,fps);
     out.loopFast=loopFrom(Math.round(vmax*.8),60);
     // the toggle itself refuses to start below the gate and accepts the gate speed
     state=ST.FLIGHT;
     if(!pacific||kind==='zero'||kind==='sbd'){
      setup(Math.floor(gate)-3);P.pos.y=2400;aeroMode=false;toggleAero();out.slowToggle=aeroMode;
      setup(Math.ceil(gate)+2);P.pos.y=2400;aeroMode=false;toggleAero();out.gateToggle=aeroMode;aeroMode=false;
     }
     return out;
    },{kind,pacific});
    console.log(kind,JSON.stringify(all[kind]));
   }
  }
  assert.deepEqual(errors,[]);
  // ---- assertions ----
  for(const [kind,r] of Object.entries(all)){
   // A type on the computed flight core (flight-core.js) no longer follows the envelope's turn/roll law;
   // its own figures are checked in p47-core-browser.cjs and scripts/flight/derive-p47.cjs.
   if(!r.core)for(const [v,x] of Object.entries(r.roll))assert(x.measured>x.expected*.75&&x.measured<x.expected*1.25,`${kind} measured roll rate ${x.measured.toFixed(0)} deg/s at ${v} m/s vs envelope ${x.expected.toFixed(0)}`);
   const t=r.turn[90];if(!r.core)assert(t.t!==null&&t.t>t.predicted*.7&&t.t<t.predicted*1.5,`${kind} 360 turn ${t.t} s vs envelope ${t.predicted.toFixed(1)} s`);
   // Build 220: on the computed core the closed-throttle deceleration is drag + windmilling propeller over
   // the real mass, so the slow heavy Avenger/SBD/Ju 87 shed less speed at half their (low) top speed than a
   // fighter. Required: a clear brake at half speed and a stronger one at 75 % (drag grows with V^2).
   for(const f of ['0.5','0.75']){const jet=kind==='me262'||kind==='me163';const floor=r.core?(f==='0.5'?.9:1.35):(f==='0.5'?1.3:2.2);if(!jet)assert(r.idle[f]>floor,`${kind} closed throttle at ${f} vmax brakes ${r.idle[f].toFixed(2)} m/s2`);}
   if(r.core)assert(r.idle['0.75']>r.idle['0.5']*1.25,`${kind} idle deceleration grows with speed`);
   for(const [fps,l] of Object.entries(r.loop)){
    assert(l.alive&&l.t!==null&&l.t<20,`${kind} completes a loop from the AERO gate at ${fps} FPS (${l.t})`);
    assert(l.minV>l.stall*.9,`${kind} stays above its stall over the top at ${fps} FPS: min ${l.minV.toFixed(0)} vs ${l.stall.toFixed(0)}`);
    assert.equal(l.front,0,`${kind} camera never ahead of the nose at ${fps} FPS`);
    assert(l.maxStep<4,`${kind} camera does not jump relative to the aircraft at ${fps} FPS: ${l.maxStep.toFixed(2)} m`);
   }
   assert(r.loopFast.t!==null&&r.loopFast.front===0,`${kind} loop at 80% of top speed`);
   if(r.slowToggle!==undefined){assert.equal(r.slowToggle,false,`${kind} AERO refuses below the gate`);assert.equal(r.gateToggle,true,`${kind} AERO accepted at the gate`);}
   const times=Object.values(r.loop).map(l=>l.t);assert(Math.max(...times)-Math.min(...times)<1.2,`${kind} loop time consistent across frame rates: ${times}`);
  }
  // fleet grading in the real game
  const T=k=>all[k].turn[90].t;
  if(all.zero&&all.avenger){assert(T('zero')<T('avenger')*.9,'Zero out-turns the Avenger at 90 m/s');}
  if(all.p47&&all.bf109&&!all.p47.core){assert(T('bf109')<T('p47'),'Bf 109 out-turns the P-47 at 90 m/s');assert(T('p47')/T('bf109')<1.7,'the Jug is no longer 2.5x slower than the 109');}
  const R=(k,v)=>all[k].roll[Object.keys(all[k].roll)[v]].measured;
  if(all.p47&&all.fw190&&!all.p47.core)assert(R('fw190',1)>R('p47',1)*1.15,'Fw 190 rolls faster than the P-47 at 70% of top speed');
  fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build219-flight-envelope.json'),JSON.stringify(all,null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
