/* Real aircraft, real mission selection, real WebGL pixels from each gun.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Europe guns WebGL: skipped locally (no Chrome).');process.exit(0);}
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
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true}),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/.test(m.text()))errors.push(m.text());});
  // Simulation ticks are driven explicitly; software WebGL isn't an iPad FPS test.
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?campaign=1&v=167');
  await page.waitForFunction(()=>typeof state!=='undefined'&&state===ST.MENU&&typeof realWorldReady!=='undefined'&&realWorldReady&&typeof renderer!=='undefined'&&renderer,null,{polling:100});
  await page.evaluate(()=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;scene.traverse(o=>{if(o.isInstancedMesh)o.visible=false;});});
  for(const [ac,count] of [['p47',8],['bf109',4],['fw190',4],['me262',4],['me163',2],['ju87',4]]){
   const index=await page.evaluate(ac=>MISSIONS.findIndex(m=>m.ac===ac&&!m.free&&!m.circuits),ac);
   await page.locator('#missionSel .chip').nth(index).click();await page.locator('#startBtn').click();await page.locator('#brGo').click();
   await page.waitForFunction(ac=>state===ST.FLIGHT&&P.ac===ac&&!!modelTpl[ac],ac,{polling:100});
   const result=await page.evaluate(()=>{
    refreshModels();P.onGround=false;P.pos.y=groundY(P.pos.x,P.pos.z)+600;P.spd=110;P.pitch=.025;P.roll=.15;P.gear=P.gearTgt=0;
    planeGroup.position.copy(P.pos);planeGroup.rotation.set(-P.pitch,P.heading,-P.roll,'YXZ');
    playerModel.getObjectByName('gear')?.visible&&(playerModel.getObjectByName('gear').visible=false);
    for(let i=0;i<30;i++)updateCamera(.05);
    for(const b of bullets)GameRuntime.release(b.mesh);bullets=[];gunT=0;gunVolley=0;fireGuns(.01);updateBullets(.04);combatFX.clear();
    renderer.setPixelRatio(1);CombatFX.updateRounds(bullets,camera,renderer);
    const gl=renderer.getContext(),off=new Uint8Array(1024*768*4),on=new Uint8Array(off.length),pixels=[];
    bullets.forEach(b=>b.mesh.visible=false);renderer.render(scene,camera);gl.readPixels(0,0,1024,768,gl.RGBA,gl.UNSIGNED_BYTE,off);
    for(let barrel=0;barrel<bullets.length;barrel++){
     bullets.forEach(b=>b.mesh.visible=b.mesh.userData.roundBarrel===barrel);renderer.render(scene,camera);gl.readPixels(0,0,1024,768,gl.RGBA,gl.UNSIGNED_BYTE,on);
     let n=0;for(let i=0;i<on.length;i+=4)if(Math.max(Math.abs(on[i]-off[i]),Math.abs(on[i+1]-off[i+1]),Math.abs(on[i+2]-off[i+2]))>35)n++;pixels.push(n);
    }
    bullets.forEach(b=>b.mesh.visible=true);renderer.render(scene,camera);
    const png=renderer.domElement.toDataURL('image/png');renderer.setPixelRatio(.25);
    return {pixels,png,lit:bullets.filter(b=>b.mesh.userData.litTracer).length,original:!!modelTpl[P.ac]&&playerModel.name};
   });
   assert.equal(result.lit,count);assert.equal(result.pixels.length,count);assert(result.pixels.every(n=>n>=1),ac+' invisible barrel: '+result.pixels);
   const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,ac+'-chase-guns.png'),Buffer.from(result.png.split(',')[1],'base64'));
   const ammo=await page.evaluate(()=>P.ammo),button=await page.locator('#fireBtn').boundingBox();
   await page.mouse.move(button.x+button.width/2,button.y+button.height/2);await page.mouse.down();
   await page.evaluate(()=>{
    const render=GameRuntime.render;let tick=0;clock.getDelta=()=>.05;
    try{GameRuntime.render=(...args)=>(++tick%30===0?render(...args):true);for(let i=0;i<180;i++)animate();}finally{GameRuntime.render=render;}
   });await page.mouse.up();
   assert(await page.evaluate(ammo=>state===ST.FLIGHT&&P.alive&&P.ammo<ammo-50,ammo),ac+' live button/frame routine must sustain fire');
   console.log('WebGL '+ac+': '+count+' guns; separate barrel pixels '+result.pixels.join('/')+'; nine simulated seconds of held fire pass.');
   await page.evaluate(()=>exitToMenuFromPause());
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exit(1);});
