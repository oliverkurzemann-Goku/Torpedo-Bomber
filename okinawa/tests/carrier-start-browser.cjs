/* Actual carrier models, aircraft tyres, camera and frozen catapult sequence.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Carrier departure WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 if(url.pathname==='/torpedo-carrier.html'){const html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
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
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?campaign=1&v=170');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  console.log('Browser: carrier menu loaded');
  await page.evaluate(()=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  for(const ac of ['avenger','sbd','zero']){
   const index=await page.evaluate(ac=>MISSIONS.findIndex(m=>ac==='zero'?m.defend:ac==='sbd'?m.sbd:!m.sbd&&!m.defend&&!m.free&&!m.qual),ac);
   await page.locator('#missionSel .chip').nth(index).click();await page.locator('#startBtn').click();
   await page.locator('#launchBtn').waitFor({state:'visible'});await page.locator('#launchBtn').click();
   await page.waitForFunction(()=>{updatePlaneMesh(0);return carrierAircraftReady()&&carrierIntro&&state===ST.LAUNCH;},null,{polling:200});
   await page.evaluate(()=>{clock.getDelta=()=>.05;animateFrame();});
   const initial=await page.evaluate(()=>({fuel:P.fuel,hull:P.hull,pos:P.pos.toArray(),carrierX,launchTimer}));
   await page.evaluate(()=>{
    window.checkDeckContact=()=>{
     const model=isDefend()?playerZero:isSBD()?playerSBD:planeGroup;
     const supports=AircraftGround.supports(model,'carrier');if(supports.length!==3)throw Error('Missing deck wheels');
     const gear=isDefend()?playerZero.getObjectByName('zeroGear'):isSBD()?playerSBD.getObjectByName('sbdGear'):gearMesh[0];
     if(!gear?.visible)throw Error('Undercarriage hidden in intro');
     for(const vertices of supports){const p=new THREE.Vector3(),low=new THREE.Vector3(0,Infinity,0);
      for(let i=0;i<vertices.length;i+=3){p.fromArray(vertices,i).applyQuaternion(planeGroup.quaternion);if(p.y<low.y)low.copy(p);}
      low.add(planeGroup.position);const expected=carrierDeckHeight(low.x,low.z);
      if(Math.abs(low.y-expected)>.015)throw Error('Wheel floating or below flight deck: '+(low.y-expected));
     }
    };
   });
   const shot=await page.evaluate(()=>{
    const render=GameRuntime.render;GameRuntime.render=()=>true;
    try{for(let i=0;i<40;i++){animateFrame();checkDeckContact();}}finally{GameRuntime.render=render;}
    renderer.setPixelRatio(.7);renderer.render(scene,camera);const png=renderer.domElement.toDataURL('image/png');renderer.setPixelRatio(.25);
    const focus=planeGroup.position.clone().project(camera);
    return {png,focus:focus.toArray(),fuel:P.fuel,hull:P.hull,pos:P.pos.toArray(),carrierX,launchTimer};
   });
   for(const k of ['fuel','hull','pos','carrierX','launchTimer'])assert.deepEqual(shot[k],initial[k],k+' frozen during camera shot');
   assert(Math.abs(shot.focus[0])<.8&&Math.abs(shot.focus[1])<.8,'aircraft framed');
   const deckGaps=await page.evaluate(()=>{
    const model=isDefend()?playerZero:isSBD()?playerSBD:planeGroup,hull=isDefend()?ijnCarrierModel:carrierModel;
    // r128's CPU raycaster does not normalize integer POSITION attributes,
    // although WebGL does. Decode them in a detached collision copy.
    const collision=hull.clone(true),owned=[];
    collision.traverse(o=>{if(!o.isMesh)return;const attr=o.geometry.attributes.position;
     if(!attr.normalized)return;const divisor=attr.array instanceof Int16Array?32767:attr.array instanceof Uint16Array?65535:attr.array instanceof Int8Array?127:255;
     const values=new Float32Array(attr.count*3);
     for(let i=0;i<attr.count;i++){values[i*3]=Math.max(-1,attr.getX(i)/divisor);values[i*3+1]=Math.max(-1,attr.getY(i)/divisor);values[i*3+2]=Math.max(-1,attr.getZ(i)/divisor);}
     o.geometry=o.geometry.clone();owned.push(o.geometry);
     o.geometry.setAttribute('position',new THREE.BufferAttribute(values,3));o.geometry.boundingBox=null;o.geometry.boundingSphere=null;
    });collision.updateWorldMatrix(true,true);
    const ray=new THREE.Raycaster(),p=new THREE.Vector3();
    const gaps=AircraftGround.supports(model,'carrier').map(vertices=>{const low=new THREE.Vector3(0,Infinity,0);
     for(let i=0;i<vertices.length;i+=3){p.fromArray(vertices,i).applyQuaternion(planeGroup.quaternion);if(p.y<low.y)low.copy(p);}
     low.add(planeGroup.position);ray.set(low.clone().add(new THREE.Vector3(0,30,0)),new THREE.Vector3(0,-1,0));
     const hits=ray.intersectObject(collision,true);
     return hits.length?low.y-hits[0].point.y:null;
    });owned.forEach(g=>g.dispose());return gaps;
   });console.log(ac+' actual deck gaps:',deckGaps);
   assert(deckGaps.every(g=>g!==null&&g>=-.02&&g<.10),'tyres contact actual rendered flight deck');
   fs.writeFileSync(path.join(out,ac+'-carrier-start.png'),Buffer.from(shot.png.split(',')[1],'base64'));
   const pauseTime=await page.evaluate(()=>carrierIntro.time);
   await page.locator('#pauseBtn').click();await page.evaluate(()=>animateFrame());
   assert.equal(await page.evaluate(()=>carrierIntro.time),pauseTime);assert(await page.locator('#pause').isVisible());
   await page.locator('#resumeBtn').click();assert(await page.evaluate(()=>state===ST.LAUNCH));
   assert(await page.locator('#skipCarrierPreview').isEnabled());
   await page.evaluate(()=>{const render=GameRuntime.render;GameRuntime.render=()=>true;
    try{while(carrierIntro){animateFrame();checkDeckContact();}}finally{GameRuntime.render=render;}
   });
   assert(await page.evaluate(()=>state===ST.LAUNCH&&!carrierIntro&&!document.body.classList.contains('carrierPreview')));
   await page.evaluate(()=>{const render=GameRuntime.render;GameRuntime.render=()=>true;try{for(let i=0;i<40;i++){animateFrame();if(state===ST.LAUNCH&&P.pos.x-carrierX<BOW_X-2)checkDeckContact();}}finally{GameRuntime.render=render;}});
   assert(await page.evaluate(()=>state===ST.FLIGHT&&launchTimer>1.6),'catapult only runs after camera');
   const fired=await page.evaluate(()=>{
    P.pos.y=300;P.spd=80;const ammo=P.ammo;firing=true;
    const render=GameRuntime.render;GameRuntime.render=()=>true;
    try{for(let i=0;i<180;i++)animateFrame();}finally{GameRuntime.render=render;firing=false;}
    return P.ammo<ammo&&!runtimeFault;
   });assert(fired,'actual aircraft continues flying and firing after intro');
   await page.evaluate(()=>{P.gear=0;P.gearTgt=0;updatePlaneMesh(0);});
   assert(await page.evaluate(()=>isDefend()?!playerZero.getObjectByName('zeroGear').visible:isSBD()?!playerSBD.getObjectByName('sbdGear').visible:gearMesh.every(g=>!g.visible)),'all wheels retract normally');
   await page.evaluate(()=>launch());
   assert(await page.locator('#skipCarrierPreview').isEnabled());await page.locator('#skipCarrierPreview').click();
   assert(await page.evaluate(()=>!carrierIntro&&state===ST.LAUNCH),'real Skip starts the catapult');
   // Abort while the shot is showing, then choose another actual aircraft.
   await page.evaluate(()=>{launch();togglePause();exitToMenu();});
   assert(await page.evaluate(()=>state===ST.MENU&&!carrierIntro&&!document.body.classList.contains('carrierPreview')));
   console.log(ac+': original GLB, three deck contacts, camera framing, frozen mission, pause/resume, catapult, nine seconds of real flight/fire, retraction, Skip and Abort pass.');
  }

  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exit(1)});
