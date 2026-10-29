/* Own A6M2 Zero in the real Pacific game (Build 207): the Zero-defence sortie loads the own rig-contract
 * model (no heuristic search, belly tank left out), the player's blades turn, the retracted gear lies inside
 * the wing (rays through the real Airframe mesh), the 20 mm rounds start at the model's named cannon ports,
 * enemy Zeros turn real blades with their gear folded, and the parked Zero on a shore dispersal stands on its
 * tyres. Writes pictures to test-visuals/. Chrome via GAME_TEST_CHROME. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Own A6M2 browser: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname==='/torpedo-carrier.html'){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.GAME_TEST_SINGLE_PROCESS?['--single-process','--no-zygote','--in-process-gpu']:[])]});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true}),errors=[];
  page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/shader error|VALIDATE_STATUS|Error compiling|zero model post-process failed/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?campaign=1&v=207');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  await page.evaluate(()=>{renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;});
  const shot=name=>page.evaluate(()=>{renderer.setPixelRatio(1);renderer.render(scene,camera);const png=renderer.domElement.toDataURL('image/png');renderer.setPixelRatio(.5);return png;}).then(png=>{const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,name),Buffer.from(png.split(',')[1],'base64'));});

  // the Zero-defence sortie: own contract model, selected by the game's own loader
  const loaded=await page.evaluate(async()=>{
   const index=MISSIONS.findIndex(m=>m.defend);await preparePacificModels(MISSIONS[index]);
   startMission(index);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;
   P.pos.set(-3000,160,0);P.heading=0;P.pitch=P.roll=0;P.onDeck=false;P.gear=P.gearTgt=1;P.flap=P.flapTgt=0;P.throttle=.7;updatePlaneMesh(0);
   const frame=zeroFrame(playerZero);
   return {index,contract:!!frame&&AircraftContract.isContract(playerZero),name:frame?.userData.articulation.kind,tank:!!playerZero.getObjectByName('DropTank'),
    template:!!zeroTemplate,fromTemplate:!!playerZero.userData.fromTemplate,rotor:zeroRotor?.name||null,axis:zeroRotorAxis,span:(()=>{const b=new THREE.Box3().setFromObject(playerZero.getObjectByName('Airframe'));return b.getSize(new THREE.Vector3()).x;})(),
    legacyGear:!!playerZero.getObjectByName('zeroGear')};
  });
  assert(loaded.contract&&loaded.name==='zero'&&loaded.template&&loaded.fromTemplate,'own contract model is the player Zero: '+JSON.stringify(loaded));
  assert.equal(loaded.tank,false,'the Zero flies clean');assert.equal(loaded.legacyGear,false,'no generated stand-in gear');
  assert(Math.abs(loaded.span-12)<.1,'true span from the PDF: '+loaded.span);

  // blades turn from frame to frame, gear down shows the legs, gear up folds them into the wing
  const spin=await page.evaluate(()=>{const read=()=>zeroRotor.rotation.z;const a=read();for(let i=0;i<5;i++)updatePlaneMesh(1/60);const b=read();return {rotor:zeroRotor.name,delta:b-a};});
  assert.equal(spin.rotor,'prop');assert(Math.abs(spin.delta)>.05,'the real blades turn: '+spin.delta);
  await page.evaluate(()=>{P.gear=P.gearTgt=1;updatePlaneMesh(0);});await shot('build207-zero-gear-down.png');
  const folded=await page.evaluate(()=>{
   P.gear=P.gearTgt=0;updatePlaneMesh(0);playerZero.updateMatrixWorld(true);
   const skin=playerZero.getObjectByName('Airframe');skin.material=skin.material.clone();skin.material.side=THREE.DoubleSide;
   const frame=zeroFrame(playerZero),up=new THREE.Vector3(0,1,0).transformDirection(frame.matrixWorld),ray=new THREE.Raycaster(),v=new THREE.Vector3(),out={};
   for(const part of ['GearLeftTyre','GearRightTyre','GearLeftLeg','GearRightLeg']){
    const mesh=playerZero.getObjectByName(part),pos=mesh.geometry.attributes.position;let inside=0,n=0;
    for(let i=0;i<pos.count;i+=3){v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);n++;
     ray.set(v,up);const above=ray.intersectObject(skin,false).length>0;ray.set(v,up.clone().negate());const below=ray.intersectObject(skin,false).length>0;if(above&&below)inside++;}
    out[part]=inside/n;}
   return out;
  });
  for(const [part,share] of Object.entries(folded))assert.equal(share,1,part+' retracted inside the wing: '+share);
  await page.evaluate(()=>{for(let i=0;i<40;i++)updateCamera(.05);});await shot('build207-zero-gear-up.png');

  // the 20 mm rounds start at the model's named ports and follow the nose
  const fire=await page.evaluate(()=>{
   P.alive=true;P.ammo=500;firing=true;gunCool=0;bullets.length=0;planeGroup.updateMatrixWorld(true);
   const ports=pacificGunMuzzles().map(p=>({name:p.name,world:planeGroup.localToWorld(p.clone())}));
   updateGuns(.01);const starts=bullets.map(b=>b.mesh.position.clone());firing=false;
   return {ports:ports.map(p=>p.name).sort(),near:starts.map(s=>Math.min(...ports.map(p=>p.world.distanceTo(s)))),count:bullets.length,weapon:bullets[0]?.weapon};
  });
  assert.deepEqual(fire.ports,['MuzzleCannonLeft','MuzzleCannonRight']);assert.equal(fire.count,2);assert(fire.near.every(d=>d<1e-6),'rounds start at the 20 mm ports: '+fire.near);assert.equal(fire.weapon,'cannon');

  // enemy Zeros: real blades, gear folded, no stand-in disc; a raider carries the same model
  const ai=await page.evaluate(()=>{
   zeros.length=0;spawnZero(0,2);spawnZero(1,2);
   const z=zeros[0],frame=zeroFrame(z.mesh),prop=frame.getObjectByName('prop'),leg=frame.getObjectByName('GearLeft');
   const a=prop.rotation.z;z.engaged=true;
   return {isProp:z.disk===prop,discs:z.mesh.children.filter(c=>c.geometry?.type==='CircleGeometry').length,
    up:leg.quaternion.angleTo(new THREE.Quaternion().fromArray(leg.userData.rigRest))>2,count:zeros.length,spin:a};
  });
  assert(ai.isProp&&ai.discs===0&&ai.up&&ai.count===2,'enemy Zeros use the real blades with folded gear: '+JSON.stringify(ai));
  await page.evaluate(()=>{const z=zeros[0];z.mesh.position.set(P.pos.x-30,P.pos.y+8,P.pos.z+120);z.mesh.rotation.set(0,Math.PI,0);z.pos.copy(z.mesh.position);});
  await page.evaluate(()=>{for(let i=0;i<30;i++)updateCamera(.05);camera.lookAt(zeros[0].mesh.position);camera.position.copy(zeros[0].mesh.position).add(new THREE.Vector3(14,3,-24));camera.lookAt(zeros[0].mesh.position);});
  await shot('build207-zero-enemy.png');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({model:'assets/aircraft/a6m2-own.glb',rig:'contract',player:loaded,spin:+spin.delta.toFixed(3),retracted:folded,ports:fire.ports,enemy:ai,pictures:['build207-zero-gear-down.png','build207-zero-gear-up.png','build207-zero-enemy.png']}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
