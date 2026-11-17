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
  const url='http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=285';
  // Build 277: Ultra's pixel ratio follows the graphics level (Auto on touch starts at Medium = 1.5).
  await page.goto(url+'&scenery=ultra&perf=1&graphics=high');
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
  const levelViews=await page.evaluate(async()=>{
   // Build 277: the Ultra loop below waits for worker masks; optional vehicle models
   // must not finish loading during that wait, or they count as Ultra's cost.
   const fallback=()=>{let n=0;scene.traverse(o=>{if(/-fallback$/.test(o.name)&&o.visible)n++;});return n;};
   for(let t=0;fallback()&&t<900;t++)await new Promise(r=>setTimeout(r,100));
   const pairs=[['river',13890,16260,13630,15040,'clear'],
    ['woodland',15120,14250,16160,13920,'broken'],
    ['settlement',22680,24630,22865,24116,'clear']];
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
     // Build 277: High turns the shadow pass on with Ultra; render-budget-browser counts it.
     // This comparison measures the Ultra scenery itself, so the shadow pass stays off.
     renderer.shadowMap.enabled=false;
     if(mode!=='classic')for(let i=0;i<85;i++){
      rhineScenery.update(.04,x,z,y,mode==='ultra'?0:1,mode==='ultra');
      rhineUltra?.update(.04,x,z);
      // Build 277: Ultra draws its land masks in a worker; let the answer arrive
      // as it would between real frames (at most 20 s per mask here).
      for(let t=0;rhineUltra?.maskJob&&!rhineUltra.maskJob.steps&&t<1000;t++)await new Promise(r=>setTimeout(r,20));
     }
     renderer.setPixelRatio(.65); // Same render resolution isolates the visual differences.
     renderer.render(scene,lens);
     const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height;
     const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
     let difference=0,lotPixels=0;
     if(mode==='detailed')detailedPixels=pixels;
     if(mode==='ultra'){
      for(let i=0;i<pixels.length;i+=4)if([0,1,2].some(c=>Math.abs(detailedPixels[i+c]-pixels[i+c])>12))difference++;
     }
     const lots=rhineScenery.sites.filter(s=>s.ultra&&s.mesh?.visible);
     const view={name,mode,png:renderer.domElement.toDataURL(),triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,
      changed:+(100*difference/(w*h)).toFixed(2),masks:rhineUltra?[...rhineUltra.maps.values()].filter(r=>r.texture).length:0,
      lots:lots.reduce((count,site)=>count+site.plots.length,0),sh:renderer.shadowMap.enabled,names:(()=>{lens.updateMatrixWorld();const fr=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(lens.projectionMatrix,lens.matrixWorldInverse)),m={};const vis=o=>{let p=o;while(p){if(!p.visible)return false;p=p.parent;}return true;};scene.traverse(o=>{if(!(o.isMesh||o.isPoints||o.isLine)||!vis(o))return;if(o.frustumCulled){if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();if(!fr.intersectsSphere(o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld)))return;}const k=o.name||o.parent?.name||o.type;m[k]=(m[k]||0)+(Array.isArray(o.material)?o.material.length:1);});return m;})(),young:(()=>{let n=0;scene.traverse(o=>{if(o.name==='nearForestYoungTrees'&&o.visible&&o.parent?.visible)n++;});return n;})(),roofTrim:rhineUltra?.roofTrim.count||0};
     if(name==='settlement'&&mode==='ultra'){
      for(const lot of lots)lot.mesh.visible=false;
      renderer.render(scene,lens);
      const bare=new Uint8Array(w*h*4);
      gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bare);
      for(let i=0;i<pixels.length;i+=4)if([0,1,2].some(c=>Math.abs(bare[i+c]-pixels[i+c])>10))lotPixels++;
      for(const lot of lots)lot.mesh.visible=true;
     }
     views.push({...view,lotPixels});
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
   assert.equal(detailed.lots,0,'Detailed must exclude Ultra properties');
   assert(ultra.lots>0,'Ultra properties must cover this route: '+JSON.stringify(ultra));
   if(ultra.name==='settlement')assert(ultra.lots>=15&&ultra.lotPixels>=100,JSON.stringify(ultra));
   assert(ultra.calls-detailed.calls<40&&ultra.triangles-detailed.triangles<90000,JSON.stringify(Object.entries(ultra.names).map(([k,v])=>[k,v-(detailed.names[k]||0)]).filter(e=>e[1]).concat(Object.keys(detailed.names).filter(k=>!(k in ultra.names)).map(k=>[k,-detailed.names[k]]))));
   assert(ultra.roofTrim>0&&ultra.roofTrim<=576&&detailed.roofTrim===0);
  }
  console.log('Rhine level camera:',JSON.stringify(levelViews));
  const detail=await page.evaluate(()=>{
   const x=22830,z=24295,level=groundY(x,z)+95;
   const leadX=22865,leadZ=24015;
   const lens=new THREE.PerspectiveCamera(59,1024/768,1,10000);
   lens.position.set(x,level,z);lens.lookAt(leadX,groundY(leadX,leadZ)+20,leadZ);
   updateContentVisibility(x,z);
   const styles=new Set();
   let roadVertices=0;
   for(const mesh of osmMgr.surfaceMeshes){
    if(mesh.material!==osmMgr.roadMat&&mesh.material!==osmMgr.railMat)continue;
    const profile=mesh.geometry.attributes.roadProfile;
    if(!profile||profile.count!==mesh.geometry.attributes.position.count||!profile.normalized)
      throw Error('Draped road lost its surface attributes');
    const array=profile.array;
    for(let i=1;i<array.length;i+=2)styles.add(array[i]);
    roadVertices+=profile.count;
   }
   const captures={};
   for(const mode of ['detailed','ultra']){
    configureRhineScenery(mode);
    for(let i=0;i<85;i++){
     rhineScenery.update(.04,x,z,level,0,mode==='ultra');
     rhineUltra?.update(.04,x,z,level);
    }
    renderer.setPixelRatio(.80);
    renderer.render(scene,lens);
    captures[mode]=renderer.domElement.toDataURL();
   }
   return {captures,roadVertices,styles:[...styles],roofTrim:rhineUltra.roofTrim.count};
  });
  for(const [mode,png] of Object.entries(detail.captures))
    fs.writeFileSync(path.join(out,'rhine-close-details-'+mode+'.png'),Buffer.from(png.split(',')[1],'base64'));
  delete detail.captures;
  assert([64,128,191,255].every(style=>detail.styles.includes(style)),JSON.stringify(detail));
  assert(detail.roadVertices>5000&&detail.roofTrim>=24&&detail.roofTrim<=576,JSON.stringify(detail));
  console.log('Rhine surface detail:',JSON.stringify(detail));
  const wildlife=await page.evaluate(()=>{
   configureRhineScenery('detailed');
   rhineScenery.clearUltraFlocks();
   configureRhineScenery('ultra');
   const life=rhineUltra.riverLife,route=life.route;
   const focus=livingWorld._sample(route,route.length*.43),x=focus.x,z=focus.z,alt=groundY(x,z)+185;
   const boats=life.boats,steam=[];
   const tick=()=>{
    rhineScenery.update(.04,x,z,alt,0,true);
    rhineUltra.update(.04,x,z,alt,(...p)=>steam.push(p));
    shipWakes.update(.04);
   };
   for(let i=0;i<12;i++)tick();
   const tug=boats.find(b=>b.type===0);
   if(!tug.mesh.visible)throw Error('Tug missing from its river lane');
   const start=tug.mesh.position.clone();
   const flock=rhineScenery.ultraFlocks.find(f=>f.river&&f.mesh.visible);
   if(!flock)throw Error('Missing river birds at 600 ft AGL');
   const birdStart=flock.mesh.geometry.attributes.position.array.slice(0,3);
   for(let i=0;i<75;i++)tick();
   const moved=start.distanceTo(tug.mesh.position),wake=shipWakes.tracks.get(tug);
   const birdsMoved=flock.mesh.geometry.attributes.position.array.slice(0,3).some((value,i)=>value!==birdStart[i]);
   const shoreTriangles=life.shore.geometry.drawRange.count/3;
   // Build 278: 96 nearest sites (was 48), fading out towards the last one.
   if(shoreTriangles<30||shoreTriangles>1152)throw Error('Rhine shoals exceed the shoreline geometry budget');
   const shoalReach=life.bankReach.value,shoalFocus=life.bankFocus.value;
   const farthest=Math.max(...life.shoreSites.map(s=>Math.hypot(s.x-shoalFocus.x,s.z-shoalFocus.y)));
   if(!(shoalReach>300&&shoalReach<=1950&&farthest<=shoalReach+60))throw Error('Shoals must fade out before the cut of the nearest-site list: '+shoalReach+' / '+farthest);
   const camera=new THREE.PerspectiveCamera(58,1024/768,1,7500);
   camera.position.set(start.x-170,start.y+108,start.z+85);
   camera.lookAt(tug.mesh.position);
   const pos=shipWakes.mesh.geometry.attributes.position;
   let wakeAboveWater=false;
   for(let i=0;i<shipWakes.stats.vertices;i++){
    if(pos.getY(i)>groundY(pos.getX(i),pos.getZ(i))+.91){wakeAboveWater=true;break;}
   }
   renderer.setPixelRatio(.65);
   renderer.render(scene,camera);
   const png=renderer.domElement.toDataURL();
   // Aim a second camera directly across a mapped shore. A view centred on
   // the tug can contain only open water on this wide stretch of the river.
   const bank=life.shoreSites
    .filter(site=>Math.hypot(site.x-x,site.z-z)<750)
    .sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
   if(!bank)throw Error('No bank near the test stretch');
   const bankY=groundY(bank.x,bank.z);
   camera.position.set(bank.x-bank.nx*75,bankY+82,bank.z-bank.nz*75);
   camera.lookAt(bank.x,bankY,bank.z);
   renderer.render(scene,camera);
   const shorePng=renderer.domElement.toDataURL();
   const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height;
   const shore=new Uint8Array(w*h*4),without=new Uint8Array(w*h*4);
   gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,shore);
   life.shore.visible=false;
   renderer.render(scene,camera);
   gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,without);
   life.shore.visible=true;
   let shorePixels=0;
   for(let i=0;i<shore.length;i+=4)if(Math.abs(shore[i]-without[i])>8)shorePixels++;
   return {moved,birdsMoved,reeds:life.reeds.count,visibleBoats:boats.filter(b=>b.mesh.visible).length,
    steam:steam.length,wakePoints:wake?.points.length,wakeAboveWater,shoreTriangles,shoalReach:Math.round(shoalReach),shorePixels,png,shorePng};
  });
  fs.writeFileSync(path.join(out,'rhine-river-life-ultra.png'),Buffer.from(wildlife.png.split(',')[1],'base64'));
  fs.writeFileSync(path.join(out,'rhine-shore-ultra.png'),Buffer.from(wildlife.shorePng.split(',')[1],'base64'));
  delete wildlife.png;
  delete wildlife.shorePng;
  assert.deepEqual(errors,[]);
  assert(wildlife.moved>8&&wildlife.reeds>18&&wildlife.reeds<=144&&wildlife.visibleBoats>=2&&
    wildlife.steam>0&&wildlife.wakePoints>2&&wildlife.wakeAboveWater&&wildlife.birdsMoved&&wildlife.shorePixels>80,
    JSON.stringify(wildlife));
  console.log('Rhine river life:',JSON.stringify(wildlife));
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
  assert.match(await page.locator('#rhinePerfHud').textContent(),/Ultra High · High · 1 FPS · P95 780\.0 ms\n.* M tris · .* draws · \d+ MB tex · 0\.44×/);
  await page.locator('#pauseBtn').click();
  assert.equal(await page.locator('#rhinePerfHud').isHidden(),true);
  await page.evaluate(()=>{
   const layer=rhineUltra,oldSky=layer.sky,oldMap=layer.noise,riverLife=layer.riverLife;
   const oldKey=layer.hooks.get(osmMgr.riverMat).cacheKey;
   let disposed=false;oldMap.addEventListener('dispose',()=>{disposed=true;});
   renderer.domElement.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
   renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
   if(rhineSceneryMode!=='detailed'||rhineUltra||oldSky.parent||riverLife.group.parent||layer.roofTrim.parent||
      riverLife.boats.some(boat=>shipWakes.tracks.has(boat))||!disposed||osmMgr.riverMat.customProgramCacheKey!==oldKey||
      renderer.getPixelRatio()!==1.5||!flightQuality.enabled||!rhineScenery.enabled||state!==ST.PAUSED){
     throw Error('Graphics recovery did not restore Detailed and release Ultra resources');
   }
  });
  console.log('Rhine Detailed route comparison:',JSON.stringify(coverage));
  assert.deepEqual(errors,[]);
  console.log('Rhine low pass:',JSON.stringify(proof));
 }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
