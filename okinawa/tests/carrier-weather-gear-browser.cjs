/* Original aircraft and the shipped touchdown/launch/render functions. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Gear/carrier/weather WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  if(!process.env.GAME_TEST_PACIFIC_ONLY){
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=190');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  await page.evaluate(async()=>{await ensureModel('p47');renderer.setPixelRatio(.75);renderer.shadowMap.enabled=false;startMission(0);finishLaunchIntro(false);show('menu',false);show('brief',false);P.gear=P.gearTgt=1;refreshModels();posePlayerAircraft(0);});
  const gear=await page.evaluate(()=>{
   const tyres=[];playerModel.getObjectByName('gear').traverse(o=>{if(o.userData.groundWheel)tyres.push(o);});
   if(tyres.length!==3||tyres.some(t=>!t.visible))throw Error('Missing tyres');
   const fit=AircraftGround.fit(playerModel,'p47',P.pos.x,P.pos.z,P.heading,(x,z)=>AircraftGround.height(terrain,x,z)),q=new THREE.Vector3();
   const gaps=fit.contacts.map(p=>fit.y+p.y-AircraftGround.height(terrain,P.pos.x+p.x,P.pos.z+p.z));
   if(gaps.some(g=>Math.abs(g)>.025))throw Error('P47 tyres do not touch actual rendered ground '+JSON.stringify(gaps));
   const diameter=tyres.slice(0,2).map(t=>new THREE.Box3().setFromObject(t).getSize(q).length());
   const p=planeGroup.position.clone(),offset=new THREE.Vector3(11,2.8,9).applyAxisAngle(new THREE.Vector3(0,1,0),P.heading);
   camera.position.copy(p).add(offset);camera.lookAt(p.clone().add(new THREE.Vector3(0,-.6,0)));camera.near=.1;camera.fov=44;camera.updateProjectionMatrix();scene.updateMatrixWorld(true);GameRuntime.render(renderer,scene,camera);
   return {gaps,diameter,hinges:playerModel.getObjectByName('gear').children.slice(0,2).map(h=>h.position.toArray())};
  });console.log('P47 real ground stance:',gear);await page.screenshot({path:path.join(out,'build190-p47-ground-gear.png')});
  await page.evaluate(()=>{P.onGround=false;P.pos.y=AF_Y+140;P.gear=1;posePlayerAircraft(0);camera.position.copy(P.pos).add(new THREE.Vector3(0,-3,14).applyAxisAngle(new THREE.Vector3(0,1,0),P.heading));camera.lookAt(P.pos.clone().add(new THREE.Vector3(0,-.6,0)));scene.updateMatrixWorld(true);GameRuntime.render(renderer,scene,camera);});
  await page.screenshot({path:path.join(out,'build190-p47-airborne-gear.png')});
  for(const size of [{width:1024,height:520},{width:1194,height:660},{width:1536,height:930}]){
   await page.setViewportSize(size);
   const layout=await page.evaluate(()=>{
    document.getElementById('objText').textContent='RTB — LAND AT BEAUFORT · REQUIRED TARGETS AND LONG RECOVERY INSTRUCTIONS';
    document.getElementById('flakAlert').textContent='ANTI-AIRCRAFT FIRE AHEAD';document.getElementById('opsStatus').textContent='RECOVERY · FUEL RESERVE · WEATHER UPDATE';
    SortieFeatures.Damage.surfaceHit(P,'aileron','left');SortieFeatures.Damage.surfaceHit(P,'elevator');SortieFeatures.Damage.surfaceHit(P,'flap','left');warningLamps.update(P);
    const a=document.getElementById('obj').getBoundingClientRect(),b=document.getElementById('systemsStatus').getBoundingClientRect(),c=document.getElementById('opsStatus').getBoundingClientRect();
    return {nav:a.bottom,warning:b.top,warningBottom:b.bottom,ops:c.top,right:b.right,width:innerWidth};
   });assert(layout.warning>=layout.nav+5&&layout.ops>=layout.warningBottom+5&&layout.right<layout.width);console.log('HUD non-overlap:',size,layout);
  }
  await page.setViewportSize({width:1194,height:660});await page.screenshot({path:path.join(out,'build190-separated-warnings.png')});
  }
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=190');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  await page.evaluate(async()=>{await prepareOkinawa();await preparePacificModels(MISSIONS[0]);renderer.setPixelRatio(.6);renderer.shadowMap.enabled=false;clock.getDelta=()=>.05;startMission(0);launch();finishCarrierIntro();});
  const idle=await page.evaluate(()=>{const power=P.throttle,x=P.pos.x-carrierX,draw=GameRuntime.render;GameRuntime.render=()=>true;try{for(let i=0;i<60;i++)animateFrame();}finally{GameRuntime.render=draw;}return {power,after:P.throttle,relativeTravel:P.pos.x-carrierX-x,state};});
  assert.equal(idle.power,0);assert.equal(idle.after,0);assert(Math.abs(idle.relativeTravel)<.001&&idle.state===2,'no autonomous deck departure');console.log('Manual launch idle:',idle);
  const throttle=await page.locator('#throttle').boundingBox();await page.touchscreen.tap(throttle.x+throttle.width/2,throttle.y+2);
  assert(await page.evaluate(()=>P.throttle>.95),'actual touch throttle supplies power');
  const departure=await page.evaluate(()=>{const begin=launchTimer,draw=GameRuntime.render;GameRuntime.render=()=>true;try{for(let i=0;i<300&&state===ST.LAUNCH;i++)animateFrame();}finally{GameRuntime.render=draw;}return {time:launchTimer-begin,state,speed:P.spd,pos:P.pos.toArray()};});assert.equal(departure.state,3);assert(departure.time>6&&departure.time<12);console.log('Touch-powered departure:',departure);
  for(const fps of [20,60,120]){
   const contact=await page.evaluate(fps=>{
    function setup(hook,power,x){startMission(0);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;DIFF='ace';windHead=6;windGust=0;seaState=0;
     for(const cm of [carrierModel,ijnCarrierModel])if(cm){cm.rotation.x=cm.rotation.z=0;cm.position.x=carrierX;}
     P.rtb=true;P.onDeck=false;P.heading=0;P.pitch=-.045;P.roll=P.rollBias=P.pitchVel=P.rollVel=0;P.spd=40;P.throttle=power;P.gear=P.gearTgt=P.flap=P.flapTgt=1;P.hook=P.hookTgt=hook;P.pos.set(carrierX+x,30,0);P.vSpeed=-2;updatePlaneMesh(0);P.pos.y=carrierContactHeight();P.touchResolved=false;inputPitch=inputRoll=0;resolveGroundAndDeck(1/fps);}
    setup(1,.25,WIRE_X0-16);const power=P.throttle,startY=P.pos.y;
    if(!P.deckRun||!P.deckRun.wireEligible||P.bolters||P.throttle!==.25)throw Error('Early touchdown did not stay grounded '+JSON.stringify({x:P.pos.x-carrierX,stern:STERN_X,wire:WIRE_X0,run:P.deckRun,arrest:P.arrestRun,bolters:P.bolters,power:P.throttle,alive:P.alive,result:document.getElementById('result')?.textContent}));
    let maxJump=0;for(let i=0;i<fps*3&&!P.arrestRun;i++){const y=P.pos.y;updateFlight(1/fps);updatePlaneMesh(1/fps);maxJump=Math.max(maxJump,P.pos.y-y);}
    if(!P.arrestRun||P.throttle!==power||maxJump>.3)throw Error('Early touchdown fails to roll to the wires '+JSON.stringify({fps,power,throttle:P.throttle,maxJump,run:P.deckRun}));
    const caught=true;
    setup(0,0,WIRE_X0-16);for(let i=0;i<fps*2;i++){updateFlight(1/fps);updatePlaneMesh(1/fps);}
    if(P.throttle!==0||!P.onDeck||!P.deckRun)throw Error('Stopped early touchdown got auto power/lift');
    P.throttle=1;setThrottleUI(1);for(let i=0;i<fps*2;i++){updateFlight(1/fps);updatePlaneMesh(1/fps);}
    if(!P.onDeck)throw Error('Gas alone caused an automatic rotation');
    inputPitch=.5;for(let i=0;i<fps*3&&P.onDeck;i++){updateFlight(1/fps);updatePlaneMesh(1/fps);}
    if(P.onDeck||!P.alive)throw Error('Pilot cannot rotate the missed-wire deck run');
    setup(1,.25,WIRE_X1+8);if(P.throttle!==.25||!P.deckRun||P.deckRun.wireEligible)throw Error('Late bolter stole the throttle');
    return {fps,caught,maxJump,earlyStartY:startY,latePower:P.throttle};
   },fps);console.log('Manual/early carrier recovery:',contact);
  }
  await page.evaluate(()=>{P.deckRun=null;P.onDeck=false;P.rtb=true;state=ST.FLIGHT;P.pos.set(carrierX-400,45,0);P.heading=0;P.pitch=-.03;P.roll=0;P.gear=P.gearTgt=P.flap=P.flapTgt=P.hook=P.hookTgt=1;P.vSpeed=-2;P.spd=CarrierRecovery.approach(P).lowLimit-1;resetControlUI();document.getElementById('flash').classList.remove('show');updatePlaneMesh(0);updateHUD();updateLSO();camera.position.copy(P.pos).add(new THREE.Vector3(-24,6,0));camera.lookAt(P.pos.clone().add(new THREE.Vector3(20,0,0)));scene.updateMatrixWorld(true);GameRuntime.render(renderer,scene,camera);});
  assert(await page.locator('#approachSpeed').isVisible());assert(await page.locator('#hSpd').evaluate(e=>e.classList.contains('lowSpeed')));assert((await page.locator('#speedBandLabel').textContent()).includes('TOO SLOW'));assert((await page.locator('#spdCue').textContent()).includes('TOO SLOW'));
  await page.screenshot({path:path.join(out,'build190-too-slow-band.png')});
  const storm=await page.evaluate(()=>{weather='storm';applyWeather();const c=maritimeWeather.cells[0];P.pos.set(c.x-3600,210,c.z-1900);P.onDeck=false;P.gear=P.gearTgt=P.flap=P.flapTgt=P.hook=P.hookTgt=0;P.rtb=false;P.spd=75;resetControlUI();updatePlaneMesh(0);camera.position.copy(P.pos).add(new THREE.Vector3(-16,6,0));camera.lookAt(c.x,c.top*.5,c.z);camera.fov=68;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);skyDome.position.copy(camera.position);document.getElementById('flash').classList.remove('show');document.getElementById('lso').classList.remove('show');maritimeWeather.render(.05,camera,renderer,flightQuality.budget);FlightOps.visibility(scene,clouds,P.pos,weather,.05,seaUniforms,maritimeWeather.conditions(P.pos));const s=maritimeWeather.conditions(P.pos);document.getElementById('wxHazard').hidden=!s.warning;document.getElementById('wxHazard').textContent=s.warning;updateHUD();updateMinimap();scene.updateMatrixWorld(true);GameRuntime.render(renderer,scene,camera);
   const gl=renderer.getContext(),a=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4),b=new Uint8Array(a.length);gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,a);maritimeWeather.layers.visible=false;GameRuntime.render(renderer,scene,camera);gl.readPixels(0,0,renderer.domElement.width,renderer.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,b);maritimeWeather.layers.visible=true;GameRuntime.render(renderer,scene,camera);let pixels=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>4)pixels++;
   const m=new THREE.Matrix4();maritimeWeather.layers.getMatrixAt(20,m);const point=new THREE.Vector3().setFromMatrixPosition(m);return {...maritimeWeather.report(),pixels,cell:c,point:point.toArray(),projected:point.project(camera).toArray()};});assert.equal(storm.cb,3);assert(storm.puffs<=160);assert(storm.pixels>1000,'CB volume must reach the framebuffer');console.log('Actual storm render:',storm);
  await page.screenshot({path:path.join(out,'build190-pacific-cb.png')});
  await page.evaluate(()=>{const c=maritimeWeather.cells[0];P.pos.set(c.x+c.radius*1.25,110,c.z);camera.position.copy(P.pos).add(new THREE.Vector3(-20,7,0));camera.lookAt(c.x,c.base,c.z);camera.updateMatrixWorld(true);maritimeWeather.render(.05,camera,renderer,flightQuality.budget);scene.updateMatrixWorld(true);GameRuntime.render(renderer,scene,camera);});
  assert(await page.evaluate(()=>rainMesh.isPoints&&rainMesh.visible&&rainMesh.geometry.drawRange.count<=1000));await page.screenshot({path:path.join(out,'build190-pacific-fine-rain.png')});
  await page.evaluate(()=>{weather='fog';applyWeather();const b=maritimeWeather.banks[0];P.pos.set(b.x-b.radius*.65,70,b.z);camera.position.copy(P.pos).add(new THREE.Vector3(-20,6,0));camera.lookAt(b.x,50,b.z);camera.updateMatrixWorld(true);for(let i=0;i<60;i++)FlightOps.visibility(scene,clouds,P.pos,weather,.05,seaUniforms,maritimeWeather.conditions(P.pos));maritimeWeather.render(.05,camera,renderer);scene.updateMatrixWorld(true);GameRuntime.render(renderer,scene,camera);});await page.screenshot({path:path.join(out,'build190-pacific-sea-fog.png')});
  assert.deepEqual(errors,[]);console.log('Original P47 gear, separated HUD, manual deck/early touchdown, speed band and native maritime weather passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
