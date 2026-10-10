/* Real aircraft, real mission selection, service/departure camera and terrain.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Water, crews, takeoff and ditching: skipped locally (no Chrome).');process.exit(0);}
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
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.GAME_TEST_SINGLE_PROCESS?['--single-process','--no-zygote','--in-process-gpu']:[])]});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:600},hasTouch:true}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  const origin='http://127.0.0.1:'+server.address().port;

  await page.goto(origin+'/remagen-mission.html?v=181');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:100});
  await page.evaluate(()=>{renderer.setPixelRatio(.65);renderer.shadowMap.enabled=false;clock.getDelta=()=>.05;});
  // Render the actual Rhine from low flight, with the new material enabled/disabled.
  const water=await page.evaluate(()=>{
    // Choose an actual broad water triangle; a polygon bounding-box centre can be dry land in a river bend.
    scene.updateMatrixWorld(true);let p=null,best=-Infinity;
    for(const tile of osmMgr.tiles.values())for(const mesh of tile.group.children){
      if(mesh.material!==osmMgr.lakeMat&&mesh.material!==osmMgr.riverMat)continue;
      const pos=mesh.geometry.attributes.position,idx=mesh.geometry.index;
      for(let j=0;j<(idx?idx.count:pos.count);j+=3){
        const a=new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(j):j),b=new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(j+1):j+1),c=new THREE.Vector3().fromBufferAttribute(pos,idx?idx.getX(j+2):j+2);
        const centre=a.clone().add(b).add(c).multiplyScalar(1/3);mesh.localToWorld(centre);
        const area=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
        if(centre.y<100&&area>best){best=area;p=centre;}
      }
    }
    if(!p)throw Error('No real valley water triangle');
    updateContentVisibility(p.x,p.z);camera.near=.1;camera.fov=55;camera.updateProjectionMatrix();
    camera.position.copy(p).add(new THREE.Vector3(0,45,70));camera.lookAt(p.clone().add(new THREE.Vector3(0,0,-20)));
    const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height;
    const frame=()=>{scene.updateMatrixWorld(true);renderer.render(scene,camera);const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
    const difference=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>3)n++;return n;};
    osmMgr.waterUniforms.waterDetail.value=0;const flat=frame();osmMgr.waterUniforms.waterDetail.value=1;const ripple=frame();
    for(let i=0;i<80;i++)osmMgr.updateWater(.05);const moved=frame();
    return {detailPixels:difference(flat,ripple),movingPixels:difference(ripple,moved),point:p.toArray(),png:renderer.domElement.toDataURL()};
  });
  fs.writeFileSync(path.join(out,'build181-rhine-water.png'),Buffer.from(water.png.split(',')[1],'base64'));delete water.png;
  console.log('Rhine water framebuffer:',water);assert(water.detailPixels>1000&&water.movingPixels>300,'real draped water has visible moving ripples/reflection');
  const crew=await page.evaluate(()=>{
    const activity=alliedActivity,hand=new THREE.Matrix4(),head=new THREE.Matrix4();let checks=0,maxRelative=-Infinity;
    for(let t=0;t<144;t+=2){activity.time=t;activity.update(0,ALLIED_AF_X,ALLIED_AF_Z);
      for(let i=0;i<activity.crew.length;i++)for(let side=0;side<2;side++){
        activity.people.hands.getMatrixAt(i*2+side,hand);activity.people.heads.getMatrixAt(i,head);
        const delta=hand.elements[13]-head.elements[13];maxRelative=Math.max(maxRelative,delta);if(delta>-.17)throw Error('Ground hands above head '+i);checks++;
      }
    }
    const c=activity.crew.find(c=>c.job==='signal'),x=ALLIED_AF_X+c.drawX,z=ALLIED_AF_Z+c.drawZ,y=terrain.getRenderedHeight(x,z);
    updateContentVisibility(x,z);camera.position.set(x-.5,y+2.2,z-3.3);camera.lookAt(x,y+1.0,z);scene.updateMatrixWorld(true);renderer.render(scene,camera);
    return {checks,maxRelative,png:renderer.domElement.toDataURL()};
  });
  fs.writeFileSync(path.join(out,'build181-ground-crew.png'),Buffer.from(crew.png.split(',')[1],'base64'));delete crew.png;console.log('Ground wrist positions through service cycle:',crew);
  const jet=await page.evaluate(async()=>{
    await ensureModel('me262');startMission(MISSIONS.findIndex(m=>m.ac==='me262'));finishLaunchIntro(false);inputPitch=1;inputRoll=0;P.throttle=1;
    let elapsed=0,rotation=null,maxPitch=0,maxVS=0,maxAccel=0,previousSpeed=P.spd;
    while(elapsed<45&&P.alive){updateFlight(.05);elapsed+=.05;
      if(!P.onGround){if(rotation===null)rotation=elapsed;maxPitch=Math.max(maxPitch,P.pitch);maxVS=Math.max(maxVS,P.vSpeed);maxAccel=Math.max(maxAccel,(P.spd-previousSpeed)/.05);if(elapsed-rotation>=10)break;}
      previousSpeed=P.spd;
    }
    return {alive:P.alive,rotation,maxPitchDegrees:maxPitch*180/Math.PI,maxVS,maxAccel,speed:P.spd,height:P.pos.y-groundY(P.pos.x,P.pos.z)};
  });
  assert(jet.alive&&jet.rotation>12&&jet.rotation<35&&jet.maxPitchDegrees<14&&jet.maxVS<15&&jet.maxAccel<8&&jet.height>50,'actual Me262 full-stick takeoff has gentle climb/continuous thrust');console.log('Live Me262 takeoff, ten seconds held back-stick:',jet);
  for(const ac of ['p47','me262']){
    const proof=await page.evaluate(async ac=>{
      await ensureModel(ac);startMission(MISSIONS.findIndex(m=>m.ac===ac&&!m.free&&!m.circuits));finishLaunchIntro(false);P.throttle=1;inputPitch=inputRoll=0;
      const render=GameRuntime.render;GameRuntime.render=()=>{};try{for(let i=0;i<120;i++)animate();}finally{GameRuntime.render=render;}
      posePlayerAircraft(0);camera.fov=48;camera.updateProjectionMatrix();camera.position.copy(P.pos).add(new THREE.Vector3(20,12,-32).applyAxisAngle(new THREE.Vector3(0,1,0),P.heading));camera.lookAt(P.pos.clone().add(new THREE.Vector3(-Math.sin(P.heading)*10,-1,-Math.cos(P.heading)*10)));scene.updateMatrixWorld(true);
      const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height,a=new Uint8Array(w*h*4),b=new Uint8Array(w*h*4);
      groundDust.mesh.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);groundDust.mesh.visible=true;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
      let pixels=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>4)pixels++;
      return {...groundDust.stats,pixels,onGround:P.onGround,png:renderer.domElement.toDataURL()};
    },ac);fs.writeFileSync(path.join(out,'build181-'+ac+'-dust.png'),Buffer.from(proof.png.split(',')[1],'base64'));delete proof.png;
    assert(proof.onGround&&proof.pixels>(ac==='p47'?15000:6000)&&proof.draws===1&&proof.live<=proof.limit,'stronger actual runway dust remains bounded');console.log('Stronger native takeoff dust:',{ac,...proof});
  }
  await page.goto(origin+'/torpedo-carrier.html?v=181');await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{renderer.setPixelRatio(.65);renderer.shadowMap.enabled=false;clock.getDelta=()=>.05;await prepareOkinawa();for(const m of MISSIONS)await preparePacificModels(m);});
  for(const kind of ['avenger','sbd','corsair','zero']){
    const result=await page.evaluate(kind=>{
      const i=MISSIONS.findIndex(m=>kind==='sbd'?m.sbd&&!m.corsair:kind==='corsair'?m.corsair:kind==='zero'?m.defend:!m.sbd&&!m.corsair&&!m.defend);
      if(i<0)throw Error('Missing mission '+kind);startMission(i);finishCarrierIntro();state=ST.FLIGHT;hideOverlays();P.alive=true;P.hull=100;P.pos.set(-1500,.55,0);P.spd=APP_SPD;P.pitch=-.015;P.roll=0;P.pitchVel=P.rollVel=0;P.gear=P.gearTgt=0;P.hook=P.hookTgt=0;P.flap=P.flapTgt=0;P.throttle=0;inputPitch=inputRoll=0;
      updateFlight(.05);if(!ditching||!bailRescue)throw Error('Sea contact did not enter ditching '+kind);
      const all=[bailout,...crewBailouts.map(c=>c.chute)];
      if(all.some(c=>c.deployed||c.group.children.some(o=>o.isMesh&&o.geometry.type==='SphereGeometry'&&o.position.y>3&&o.visible)))throw Error('Ditching deployed a parachute');
      for(const c of all){const pilot=c.group.getObjectByName('pilot');if(pilot.userData.arms.some(a=>Math.abs(a.rotation.z)>.01))throw Error('Raft retains raised chute arms');}
      for(let j=0;j<25;j++){advanceBailout(.05);combatFX?.update(.05);shipWakes?.update(.05);updateSplashes(.05);}updatePlaneMesh(.05);scene.updateMatrixWorld(true);
      camera.position.copy(P.pos).add(new THREE.Vector3(22,10,25));camera.lookAt(bailout.position);renderer.render(scene,camera);const png=renderer.domElement.toDataURL();
      const p=P.pos.clone(),t=ditching.time,boat=crewWaterRescue.group.position.clone();togglePause();animate();const paused=t===ditching.time&&p.equals(P.pos)&&boat.equals(crewWaterRescue.group.position);togglePause();
      let boats=0;for(let j=0;j<1200&&!bailDone;j++){advanceBailout(.05);boats=Math.max(boats,scene.children.filter(o=>o.name==='rescueBoat').length);}
      return {kind,count:aircraftCrewCount(),recovered:Number(bailRescue.pickup)+crewBailouts.filter(c=>c.safe).length,aboard:bailRescue.group.children.filter(o=>o.name==='rescuedCrew').length,boats,done:bailDone,paused,png};
    },kind);fs.writeFileSync(path.join(out,'build181-'+kind+'-ditching.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
    assert(result.done&&result.recovered===result.count&&result.aboard===result.count&&result.boats===1&&result.paused,'whole crew recovered by one boat');console.log('Actual sea contact and rescue:',result);
  }
  const unsafe=await page.evaluate(()=>{
    DIFF='ace';startMission(0);finishCarrierIntro();state=ST.FLIGHT;hideOverlays();P.alive=true;P.pos.set(-1500,.5,0);P.spd=APP_SPD;P.gear=P.gearTgt=1;P.pitch=-.15;P.roll=0;P.throttle=0;inputPitch=inputRoll=0;updateFlight(.05);
    const crash=state===ST.RESULT&&!P.alive&&!ditching&&!bailRescue;startMission(0);return {crash,reset:!ditching&&!bailout&&!crewWaterRescue&&!scene.children.some(o=>o.name==='rescueBoat')};
  });assert(unsafe.crash&&unsafe.reset);console.log('Unsafe water impact and restart:',unsafe);
  assert.deepEqual(errors,[]);console.log('Build181 native water, natural wrists, Me262 takeoff/climb, dust and all carrier ditching/rescue cases passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
