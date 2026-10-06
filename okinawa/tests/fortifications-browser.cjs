/* Uploaded forts in both real game worlds, airport exclusions and terrain LOD.
 * Local Chrome can be selected with GAME_TEST_CHROME; required in CI. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Fortification WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=174');
  await page.waitForFunction(()=>typeof realWorldReady!=='undefined'&&realWorldReady&&state===ST.MENU,null,{polling:200});
  await page.evaluate(()=>{renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});
  const europe=await page.evaluate(()=>{
   const entries=periodBuildings.entries.filter(e=>e.model&&['bunker','observation-post'].includes(e.kind));
   if(entries.filter(e=>e.kind==='bunker').length!==2||entries.filter(e=>e.kind==='observation-post').length<4)throw Error('Missing uploaded European forts');
   for(const e of entries)for(const b of [...periodBuildings.exclusions,...terrain.airfieldGroundRegions])if(e.x+e.w/2>b.minX&&e.x-e.w/2<b.maxX&&e.z+e.d/2>b.minZ&&e.z-e.d/2<b.maxZ)throw Error('Fort intersects airport structures, aircraft apron or taxiway');
   const vertex=new THREE.Vector3(),matrix=new THREE.Matrix4(),position=new THREE.Vector3();
   for(const e of entries){
    for(const delta of [0,4500,0]){
     for(let i=0;i<24;i++)terrain.updateLOD(e.x+delta,e.z+delta,.25);
     periodBuildings.update(e.x,e.z);scene.updateMatrixWorld(true);
     if(!e.model.visible||!e.group.visible||e.proxy.visible)throw Error('Near fort hidden');
     let minimum=Infinity;e.model.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)minimum=Math.min(minimum,vertex.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).y);}});
     if(Math.abs(minimum-e.group.position.y)>.002)throw Error('Exporter transform changed foundation');
     const c=Math.cos(e.yaw),s=Math.sin(e.yaw);let ground=-Infinity;
     for(const [x,z] of [[0,0],[-e.w/2,-e.d/2],[e.w/2,-e.d/2],[-e.w/2,e.d/2],[e.w/2,e.d/2]])ground=Math.max(ground,terrain.getRenderedHeight(e.x+x*c+z*s,e.z-x*s+z*c));
     if(Math.abs(minimum-ground-.03)>.002)throw Error('Fort buried or floating after LOD');
    }
    for(const tile of osmMgr.tiles.values())tile?.farGroup?.traverse(mesh=>{
     if(!mesh.isInstancedMesh||!mesh.name.startsWith('osmForest'))return;
     for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
      const radius=Math.hypot(e.w,e.d)/2+12+(mesh.userData.canopyRadii?.[i]||0);
      if(Math.hypot(position.x-e.x,position.z-e.z)<radius&&matrix.elements[0]!==0)throw Error('Tree intersects fortification');
     }
    });
    if(entries.filter(p=>p.kind==='bunker'&&p.model.visible).length>1||entries.filter(p=>p.kind==='observation-post'&&p.model.visible).length>2)throw Error('Detail budget exceeded');
   }
   return entries.map(e=>({kind:e.kind,x:e.x,z:e.z,y:e.group.position.y}));
  });console.log('European forts: actual vertices on rendered ground over LOD switches, tree clearance and detail limits:',europe);
  for(const kind of ['bunker','observation-post']){
   const png=await page.evaluate(kind=>{const e=periodBuildings.entries.find(e=>e.kind===kind&&e.model);periodBuildings.update(e.x,e.z);camera.position.set(e.x+13,e.group.position.y+7,e.z+15);camera.lookAt(e.x,e.group.position.y+1.1,e.z);camera.near=.2;camera.updateProjectionMatrix();renderer.setPixelRatio(.9);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');},kind);
   fs.writeFileSync(path.join(out,'build174-europe-'+kind+'.png'),Buffer.from(png.split(',')[1],'base64'));
  }
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=174');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:200});
  const idx=await page.evaluate(()=>MISSIONS.findIndex(m=>m.corsair&&!m.shoreStrike));
  await page.locator('#missionSel .chip').nth(idx).click();await page.locator('#startBtn').click();await page.locator('#launchBtn').click();
  await page.waitForFunction(()=>carrierAircraftReady()&&carrierIntro,null,{polling:200});
  const pacific=await page.evaluate(()=>{const w=okinawaWorld;if(w.fortifications.length!==4)throw Error('Missing coastal forts');
   for(const e of w.fortifications){w.updateFortifications(e.x,e.z);if(!e.model.visible)throw Error('Near coastal fort missing');if(w.biome(e.x,e.z)[2]>.2)throw Error('Fort on runway');}
   return w.fortifications.map(e=>({kind:e.kind,x:e.x,z:e.z,y:e.y}));
  });console.log('Pacific real coastal fortifications:',pacific);
  for(const kind of ['bunker','observation-post']){
   const png=await page.evaluate(kind=>{const e=okinawaWorld.fortifications.find(e=>e.kind===kind);okinawaWorld.updateFortifications(e.x,e.z);camera.position.set(10000+e.x+13,e.y+7,e.z+15);camera.lookAt(10000+e.x,e.y+1.1,e.z);camera.near=.2;camera.updateProjectionMatrix();renderer.setPixelRatio(.9);renderer.shadowMap.enabled=false;renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');},kind);
   fs.writeFileSync(path.join(out,'build174-okinawa-'+kind+'.png'),Buffer.from(png.split(',')[1],'base64'));
  }
  assert.deepEqual(errors,[]);console.log('Build 174 fortification WebGL: passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
