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
 if(url.pathname==='/remagen-mission.html'){const html=fs.readFileSync(path.join(root,'remagen-mission.html'),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
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
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?campaign=1&v=168');
  await page.waitForFunction(()=>typeof realWorldReady!=='undefined'&&realWorldReady&&state===ST.MENU,null,{polling:200});
  console.log('Browser: real terrain menu loaded');
  await page.evaluate(()=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  for(const ac of ['p47','fw190','me163']){
   const index=await page.evaluate(ac=>MISSIONS.findIndex(m=>m.ac===ac&&!m.free&&!m.circuits),ac);
   await page.locator('#missionSel .chip').nth(index).click();await page.locator('#startBtn').click();await page.locator('#brGo').click();
   await page.waitForFunction(ac=>state===ST.FLIGHT&&P.ac===ac&&launchIntro,ac,{polling:100});
   const initial=await page.evaluate(()=>({fuel:P.fuel,hull:P.hull,pos:P.pos.toArray(),time:launchIntro.time}));
   // Drive the real loop, rendering only the sampled views on software WebGL.
   const service=await page.evaluate(()=>{
    const render=GameRuntime.render;GameRuntime.render=()=>true;clock.getDelta=()=>.05;
    try{for(let i=0;i<40;i++)animate();}finally{GameRuntime.render=render;}
    renderer.setPixelRatio(.7);renderer.render(scene,camera);
    const t=launchIntro.target.clone().project(camera);
    const png=renderer.domElement.toDataURL('image/png');renderer.setPixelRatio(.25);
    return {png,focus:t.toArray(),fuel:P.fuel,hull:P.hull,pos:P.pos.toArray(),progress:launchIntro.activity?.loading.progress};
   });
   assert.deepEqual(service.pos,initial.pos);assert.equal(service.fuel,initial.fuel);assert.equal(service.hull,initial.hull);
   assert(Math.abs(service.focus[0])<.8&&Math.abs(service.focus[1])<.8,'service aircraft stays in view');
   if(ac==='p47'||ac==='fw190')assert(service.progress>.4&&service.progress<1,'actual visible load lifts during the opening shot');
   fs.writeFileSync(path.join(out,ac+'-start-service.png'),Buffer.from(service.png.split(',')[1],'base64'));
   const paused=await page.evaluate(()=>{const time=launchIntro.time;togglePause();animate();const frozen=launchIntro.time===time;togglePause();return frozen;});assert(paused);
   await page.evaluate(()=>{const render=GameRuntime.render;GameRuntime.render=()=>true;try{while(launchIntro)animate();}finally{GameRuntime.render=render;}renderer.render(scene,camera);});
   assert(await page.evaluate(()=>!launchIntro&&!document.body.classList.contains('launchPreview')));
   await page.evaluate(()=>exitToMenuFromPause());
   console.log(ac+': service aircraft in frame; real loading, frozen position/fuel/hull, pause/resume and smooth finish pass.');
  }
  // Fly across the actual seam that previously had a 69m cliff, then show the river.
  for(const [name,x,y,z,tx,ty,tz] of [['terrain-seam',3250,780,11500,3250,600,12500],['rhine-roads',13750,500,14200,13805,60,15770]]){
   const png=await page.evaluate(({x,y,z,tx,ty,tz})=>{
    for(let i=0;i<160;i++){osmMgr.advanceSurfacePreparation();terrain.updateLOD(x,z,.05);osmMgr.syncTerrainSurfaces();}
    updateContentVisibility(x,z);camera.position.set(x,y,z);camera.up.set(0,1,0);camera.lookAt(tx,ty,tz);renderer.setPixelRatio(.7);renderer.render(scene,camera);
    return renderer.domElement.toDataURL('image/png');
   },{x,y,z,tx,ty,tz});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(png.split(',')[1],'base64'));
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exit(1)});
