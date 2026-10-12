/* Shipped bomb predictors, straight-flight jitter and exact release trajectories. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Bomb cue WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  page.setDefaultTimeout(120000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(/shader error|VALIDATE_STATUS|Error compiling/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=191');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  await page.evaluate(async()=>{const m=MISSIONS.find(m=>m.loadout==='divebomb');await prepareOkinawa();await preparePacificModels(m);renderer.setPixelRatio(.6);renderer.shadowMap.enabled=false;});
  await page.waitForFunction(()=>sbdTemplate,null,{polling:200});
  for(const fps of [20,60,120]){
   const proof=await page.evaluate(fps=>{
    startMission(MISSIONS.findIndex(m=>m.loadout==='divebomb'));finishCarrierIntro();hideOverlays();state=ST.FLIGHT;DIFF='ace';
    ships.forEach(s=>s.alive=false);shoreTargets=[];loadout='divebomb';
    P.alive=true;P.onDeck=false;P.pos.set(-6000,150,-3500);P.heading=P.pitch=P.roll=0;P.spd=90;P.torps=2;shakeT=0;
    const nd=noseDir(),start=P.pos.clone(),old=[],smooth=[];
    let cached=null,timer=0;
    camera.position.copy(P.pos).addScaledVector(nd,-24).add(new THREE.Vector3(0,chaseH,0));camera.lookAt(P.pos.clone().addScaledVector(nd,30));bombCue.reset();
    for(let i=0;i<fps*3;i++){
     P.pos.addScaledVector(nd,P.spd/fps);
     camera.position.addScaledVector(nd,P.spd/fps);camera.lookAt(P.pos.clone().addScaledVector(nd,30));camera.updateMatrixWorld(true);
     timer-=1/fps;if(!cached||timer<=1e-6){cached=bombImpactPrediction().point;timer=.1;}
     const raw=cached.clone().project(camera);updateBombSight(1/fps);
     if(i>fps){old.push((-raw.y*.5+.5)*innerHeight);smooth.push(bombCue.y);}
    }
    const span=a=>Math.max(...a)-Math.min(...a);
    if(smooth.some(v=>v===null)||span(smooth)>.3||span(old)<1)throw Error('Straight-flight cue unstable '+JSON.stringify({fps,old:span(old),new:span(smooth)}));
    if(P.pos.distanceTo(start)<250||P.spd!==90||P.torps!==2)throw Error('Display altered flight/ordnance');
    const quiet=bombCue.opacity;
    P.pitch=-.5;camera.position.copy(P.pos).add(new THREE.Vector3(-25,9,0));
    const hit=bombImpactPrediction();camera.lookAt(hit.point);
    for(let i=0;i<fps;i++)updateBombSight(1/fps);
    camera.updateMatrixWorld(true);const ndc=bombImpactPrediction().point.clone().project(camera);
    const error=Math.hypot(bombCue.x-(ndc.x*.5+.5)*innerWidth,bombCue.y-(-ndc.y*.5+.5)*innerHeight);
    if(error>1.5||bombCue.opacity<.9||quiet>.43)throw Error('Dive response/opacity incorrect '+JSON.stringify({error,quiet,dive:bombCue.opacity}));
    let actual=null;const splash=spawnSplash;spawnSplash=(x,z,...args)=>{actual=new THREE.Vector3(x,.4,z);return splash(x,z,...args);};
    releaseBomb();for(let i=0;i<fps*8&&bombs.length;i++)updateBombs(1/fps);spawnSplash=splash;
    if(!actual||actual.distanceTo(hit.point)>8)throw Error('Actual bomb deviates from unchanged predictor');
    loadout='torpedo';updateBombSight(1/fps);if(!document.getElementById('bombSight').hidden)throw Error('Cue persists for torpedo');
    return {fps,oldRange:span(old),newRange:span(smooth),aimError:error,bombError:actual.distanceTo(hit.point),quiet};
   },fps);console.log('Actual Pacific cue / bomb:',proof);
  }
  await page.evaluate(()=>{
   loadout='divebomb';P.torps=1;P.pitch=0;P.pos.set(-6000,150,-3500);P.heading=P.roll=0;P.gear=P.gearTgt=0;document.getElementById('flash').classList.remove('show');updatePlaneMesh(0);
   camera.position.copy(P.pos).add(new THREE.Vector3(-24,9,0));camera.lookAt(P.pos.clone().add(new THREE.Vector3(30,0,0)));
   bombCue.reset();for(let i=0;i<90;i++)updateBombSight(1/60);updateHUD();scene.updateMatrixWorld(true);GameRuntime.render(renderer,scene,camera);
  });
  await page.screenshot({path:path.join(out,'build191-pacific-quiet-bomb-cue.png')});
  const edges=await page.evaluate(()=>{
   const hit=bombImpactPrediction();camera.lookAt(hit.point);updateBombSight(0);
   const first=bombCue.opacity;
   camera.lookAt(P.pos.clone().add(new THREE.Vector3(30,200,0)));
   for(let i=0;i<3;i++)updateBombSight(1/60);
   const intermediate=bombCue.opacity;
   if(intermediate<=0||intermediate>=first)throw Error('Edge has no fade');
   for(let i=0;i<60;i++)updateBombSight(1/60);
   if(!document.getElementById('bombSight').hidden)throw Error('Offscreen bomb cue stays visible');
   camera.lookAt(hit.point);for(let i=0;i<60;i++)updateBombSight(1/60);
   if(document.getElementById('bombSight').hidden||Math.abs(bombCue.x-innerWidth/2)>1)throw Error('Reentry traverses from old offscreen position');
   return {first,intermediate,returned:bombCue.opacity};
  });console.log('Actual camera edge/reentry:',edges);
  await page.evaluate(()=>{
   const edgeCamera=new THREE.OrthographicCamera(-innerWidth/2,innerWidth/2,innerHeight/2,-innerHeight/2,.1,100);
   edgeCamera.position.z=10;edgeCamera.lookAt(0,0,0);bombCue.reset();
   for(let i=0;i<120;i++)bombCue.update(1/120,{enabled:true,position:new THREE.Vector3(),camera:edgeCamera,predict:()=>({point:new THREE.Vector3(-innerWidth/2+3.6,0,0),onTarget:false})});
   if(document.getElementById('bombSight').hidden||bombCue.opacity<.035)throw Error('Faint edge entry never fades in at 120 FPS');
   bombCue.reset();
  });
  await page.evaluate(()=>{P.pitch=-.5;const hit=bombImpactPrediction();camera.position.copy(P.pos).add(new THREE.Vector3(-25,9,0));camera.lookAt(hit.point);for(let i=0;i<60;i++)updateBombSight(1/60);GameRuntime.render(renderer,scene,camera);});
  await page.screenshot({path:path.join(out,'build191-pacific-dive-bomb-cue.png')});
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=191');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  const rhine=await page.evaluate(async()=>{
   await ensureModel('p47');renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;startMission(0);finishLaunchIntro(false);show('menu',false);show('brief',false);
   state=ST.FLIGHT;P.onGround=false;P.alive=true;P.pos.set(AF_X,AF_Y+200,AF_Z+1500);P.heading=0;P.pitch=-.4;P.roll=0;P.spd=100;P.bombs=2;weapon='bomb';shakeT=0;
   const hit=bombImpactPrediction();if(!hit)throw Error('Rhine prediction absent');
   camera.position.copy(P.pos).add(new THREE.Vector3(0,9,-25));camera.lookAt(hit);bombCue.reset();
   for(let i=0;i<60;i++)updateBombSight(1/60);
   const x=bombCue.x,y=bombCue.y,timer=bombCue.timer;
   for(let i=0;i<20;i++)updateHUD();
   if(bombCue.x!==x||bombCue.y!==y||bombCue.timer!==timer)throw Error('HUD bypasses display filter/sample timer');
   updateCamera(1/60);updateBombSight(1/60);scene.updateMatrixWorld(true);GameRuntime.render(renderer,scene,camera);
   P.bombs=0;updateBombSight(1/60);if(!document.getElementById('bombSight').hidden)throw Error('Empty Rhine load keeps cue');
   return {x,y,timer};
  });console.log('Actual Rhine camera/HUD/reset:',rhine);
  assert.deepEqual(errors,[]);console.log('Native bomb cue motion, opacity, edge fade, real bombs and both game integrations passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
