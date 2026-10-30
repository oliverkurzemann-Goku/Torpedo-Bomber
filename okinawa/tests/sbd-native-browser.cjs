/* Real r128 decoding, preview and production Pacific mission integration. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('SBD browser: skipped locally (no Chrome).');process.exit(0);}
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled|post-process failed/i.test(m.text()))errors.push(m.text());});await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/model-check.html?aircraft=sbd&v=201');await page.waitForFunction(()=>!!model?.userData.nativeSBD,null,{polling:100});
  await page.locator('#sbdGear').uncheck();assert(await page.evaluate(()=>Math.abs(model.getObjectByName('GearLeft').rotation.z)<1e-8));
  for(const id of ['sbdFlaps','sbdDive']){await page.locator('#'+id).focus();await page.locator('#'+id).press('End');}await page.locator('#sbdHook').check();
  const preview=await page.evaluate(()=>{
   if(Math.abs(model.getObjectByName('sbdHook').rotation.x+.8)>1e-6)throw Error('Static hook');
   const brake=model.getObjectByName('BrakeUpperLeft');if(brake.quaternion.angleTo(new THREE.Quaternion().fromArray(brake.userData.restQuaternion))<1)throw Error('Static dive brake');
   const clone=model.clone(true);SBDRig.update(clone,{gear:1,flaps:{left:0,right:1},dive:0,bombs:0,roll:.6,pitch:.4});
   if(Math.abs(model.getObjectByName('GearLeft').rotation.z)>1e-6||clone.getObjectByName('GearLeft').rotation.z>-.5)throw Error('Shared gear state');
   if(clone.getObjectByName('BrakeLowerLeft').quaternion.angleTo(clone.getObjectByName('BrakeLowerRight').quaternion)<.1)throw Error('Flaps not independent');
   for(const side of ['Left','Right'])for(const level of ['Upper','Lower']){
    const panel=clone.getObjectByName('Brake'+level+side);if(panel.userData.perforationCount<20)throw Error('Missing perforations');
    const hole=panel.userData.holes[0],mesh=panel.children.find(c=>c.isMesh);clone.updateMatrixWorld(true);
    const a=panel.localToWorld(new THREE.Vector3(hole[0],.1,hole[1])),b=panel.localToWorld(new THREE.Vector3(hole[0],-.1,hole[1]));
    const hits=new THREE.Raycaster(a,b.sub(a).normalize(),0,.2).intersectObject(panel,true);if(hits.length)throw Error('Painted instead of open brake holes');
   }
   let triangles=0;model.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
   return {rotors:propGroup.rotors.length,span:new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).x,triangles};
  });assert.equal(preview.rotors,1);assert(Math.abs(preview.span-12.66)<.002);assert.equal(preview.triangles,73326);
  await page.goto(base+'/torpedo-carrier.html?v=201');await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{renderer.setPixelRatio(.4);renderer.shadowMap.enabled=false;await prepareOkinawa();const i=MISSIONS.findIndex(m=>m.sbd&&!m.corsair);await preparePacificModels(MISSIONS[i]);startMission(i);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;});
  await page.waitForFunction(()=>SBDRig.isNative(playerSBD),null,{polling:100});
  const result=await page.evaluate(()=>{
   if(!playerSBD.getObjectByName('sbdGear').parent.userData.nativeSBD)throw Error('Generic gear installed');
   let paint=0;playerSBD.traverse(o=>{if(o.material?.map)paint=Math.max(paint,o.material.map.image.width);});if(paint!==2048)throw Error('Touch paint downsampled: '+paint);
   const contacts=AircraftGround.supports(playerSBD);if(contacts.length!==3)throw Error('Wrong ground support count '+contacts.length);
   P.alive=true;P.onGround=false;P.onDeck=false;P.pos.set(-1800,320,700);P.heading=Math.PI/2;P.pitch=P.roll=0;P.gear=0;P.flap=0;P.diveBrake=true;P.hook=0;P.torps=3;P.spd=70;inputRoll=.4;inputPitch=.2;
   const rotor=playerSBD.getObjectByName('sbdRotorBlade'),before=rotor.rotation.z;
   for(let i=0;i<40;i++)updatePlaneMesh(1/30);
   if(rotor.rotation.z===before)throw Error('Static original propeller');if(Math.abs(playerSBD.getObjectByName('GearLeft').rotation.z)>1e-5)throw Error('Main gear not retracted');if(Math.abs(playerSBD.getObjectByName('sbdHook').rotation.x)>1e-5)throw Error('Hook not stowed');
   const brake=playerSBD.getObjectByName('BrakeUpperLeft'),brakeAngle=brake.quaternion.angleTo(new THREE.Quaternion().fromArray(brake.userData.restQuaternion));if(brakeAngle<1)throw Error('Dive input not applied');
   const first=bullets.length;gunCool=0;P.ammo=100;firing=true;updateGuns(0);firing=false;
   const front=bullets.slice(first);if(front.length!==2)throw Error('Wrong forward shot count '+front.length);
   const muzzles=SBDRig.frontMuzzles(playerSBD,planeGroup).map(v=>planeGroup.localToWorld(v));if(!front.every(b=>muzzles.some(m=>m.distanceTo(b.mesh.position)<.003)))throw Error('Forward shots miss model barrels');
   for(const z of zeros)z.alive=false;const nd=noseDir();zeros.push({alive:true,pos:P.pos.clone().addScaledVector(nd,-180).add(new THREE.Vector3(0,45,0)),heading:0,pitch:0,spd:0});P.tailCool=0;
   const tailStart=bullets.length;updateTailGun(1/30);const rearRounds=bullets.slice(tailStart),rear=SBDRig.rear(playerSBD);if(rearRounds.length!==2)throw Error('Wrong rear shot count '+rearRounds.length);
   const ports=rear.ports.map(v=>rear.pivot.localToWorld(v.clone()));if(!rearRounds.every(b=>ports.some(m=>m.distanceTo(b.mesh.position)<.003)))throw Error('Rear shots miss original barrels');if(rearArmament?.visible)throw Error('Duplicate rear mount');
   wingmen.length=0;spawnWingman(0);spawnWingman(1);if(wingmen.length!==2||wingmen.some(w=>!SBDRig.isNative(w.mesh)))throw Error('Wrong wingmen');
   const w0=wingmen[0].mesh.getObjectByName('sbdRotorBlade'),w1=wingmen[1].mesh.getObjectByName('sbdRotorBlade'),wz=w1.rotation.z;w0.rotation.z+=.1;if(w1.rotation.z!==wz)throw Error('Shared wingman transform');
   P.torps=0;P.diveBrake=false;for(let i=0;i<40;i++)updatePlaneMesh(1/30);if(playerSBD.getObjectByName('CenterBomb').visible)throw Error('Stores not hidden');
   combatFX.update(.2); // Finish muzzle flashes before the studio proof image.
   const studio=new THREE.Scene();studio.background=new THREE.Color(0xb7c8d4);studio.add(new THREE.HemisphereLight(0xcfe8ff,0x33402f,.9));const sun=new THREE.DirectionalLight(0xfff0d2,1.6);sun.position.set(8,15,-12);studio.add(sun);
   const hero=playerSBD.clone(true);hero.position.set(0,0,0);hero.rotation.set(0,0,0);SBDRig.update(hero,{gear:0,bombs:0});studio.add(hero);
   const cam=new THREE.PerspectiveCamera(36,1194/834,.1,150);cam.position.set(13,5,-17);cam.lookAt(0,0,0);renderer.setPixelRatio(1);renderer.setSize(1194,834);renderer.render(studio,cam);
   return {source:SBD_MODEL_URL,paint,originalWheelContacts:contacts.length,frontRounds:front.length,rearRounds:rearRounds.length,wingmen:wingmen.length,brakeAngle,triangles:renderer.info.render.triangles,png:renderer.domElement.toDataURL('image/png')};
  });fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build201-sbd-final.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;assert.deepEqual(errors,[]);console.log('Dauntless production preview, touch paint, native mechanics, clones and barrel origins:',preview,result);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
