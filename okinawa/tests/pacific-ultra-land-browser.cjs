/* Build 284: Pacific Ultra step 2 (land): the real game, Sortie 3, weather broken. With Pacific scenery Ultra every lit material
 * (Okinawa, ships, carrier, aircraft) gets the sea's cloud shadows, the Okinawa terrain gets the baked relief (normals, hill shade,
 * hollow occlusion); no shader/page error; the views change visibly against the same Ultra frame without the land layer; cloud
 * strength 0 vs broken changes the island; switching to Standard restores every material. Writes app/release/pacific-ultra-land-browser.json. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Render budget WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(url.pathname.endsWith('.html')){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,res={};
 const browser=await chromium.launch({...(executable?{executablePath:executable}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote','--in-process-gpu']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660}});page.setDefaultTimeout(900000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled|ERROR:/.test(m.text()))errors.push(m.text().slice(0,600));});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(base+'/torpedo-carrier.html?v=284&campaign=1&graphics=high&scenery=ultra');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:250});
  const index=await page.evaluate(()=>MISSIONS.findIndex(m=>/Sortie 3\b/.test(m.title)));
  await page.evaluate(async i=>{renderer.setPixelRatio(1);await prepareOkinawa();await preparePacificModels(MISSIONS[i]);},index);
  res.setup=await page.evaluate(async i=>{
   startMission(i);finishCarrierIntro();hideOverlays();weather='broken';applyWeather();
   clock.getDelta=()=>1/60;state=ST.FLIGHT;P.deckRun=null;P.onDeck=false;P.spd=90;P.gear=P.gearTgt=0;
   renderPacific();const job=pacificLand.update(okinawaWorld,seaUniforms.uSunDir.value);const r=job?await job:pacificLand.stats.lastBake;
   return {bakeMs:Math.round(r.ms),shadedLand:+r.shadedLand.toFixed(3),patched:pacificLand.patchedCount,reliefOn:pacificLand.uniforms.uPacReliefOn.value,shade:seaUniforms.uCloudShade.value,
     terrainPatched:okinawaWorld.terrain.children.every(m=>m.material.userData.pacUltra?.relief===true),sun:seaUniforms.uSunDir.value.toArray().map(v=>+v.toFixed(3))};
  },index);
  const shots=await page.evaluate(()=>{
   const gl=renderer.getContext(),pics={};
   const grab=()=>{renderPacific();const W=gl.drawingBufferWidth,H=gl.drawingBufferHeight,a=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,a);
     return {W,H,data:Array.from(a.filter((_,j)=>j%4!==3&&((j>>2)%W)%4===0&&(((j>>2)/W|0)%4===0))),jpg:renderer.domElement.toDataURL('image/jpeg',.85)};};
   const c=new THREE.Vector3().applyMatrix4(okinawaWorld.root.matrixWorld);
   const views={coast:[c.x-5200,220,c.z+800,0,-.06],hills:[c.x-1500,520,c.z-2500,.6,-.32],fleet:[carrierX+260,90,-160,Math.PI*.8,-.12]};
   for(const [name,[x,y,z,h,p]] of Object.entries(views)){
    const pose=()=>{for(let k=0;k<30;k++){P.pos.set(x,y,z);P.heading=h;P.pitch=p;animateFrame();}};
    pose();pics[name+'-land']=grab();
    pacificLand.setEnabled(false);pose();pics[name+'-sea']=grab();
    pacificLand.setEnabled(true,scene);pacificLand.uniforms.uPacReliefOn.value=1;pose();
    if(name==='hills'){const s=seaUniforms.uCloudShade.value;seaUniforms.uCloudShade.value=0;pose();pics['hills-noclouds']=grab();seaUniforms.uCloudShade.value=s;}
   }
   return pics;
  });
  const diff=(a,b)=>{let n=0;for(let j=0;j<a.length;j+=3)if(Math.abs(a[j]-b[j])+Math.abs(a[j+1]-b[j+1])+Math.abs(a[j+2]-b[j+2])>24)n++;return +(n/(a.length/3)).toFixed(3);};
  res.changed={};for(const k of ['coast','hills','fleet'])res.changed[k]=diff(shots[k+'-land'].data,shots[k+'-sea'].data);
  res.clouds=diff(shots['hills-land'].data,shots['hills-noclouds'].data);
  fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});
  for(const [k,v] of Object.entries(shots))fs.writeFileSync(path.join(root,'test-visuals',`build284-pacific-${k}.jpg`),Buffer.from(v.jpg.split(',')[1],'base64'));
  // Standard: every patched material gets its own hook back.
  res.standard=await page.evaluate(()=>{setPacificScenery('standard');let left=0;scene.traverse(o=>{const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)if(m?.userData?.pacUltra)left++;});
   renderPacific();return {patched:pacificLand.patchedCount,left,terrainHook:typeof okinawaWorld.terrain.children[0].material.onBeforeCompile};});
  setPacificBack:{await page.evaluate(()=>setPacificScenery('ultra'));}
  res.errors=errors.slice();
  fs.writeFileSync(path.join(root,'app/release/pacific-ultra-land-browser.json'),JSON.stringify(res,null,1)+'\n');
  console.log('Pacific Ultra land:',JSON.stringify(res));
  assert.deepEqual(res.errors,[],'shader/page errors');
  assert.ok(res.setup.terrainPatched,'terrain has the relief variant');assert.equal(res.setup.reliefOn,1);assert.ok(res.setup.patched>20,'lit materials patched '+res.setup.patched);
  for(const [k,v] of Object.entries(res.changed))assert.ok(v>(k==='fleet'?.02:.08),'the land layer changes the '+k+' view: '+v);
  assert.ok(res.clouds>.03,'cloud shadows visible on the island: '+res.clouds);
  assert.equal(res.standard.patched,0);assert.equal(res.standard.left,0);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
