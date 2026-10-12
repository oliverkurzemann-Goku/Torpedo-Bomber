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
   if(!pacific)for(const fps of [20,60,120]){
    const takeoffs=await page.evaluate(fps=>{
     return [0,MISSIONS.findIndex(m=>m.id==='final'),MISSIONS.findIndex(m=>m.id==='jetstrike'),MISSIONS.findIndex(m=>m.id==='jetjabo')].map(index=>{
      startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;inputRoll=0;inputPitch=.6;P.throttle=1;
      const mass=SortieFeatures.Handling.sample(P).ratio,start=P.pos.x;let time=0;
      while(P.onGround&&P.alive&&time<35){updateFlight(1/fps);time+=1/fps;}
      const distance=P.pos.x-start,rotation=time;
      if(!P.alive||P.onGround||distance>RWY_LEN-140)throw Error('Loaded runway departure failed '+JSON.stringify({mission:MISSIONS[index].id,fps,mass,time,distance,spd:P.spd}));
      for(let i=0;i<fps*4;i++)updateFlight(1/fps);
      if(!P.alive||P.onGround||P.pos.y-groundY(P.pos.x,P.pos.z)<10)throw Error('Loaded aircraft cannot continue climbing '+JSON.stringify({mission:MISSIONS[index].id,fps,mass,rotation,distance,alive:P.alive,ground:P.onGround,agl:P.pos.y-groundY(P.pos.x,P.pos.z),spd:P.spd,title:document.getElementById('resTitle')?.textContent}));
      return {mission:MISSIONS[index].id,fps,mass,rotation,distance};
     });
    },fps);console.log('Original loaded runway departures:',takeoffs);
   }
   for(const kind of pacific?['avenger','sbd','corsair','zero']:['p47','bf109','fw190','ju87','me262','me163'])for(const fps of [20,60,120]){
    const result=await page.evaluate(({kind,fps,pacific})=>{
     const index=MISSIONS.findIndex(m=>pacific?(kind==='zero'?m.defend:kind==='corsair'?m.corsair:kind==='sbd'?m.sbd&&!m.corsair:!m.sbd&&!m.defend&&!m.free&&!m.qual):(m.ac||'p47')===kind&&!m.free);
     startMission(index);if(pacific){finishCarrierIntro();hideOverlays();}else{finishLaunchIntro(false);show('menu',false);show('brief',false);}
     state=ST.FLIGHT;DIFF='ace';
     const setup=(heavy=true)=>{
      SortieFeatures.Damage.reset(P,pacific?100:acDef().hull);P.alive=true;P.hull=pacific?100:acDef().hull;
      P.fuel=heavy?100:15;P.bombs=heavy?3:0;P.rockets=heavy?8:0;P.torps=heavy?1:0;P.tankAttached=false;
      P.onGround=P.onDeck=false;P.deckRun=P.arrestRun=null;P.touchResolved=false;P.pos.set(pacific?-4500:AF_X,1800+(pacific?0:groundY(AF_X,AF_Z)),pacific?0:AF_Z);
      P.gear=P.gearTgt=P.flap=P.flapTgt=P.hook=P.hookTgt=0;P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;P.heading=0;P.spd=120;P.throttle=.8;inputRoll=.45;inputPitch=.3;aeroMode=false;
     };
     const response=heavy=>{setup(heavy);for(let i=0;i<fps*.5;i++)updateFlight(1/fps);return {pitch:P.pitch,roll:P.roll,climb:P.vSpeed,turn:Math.abs(P.heading)};};
     const heavy=response(true),light=response(false);
     if(!(heavy.pitch<light.pitch&&heavy.roll<light.roll&&heavy.climb<light.climb&&heavy.turn<light.turn))throw Error('Loading has no live effect '+JSON.stringify({kind,fps,heavy,light}));
     setup(false);SortieFeatures.Damage.surfaceHit(P,'elevator');for(let i=0;i<fps*.5;i++)updateFlight(1/fps);
     if(P.pitch>=light.pitch*.9)throw Error('Elevator damage has no live effect');
     setup(false);SortieFeatures.Damage.surfaceHit(P,'aileron','left');inputRoll=inputPitch=0;
     for(let i=0;i<fps*4;i++)updateFlight(1/fps);const bias=SortieFeatures.Damage.controls(P).bias;
     if(Math.abs(P.roll-bias)>.003||Math.abs(P.roll)<.005)throw Error('Permanent surface bias missing');
     if(pacific)updatePlaneMesh(0);else posePlayerAircraft(0);
     const leftTip=new THREE.Vector3(pacific?-1:1,0,0).applyQuaternion(planeGroup.quaternion);
     if(leftTip.y>=0)throw Error('Named left-aileron damage banks the wrong physical wing down');
     const rollLim=pacific?(kind==='zero'?1.52:kind==='sbd'?1.50:1.42)*(kind==='avenger'?.78:.86):acDef().rollLim*.86;
     inputRoll=-bias/(rollLim*steerSign);
     // Europe types with progressive stick response invert their exponent.
     if(!pacific&&acDef().stickExponent)inputRoll=Math.sign(inputRoll)*Math.pow(Math.abs(inputRoll),1/acDef().stickExponent);
     for(let i=0;i<fps*4;i++)updateFlight(1/fps);if(Math.abs(P.roll)>.003)throw Error('Existing stick cannot counter damage');
     let asymmetry=null;
     if(kind!=='me163'){
      setup(false);SortieFeatures.Damage.surfaceHit(P,'flap','left');P.flap=P.flapTgt=1;inputPitch=inputRoll=0;
      for(let i=0;i<fps*4;i++)updateFlight(1/fps);asymmetry=SortieFeatures.Damage.controls(P);
      if(asymmetry.flaps.left!==0||asymmetry.flaps.right!==1||Math.abs(P.roll)<.10)throw Error('Asymmetric flaps not integrated');
      if(pacific){updatePlaneMesh(0);const left=isSBD()&&playerSBD?sbdFlapL:flapL,right=isSBD()&&playerSBD?sbdFlapR:flapR;
       if(kind!=='zero'&&left&&right&&(Math.abs(left.rotation.x)>.001||Math.abs(right.rotation.x)<.75))throw Error('Flap visuals disagree with damage');}
     }
     SortieFeatures.Damage.reset(P,pacific?100:acDef().hull);P.gear=P.gearTgt=1;updateHUD();
     if(!document.querySelector('.controlFault').hidden)throw Error('Repair left a control warning');
     const reference=pacific?CarrierRecovery.envelope(P,STALL_SPD,APP_SPD).reference:SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).reference;
     if(!document.getElementById('landingRef').textContent.includes(Math.round(reference*KT)+(pacific?' KT':' MPH')))throw Error('HUD reference differs from physics');
     return {kind,fps,heavy,light,reference,asymmetry:asymmetry?.flaps};
    },{kind,fps,pacific});console.log('Shipped handling:',JSON.stringify(result));
   }
   const quality=await page.evaluate(p=>{
    renderer.setPixelRatio(1.5);flightQuality=GameRuntime.createQuality(renderer,{enabled:true});
    SortieFeatures.Damage.surfaceHit(P,'aileron','left');SortieFeatures.Damage.surfaceHit(P,'elevator');updateHUD();
    if(document.querySelector('.controlFault').hidden||!document.querySelector('.controlFault').textContent.includes('L AIL / ELEV'))throw Error('No persistent control warning');
    const snapshot=()=>JSON.stringify({pos:P.pos.toArray(),spd:P.spd,fuel:P.fuel,hull:P.hull,ord:[P.bombs,P.rockets,P.torps],weather,objectives:p?ships.map(s=>[s.hp,s.alive]):objectiveLeft(),controls:[inputRoll,inputPitch]});
    const before=snapshot(),groups=clouds.map(c=>c.visible),stick=document.getElementById('stick').getBoundingClientRect().toJSON();
    for(let i=0;i<700;i++)flightQuality.sample(.05);flightQuality.weather(clouds,rainMesh);
    if(flightQuality.tier!==3||renderer.getPixelRatio()>=1.5||snapshot()!==before||JSON.stringify(groups)!==JSON.stringify(clouds.map(c=>c.visible)))throw Error('Quality changes gameplay or fails to adapt');
    if(JSON.stringify(stick)!==JSON.stringify(document.getElementById('stick').getBoundingClientRect().toJSON()))throw Error('Touch controls moved');
    const down=flightQuality.report();for(let i=0;i<3600;i++)flightQuality.sample(1/60);flightQuality.weather(clouds,rainMesh);
    if(flightQuality.tier!==0||renderer.getPixelRatio()!==1.5||snapshot()!==before)throw Error('Quality fails to recover');
    flightQuality.setTier(3);renderer.shadowMap.enabled=false;
    if(p){P.pos.set(carrierX-300,50,0);P.heading=0;updatePlaneMesh(0);camera.position.copy(P.pos).add(new THREE.Vector3(-22,7,0));camera.lookAt(P.pos.clone().add(new THREE.Vector3(20,0,0)));}
    else {P.pos.set(AF_X,AF_Y+150,AF_Z);posePlayerAircraft(0);camera.position.copy(P.pos).add(new THREE.Vector3(-25,8,0));camera.lookAt(P.pos);}
    P.spd=p?CarrierRecovery.envelope(P,STALL_SPD,APP_SPD).reference:SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).reference;
    document.getElementById('flash').classList.remove('show');
    updateHUD();scene.updateMatrixWorld(true);GameRuntime.render(renderer,scene,camera);return down;
   },pacific);console.log('Render-only adaptation:',quality);
   const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'build189-'+(pacific?'pacific':'rhine')+'-adaptive.png')});
  }
  assert.deepEqual(errors,[]);console.log('Both campaigns: live loading/damage at 20/60/120 FPS and render-only touch quality passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
