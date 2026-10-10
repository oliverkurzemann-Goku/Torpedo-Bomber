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
  const page=await browser.newPage({viewport:{width:1100,height:780}}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  async function proof(name,pose){await page.evaluate(pose);const data=await page.evaluate(()=>{scene.updateMatrixWorld(true);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');});fs.writeFileSync(path.join(out,(name.startsWith('shared-')?'build178-':'build176-')+name+'.png'),Buffer.from(data.split(',')[1],'base64'));}
  for(const game of ['remagen-mission.html','torpedo-carrier.html']){
   const pacific=game.startsWith('torpedo');await page.goto('http://127.0.0.1:'+server.address().port+'/'+game+'?v=178');
   await page.waitForFunction(p=>state===ST.MENU&&(p||realWorldReady),pacific,{polling:200});
   await page.evaluate(()=>{renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;});
   if(pacific){await page.evaluate(async()=>{await prepareOkinawa();await preparePacificModels(MISSIONS[0]);});await page.waitForFunction(()=>planeModelLoaded,null,{polling:200});}
   await page.evaluate(()=>{startMission(0);state=ST.FLIGHT;if(typeof launchIntro!=='undefined')launchIntro=null;if(typeof carrierIntro!=='undefined')carrierIntro=null;document.querySelectorAll(".overlay").forEach(o=>o.classList.add("hidden"));clock.getDelta=()=>1/60;P.pos.set(typeof ALLIED_AF_X==='number'?ALLIED_AF_X:-1000,900,typeof ALLIED_AF_Z==='number'?ALLIED_AF_Z:0);P.spd=105;P.onGround=false;P.gear=0;P.gearTgt=0;P.pitch=0;P.roll=0;P.hull=35;P.systemDamage.engine=.65;});
   // Execute the shipped frame loop, not a duplicated call to trail(). Suppress
   // only final drawing during simulation; the proof below compiles its shader.
   const trail=await page.evaluate(()=>{const render=GameRuntime.render;GameRuntime.render=()=>{};try{for(let i=0;i<90;i++)animate();}finally{GameRuntime.render=render;}if(!P.alive||aircraftSmoke.count<20)throw Error('Damaged player produces no continuous trail');const stats=aircraftSmoke.stats;state=ST.PAUSED;const before=aircraftSmoke.mesh.instanceMatrix.array.slice();animate();if(before.some((v,i)=>v!==aircraftSmoke.mesh.instanceMatrix.array[i]))throw Error('Paused smoke moved');state=ST.FLIGHT;return stats;});
   await proof((pacific?'pacific':'europe')+'-smoke',()=>{camera.fov=48;camera.updateProjectionMatrix();camera.position.copy(P.pos).add(new THREE.Vector3(55,22,65));camera.lookAt(P.pos.clone().addScaledVector(noseDir(),-40));});
   const smokePixels=await page.evaluate(()=>{const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height,off=new Uint8Array(w*h*4),on=new Uint8Array(w*h*4);aircraftSmoke.mesh.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,off);aircraftSmoke.mesh.visible=true;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,on);let changed=0;for(let i=0;i<on.length;i+=4)if(Math.max(Math.abs(on[i]-off[i]),Math.abs(on[i+1]-off[i+1]),Math.abs(on[i+2]-off[i+2]))>12)changed++;return changed;});assert(smokePixels>150,'damage smoke must actually reach the framebuffer');
   await page.evaluate(()=>{beginBailout();for(let i=0;i<65;i++)advanceBailout(1/60);if(!bailout.deployed)throw Error('Detailed pilot did not deploy');});
   await proof((pacific?'navy':'usaaf')+'-pilot',()=>{const p=bailout.position;camera.fov=45;camera.updateProjectionMatrix();camera.near=.1;camera.position.copy(p).add(new THREE.Vector3(5,2,7));camera.lookAt(p.clone().add(new THREE.Vector3(0,1.6,0)));});
   if(!pacific){
    await proof('ground-crew',()=>{alliedActivity.update(0,ALLIED_AF_X,ALLIED_AF_Z);const c=alliedActivity.crew.find(c=>c.job==='signal'),x=ALLIED_AF_X+c.drawX,z=ALLIED_AF_Z+c.drawZ,y=terrain.getRenderedHeight(x,z);updateContentVisibility(x,z);camera.position.set(x-.5,y+2.3,z-3.2);camera.lookAt(x,y+1.1,z);});
   }else{
    const rescue=await page.evaluate(()=>{for(let i=0;i<6000&&!bailDone&&!bailRescue;i++)advanceBailout(.05);if(!bailRescue?.water)throw Error('Water pickup did not start');advanceBailout(3);return {crew:bailRescue.group.children.filter(o=>o.name==='pilot').length,pickup:bailRescue.pickup};});
    assert.equal(rescue.crew,2);assert.equal(rescue.pickup,false);
    await proof('rescue-boat',()=>{const p=bailRescue.group.position;camera.position.copy(p).add(new THREE.Vector3(9,6,10));camera.lookAt(p.clone().add(new THREE.Vector3(0,1.2,0)));});
    const avenger=await page.evaluate(()=>{let boats=0;for(let i=0;i<12000&&!bailDone;i++){advanceBailout(.05);boats=Math.max(boats,scene.children.filter(o=>o.name==='rescueBoat').length);}return {boats,done:bailDone,recovered:crewBailouts.filter(c=>c.safe).length+Number(bailRescue.pickup),aboard:bailRescue.group.children.filter(o=>o.name==='rescuedCrew').length};});
    assert.deepEqual(avenger,{boats:1,done:true,recovered:3,aboard:3});
    await proof('shared-avenger-rescue',()=>{const p=bailRescue.group.position;camera.position.copy(p).add(new THREE.Vector3(8,5,9));camera.lookAt(p.clone().add(new THREE.Vector3(0,1,0)));});
    // The Dauntless gunner lands first; a later pilot reuses that same launch.
    await page.evaluate(async()=>{await preparePacificModels(MISSIONS.find(m=>m.sbd&&!m.corsair));startMission(MISSIONS.findIndex(m=>m.sbd&&!m.corsair));carrierIntro=null;state=ST.FLIGHT;hideOverlays();P.pos.set(-1000,300,0);P.alive=true;P.spd=90;});
    await page.locator('#bailBtn').dispatchEvent('pointerdown',{pointerId:178});
    await page.evaluate(()=>{for(let i=0;i<60;i++)advanceBailout(1/60);bailout.position.set(-1040,150,20);crewBailouts[0].chute.position.set(-990,4,-15);for(let i=0;i<100&&!crewWaterRescue;i++)advanceBailout(.05);if(!crewWaterRescue||bailRescue)throw Error('Gunner should signal before the pilot lands');window.__rescueBoat=crewWaterRescue.group;});
    const paused=await page.evaluate(()=>{togglePause();const p=crewWaterRescue.group.position.clone(),t=crewBailouts[0].rescue.elapsed;animate();const held=state===ST.PAUSED&&p.equals(crewWaterRescue.group.position)&&t===crewBailouts[0].rescue.elapsed;togglePause();return held;});assert(paused,'shared launch freezes while paused');
    const dauntless=await page.evaluate(()=>{let boats=0;for(let i=0;i<12000&&!bailDone;i++){advanceBailout(.05);boats=Math.max(boats,scene.children.filter(o=>o.name==='rescueBoat').length);}if(bailRescue.group!==window.__rescueBoat)throw Error('Late pilot created another launch');return {boats,done:bailDone,recovered:crewBailouts.filter(c=>c.safe).length+Number(bailRescue.pickup),aboard:bailRescue.group.children.filter(o=>o.name==='rescuedCrew').length};});
    assert.deepEqual(dauntless,{boats:1,done:true,recovered:2,aboard:2});
    await proof('shared-dauntless-rescue',()=>{const p=bailRescue.group.position;camera.position.copy(p).add(new THREE.Vector3(8,5,9));camera.lookAt(p.clone().add(new THREE.Vector3(0,1,0)));});
    await page.evaluate(()=>{exitToMenu();if(crewWaterRescue||scene.children.some(o=>o.name==='rescueBoat'||o.name==='rescueBeacon'))throw Error('Menu retains shared rescue geometry');});
    console.log('One shared launch per original aircraft:',{avenger,dauntless,paused});
    await page.evaluate(async()=>{await prepareOkinawa();});
   }
   const reset=await page.evaluate(()=>{startMission(0);if(typeof crewWaterRescue!=='undefined'&&crewWaterRescue||scene.children.some(o=>o.name==='rescueBoat'))throw Error('Restart retains shared launch');return {smoke:aircraftSmoke.count,emitters:aircraftSmoke.stats.emitters,bailout:!!bailout};});assert.equal(reset.smoke,0);assert.equal(reset.emitters,0);assert.equal(reset.bailout,false);
   console.log(game,{trail,smokePixels,reset});
  }
  assert.deepEqual(errors,[]);console.log('Detailed crews, original aircraft damage trails, pause, bailout, water pickup and restart: passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
