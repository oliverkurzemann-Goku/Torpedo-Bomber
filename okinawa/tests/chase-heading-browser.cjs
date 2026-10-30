/* Build 220: on the computed core the Pacific cases fly at 125 kt - 80 kt is below the Avenger's clean stall, and a real stall swings the nose.
 * Real aircraft, real mission selection, real WebGL pixels from each gun.
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
    else{await ensureModel('p47');startMission(MISSIONS.findIndex(m=>m.ac==='p47'&&!m.free&&!m.circuits));finishLaunchIntro(false);show('menu',false);show('brief',false);}
    state=ST.FLIGHT;shakeT=0;
   },pacific);
   if(!pacific){await page.waitForFunction(()=>!!modelTpl.p47,null,{polling:100});await page.evaluate(()=>{refreshModels();if(!playerModel)throw Error('Original P-47 model not attached');});}
   const result=await page.evaluate(pacific=>{
    const setup=(degrees,aero)=>{
     aeroMode=aero;P.alive=true;P.onGround=false;P.hull=pacific?100:AC[P.ac].hull;P.pos.set(pacific?-4500:AF_X,1200,pacific?0:AF_Z);
     P.heading=(pacific?90-degrees:degrees)*Math.PI/180;P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;
     P.gear=P.gearTgt=P.flap=P.flapTgt=0;P.spd=pacific?(typeof coreOn==='function'&&coreOn()?125/KT:80/KT):110;P.throttle=.6;inputPitch=inputRoll=0;windZ=6;
     if(pacific)windGust=0;shakeT=0;camera.position.copy(P.pos).addScaledVector(noseDir(),-30).add(new THREE.Vector3(0,8,0));
     delete (pacific?document.querySelector('.pitReticle'):document.getElementById('gunsight'))._gunCue;
    };
    const before=FlightSupport.centerChase;let legacy=0;
    try{FlightSupport.centerChase=()=>{};setup(120,false);for(let i=0;i<180;i++){updateFlight(1/60);updateCamera(1/60);}camera.updateMatrixWorld(true);legacy=Math.abs(P.pos.clone().project(camera).x*innerWidth/2);}
    finally{FlightSupport.centerChase=before;}
    const cases=[];let maxOffset=0,maxSight=0,settledSight=0;
    for(const aero of [false,true])for(const fps of [20,60,120])for(const degrees of [120,289]){
     setup(degrees,aero);
     for(let i=0;i<fps*3;i++){
      updateFlight(1/fps);updateCamera(1/fps);camera.updateMatrixWorld(true);
      const screen=P.pos.clone().project(camera);maxOffset=Math.max(maxOffset,Math.abs(screen.x*innerWidth/2));
      if(pacific){
       const reticle=document.querySelector('.pitReticle'),ports=pacificGunMuzzles(),q=pacificAircraftQuaternion();
       const range=Math.max(220,Math.min(430,650*(.34+P.spd*.00075))),aim=new THREE.Vector3();
       for(const port of ports)aim.add(port.clone().applyQuaternion(q).add(P.pos).addScaledVector(noseDir(),range));
       aim.divideScalar(ports.length).project(camera);
       const error=Math.abs(parseFloat(reticle.style.left)-(aim.x*.5+.5)*innerWidth);
       maxSight=Math.max(maxSight,error);if(i>fps*2.75)settledSight=Math.max(settledSight,error);
      }
     }
     if(!P.alive)throw Error('Camera check crashed during real flight');
     cases.push({aero,fps,degrees});
    }
    // The player turns through the north wrap and levels out under crosswind.
    setup(350,false);inputRoll=.08;
    for(let i=0;i<360;i++){if(i===180)inputRoll=0;updateFlight(1/60);updateCamera(1/60);}
    const from=camera.position.clone(),pos=P.pos.clone();clock.getDelta=()=>.05;togglePause();animate();const paused=from.equals(camera.position)&&pos.equals(P.pos);togglePause();
    // Build 229: REALISTIC, banked hard pull through the 53-degree pitch line (the old rule switched the sideways
    // correction on and off there: the picture popped sideways, worst in the fast-turning Zero). The camera may not
    // turn faster than the aircraft does; the old rule is reproduced for comparison.
    const popRun=old=>{
     const keep=FlightSupport.centerChaseLag;
     if(old)FlightSupport.centerChaseLag=(cam,want,track)=>{if(Math.hypot(track.x,track.z)>.6)FlightSupport.centerChase(cam,P.pos,track);};
     let maxCam=0,maxPlane=0;
     try{
      for(const [pull,fps] of [[1,60],[-1,60],[1,120]]){
       setup(120,true);P.pos.y=pacific?1500:groundY(AF_X,AF_Z)+1500;P.spd=pacific?125/KT:130;
       for(let i=0;i<fps;i++){updateFlight(1/fps);updateCamera(1/fps);}   // settle the camera in level flight
       camera.updateMatrixWorld(true);
       let prevC=camera.quaternion.clone(),prevP=null;
       const planeQ=()=>pacific?pacificAircraftQuaternion():new THREE.Quaternion().setFromEuler(new THREE.Euler(-P.pitch,P.heading,-P.roll,'YXZ'));
       prevP=planeQ();
       for(let i=0;i<fps*4;i++){
        inputPitch=pull;inputRoll=.1;   // a thumb a little off the vertical axis
        updateFlight(1/fps);updateCamera(1/fps);camera.updateMatrixWorld(true);
        const c=camera.quaternion,q=planeQ();
        maxCam=Math.max(maxCam,2*Math.acos(Math.min(1,Math.abs(prevC.dot(c))))*fps*180/Math.PI);
        maxPlane=Math.max(maxPlane,2*Math.acos(Math.min(1,Math.abs(prevP.dot(q))))*fps*180/Math.PI);
        prevC=c.clone();prevP=q.clone();
       }
       inputPitch=inputRoll=0;
      }
     }finally{FlightSupport.centerChaseLag=keep;}
     return {maxCam:Math.round(maxCam),maxPlane:Math.round(maxPlane)};
    };
    const pop={fixed:popRun(false),old:popRun(true)};
    // Build 229: the same chase distance in both modes (REALISTIC eases the camera faster and used to sit 4-9 m closer: the
    // aircraft looked zoomed in). Speed and height are held, so only the camera law differs.
    const distRun=aero=>{
     setup(120,aero);P.pos.y=pacific?1500:groundY(AF_X,AF_Z)+1500;const y0=P.pos.y,v0=pacific?75:70;P.spd=v0;
     for(let i=0;i<300;i++){updateFlight(1/60);P.spd=v0;P.pos.y=y0;P.pitch=P.roll=0;updateCamera(1/60);}
     return camera.position.distanceTo(P.pos);
    };
    const chaseDist={arcade:distRun(false),realistic:distRun(true)};
    return {pacific,legacy,maxOffset,maxSight,settledSight,cases:cases.length,paused,pop,chaseDist};
   },pacific);
   console.log('Actual flight/chase-camera regression:',result);
   assert(result.legacy>1,'legacy world-space easing reproduces a visible crosswind shift');
   assert(Math.abs(result.chaseDist.arcade-result.chaseDist.realistic)<1.5,'REALISTIC chase camera sits at the ARCADE distance (no zoom-in) '+JSON.stringify(result.chaseDist));
   assert(result.pop.fixed.maxCam<=result.pop.fixed.maxPlane*1.6+15,'REALISTIC camera never turns much faster than the aircraft in a banked pull/push through 53 degrees of pitch '+JSON.stringify(result.pop));
   assert(result.pop.old.maxCam>result.pop.fixed.maxCam*1.5,'the old on/off rule popped the picture there (comparison) '+JSON.stringify(result.pop));
   assert(result.maxOffset<.05&&result.maxSight<3&&result.settledSight<.5&&result.paused,'aircraft remains centred and the briefly smoothed gunsight follows the muzzle centroid, including pause');
   for(const degrees of [120,289]){
    await page.evaluate(({pacific,degrees})=>{
     aeroMode=false;P.pos.set(pacific?-4500:AF_X,pacific?170:groundY(AF_X,AF_Z)+600,pacific?0:AF_Z);P.heading=(pacific?90-degrees:degrees)*Math.PI/180;P.pitch=P.roll=P.rollBias=P.pitchVel=P.rollVel=0;P.spd=pacific?(typeof coreOn==='function'&&coreOn()?125/KT:80/KT):110;
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
