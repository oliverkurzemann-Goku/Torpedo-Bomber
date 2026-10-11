/* Real aircraft, real mission selection, real WebGL pixels from each gun.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Chase heading WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 if(['/remagen-mission.html','/torpedo-carrier.html'].includes(url.pathname)){const html=fs.readFileSync(path.join(root,url.pathname.slice(1)),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1536,height:927},hasTouch:true}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  for(const pacific of (process.env.GAME_TEST_EUROPE_ONLY?[false]:[true,false])){
   await page.goto('http://127.0.0.1:'+server.address().port+(pacific?'/torpedo-carrier.html?v=183':'/remagen-mission.html?campaign=1&v=183'));
   await page.waitForFunction(pacific=>state===ST.MENU&&(pacific||realWorldReady),pacific,{polling:100});
   await page.evaluate(async pacific=>{
    renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;
    if(pacific){await prepareOkinawa();const m=MISSIONS.find(m=>m.sbd&&!m.corsair);await preparePacificModels(m);startMission(MISSIONS.indexOf(m));finishCarrierIntro();hideOverlays();}
    else{startMission(MISSIONS.findIndex(m=>m.ac==='p47'&&!m.free&&!m.circuits));finishLaunchIntro(false);show('menu',false);show('brief',false);}
    state=ST.FLIGHT;shakeT=0;
   },pacific);
   if(!pacific){await page.waitForFunction(()=>!!modelTpl.p47,null,{polling:100});await page.evaluate(()=>{refreshModels();if(!playerModel)throw Error('Original P-47 model not attached');});}
   const result=await page.evaluate(pacific=>{
    const setup=(degrees,aero)=>{
     aeroMode=aero;P.alive=true;P.onGround=false;P.hull=pacific?100:AC[P.ac].hull;P.pos.set(pacific?-4500:AF_X,1200,pacific?0:AF_Z);
     P.heading=(pacific?90-degrees:degrees)*Math.PI/180;P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;
     P.gear=P.gearTgt=P.flap=P.flapTgt=0;P.spd=pacific?80/KT:110;P.throttle=.6;inputPitch=inputRoll=0;windZ=6;
     if(pacific)windGust=0;shakeT=0;camera.position.copy(P.pos).addScaledVector(noseDir(),-30).add(new THREE.Vector3(0,8,0));
    };
    const before=FlightSupport.centerChase;let legacy=0;
    try{FlightSupport.centerChase=()=>{};setup(120,false);for(let i=0;i<180;i++){updateFlight(1/60);updateCamera(1/60);}camera.updateMatrixWorld(true);legacy=Math.abs(P.pos.clone().project(camera).x*innerWidth/2);}
    finally{FlightSupport.centerChase=before;}
    const cases=[];let maxOffset=0,maxSight=0;
    for(const aero of [false,true])for(const fps of [20,60,120])for(const degrees of [120,289]){
     setup(degrees,aero);
     for(let i=0;i<fps*3;i++){
      updateFlight(1/fps);updateCamera(1/fps);camera.updateMatrixWorld(true);
      const screen=P.pos.clone().project(camera);maxOffset=Math.max(maxOffset,Math.abs(screen.x*innerWidth/2));
      if(pacific){const reticle=document.querySelector('.pitReticle'),aim=P.pos.clone().addScaledVector(noseDir(),400).project(camera);maxSight=Math.max(maxSight,Math.abs(parseFloat(reticle.style.left)-(aim.x*.5+.5)*innerWidth));}
     }
     if(!P.alive)throw Error('Camera check crashed during real flight');
     cases.push({aero,fps,degrees});
    }
    // The player turns through the north wrap and levels out under crosswind.
    setup(350,false);inputRoll=.08;
    for(let i=0;i<360;i++){if(i===180)inputRoll=0;updateFlight(1/60);updateCamera(1/60);}
    const from=camera.position.clone(),pos=P.pos.clone();clock.getDelta=()=>.05;togglePause();animate();const paused=from.equals(camera.position)&&pos.equals(P.pos);togglePause();
    return {pacific,legacy,maxOffset,maxSight,cases:cases.length,paused};
   },pacific);
   assert(result.legacy>1,'legacy world-space easing reproduces a visible crosswind shift');
   assert(result.maxOffset<.05&&result.maxSight<.05&&result.paused,'actual flight frames and current gunsight remain centred, including pause');
   console.log('Actual flight/chase-camera regression:',result);
   for(const degrees of [120,289]){
    await page.evaluate(({pacific,degrees})=>{
     aeroMode=false;P.pos.set(pacific?-4500:AF_X,pacific?170:groundY(AF_X,AF_Z)+600,pacific?0:AF_Z);P.heading=(pacific?90-degrees:degrees)*Math.PI/180;P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;P.spd=pacific?80/KT:110;
     for(let i=0;i<120;i++){updateFlight(1/60);updateCamera(1/60);}
     if(pacific){updatePlaneMesh(0);updateHUD();updateNav();updateMinimap();}
     else{refreshModels();planeGroup.position.copy(P.pos);planeGroup.rotation.set(-P.pitch,P.heading,-P.roll,'YXZ');updateHUD();drawMinimap();updateContentVisibility(camera.position.x,camera.position.z);}
     scene.updateMatrixWorld(true);renderer.render(scene,camera);
    },{pacific,degrees});
    await page.screenshot({path:path.join(out,'build183-'+(pacific?'pacific':'europe')+'-heading-'+degrees+'.png')});
   }
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
