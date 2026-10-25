/* Own Bf 109 F-2 in the real Rhine game (Build 203): it loads first, takes the rig-contract path,
 * carries the reference PDF's armament and tank, its retracted gear lies inside the wing (rays
 * through the real airframe mesh), each gun fires from its named muzzle and the hub cannon runs
 * dry on its own 200 rounds. Writes chase-view pictures to test-visuals/. Chrome via GAME_TEST_CHROME. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Own Bf 109 browser: skipped locally (no Chrome).');process.exit(0);}
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:820},hasTouch:true}),errors=[];page.setDefaultTimeout(180000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});// frames are driven explicitly
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?campaign=1&v=203');
  await page.waitForFunction(()=>typeof state!=='undefined'&&state===ST.MENU&&typeof realWorldReady!=='undefined'&&realWorldReady&&!!renderer,null,{polling:100});
  await page.evaluate(()=>{renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;});
  const index=await page.evaluate(()=>MISSIONS.findIndex(m=>m.id==='boxes'));
  await page.locator('#missionSel .chip').nth(index).click();await page.locator('#startBtn').click();await page.locator('#brGo').click();
  await page.waitForFunction(()=>state===ST.FLIGHT&&P.ac==='bf109'&&!!modelTpl.bf109,null,{polling:100});
  const shot=()=>page.evaluate(()=>{renderer.setPixelRatio(1);renderer.render(scene,camera);const png=renderer.domElement.toDataURL('image/png');renderer.setPixelRatio(.5);return png;});
  const save=(name,png)=>{const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,name),Buffer.from(png.split(',')[1],'base64'));};
  const data=await page.evaluate(()=>{
   finishLaunchIntro(false);refreshModels();
   return {src:window.__modelSrc.bf109,rig:window.__modelInfo.bf109,name:acDef().name,max:acDef().max,ammo:P.ammo,guns:gunCount(),
    hud:document.getElementById('hAmmo').textContent,label:document.getElementById('hAmmoLbl').textContent,tank:P.tankFuel,contract:!!playerModel.userData.nativeContract};
  });
  assert.equal(data.src,'assets/aircraft/bf109f2-own.glb');assert.match(data.rig,/rig contract v1 bf109f2-own-1/);assert(data.contract);
  assert.equal(data.name,'Bf 109F-2');assert.equal(data.max,176);assert.equal(data.ammo,1200);assert.equal(data.guns,'1000/200');
  assert.equal(data.hud,'1000/200');assert.equal(data.label,'MG/CANNON');assert.equal(data.tank,75);
  // On the strip, gear down: the game's own camera after the intro.
  await page.evaluate(()=>{for(let i=0;i<40;i++)updateCamera(.05);});save('build203-bf109-strip.png',await shot());

  // Retracted gear inside the wing: every sampled tyre and leg vertex has airframe skin straight
  // above and below it (rays along the model's own up axis through the real Airframe mesh).
  const stowed=await page.evaluate(()=>{
   const frame=modelTpl.bf109.clone(true);scene.add(frame);frame.position.set(0,5000,0);frame.updateMatrixWorld(true);
   AircraftArticulation.install(frame,'bf109');AircraftArticulation.pose(frame,0,{left:0,right:0});frame.updateMatrixWorld(true);
   const skin=frame.getObjectByName('Airframe');skin.material=skin.material.clone();skin.material.side=THREE.DoubleSide;// rays leave the wing from inside
   const up=new THREE.Vector3(0,1,0).transformDirection(frame.matrixWorld),ray=new THREE.Raycaster(),v=new THREE.Vector3();
   const out={};
   for(const part of ['GearLeftTyre','GearRightTyre','GearLeftLeg','GearRightLeg']){
    const mesh=frame.getObjectByName(part);if(!mesh){out[part]='missing';continue;}
    const pos=mesh.geometry.attributes.position;let inside=0,n=0;
    for(let i=0;i<pos.count;i+=3){v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);n++;
     ray.set(v,up);const above=ray.intersectObject(skin,false).length>0;ray.set(v,up.clone().negate());const below=ray.intersectObject(skin,false).length>0;
     if(above&&below)inside++;}
    out[part]=inside/n;}
   scene.remove(frame);return out;
  });
  for(const [part,share] of Object.entries(stowed))assert.equal(share,1,part+' retracted inside the wing: '+share);

  // In flight, gear up: chase view; then fire: each gun from its named muzzle, then the cannon runs dry first.
  const fire=await page.evaluate(()=>{
   P.onGround=false;P.pos.y=groundY(P.pos.x,P.pos.z)+700;P.spd=150;P.pitch=.03;P.roll=.2;P.gear=P.gearTgt=0;P.alive=true;
   posePlayerAircraft(.016);
   for(let i=0;i<40;i++)updateCamera(.05);
   const gearVisible=playerModel.getObjectByName('gear').visible;
   for(const b of bullets)GameRuntime.release(b.mesh);bullets=[];armGuns();fireGuns(.01);
   const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-P.pitch,P.heading,-P.roll,'YXZ')),ports=gunMuzzles();
   const first=bullets.map(b=>({barrel:b.mesh.userData.roundBarrel,off:b.mesh.position.distanceTo(ports[b.mesh.userData.roundBarrel].clone().applyQuaternion(q).add(P.pos))}));
   const names=ports.map(p=>p.name);
   let t=0,cannonDry=null;while(t<20){fireGuns(1/60);t+=1/60;for(const b of bullets)GameRuntime.release(b.mesh);bullets=[];if(cannonDry===null&&P.gunAmmo[2]===0)cannonDry=t;}
   return {gearVisible,first,names,cannonDry,left:P.gunAmmo.slice(),hud:gunCount()};
  });
  assert.equal(fire.gearVisible,false);assert.equal(fire.first.length,3);assert(fire.first.every(f=>f.off<.5),'rounds start at their muzzles: '+JSON.stringify(fire.first));
  assert.deepEqual(fire.names,['MuzzleLeft','MuzzleRight','MuzzleCannon']);
  assert(Math.abs(fire.cannonDry-15)<.1,'hub cannon dry after its 200 rounds: '+fire.cannonDry);assert(fire.left[0]>0&&fire.left[1]>0&&fire.left[2]===0,'MG 17 still firing: '+fire.left);
  await page.evaluate(()=>{for(let i=0;i<40;i++)updateCamera(.05);});save('build203-bf109-flight.png',await shot());
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({model:data.src,rig:'contract',performance:{max:data.max},armament:data.guns,tank:data.tank,retracted:stowed,cannonDrySeconds:+fire.cannonDry.toFixed(2),mgLeft:fire.left.slice(0,2),pictures:['build203-bf109-strip.png','build203-bf109-flight.png']}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
