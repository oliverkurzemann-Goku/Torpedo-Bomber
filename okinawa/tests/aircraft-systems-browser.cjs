/* All original aircraft: mechanical rigs, visible surfaces, gun cues and departure. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Aircraft systems WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/shader error|VALIDATE_STATUS|Error compiling/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});

  for(const pacific of [false,true]){
   await page.goto('http://127.0.0.1:'+server.address().port+'/'+(pacific?'torpedo-carrier.html':'remagen-mission.html')+'?v=192');
   await page.waitForFunction(p=>state===ST.MENU&&(p||realWorldReady),pacific,{polling:200});
   await page.evaluate(async p=>{
    renderer.setPixelRatio(.6);renderer.shadowMap.enabled=false;
    if(p){await prepareOkinawa();for(const kind of ['avenger','sbd','corsair','zero']){const m=MISSIONS.find(m=>kind==='zero'?m.defend:kind==='corsair'?m.corsair:kind==='sbd'?m.sbd&&!m.corsair:!m.sbd&&!m.defend&&!m.free&&!m.qual);await preparePacificModels(m);}}
    else for(const kind of ['p47','bf109','fw190','ju87','me262','me163','b17','b24'])await ensureModel(kind);
   },pacific);
   for(const kind of pacific?['avenger','sbd','corsair','zero']:['p47','bf109','fw190','ju87','me262','me163','b17','b24']){
    const report=await page.evaluate(({kind,pacific})=>{
     let model,frame;
     if(pacific){
      const index=MISSIONS.findIndex(m=>kind==='zero'?m.defend:kind==='corsair'?m.corsair:kind==='sbd'?m.sbd&&!m.corsair:!m.sbd&&!m.defend&&!m.free&&!m.qual);
      startMission(index);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;
      P.pos.set(-3000,150,0);P.heading=0;P.pitch=P.roll=0;P.onDeck=false;P.gear=P.gearTgt=1;P.flap=P.flapTgt=0;updatePlaneMesh(0);
      model=kind==='avenger'?gltfRoot:kind==='zero'?playerZero:playerSBD;
      frame=kind==='avenger'?model.getObjectByName('avengerArticulation'):model.getObjectByName(kind==='zero'?'zeroGear':'sbdGear').parent;
     }else if(kind==='b17'||kind==='b24'){
      startMission(0);finishLaunchIntro(false);show('menu',false);show('brief',false);model=buildAircraft(kind);scene.add(model);model.position.set(AF_X,AF_Y+150,AF_Z);frame=model;window.systemProofModel=model;
     }else{
      const index=MISSIONS.findIndex(m=>m.ac===kind&&!m.free);startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
      P.pos.set(AF_X,AF_Y+150,AF_Z);P.heading=0;P.pitch=P.roll=0;P.onGround=false;P.gear=P.gearTgt=1;P.flap=P.flapTgt=0;refreshModels();posePlayerAircraft(0);model=playerModel;frame=model;
     }
     const panels=frame.getObjectByName('flightFlaps');
     if(!panels||panels.children.length!==2)throw Error('Flaps are not fitted to both original wings: '+kind+' '+panels?.children.length);
     const gear=frame.getObjectByName(frame.userData.articulation.gearName),tyres=[];
     gear?.traverse(o=>{if(o.userData.groundWheel)tyres.push(o);});
     if(!['ju87','me163'].includes(kind)&&tyres.length!==3)throw Error('Missing grounded wheel assemblies '+kind+' '+tyres.length);
     const down=gear?.children.map(h=>h.rotation.toArray().slice(0,3));
     AircraftArticulation.pose(frame,.5,{left:.8,right:.25});
     if(kind==='p47')poseP47Gear(frame,.5);
     const half=gear?.children.map(h=>h.rotation.toArray().slice(0,3));
     if(!['ju87','me163'].includes(kind)&&JSON.stringify(down)===JSON.stringify(half))throw Error('Gear only toggles instead of moving '+kind);
     if(!(panels.children[0].rotation.x<panels.children[1].rotation.x))throw Error('Flap damage/left-right commands lost '+kind);
     AircraftArticulation.pose(frame,1,{left:1,right:1});if(kind==='p47')poseP47Gear(frame,1);
     model.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(model),centre=box.getCenter(new THREE.Vector3());
     camera.position.copy(centre).add(new THREE.Vector3(14,1.5,-12).multiplyScalar(kind==='b17'||kind==='b24'?2:1));camera.up.set(0,1,0);camera.lookAt(centre);camera.fov=45;camera.updateProjectionMatrix();
     scene.updateMatrixWorld(true);GameRuntime.render(renderer,scene,camera);
     const gl=renderer.getContext(),pixels=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4),without=new Uint8Array(pixels.length);
     gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);panels.visible=false;GameRuntime.render(renderer,scene,camera);
     gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,without);panels.visible=true;GameRuntime.render(renderer,scene,camera);
     let changed=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(Math.abs(pixels[i]-without[i]),Math.abs(pixels[i+1]-without[i+1]),Math.abs(pixels[i+2]-without[i+2]))>5)changed++;
     if(changed<20)throw Error('Flaps do not reach the actual framebuffer: '+kind+' '+changed);
     return {kind,flapPixels:changed,panels:panels.children.map(p=>({root:p.position.toArray(),faces:p.children[0].geometry.attributes.position.count/3})),tyres:tyres.length,gear:gear?.children.map(p=>p.position.toArray()),down,half};
    },{kind,pacific});console.log('Original aircraft rig:',JSON.stringify(report));
    await page.screenshot({path:path.join(out,'build192-'+kind+'-gear-flaps.png')});
    if(['bf109','fw190','ju87'].includes(kind)){
     const starts=await page.evaluate(kind=>[20,60,120].map(fps=>{
      startMission(MISSIONS.findIndex(m=>m.ac===kind&&!m.free&&!m.circuits));finishLaunchIntro(false);state=ST.FLIGHT;
      inputRoll=0;inputPitch=.6;P.throttle=1;aeroMode=false;const start=P.pos.x;let seconds=0;
      while(P.onGround&&P.alive&&seconds<40){updateFlight(1/fps);seconds+=1/fps;}
      const distance=P.pos.x-start;
      if(!P.alive||P.onGround||distance>RWY_LEN-140)throw Error('Runway rotation failed '+JSON.stringify({kind,fps,distance,seconds}));
      for(let i=0;i<fps*4;i++)updateFlight(1/fps);
      const agl=P.pos.y-groundY(P.pos.x,P.pos.z);
      if(!P.alive||P.onGround||agl<10)throw Error('Initial climb failed '+JSON.stringify({kind,fps,agl,spd:P.spd}));
      return {fps,seconds,distance,agl};
     }),kind);console.log('Runway rotation/climb:',JSON.stringify({kind,starts}));
    }
    if(!['b17','b24'].includes(kind)){
     const flight=await page.evaluate(({kind,pacific})=>{
      const results=[];
      const reset=(gear,flap)=>{
       P.alive=true;P.onGround=P.onDeck=false;P.arrestRun=P.deckRun=null;P.departureAge=null;P.touchResolved=false;
       P.pos.set(pacific?-4500:AF_X,pacific?900:AF_Y+1000,pacific?0:AF_Z);P.heading=0;P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;
       P.gear=P.gearTgt=kind==='ju87'?1:gear;P.flap=P.flapTgt=flap;P.throttle=1;P.hull=pacific?100:acDef().hull;
       P.fuel=70;P.bombs=P.torps=0;P.tankAttached=false;P.tankFuel=0;SortieFeatures.Damage.reset(P,P.hull);
       const ref=pacific?CarrierRecovery.envelope(P,STALL_SPD,APP_SPD).reference:SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).reference;
       P.spd=ref+5;inputPitch=.5;inputRoll=.45;shakeT=0;state=ST.FLIGHT;
      };
      for(const fps of [20,60,120]){
       for(const aero of [false,true]){
        aeroMode=aero;reset(0,0);for(let i=0;i<fps*.5;i++)updateFlight(1/fps);const clean={pitch:P.pitch,roll:P.roll};
        reset(1,1);for(let i=0;i<fps*.5;i++)updateFlight(1/fps);const landing={pitch:P.pitch,roll:P.roll};
        if(Math.abs(landing.roll)>=Math.abs(clean.roll)*.97||landing.pitch>=clean.pitch*.97)throw Error('Landing configuration stays twitchy '+JSON.stringify({kind,fps,aero,clean,landing}));
       }
       aeroMode=false;reset(1,0);inputRoll=0;inputPitch=.8;const high=P.pos.y;
       for(let i=0;i<fps*5;i++)updateFlight(1/fps);const normal=P.pos.y-high;
       reset(1,0);inputRoll=0;inputPitch=.8;const begin=P.pos.y;SortieFeatures.Handling.beginDeparture(P);
       for(let i=0;i<fps*5;i++)updateFlight(1/fps);const initial=P.pos.y-begin;
       if(!P.alive||initial<2||initial>=normal*.85)throw Error('Departure envelope ineffective '+JSON.stringify({kind,fps,initial,normal,alive:P.alive}));
       results.push({fps,initial,normal});
      }
      reset(0,0);P.pitch=.25;P.roll=.5;P.spd=95;P.ammo=100;
      if(pacific)updatePlaneMesh(0);else posePlayerAircraft(0);
      camera.position.copy(P.pos).addScaledVector(noseDir(),-30).add(new THREE.Vector3(0,8,0));camera.lookAt(P.pos.clone().addScaledVector(noseDir(),35));updateCamera(1/60);
      const q=pacific?pacificAircraftQuaternion():new THREE.Quaternion().setFromEuler(new THREE.Euler(-P.pitch,P.heading,-P.roll,'YXZ'));
      const ports=pacific?pacificGunMuzzles():gunMuzzles(),aim=GameRuntime.gunAim(camera,P.pos,q,ports,noseDir(),P.spd,pacific?650:JET_KINDS.includes(kind)?540:760);
      const random=Math.random;let fresh;
      try{Math.random=()=>.5;const count=bullets.length;if(pacific){gunCool=0;firing=true;updateGuns(0);firing=false;}else{gunT=0;fireGuns(0);}fresh=bullets.slice(count);}finally{Math.random=random;}
      if(fresh.length!==ports.length)throw Error('Actual gun barrels not all firing '+kind);
      const mean=new THREE.Vector3();for(const b of fresh)mean.add(b.mesh.position.clone().addScaledVector(b.dir,aim.range));mean.divideScalar(fresh.length).project(camera);
      const error=Math.hypot(aim.x-(mean.x*.5+.5)*innerWidth,aim.y-(-mean.y*.5+.5)*innerHeight);
      if(error>.01)throw Error('Gun cue lies above actual rounds '+kind+' '+error);
      const element=pacific?document.querySelector('.pitReticle'):document.getElementById('gunsight');GameRuntime.showGunAim(element,aim,0);
      const rect=element.getBoundingClientRect();if(Math.hypot(rect.x+rect.width/2-aim.x,rect.y+rect.height/2-aim.y)>1)throw Error('Rendered circle centre disagrees with muzzle projection '+kind);
      return {kind,departure:results,gunError:error};
     },{kind,pacific});console.log('Actual aircraft flight/sight:',JSON.stringify(flight));
    }
    if(!pacific&&(kind==='b17'||kind==='b24'))await page.evaluate(()=>{scene.remove(window.systemProofModel);delete window.systemProofModel;});
   }
  }
  assert.deepEqual(errors,[]);console.log('Original-aircraft mechanical rigs and fitted visible flaps passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
