/* Real aircraft, real mission selection, service/departure camera and terrain.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Europe departure WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 if(url.pathname==='/remagen-mission.html'){const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.GAME_TEST_SINGLE_PROCESS?['--single-process','--no-zygote','--in-process-gpu']:[])]});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?campaign=1&v=171');
  await page.waitForFunction(()=>typeof realWorldReady!=='undefined'&&realWorldReady&&state===ST.MENU,null,{polling:200});
  console.log('Browser: real terrain menu loaded');
  await page.evaluate(()=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  for(const ac of ['p47','bf109','fw190','me262','ju87','me163','me163-bonus']){
   const index=await page.evaluate(ac=>ac==='me163-bonus'?MISSIONS.findIndex(m=>m.id==='kometdash'):MISSIONS.findIndex(m=>m.ac===ac&&!m.free&&!m.circuits),ac);
   const kind=ac==='me163-bonus'?'me163':ac;
   await page.locator('#missionSel .chip').nth(index).click();await page.locator('#startBtn').click();await page.locator('#brGo').click();
   await page.waitForFunction(ac=>state===ST.FLIGHT&&P.ac===ac&&launchIntro,kind,{polling:100});
   const initial=await page.evaluate(()=>({fuel:P.fuel,hull:P.hull,pos:P.pos.toArray(),time:launchIntro.time}));
   // Measure actual wheel/skid geometry in world space at every intro frame.
   await page.evaluate(()=>{
    window.checkGroundContact=()=>{
     const measure=(model,kind,group)=>{
      const supports=AircraftGround.supports(model,kind);if(supports.length!==3)throw Error(kind+' missing supports');
      for(const vertices of supports){const low=new THREE.Vector3(0,Infinity,0),p=new THREE.Vector3();
       for(let i=0;i<vertices.length;i+=3){p.fromArray(vertices,i).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));if(p.y<low.y)low.copy(p);}
       low.add(group.getWorldPosition(new THREE.Vector3()));
       if(Math.abs(low.y-AircraftGround.height(terrain,low.x,low.z))>.02)throw Error(kind+' wheel floats or sinks');
      }
     };
     if(P.onGround){
      const gear=playerModel.getObjectByName('gear');if(gear&&!gear.visible)throw Error(P.ac+' hidden runway gear');
      measure(playerModel,P.ac,planeGroup);
      const activity=launchIntro?.activity;
      if(activity){
       for(const pad of activity.parked)measure(pad.children[0],P.ac,pad);
       for(const crew of activity.crew)for(const pad of activity.parked){const b=pad.userData.crewBox;
        if(crew.drawX>b.min.x&&crew.drawX<b.max.x&&crew.drawZ>b.min.z&&crew.drawZ<b.max.z)throw Error(P.ac+' crew intersects aircraft');
       }
      }
     }
    };
   });
   // Drive the real loop, rendering only the sampled views on software WebGL.
   const service=await page.evaluate(()=>{
    const render=GameRuntime.render;GameRuntime.render=()=>true;clock.getDelta=()=>.05;
    try{for(let i=0;i<40;i++){animate();checkGroundContact();}}finally{GameRuntime.render=render;}
    renderer.setPixelRatio(.7);renderer.render(scene,camera);
    const t=launchIntro.target.clone().project(camera);
    const png=renderer.domElement.toDataURL('image/png');renderer.setPixelRatio(.25);
    return {png,focus:t.toArray(),fuel:P.fuel,hull:P.hull,pos:P.pos.toArray(),progress:launchIntro.activity?.loading.progress};
   });
   assert.deepEqual(service.pos,initial.pos);assert.equal(service.fuel,initial.fuel);assert.equal(service.hull,initial.hull);
   assert(Math.abs(service.focus[0])<.8&&Math.abs(service.focus[1])<.8,'service aircraft stays in view');
   if(ac==='p47'||ac==='fw190')assert(service.progress>.4&&service.progress<1,'actual visible load lifts during the opening shot');
   fs.writeFileSync(path.join(out,ac+'-start-service.png'),Buffer.from(service.png.split(',')[1],'base64'));
   const paused=await page.evaluate(()=>{const time=launchIntro.time;togglePause();animate();const frozen=launchIntro.time===time;togglePause();return frozen;});assert(paused);
   await page.evaluate(()=>{const render=GameRuntime.render;GameRuntime.render=()=>true;try{while(launchIntro){animate();checkGroundContact();}}finally{GameRuntime.render=render;}renderer.render(scene,camera);});
   assert(await page.evaluate(()=>!launchIntro&&!document.body.classList.contains('launchPreview')));
   if(kind!=='me163'){
    const png=await page.evaluate(()=>{
     checkGroundContact();const centre=planeGroup.position.clone(),offset=new THREE.Vector3(17,7,-18).applyAxisAngle(new THREE.Vector3(0,1,0),P.heading);
     camera.position.copy(centre).add(offset);camera.lookAt(centre);renderer.setPixelRatio(.7);renderer.render(scene,camera);
     const png=renderer.domElement.toDataURL('image/png');renderer.setPixelRatio(.25);return png;
    });fs.writeFileSync(path.join(out,ac+'-runway-gear.png'),Buffer.from(png.split(',')[1],'base64'));
   }
   // Real neutral-control rocket flight after the camera, including physics,
   // terrain morphs and the operational-area clamp, for both Komet sorties.
   if(kind==='me163'){
    const flight=await page.evaluate(()=>{
     const start=P.pos.clone(),render=GameRuntime.render;GameRuntime.render=()=>true;let edge=false,minMargin=Infinity,minClearance=Infinity;
     try{for(let i=0;i<600;i++){
      animate();edge ||= P.edgeWarned;
      minMargin=Math.min(minMargin,P.pos.x,RTILE*RGRID_W-P.pos.x,P.pos.z,RTILE*RGRID_H-P.pos.z);
      minClearance=Math.min(minClearance,P.pos.y-groundY(P.pos.x,P.pos.z));
      if(!P.alive)throw Error('Komet failed during the initial departure');
     }}finally{GameRuntime.render=render;}
     return {edge,minMargin,minClearance,travel:P.pos.distanceTo(start),dx:P.pos.x-start.x,dz:P.pos.z-start.z};
    });
    assert(!flight.edge&&flight.minMargin>5000,'Komet reaches the initial attack without an edge clamp');
    assert(flight.travel>2500&&flight.dx<0&&flight.dz<0,'Komet flies southwest into the terrain');
    assert(flight.minClearance>200,'rocket departure clears the actual rendered hills');
    console.log(ac+': 30 seconds of actual flight, no boundary clamp, terrain clearance '+Math.round(flight.minClearance)+'m.');
   }
   await page.evaluate(()=>exitToMenuFromPause());
   console.log(ac+': service and runway ground contact; aircraft in frame, real loading, frozen position/fuel/hull, pause/resume and smooth finish pass.');
  }
  // Fly across the actual seam that previously had a 69m cliff, then show the river.
  for(const [name,x,y,z,tx,ty,tz] of [['terrain-seam',3250,780,11500,3250,600,12500],['rhine-roads',13750,500,14200,13805,60,15770]]){
   const png=await page.evaluate(({x,y,z,tx,ty,tz})=>{
    for(let i=0;i<160;i++){osmMgr.advanceSurfacePreparation();terrain.updateLOD(x,z,.05);osmMgr.syncTerrainSurfaces();}
    updateContentVisibility(x,z);camera.position.set(x,y,z);camera.up.set(0,1,0);camera.lookAt(tx,ty,tz);renderer.setPixelRatio(.7);renderer.render(scene,camera);
    return renderer.domElement.toDataURL('image/png');
   },{x,y,z,tx,ty,tz});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(png.split(',')[1],'base64'));
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exit(1)});
