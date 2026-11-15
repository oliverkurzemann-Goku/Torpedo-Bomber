/* Render matching low flight paths with and without the new Rhine detail. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Rhine village WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,args:[
   '--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'
  ]});
  const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true,deviceScaleFactor:2}),errors=[];
  page.setDefaultTimeout(150000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const url='http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=272';
  await page.goto(url+'&scenery=ultra&perf=1');
  await page.waitForFunction(()=>typeof livingWorld!=='undefined'&&livingWorld?.rhineVillage&&state===ST.MENU,null,{polling:200});
  const proof=await page.evaluate(()=>{
   if(!rhineUltra||renderer.getPixelRatio()!==2||!rhineMetricsEnabled)throw Error('Ultra test link failed');
   configureRhineScenery('detailed');
   renderer.setPixelRatio(.60);renderer.shadowMap.enabled=false;
   const layer=livingWorld.rhineVillage;
   if(!periodBuildings.entries.some(e=>e.group.name==='remagen-rail-ruin'&&e.proxy.children[0].geometry.attributes.position.count===144)){
    throw Error('Railway ruin or open distant shell missing');
   }
   const cam=new THREE.PerspectiveCamera(52,1024/768,1,13000);
   const output=[];
   for(const site of layer.sites){
    const {x,z}=site,altitude=groundY(x,z)+70;
    const key=Math.floor(x/RTILE)+','+Math.floor(z/RTILE),tile=terrain.tiles.get(key),osmTile=osmMgr.tiles.get(key);
    const local=new THREE.Scene();local.background=new THREE.Color(0x9eb4c2);
    const sky=new THREE.HemisphereLight(0xe5ecff,0x747565,1.45),sun=new THREE.DirectionalLight(0xffdfb5,1.05);
    sun.position.set(-150,200,100);local.add(sky,sun);
    const ground=new THREE.Mesh(tile.mesh.geometry,tile.mesh.material);ground.position.copy(tile.mesh.position);local.add(ground);
    osmTile.farGroup.updateMatrixWorld(true);
    for(const mesh of osmTile.farGroup.children.filter(o=>o.name.startsWith('osmBuilding')))local.add(mesh.clone());
    layer.update(.3,x,z,altitude);
    const scenery=site.group.clone();scenery.visible=false;local.add(scenery);
    const shots=[];
    for(const distance of [180,115,72]){
     cam.position.set(x-32,altitude,z+distance);cam.lookAt(x,groundY(x,z)+3,z);
     const render=visible=>{
      scenery.visible=visible;renderer.render(local,cam);
      const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height;
      const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return {pixels,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
     };
     const before=render(false),after=render(true);let changed=0;
     for(let i=0;i<before.pixels.length;i+=4){
      if(Math.abs(before.pixels[i]-after.pixels[i])>8||
         Math.abs(before.pixels[i+1]-after.pixels[i+1])>8||
         Math.abs(before.pixels[i+2]-after.pixels[i+2])>8)changed++;
     }
     shots.push({distance,changed,extraCalls:after.calls-before.calls,extraTriangles:after.triangles-before.triangles});
    }
    output.push({name:site.name,shots});
   }
   return output;
  });
  assert.equal(proof.length,2);
  for(const site of proof){
   assert(site.shots.some(s=>s.changed>120),site.name+' details must be visible in the low pass '+JSON.stringify(site.shots));
   assert(site.shots.every(s=>s.extraCalls<=1&&s.extraTriangles<=1800),'site exceeds geometry budget');
  }
  await page.waitForFunction(()=>rhineScenery?.enabled);
  const coverage=await page.evaluate(()=>{
   const layer=rhineScenery;
   const routes=[
    [[7450,15800],[8600,15780],[10400,15800],[13680,15420]],
    [[14100,15020],[14470,15590],[14300,16000],[13400,17150]],
    [[21800,25720],[22700,25720],[23500,25720],[24650,25720]]
   ];
   const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height;
   const measurements=[];
   const cam=new THREE.PerspectiveCamera(51,1024/768,1,13000);
   const light=new THREE.HemisphereLight(0xe4edff,0x889078,1.9);
   const sceneSlice=new THREE.Scene();sceneSlice.background=new THREE.Color(0x9eb4c2);sceneSlice.add(light);
   const classicRoof=0x653b31;
   for(const route of routes){
    const record=[];
    for(const [index,[x,z]] of route.entries()){
     const agl=index%2===0?100:320;
     const y=groundY(x,z)+agl;
     for(let i=0;i<26;i++)layer.update(.016,x,z,y,0);
     const tile=terrain.tiles.get(Math.floor(x/RTILE)+','+Math.floor(z/RTILE));
     const ground=new THREE.Mesh(tile.mesh.geometry,tile.mesh.material);
     ground.position.copy(tile.mesh.position);sceneSlice.add(ground);
     const baseScenery=new THREE.Group();sceneSlice.add(baseScenery);
     const tileScenery=osmMgr.tiles.get(Math.floor(x/RTILE)+','+Math.floor(z/RTILE));
     for(const o of tileScenery.farGroup.children.filter(o=>o.name.startsWith('osmBuilding')||o.name.startsWith('osmForest'))){
      baseScenery.add(o.clone());
     }
     const detail=new THREE.Group();sceneSlice.add(detail);
     const nearby=layer.sites.filter(s=>s.mesh?.visible);
     for(const s of nearby)detail.add(s.mesh.clone());
     if(route===routes[2]){
      const direction=x<23600?1:-1;
      cam.position.set(x-direction*190,y,z);cam.lookAt(x+direction*235,groundY(x,z)+18,z);
     }else{
      cam.position.set(x-100,y,z+235);cam.lookAt(x+85,groundY(x,z),z-140);
     }
     const sample=enabled=>{
      detail.visible=enabled;terrain.setRhineLandscape(enabled);osmMgr.setRhineLandscape(enabled);
      renderer.render(sceneSlice,cam);
      const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return {pixels,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
     };
     const classic=sample(false),advanced=sample(true);
     let pixels=0;
     for(let i=0;i<classic.pixels.length;i+=4){
      if(Math.abs(classic.pixels[i]-advanced.pixels[i])>7||
         Math.abs(classic.pixels[i+1]-advanced.pixels[i+1])>7||
         Math.abs(classic.pixels[i+2]-advanced.pixels[i+2])>7)pixels++;
     }
     record.push({agl,pixels,pct:+(100*pixels/(w*h)).toFixed(2),calls:advanced.calls-classic.calls,triangles:advanced.triangles-classic.triangles});
     sceneSlice.remove(ground,detail,baseScenery);
    }
    measurements.push(record);
   }
   terrain.setRhineLandscape(false);osmMgr.setRhineLandscape(false);
   if(osmMgr.roofMat.color.getHex()!==classicRoof)throw Error('Classic roof tint mismatch');
   terrain.setRhineLandscape(true);osmMgr.setRhineLandscape(true);
   return measurements;
  });
  assert(coverage.every(samples=>samples.filter(s=>s.pct>=8).length>=3),JSON.stringify(coverage));
  assert(coverage.flat().every(s=>s.calls<=12&&s.triangles<18000),JSON.stringify(coverage));
  await page.evaluate(()=>{
   const select=document.getElementById('rhineSceneryPause');
   select.value='classic';select.dispatchEvent(new Event('change'));
   if(rhineScenery.enabled||terrain.rhineLandscape.value||osmMgr.roofMat.color.getHex()!==0x653b31||
      rhineScenery.group.visible||rhineScenery.atlas||rhineScenery.sites.some(s=>s.mesh)||
      GameRuntime.storage.getItem('re_rhine_scenery')!=='classic'||
      document.getElementById('rhineSceneryMenu').value!=='classic')throw Error('Classic fallback failed');
   select.value='detailed';select.dispatchEvent(new Event('change'));
   if(!rhineScenery.enabled||!terrain.rhineLandscape.value||osmMgr.roofMat.color.getHex()!==0x805440||!rhineScenery.atlas||
      GameRuntime.storage.getItem('re_rhine_scenery')!=='detailed')throw Error('Detailed reactivation failed');
  });
  const levelViews=await page.evaluate(()=>{
   const pairs=[['river',13890,16260,13630,15040,'clear'],['woodland',15120,14250,16160,13920,'broken']];
   const lens=new THREE.PerspectiveCamera(58,1024/768,1,13500);
   const views=[];
   for(const [name,x,z,tx,tz,wx] of pairs){
    weather=wx;applyWeather();
    updateContentVisibility(x,z);
    const y=groundY(x,z)+185;
    lens.position.set(x,y,z);lens.lookAt(tx,y-25,tz);
    let detailedPixels;
    for(const mode of ['classic','detailed','ultra']){
     configureRhineScenery(mode);
     if(mode!=='classic')for(let i=0;i<85;i++){
      rhineScenery.update(.04,x,z,y,mode==='ultra'?0:1,mode==='ultra');
      rhineUltra?.update(.04,x,z);
     }
     renderer.setPixelRatio(.65); // Same render resolution isolates the visual differences.
     renderer.render(scene,lens);
     const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height;
     const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
     let difference=0;
     if(mode==='detailed')detailedPixels=pixels;
     if(mode==='ultra'){
      for(let i=0;i<pixels.length;i+=4)if([0,1,2].some(c=>Math.abs(detailedPixels[i+c]-pixels[i+c])>12))difference++;
     }
     views.push({name,mode,png:renderer.domElement.toDataURL(),triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,
      changed:+(100*difference/(w*h)).toFixed(2),masks:rhineUltra?[...rhineUltra.maps.values()].filter(r=>r.texture).length:0});
    }
   }
   return views;
  });
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  for(const view of levelViews){
   assert(view.png.length>10000);
   fs.writeFileSync(path.join(out,'rhine-'+view.name+'-'+view.mode+'.png'),Buffer.from(view.png.split(',')[1],'base64'));
   delete view.png;
  }
  for(let i=0;i<levelViews.length;i+=3){
   const [classic,detailed,ultra]=levelViews.slice(i,i+3);
   assert(detailed.triangles-classic.triangles<18000);
   assert(ultra.changed>=20,'Ultra must be visible at flight height: '+JSON.stringify(ultra));
   assert(ultra.masks>0&&ultra.masks<=18);
   assert(ultra.calls-detailed.calls<40&&ultra.triangles-detailed.triangles<90000);
  }
  console.log('Rhine level camera:',JSON.stringify(levelViews));
  await page.evaluate(()=>{
   configureRhineScenery('detailed');
   startMission(0);finishLaunchIntro(false);show('menu',false);
   P.pos.set(13890,groundY(13890,16260)+185,16260);P.onGround=false;P.spd=130;
  });
  await page.locator('#pauseBtn').click();
  await page.locator('#rhineSceneryPause').selectOption('ultra');
  assert.equal(await page.locator('#rhinePerfPause').isChecked(),true);
  await page.evaluate(()=>{
   if(!rhineUltra||renderer.getPixelRatio()!==2||flightQuality.enabled)throw Error('Ultra resolution must be fixed');
   if(GameRuntime.storage.getItem('re_rhine_scenery')!=='detailed')throw Error('Ultra must be temporary');
   // A slower fixture frame still counts in FPS even when simulation dt is clamped.
   const rate=new RhineFrameRate();for(let i=0;i<29;i++)rate.sample(.03);
   const report=rate.sample(.65);
   if(Math.abs(report.fps-30/1.52)>.01||Math.abs(report.p95-30)>.01)throw Error('Cadence and P95 sample window');
  });
  await page.locator('#pmResume').click();
  await page.evaluate(()=>{
   renderer.setPixelRatio(.44);
   const getDelta=clock.getDelta;
   try{clock.getDelta=()=>.78;animate();animate();}
   finally{clock.getDelta=getDelta;}
  });
  assert.match(await page.locator('#rhinePerfHud').textContent(),/Ultra High · 1 FPS · P95 780\.0 ms\n.* M tris · .* draws · 0\.44×/);
  await page.locator('#pauseBtn').click();
  assert.equal(await page.locator('#rhinePerfHud').isHidden(),true);
  await page.evaluate(()=>{
   const layer=rhineUltra,oldSky=layer.sky,oldMap=layer.noise;
   const oldKey=layer.hooks.get(osmMgr.riverMat).cacheKey;
   let disposed=false;oldMap.addEventListener('dispose',()=>{disposed=true;});
   renderer.domElement.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
   renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
   if(rhineSceneryMode!=='detailed'||rhineUltra||oldSky.parent||!disposed||osmMgr.riverMat.customProgramCacheKey!==oldKey||
      renderer.getPixelRatio()!==1.5||!flightQuality.enabled||!rhineScenery.enabled||state!==ST.PAUSED){
     throw Error('Graphics recovery did not restore Detailed and release Ultra resources');
   }
  });
  console.log('Rhine Detailed route comparison:',JSON.stringify(coverage));
  assert.deepEqual(errors,[]);
  console.log('Rhine low pass:',JSON.stringify(proof));
 }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
