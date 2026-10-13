/* Real selected models + actual game functions. No simplified substitute simulation. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Carrier recovery WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660}}),errors=[];page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=195');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  const proof=await page.evaluate(()=>{
   renderer.setPixelRatio(.7);renderer.shadowMap.enabled=false;
   const key='3,3',tx=3,tz=3,ox=tx*RTILE,oz=tz*RTILE,data=osmMgr.sourceTiles.get(key),tile=terrain.tiles.get(key);
   const studio=new THREE.Scene();studio.background=new THREE.Color(0xb8c8cf);
   for(const light of scene.children.filter(o=>o.isLight))studio.add(light.clone());
   const ground=new THREE.Mesh(tile.mesh.geometry,tile.mesh.material);ground.position.copy(tile.mesh.position);studio.add(ground);
   const cam=new THREE.PerspectiveCamera(50,1194/660,1,13000),y=groundY(14000,14300);
   cam.position.set(13700,y+1450,11200);cam.lookAt(14000,y,14700);
   const exclusion=osmMgr._buildForestExclusion(data,ox,oz),gl=renderer.getContext(),width=renderer.domElement.width,height=renderer.domElement.height;
   let group=null;
   const render=soft=>{
    if(group){studio.remove(group);for(const m of group.children)if(m.geometry.attributes.canopyGround)m.geometry.dispose();}
    group=new THREE.Group();const count=osmMgr._buildForests(group,data.forests,ox,oz,exclusion,soft);
    for(const m of group.children)m.frustumCulled=false;studio.add(group);
    terrain.setLandcover(tx,tz,data,soft);ground.material=tile.mesh.material;
    studio.updateMatrixWorld(true);for(let i=0;i<3;i++)renderer.render(studio,cam);
    const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return {count,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,pixels,png:renderer.domElement.toDataURL()};
   };
   const before=render(false),after=render(true);let changed=0;
   for(let i=0;i<before.pixels.length;i+=4)if(Math.max(Math.abs(before.pixels[i]-after.pixels[i]),Math.abs(before.pixels[i+1]-after.pixels[i+1]),Math.abs(before.pixels[i+2]-after.pixels[i+2]))>4)changed++;
   delete before.pixels;delete after.pixels;
   if(after.calls>before.calls||after.triangles>before.triangles||after.textures>before.textures||after.count>before.count||changed<500)throw Error('Forest edge changes exceed rendering budget or are invisible '+JSON.stringify({before:{...before,png:null},after:{...after,png:null},changed}));
   // Same-size texture, curved visible transition, and no erased seams in a full forest tile.
   const ring=[[800,0],[3200,0],[3200,4000],[800,4000],[800,0]];
   const canvas=makeTerrainLandcover(3,3,4000,{forests:[ring]}),image=canvas.getContext('2d').getImageData(0,0,128,128).data,edges=[];
   for(let z=10;z<118;z++){let x=0;while(x<128&&image[(z*128+x)*4+3]<220)x++;edges.push(x);}
   if(Math.max(...edges)-Math.min(...edges)<1)throw Error('Straight forest border remains rigid');
   const full=makeTerrainLandcover(3,3,4000,{forests:[[[0,0],[4000,0],[4000,4000],[0,4000],[0,0]]]}).getContext('2d').getImageData(0,0,128,128).data;
   if([...full].some((v,i)=>i%4===3&&v<220))throw Error('Tile-edge forest seam opened');
   return {before,after,changed,edgeRange:[Math.min(...edges),Math.max(...edges)]};
  });
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  for(const name of ['before','after']){fs.writeFileSync(path.join(out,'build195-woodland-'+name+'.png'),Buffer.from(proof[name].png.split(',')[1],'base64'));delete proof[name].png;}
  console.log('Actual Rhine forest edges and rendering budgets:',proof);
  // The same original merchant vessel is solid in the Rhine flight pipeline.
  const ferry=await page.evaluate(async()=>{
   await ensureModel('p47');await worldVehicles.load();livingWorld.installVehicleModels(worldVehicles.templates);
   startMission(MISSIONS.findIndex(m=>m.ac==='p47'&&m.free));finishLaunchIntro(false);state=ST.FLIGHT;show('menu',false);show('brief',false);
   const e=livingWorld.entities.find(e=>e.kind==='ferry');e.model.visible=e.visual.visible=true;e.alive=true;
   const centre=e.model.position.clone();P.alive=true;P.onGround=false;P.gear=P.gearTgt=0;P.flap=P.flapTgt=0;P.heading=Math.PI/2;P.pitch=P.roll=0;P.spd=180;P.throttle=1;P.departureAge=null;P.pos.copy(centre).add(new THREE.Vector3(-25,2,0));
   posePlayerAircraft(0);for(let i=0;i<50&&P.alive;i++)updateFlight(1/20);
   if(P.alive||riverShipContact.stats.triangleTests===0)throw Error('Actual Rhine flight ignores vessel skin');
   return {alive:P.alive,collision:riverShipContact.stats.lastHit};
  });console.log('Rhine original vessel / real P47 collision:',ferry);
  assert.deepEqual(errors,[]);console.log('Woodland silhouette, visible mask, tile continuity, no added GPU budget and Rhine vessel contact passed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

