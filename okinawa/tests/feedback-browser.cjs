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
  const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+(process.env.GAME_TEST_PACIFIC_ONLY?'/torpedo-carrier.html?v=175':'/remagen-mission.html?v=175'));
  await page.waitForFunction(pacific=>state===ST.MENU&&(pacific||typeof realWorldReady!=='undefined'&&realWorldReady),!!process.env.GAME_TEST_PACIFIC_ONLY,{polling:200});
  await page.evaluate(()=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});

  await page.evaluate(()=>{renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;});
  const proof=async(name,pose)=>{await page.evaluate(pose);const data=await page.evaluate(()=>{if(typeof updateContentVisibility==='function')updateContentVisibility(camera.position.x,camera.position.z);scene.updateMatrixWorld(true);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');});fs.writeFileSync(path.join(out,'build175-'+name+'.png'),Buffer.from(data.split(',')[1],'base64'));};
  if(!process.env.GAME_TEST_PACIFIC_ONLY){
  const bridgeResult=await page.evaluate(()=>{
   startMission(MISSIONS.findIndex(m=>m.kills?.bridge));state=ST.FLIGHT;launchIntro=null;weapon='bomb';
   const results=[];
   for(const dt of [.05,1/60,1/120])for(const fraction of [.12,.5,.88]){
    clearWorld();populate();sortieKills.bridge=0;
    const target=targets.find(t=>t.kind==='bridge'),u=target.sub.userData,b=u.data,ox=u.x-(b.x1+b.x2)/2,oz=u.z-(b.z1+b.z2)/2;
    const x=ox+b.x1+(b.x2-b.x1)*fraction,z=oz+b.z1+(b.z2-b.z1)*fraction,deck=target.sub.children[0].geometry.attributes.position.getY(0);
    P.spd=100;P.pitch=0;P.heading=0;P.bombs=1;P.pos.set(x,deck+180,z-100*Math.sqrt(2*(180-1.4)/32)-2);P.alive=true;
    dropBomb();for(let n=0;n<1000&&bombs.length;n++)updateOrdnance(dt);
    if(target.alive||sortieKills.bridge!==1||P.bombs!==0||target.sub.children[0].visible)throw Error('Actual dropped bomb failed '+JSON.stringify({dt,fraction,hp:target.hp}));
    results.push({dt,fraction});
   }
   clearWorld();populate();const t=targets.find(t=>t.kind==='bridge');if(!t.sub.children[0].visible)throw Error('Bridge reset remains collapsed');
   const u=t.sub.userData;if(directBridgeHit(new THREE.Vector3(u.x+130,180,u.z),new THREE.Vector3(u.x+130,-10,u.z)))throw Error('Empty air counts as bridge');
   P.pos.set(u.x,250,u.z-500);P.spd=100;P.pitch=-.15;P.heading=0;P.bombs=1;updateHUD();drawMinimap();
   return {drops:results.length,trees:europeTrees.count};
  });console.log('Actual single-bomb strikes at nine span/frame combinations:',bridgeResult);
  await proof('bridge-sight',()=>{const t=targets.find(t=>t.kind==='bridge'),p=t.group.position;camera.position.set(p.x+110,p.y+150,p.z-150);camera.lookAt(p.x,p.y+5,p.z);updateHUD();});
  const euNav=await page.evaluate(()=>{
   const target=targets.find(t=>t.alive&&t.primary);const nav=ensureNavigation();nav.choose(europeContacts().find(c=>c.ref===target));
   enemyAir.push({alive:true,pos:P.pos.clone().add(new THREE.Vector3(10,0,10)),kind:'bf109'});updateHUD();
   if(document.getElementById('navKind').textContent!==target.kind.toUpperCase())throw Error('Bandit displaced ground selection');
   nav.choose(europeContacts().find(c=>c.kind==='BASE'));updateHUD();if(document.getElementById('navKind').textContent!=='BASE'||P.rtb)throw Error('Manual RTB changes objective');
   enemyAir.pop();nav.reset();return true;
  });assert(euNav);
  const euRecon=await page.evaluate(()=>{
   const r={x:P.pos.x,z:P.pos.z,radius:800,min:220,max:850,seconds:5};europeOps=new FlightOps.Operation({recon:r});P.onGround=false;P.pos.y=1000;
   for(let i=0;i<300;i++)updateEuropeOperation(1/60);if(!europeOps.reconDone)throw Error('Circle recognition fails at recommended-height deviation');return europeOps.reconHold;
  });assert.equal(euRecon,5);
  const euTrees=await page.evaluate(()=>{
   const t=[...europeTrees.cells.values()].flat().find(t=>t.height>15&&t.height<30&&Math.abs(t.x-AF_X)>1000);
   const a=new THREE.Vector3(t.x,t.y+t.height*.7,t.z-20),b=new THREE.Vector3(t.x,a.y,t.z+20);
   if(!europeTrees.hit(a,b)||europeTrees.hit(a.clone().setY(t.y+t.height+80),b.clone().setY(t.y+t.height+80)))throw Error('Tree swept volumes wrong');
   P.pos.set(t.x,t.y+t.height*.7,t.z-1);P.heading=0;P.pitch=0;P.spd=100;P.gear=0;P.gearTgt=0;P.onGround=false;P.alive=true;state=ST.FLIGHT;
   updateFlight(.05);if(P.alive)throw Error('Flight ignores visible European trees');return {height:t.height,collision:true};
  });console.log('Europe radar, reconnaissance and actual tree strike:',{euRecon,euTrees});
  }
  if(!process.env.GAME_TEST_PACIFIC_ONLY)await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=175');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  await page.evaluate(async()=>{renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;await prepareOkinawa();await preparePacificModels(MISSIONS[0]);loadSBDModel();});
  await page.waitForFunction(()=>sbdTemplate&&planeModelLoaded,null,{polling:200});
  const world=await page.evaluate(()=>{
   const w=okinawaWorld,roads=w.roadRoutes;if(roads.filter(r=>r.kind==='road').length<4||roads.filter(r=>r.kind==='track').length<2)throw Error('Road network absent');
   let samples=0,maxError=0;
   for(const mesh of w.decorations.filter(m=>['Hamlet earth roads','Farm tracks'].includes(m.name))){const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i+=17){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);maxError=Math.max(maxError,Math.abs(y-w.getSurfaceHeight(x,z)-.14));if(w.shoreDistance(x,z)<15)throw Error('Road in water');samples++;}}
   if(maxError>.001)throw Error('Roads buried or floating');
   const path=roads.find(r=>r.kind==='road').path;window.roadProofPoint=path[Math.floor(path.length/2)];
   const trees=[...w.treeIndex.cells.values()].flat();if(trees.some(t=>w.nearRoad(t.x,t.z)))throw Error('Tree grows through a new road');
   return {roads:roads.filter(r=>r.kind==='road').length,tracks:roads.filter(r=>r.kind==='track').length,treeCount:w.treeIndex.count,samples,maxError};
  });console.log('Okinawa surface and road clearance:',world);
  await page.evaluate(()=>{startMission(0);carrierIntro=null;state=ST.FLIGHT;hideOverlays();P.pos.set(-1000,320,0);P.spd=100;P.gear=0;P.gearTgt=0;P.hook=0;updatePlaneMesh(0);updateHUD();});
  await proof('avenger-gun',()=>{camera.fov=45;camera.updateProjectionMatrix();camera.position.copy(P.pos).add(new THREE.Vector3(-8,4,7));camera.lookAt(P.pos.clone().add(new THREE.Vector3(-1,1,0)));});
  const avenger=await page.evaluate(()=>{
   if(P.hookTgt!==0||!rearArmament?.visible||rearArmament.userData.ports.length!==1)throw Error('Avenger hook/gun setup');
   const nd=noseDir(),tgt=P.pos.clone().addScaledVector(nd,-200).add(new THREE.Vector3(0,10,0));zeros.push({alive:true,pos:tgt,heading:0,pitch:0,spd:0});P.tailCool=0;updateTailGun(.1);zeros.pop();
   const round=bullets.at(-1);const muzzle=rearArmament.userData.pivot.localToWorld(rearArmament.userData.ports[0].clone());if(round.mesh.position.distanceTo(muzzle)>.0001||!round.tail)throw Error('Rear rounds leave cockpit');
   const y=P.pos.y;inputPitch=.5;for(let i=0;i<60;i++)updateFlight(1/60);const climb={gain:P.pos.y-y,pitch:P.pitch,vsi:P.vSpeed};if(climb.gain<12||climb.pitch<.27)throw Error('Avenger climb response remains sluggish');inputPitch=0;
   beginBailout();for(let i=0;i<60;i++)advanceBailout(1/60);
   if(aircraftCrewCount()!==3||crewBailouts.length!==2||!bailout.deployed||crewBailouts.some(c=>!c.chute.deployed))throw Error('Avenger crew missing');
   return {climb,crew:3,mount:rearArmament.position.toArray(),muzzle:muzzle.toArray()};
  });console.log('Avenger:',avenger);
  await proof('avenger-crew',()=>{const p=bailout.position;camera.position.copy(p).add(new THREE.Vector3(23,10,25));camera.lookAt(p.clone().add(new THREE.Vector3(0,3,0)));});
  await page.evaluate(()=>{startMission(MISSIONS.findIndex(m=>m.sbd&&!m.corsair));carrierIntro=null;state=ST.FLIGHT;hideOverlays();P.pos.set(-1000,320,0);P.spd=100;P.gear=0;P.gearTgt=0;updatePlaneMesh(0);});
  await proof('dauntless-gun',()=>{camera.fov=45;camera.updateProjectionMatrix();camera.position.copy(P.pos).add(new THREE.Vector3(-8,4,7));camera.lookAt(P.pos.clone().add(new THREE.Vector3(-1,1,0)));});
  const sbd=await page.evaluate(()=>{
   if(Math.abs(rearArmament.position.y)>3||!rearArmament?.visible||rearArmamentType!=='sbd'||rearArmament.userData.ports.length!==2)throw Error('Twin Dauntless gun missing '+JSON.stringify({type:rearArmamentType,mount:rearArmament?.position.toArray(),visible:rearArmament?.visible,ports:rearArmament?.userData.ports.length,models:(()=>{const meshes=[];playerSBD.traverse(o=>{if(o.isMesh&&/^Object_/.test(o.name)){const box=new THREE.Box3(),v=new THREE.Vector3(),p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);o.localToWorld(v);planeGroup.worldToLocal(v);box.expandByPoint(v);}meshes.push({name:o.name,visible:o.visible,scale:new THREE.Vector3().setFromMatrixScale(o.matrixWorld).toArray(),min:box.min.toArray(),max:box.max.toArray()});}});return meshes;})()}));
   const target=P.pos.clone().addScaledVector(noseDir(),-200);zeros.push({alive:true,pos:target,heading:0,pitch:0,spd:0});P.tailCool=0;updateTailGun(.1);zeros.pop();
   if(bullets.slice(-2).some(b=>!b.tail))throw Error('Dauntless twin gun does not fire');
   beginBailout();for(let i=0;i<60;i++)advanceBailout(1/60);if(crewBailouts.length!==1||!crewBailouts[0].chute.deployed)throw Error('Dauntless second crew absent');return {crew:2,mount:rearArmament.position.toArray()};
  });console.log('Dauntless:',sbd);
  await proof('dauntless-crew',()=>{const p=bailout.position;camera.position.copy(p).add(new THREE.Vector3(23,10,25));camera.lookAt(p.clone().add(new THREE.Vector3(0,3,0)));});
  await page.evaluate(()=>{startMission(2);carrierIntro=null;state=ST.FLIGHT;hideOverlays();P.pos.set(-1000,320,0);updatePlaneMesh(0);updateNav();updateMinimap();});
  const pacNav=await page.evaluate(()=>{
   const nav=ensureNavigation(),ship=ships.find(s=>s.alive&&s.def.type==='freighter');if(!ship)throw Error('Merchant absent');
   zeros.push({alive:true,pos:P.pos.clone().add(new THREE.Vector3(10,0,10))});nav.choose(pacificContacts().find(c=>c.ref===ship));updateNav();if(document.getElementById('navKind').textContent!=='SHIP')throw Error('Ground/ship navigation overwritten');
   nav.choose(pacificContacts().find(c=>c.kind==='BASE'));updateNav();if(document.getElementById('navKind').textContent!=='BASE'||P.rtb)throw Error('RTB bypasses mission');zeros.pop();nav.reset();
   const r=pacificOps.config.recon;P.pos.set(r.x,40,r.z);for(let i=0;i<300;i++)updatePacificOperation(1/60);if(!pacificOps.reconDone)throw Error('Real Pacific search circle impossible');
   updateMinimap();const marker=nav.markers.find(m=>m.contact.ref===ship);window.testRadarMarker=marker;return {markers:nav.markers.length,reconDone:pacificOps.reconDone};
  });console.log('Pacific navigation:',pacNav);
  // Real pointer interaction with a radar contact, including the distant rim marker.
  const tap=await page.evaluate(()=>{const b=document.getElementById('mmap').getBoundingClientRect(),m=testRadarMarker;return {x:b.x+m.x*b.width/120,y:b.y+m.y*b.height/120};});await page.mouse.click(tap.x,tap.y);
  assert(await page.evaluate(()=>navigation.mode==='SELECT'||!navigation.panel.hidden),'radar tap selects or resolves overlapping contacts');
  await page.evaluate(()=>{navigation.choose(pacificContacts().find(c=>c.kind==='BASE'));P.pos.set(1000,250,0);updatePlaneMesh(0);updateHUD();updateNav();updateMinimap();});
  await page.setViewportSize({width:1024,height:600});await page.evaluate(()=>{document.getElementById('flash').classList.remove('show');renderer.render(scene,camera);const a=navigation.button.getBoundingClientRect(),b=document.getElementById('fireBtn').getBoundingClientRect();if(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)throw Error('Radar selector overlaps guns');});await page.screenshot({path:path.join(out,'build175-navigation-ui.png')});
  await proof('okinawa-roads',()=>{const [x,z]=roadProofPoint,w=okinawaWorld,y=w.getSurfaceHeight(x,z);camera.position.set(OKINAWA_OFFSET_X+x+100,y+170,z+140);camera.lookAt(OKINAWA_OFFSET_X+x,y,z);});
  const impacts=await page.evaluate(()=>{
   combatFX.clear();const add=(a,b)=>{const mesh=CombatFX.round();mesh.position.copy(a);scene.add(mesh);bullets.push({mesh,dir:b.clone().sub(a).normalize(),speed:a.distanceTo(b)/.05,life:1});};
   add(new THREE.Vector3(-500,15,0),new THREE.Vector3(-450,-10,0));const [x,z]=roadProofPoint,y=shoreHeight(x+OKINAWA_OFFSET_X,z);add(new THREE.Vector3(x+OKINAWA_OFFSET_X-5,y+12,z),new THREE.Vector3(x+OKINAWA_OFFSET_X+5,y-12,z));
   const before=bullets.length;updateGuns(.05);if(bullets.length>=before||combatFX.count<6)throw Error('Land/water round impacts missing');return combatFX.count;
  });console.log('Swept land/water effects:',impacts);
  assert.deepEqual(errors,[]);console.log('Build 175 feedback regression: passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
