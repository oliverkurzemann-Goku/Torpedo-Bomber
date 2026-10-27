'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Fw190/Komet WebGL: skipped locally (no Chrome).');process.exit(0);}
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://x').pathname));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(f,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true}),errors=[],requests=[],out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});page.setDefaultTimeout(150000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/shader error|Error compiling|VALIDATE_STATUS/i.test(m.text()))errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;localStorage.setItem('re_modeladj',JSON.stringify({fw190:2,me163:2}));});
 await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?campaign=1&v=209');
 await page.waitForFunction(()=>typeof realWorldReady!=='undefined'&&realWorldReady&&state===ST.MENU,null,{polling:200});
 await page.evaluate(async()=>{renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;for(const k of ['fw190','me163','p47','b17'])await ensureModel(k);});
 for(const kind of ['fw190','me163']){
  const index=await page.evaluate(k=>MISSIONS.findIndex(m=>m.ac===k&&!m.free&&!m.circuits),kind);
  await page.locator('#missionSel .chip').nth(index).click();await page.locator('#startBtn').click();await page.locator('#brGo').click();
  await page.waitForFunction(k=>state===ST.FLIGHT&&P.ac===k&&!!modelTpl[k],kind,{polling:100});
  const report=await page.evaluate(kind=>{
   finishLaunchIntro(false);refreshModels();posePlayerAircraft(.016);
   if(modelAdj[kind]!==0)throw Error('Legacy orientation survived the original-model replacement');
   const native=kind==='fw190'?playerModel.userData.nativeContract:playerModel.userData.nativeMe163;
   const contacts=AircraftGround.fit(playerModel,kind,0,0,0,()=>0).contacts.length;
   const info=window.__modelInfo[kind],source=window.__modelSrc[kind];
   let departure=null;
   if(kind==='fw190'){
    P.throttle=1;inputPitch=.60;inputRoll=0;const start=P.pos.clone();let seconds=0;
    for(;seconds<50&&P.onGround&&P.alive;seconds+=1/60){updateFlight(1/60);posePlayerAircraft(1/60);}
    departure={alive:P.alive,airborne:!P.onGround,seconds,distance:P.pos.distanceTo(start)};
   }
   P.onGround=false;P.pos.set(AF_X,groundY(AF_X,AF_Z)+1000,AF_Z);P.spd=130;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;P.pitch=.02;P.roll=0;P.departureAge=null;inputPitch=.3;inputRoll=.4;posePlayerAircraft(.016);
   const moved=kind==='fw190'?Math.abs(playerModel.getObjectByName('GearLeft').rotation.z):playerModel.getObjectByName('LandingSkid').position.y;
   for(const b of bullets)GameRuntime.release(b.mesh);bullets=[];armGuns();gunT=0;gunVolley=0;fireGuns(.001);
   const ports=gunMuzzles(),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(-P.pitch,P.heading,-P.roll,'YXZ'));
   const originErrors=bullets.map(b=>b.mesh.position.distanceTo(ports[b.mesh.userData.roundBarrel].clone().applyQuaternion(q).add(P.pos)));
   const normals=[];playerModel.traverse(n=>{if(n.isMesh)normals.push(n.geometry.attributes.position.count);});
   return {kind,source,info,native,contacts,departure,moved,ports:ports.length,shots:bullets.length,originErrors,meshes:normals.length};
  },kind);
  assert(report.native&&report.contacts===3);assert.equal(report.ports,kind==='fw190'?6:2);assert.equal(report.shots,report.ports);assert(report.originErrors.every(x=>x<.001));
  if(kind==='fw190'){assert(report.departure.alive&&report.departure.airborne&&report.departure.distance<900);assert(report.moved>1.5);}else assert.equal(report.moved,.24);
  await page.evaluate(()=>{scene.updateMatrixWorld(true);camera.position.copy(P.pos).add(new THREE.Vector3(-11,4,13));camera.lookAt(P.pos);GameRuntime.render(renderer,scene,camera);});
  await page.screenshot({path:path.join(out,'build209-'+kind+'-in-game.png')});console.log('REAL GAME',JSON.stringify(report));
  await page.evaluate(()=>exitToMenuFromPause());
 }
 assert(!requests.some(u=>/\/(fw190|me163)\.glb(?:\?|$)/.test(u)),'retired aircraft must never be requested');assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'build209-native-browser.json'),JSON.stringify({requests:requests.filter(u=>/aircraft\//.test(u)),errors},null,2));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
