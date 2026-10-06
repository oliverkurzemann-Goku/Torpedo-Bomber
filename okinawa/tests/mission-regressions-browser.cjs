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
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=173');
  await page.waitForFunction(()=>typeof realWorldReady!=='undefined'&&realWorldReady&&state===ST.MENU,null,{polling:200});
  await page.evaluate(()=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  for(const ac of ['bf109','me262']){
   const index=await page.evaluate(ac=>MISSIONS.findIndex(m=>m.ac===ac&&m.kills?.bridge),ac);assert(index>=0);
   await page.locator('#missionSel .chip').nth(index).click();await page.locator('#startBtn').click();await page.locator('#brGo').click();
   await page.waitForFunction(ac=>state===ST.FLIGHT&&P.ac===ac,ac,{polling:100});
   const results=await page.evaluate(()=>{
    const results=[];
    for(const dt of [1/20,1/60,1/120])for(const fraction of [.12,.5,.88]){
     clearWorld();populate();sortieKills.bridge=0;P.bombs=1;
     const t=targets.find(t=>t.kind==='bridge'),b=t.sub.userData.data,u=t.sub.userData;
     const ox=u.x-(b.x1+b.x2)/2,oz=u.z-(b.z1+b.z2)/2;
     const x=ox+b.x1+(b.x2-b.x1)*fraction,z=oz+b.z1+(b.z2-b.z1)*fraction;
     const y=t.sub.children[0].geometry.attributes.position.getY(0);
     const mesh=new THREE.Mesh(new THREE.SphereGeometry(.2,4,3),new THREE.MeshBasicMaterial());GameRuntime.own(mesh);mesh.position.set(x,y+90,z);scene.add(mesh);
     bombs.push({mesh,v:new THREE.Vector3(0,-180,0),life:15});P.bombs--;
     for(let n=0;n<200&&bombs.length;n++)updateOrdnance(dt);
     if(t.alive||sortieKills.bridge!==1||bombs.length||P.bombs!==0)throw Error('One direct bomb failed: '+JSON.stringify({fraction,dt,alive:t.alive,hp:t.hp,kills:sortieKills.bridge,bombs:bombs.length,remaining:P.bombs,x,z,deck:y,ground:groundY(x,z),matrix:t.sub.matrixWorld.elements}));
     results.push({fraction,dt,kills:sortieKills.bridge});
    }
    // A shot into empty air beside the bridge must not be a direct structural hit.
    clearWorld();populate();const t=targets.find(t=>t.kind==='bridge'),u=t.sub.userData;
    if(directBridgeHit(new THREE.Vector3(u.x+130,180,u.z),new THREE.Vector3(u.x+130,-10,u.z)))throw Error('Bridge hit box covers empty air');
    return results;
   });assert.equal(results.length,9);console.log(ac+': nine single-bomb bridge strikes across span and frame rates passed');
   await page.evaluate(()=>exitToMenuFromPause());
  }
  const flakIndex=await page.evaluate(()=>MISSIONS.findIndex(m=>m.id==='flak'));
  await page.locator('#missionSel .chip').nth(flakIndex).click();await page.locator('#startBtn').click();await page.locator('#brGo').click();
  await page.waitForFunction(()=>state===ST.FLIGHT&&P.ac==='p47',null,{polling:100});
  const batteries=await page.evaluate(()=>{
   const batteries=[];const guns=targets.filter(t=>t.kind==='flak'&&t.primary);if(guns.length!==2)throw Error('Second battery absent');
   for(const t of guns){const p=t.group.position;
    for(const offset of [0,4300,0]){
     P.pos.set(p.x,groundY(p.x,p.z)+200,p.z);
     for(let i=0;i<24;i++)terrain.updateLOD(p.x+offset,p.z+offset,.25);
     updateContentVisibility(p.x,p.z);scene.updateMatrixWorld(true);
     const u=t.sub.userData;
     if(Math.abs(u.foundationY+t.sub.position.y-groundY(p.x,p.z))>.02)throw Error('Battery buried by terrain LOD');
     for(let o=t.sub;o;o=o.parent)if(!o.visible)throw Error('Active battery culled');
    }
    batteries.push({position:p.toArray(),terrainLift:t.sub.userData.terrainLift,visible:t.sub.visible});
   }
   const p=guns[1].group.position;camera.position.set(p.x+28,p.y+18,p.z+28);camera.lookAt(p.x,p.y+2,p.z);renderer.setPixelRatio(.7);renderer.render(scene,camera);
   window.flakProof=renderer.domElement.toDataURL('image/png');
   for(const t of guns)damageTarget(t,t.hp,true);
   if(sortieKills.flak!==2||objectiveLeft().flak)throw Error('Flak objective cannot finish');
   // Starting the same mission restores both wrecks on their current ground surface.
   clearWorld();populate();historicalMgr.refresh();if(targets.filter(t=>t.kind==='flak'&&t.alive&&t.primary).length!==2)throw Error('Second sortie loses a gun');
   return batteries;
  });assert.equal(batteries.length,2);console.log('Two flak batteries: visible over LOD changes, two kills complete objective, reset passed',batteries);
  fs.writeFileSync(path.join(out,'build173-second-flak.png'),Buffer.from((await page.evaluate(()=>flakProof)).split(',')[1],'base64'));
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=173');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  const idx=await page.evaluate(()=>MISSIONS.findIndex(m=>m.corsair&&!m.shoreStrike));
  await page.locator('#missionSel .chip').nth(idx).click();await page.locator('#startBtn').click();await page.locator('#launchBtn').click();
  await page.waitForFunction(()=>carrierAircraftReady()&&carrierIntro,null,{polling:200});
  const pacific=await page.evaluate(()=>{
   if(hasRearGunner()||hasDiveBrakes())throw Error('Corsair capabilities leaked');
   const rear=P.pos.clone().add(new THREE.Vector3(-100,0,0));zeros.push({alive:true,pos:rear});const before=bullets.length;state=ST.FLIGHT;updateTailGun(1);if(bullets.length!==before)throw Error('Corsair tail gun fires');zeros.pop();
   const distance=Math.min(...ships.map(s=>P.pos.distanceTo(s.group.position)));if(distance<7500)throw Error('Target appears at departure');
   if(NavalAssets.gunThreshold({type:'destroyer'})<=NavalAssets.gunThreshold({type:'freighter'}))throw Error('Destroyer weaker than merchant');
   if(!NavalAssets.label({type:'cruiser'}).includes('carrier')||!NavalAssets.label({type:'freighter',model:'submarine'}).includes('Ko-hyoteki'))throw Error('Incorrect radio type');
   const t=ships[0],p=t.group.position;const hull=shipBulletHit(t,new THREE.Vector3(p.x,p.y+4,p.z-250),new THREE.Vector3(p.x,p.y+4,p.z+250));
   if(!hull||shipBulletHit(t,new THREE.Vector3(p.x+100,4,p.z-250),new THREE.Vector3(p.x+100,4,p.z+250)))throw Error('Ship hit box incorrect');
   const w=okinawaWorld,site=w.houseSites.find(p=>p.style===0);w.updateVillageDetails(site.x,site.z);
   if(w.nearBuildings.filter(o=>o.visible).length>12||!w.nearBuildings.some(o=>o.visible))throw Error('Village detail budget');
   renderer.setPixelRatio(.7);renderer.shadowMap.enabled=false;camera.position.set(10000+site.x+40,site.y+20,site.z+42);camera.lookAt(10000+site.x,site.y+3,site.z);scene.updateMatrixWorld(true);renderer.render(scene,camera);window.villageProof=renderer.domElement.toDataURL('image/png');
   return {distance,hull,nearHouses:w.nearBuildings.filter(o=>o.visible).length,objects:w.objectCount};
  });console.log('Pacific capabilities, target approach, damage and village details:',pacific);
  fs.writeFileSync(path.join(out,'build173-okinawa-village.png'),Buffer.from((await page.evaluate(()=>villageProof)).split(',')[1],'base64'));
  assert.deepEqual(errors,[]);console.log('Build 173 mission regression WebGL: passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
