/* Execute shipped flight code and loaded aircraft, not a substitute simulation. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Handling/quality WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.GAME_TEST_SINGLE_PROCESS?['--single-process','--no-zygote','--in-process-gpu']:[])]});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1.5}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  for(const pacific of process.env.GAME_TEST_RHINE_ONLY?[false]:[true,false]){
   await page.goto('http://127.0.0.1:'+server.address().port+'/'+(pacific?'torpedo-carrier.html':'remagen-mission.html')+'?v=189');
   await page.waitForFunction(p=>state===ST.MENU&&(p||realWorldReady),pacific,{polling:200});
   await page.evaluate(async p=>{
    if(p){await prepareOkinawa();for(const kind of ['avenger','sbd','corsair','zero']){const m=MISSIONS.find(m=>kind==='zero'?m.defend:kind==='corsair'?m.corsair:kind==='sbd'?m.sbd&&!m.corsair:!m.sbd&&!m.defend&&!m.free&&!m.qual);await preparePacificModels(m);}}
    else await Promise.all(['p47','bf109','fw190','ju87','me262','me163'].map(ensureModel));
    renderer.setPixelRatio(.3);renderer.shadowMap.enabled=false;flightQuality.enabled=false;
   },pacific);

   await page.locator('#startBtn').click();
   await page.locator(pacific?'#launchBtn':'#brGo').click();
   await page.waitForFunction(()=>!!eng&&actx.state==='running',null,{polling:100});
   const rows=await page.evaluate(pacific=>{
    const rows=[];
    for(const kind of pacific?['avenger','sbd','corsair','zero']:['p47','bf109','fw190','ju87','me262','me163']){
     const index=MISSIONS.findIndex(m=>pacific?(kind==='zero'?m.defend:kind==='corsair'?m.corsair:kind==='sbd'?m.sbd&&!m.corsair:!m.sbd&&!m.defend&&!m.free&&!m.qual):(m.ac||'p47')===kind&&!m.free);
     for(const fps of [20,60,120]){
      startMission(index);if(pacific){finishCarrierIntro();hideOverlays();}else{finishLaunchIntro(false);show('menu',false);show('brief',false);}
      const setup=(speed=85)=>{
       state=ST.FLIGHT;P.alive=true;P.hull=pacific?100:acDef().hull;SortieFeatures.Damage.reset(P,P.hull);
       P.bombs=P.rockets=P.torps=0;P.fuel=50;P.tankAttached=false;
       P.onGround=P.onDeck=false;P.deckRun=P.arrestRun=null;P.touchResolved=false;P.pos.set(pacific?-4500:AF_X,2400,pacific?0:AF_Z);
       P.gear=P.gearTgt=P.flap=P.flapTgt=P.hook=P.hookTgt=0;P.diveBrake=false;
       P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;P.heading=0;P.spd=speed;P.throttle=1;P.groundPower=1;P.departureAge=null;inputRoll=inputPitch=0;aeroMode=false;
      };
      setup();for(let i=0;i<fps*10;i++)updateFlight(1/fps);const acceleration=P.spd;
      setup(140);P.throttle=0;P.groundPower=0;for(let i=0;i<fps*10;i++)updateFlight(1/fps);const coast=P.spd;
      setup(110);inputRoll=.5;inputPitch=.25;for(let i=0;i<fps*.5;i++)updateFlight(1/fps);const roll=P.roll,pitch=P.pitch;
      inputRoll=inputPitch=0;for(let i=0;i<fps*4;i++)updateFlight(1/fps);
      if(Math.abs(P.roll)>.003||Math.abs(P.pitch)>.004)throw Error('Lost assisted return '+kind+' '+fps);
      setup(120);inputRoll=.6;for(let i=0;i<fps*4;i++)updateFlight(1/fps);const turn=Math.abs(P.heading),turnSpeed=P.spd;
      for(let i=0;i<180;i++)updateAudio(1/60);
      const sound=eng.piston.state.kind;if(sound!==(AircraftEngine.profiles[kind]?kind:null))throw Error('Wrong live sound '+kind+': '+sound);
      if(!P.alive||![P.spd,P.pos.y,roll,pitch,turn].every(Number.isFinite))throw Error('Invalid flight '+kind);
      rows.push({kind,fps,acceleration,coast,roll,pitch,turn,turnSpeed,sound});
     }
    }
    return rows;
   },pacific);
   console.log('Actual fleet flight and sound:',JSON.stringify(rows));
   const at=kind=>rows.find(r=>r.kind===kind&&r.fps===60);
   // On the computed core (flight-core.js) the P-47's half stick commands the level-turn bank of the same
   // load-factor share (about 70 deg here), not half of rollLim, so this normalisation does not apply to it.
   const p47Core=!pacific&&await page.evaluate(()=>typeof coreOn==='function'&&coreOn('p47'));
   // Build 220: on the core the gain from 85 m/s in 10 s is the real excess power over the real mass (no
   // thrust multiplier any more): the Corsair gains about twice what the Avenger does, not a fixed +12 m/s.
   const pacCore=pacific&&await page.evaluate(()=>typeof coreOn==='function'&&coreOn('corsair'));
   if(pacific){assert(at('zero').turn>at('avenger').turn*1.4);if(pacCore)assert(at('corsair').acceleration-85>(at('avenger').acceleration-85)*1.6,'Corsair out-accelerates the Avenger');else assert(at('corsair').acceleration>at('avenger').acceleration+12);assert(at('sbd').roll>at('avenger').roll*1.1);}
   else {if(!p47Core)assert(at('fw190').roll/(Math.pow(.5,1.18)*1.56)>at('p47').roll/(.5*1.56)*1.06,'Fw 190 reaches its commanded bank sooner');assert(at('bf109').pitch>at('p47').pitch*1.03,'Bf 109 answers the stick a little sooner than the Jug (Build 215: wing-loading graded, no longer 25 % apart)');assert(at('p47').coast>at('bf109').coast+2);assert(at('me163').acceleration>at('me262').acceleration+30);assert(at('bf109').turn>at('me262').turn*1.25);}
   for(const kind of new Set(rows.map(r=>r.kind))){const samples=rows.filter(r=>r.kind===kind);for(const key of ['acceleration','coast','turnSpeed'])assert(Math.max(...samples.map(r=>r[key]))-Math.min(...samples.map(r=>r[key]))<1.5,kind+' FPS '+key);}

   fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build219-'+(pacific?'pacific':'rhine')+'-flight.json'),JSON.stringify(rows,null,2));
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
