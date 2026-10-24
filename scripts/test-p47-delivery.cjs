/* Observe the real mission and error path in Chromium. Device emulation is not iPad hardware. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),out=path.join(root,'app/release/model-review'),live=process.argv.includes('--live');
const exe=process.env.GAME_TEST_CHROME;if(!exe||!fs.existsSync(exe))throw Error('Set GAME_TEST_CHROME to a working Chromium executable');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,''),file=path.resolve(root,rel==='model-check.html'?rel:path.join('dist-app',rel||'index.html'));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(err,s)=>{if(err||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});});
(async()=>{
 if(!live)await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const base=live?'https://oliverkurzemann-goku.github.io/Torpedo-Bomber/':'http://127.0.0.1:'+server.address().port+'/',scenarios=[];
 try{
  for(const fault of live?[false]:process.argv.includes('--fault-only')?[true]:[false,true]){
   const context=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true}),page=await context.newPage(),requests=[],responses=[],errors=[],jobs=[];
   page.setDefaultTimeout(120000);page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/.test(m.text()))errors.push(m.text());if(/p47|P-47|GLTF|Failed|Error|Could not|model.*fail/i.test(m.text()))console.log('BROWSER',m.text());});
   page.on('request',r=>{if(/\.(glb|fbx|png|jpe?g|webp)(?:[?#]|$)/i.test(r.url()))requests.push(r.url());});
   page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url());if(/\.(glb|fbx|png|jpe?g|webp)(?:[?#]|$)/i.test(r.url()))jobs.push((async()=>{let b;try{b=await r.body();}catch{}responses.push({url:r.url(),status:r.status(),bytes:b?.length||0,sha256:b?crypto.createHash('sha256').update(b).digest('hex'):null});})());});
   await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
   if(fault)await page.route('**/assets/aircraft/p47-independent.glb*',r=>r.fulfill({status:404,body:'Intentional replacement-missing test'}));
   await page.goto(base+'remagen-mission.html?campaign=1&review=202',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>typeof realWorldReady!=='undefined'&&realWorldReady&&state===ST.MENU,null,{polling:250});
   console.log('Actual terrain/menu ready');
   const index=await page.evaluate(()=>MISSIONS.findIndex(m=>m.ac==='p47'&&!m.free&&!m.circuits));
   await page.locator('#missionSel .chip').nth(index).click();await page.locator('#startBtn').click();
   if(!fault)await page.waitForFunction(()=>!!modelTpl.p47,null,{polling:200});
   const info=await page.evaluate(()=>({modelSource:window.__modelSrc?.p47||null,modelInfo:window.__modelInfo?.p47||null,p47Ready:!!modelTpl.p47}));
   await page.locator('#brGo').click();
   await page.waitForFunction(()=>state===ST.FLIGHT&&P.ac==='p47',null,{polling:100});
   const mechanical=await page.evaluate(fault=>{
    renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;refreshModels();
    const native=!!playerModel.userData.nativeP47;if(!fault&&!native)throw Error('New native P47 missing from actual mission');
    const stats={native,ports:gunMuzzles().map(v=>v.toArray()),source:window.__modelSrc?.p47||null};
    if(native){
     const left=playerModel.getObjectByName('GearLeft');AircraftArticulation.pose(playerModel,1,{left:0,right:0});
     spawnEnemyAir(1,'p47');const ai=enemyAir.at(-1);AircraftArticulation.pose(ai.group,0,{left:.6,right:.2});
     if(left.rotation.z!==0||ai.group.getObjectByName('GearLeft').rotation.z<1)throw Error('Player/AI mechanical state shared');
     stats.aiNative=!!ai.group.userData.nativeP47;stats.aiCloneIndependent=true;
     const playerPosition=P.pos.clone();P.pos.y+=600;enemyAir.forEach(e=>{if(e!==ai)e.alive=false;});ai.pos.copy(P.pos).addScaledVector(noseDir(),-300);ai.heading=P.heading;ai.pitch=P.pitch;ai.cool=0;
     const tracerCount=tracers.length;updateEnemyAir(.001);const shot=tracers.at(-1);const aiPorts=AircraftArticulation.p47Muzzles(ai.group,null);stats.aiShotOriginError=tracers.length>tracerCount?Math.min(...aiPorts.map(p=>p.distanceTo(shot.mesh.position))):null;P.pos.copy(playerPosition);
     if(stats.aiShotOriginError===null||stats.aiShotOriginError>.0001)throw Error('AI tracer misses original barrel');
     const supports=AircraftGround.supports(playerModel,'p47');const fit=AircraftGround.fit(playerModel,'p47',P.pos.x,P.pos.z,P.heading,(x,z)=>AircraftGround.height(terrain,x,z));
     stats.groundContactResiduals=fit.contacts.map(p=>fit.y+p.y-AircraftGround.height(terrain,P.pos.x+p.x,P.pos.z+p.z));
     if(stats.groundContactResiduals.some(x=>Math.abs(x)>.005))throw Error('Ground residual exceeds 5mm');
     const rotor=playerModel.getObjectByName('prop'),q=rotor.quaternion.clone();rotor.rotation.z+=.6;if(q.angleTo(rotor.quaternion)<.5)throw Error('Original rotor not animated');
     AircraftArticulation.pose(playerModel,.5,{left:1,right:1});stats.halfGear=left.rotation.z;AircraftArticulation.pose(playerModel,1,{left:0,right:0});
     const ammo=P.ammo,was=launchIntro;launchIntro=null;gunT=0;fireGuns(.05);launchIntro=was;stats.volleyAmmo=ammo-P.ammo;if(stats.volleyAmmo!==8)throw Error('P47 actual volley does not have eight origins');
     const centre=planeGroup.position.clone(),offset=new THREE.Vector3(17,7,-18).applyAxisAngle(new THREE.Vector3(0,1,0),P.heading);camera.position.copy(centre).add(offset);camera.lookAt(centre);
    }
    renderer.render(scene,camera);stats.render={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries};
    const png=renderer.domElement.toDataURL('image/png');return {stats,png};
   },fault);
   fs.writeFileSync(path.join(out,'p47',live?'live-build201-mission.png':fault?'missing-model-standin.png':'p47-in-mission.png'),Buffer.from(mechanical.png.split(',')[1],'base64'));
   await Promise.all(jobs);const oldP47=requests.filter(u=>/(?:p47new|p47-weathered|p-47d-28|p47\.glb|p-47\.glb|p_47\.glb)/i.test(decodeURIComponent(u)));
   if(!live){assert.equal(oldP47.length,0,'legacy P47 requested on normal/error path');assert.equal(errors.length,0,errors.join('\n'));}
   if(fault){assert.equal(mechanical.stats.native,false,'failed replacement must use original procedural stand-in');assert(responses.filter(r=>r.url.includes('p47-independent.glb')).every(r=>r.status===404));}
   scenarios.push({scenario:live?'live-deployed-baseline':fault?'local-app-replacement-404':'local-app-normal',entry:base+'remagen-mission.html',info,mechanical:mechanical.stats,oldP47Requests:oldP47,errors,requests,responses:responses.sort((a,b)=>a.url.localeCompare(b.url))});
   console.log(JSON.stringify({scenario:scenarios.at(-1).scenario,info,mechanical:mechanical.stats,oldP47Requests:oldP47,errors}));await context.close();
  }
  const report={checkedOn:'2026-10-24',environment:'Chromium headless / SwiftShader on Linux, 1024x768 touch viewport. Not Safari/WKWebView and not a physical iPad.',scope:'Actual Rhine mission, player/AI, mechanics, muzzle volley, observed resource hashes and deliberate missing-replacement route. Static audit covers other potential paths; this is not an exhaustive mission trace.',scenarios};
  const reportPath=path.join(out,live?'browser-live-baseline-trace.json':'browser-delivery-trace.json');
  if(process.argv.includes('--fault-only')&&fs.existsSync(reportPath))report.scenarios=[...JSON.parse(fs.readFileSync(reportPath)).scenarios.filter(s=>s.scenario!=='local-app-replacement-404'),...scenarios];
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 }finally{await browser.close();if(!live)server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
