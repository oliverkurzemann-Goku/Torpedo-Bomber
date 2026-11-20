/* Build 292: the Pacific sea had holes (iPad photo, Build 291: pale patches in the water off Okinawa). The beach discard in
 * the sea shader held the sea bed at -1 m everywhere offshore, so every wave trough below -0.88 m was cut out of the sea and
 * the sea bed showed through. Real game, Sortie 3, the camera 220 m up looking east at the Okinawa coast: with the terrain
 * hidden and a magenta background, every magenta pixel under the horizon is a hole in the sea. Calm (sea state 1) and storm
 * (2.1). Writes app/release/sea-holes-browser.json and test-visuals/build292-sea-holes-*.jpg. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Sea holes WebGL: skipped locally (no Chrome).');process.exit(0);}
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
 const base='http://127.0.0.1:'+server.address().port,out={};
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  for(const scenery of (process.env.ONLY?[process.env.ONLY]:['ultra','standard'])){
   const page=await browser.newPage({viewport:{width:1000,height:700}});page.setDefaultTimeout(900000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled|ERROR:/.test(m.text()))errors.push(m.text().slice(0,400));});
   await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
   await page.goto(base+'/torpedo-carrier.html?v=294&campaign=1&graphics=high&scenery='+scenery);
   await page.waitForFunction(()=>state===ST.MENU,null,{polling:250});
   const index=await page.evaluate(()=>MISSIONS.findIndex(m=>/Sortie 3\b/.test(m.title)));
   await page.evaluate(async i=>{await prepareOkinawa();await preparePacificModels(MISSIONS[i]);},index);
   out[scenery]=await page.evaluate(async i=>{
    startMission(i);finishCarrierIntro();hideOverlays();weather='clear';applyWeather();
    clock.getDelta=()=>1/60;state=ST.FLIGHT;P.deckRun=null;P.onDeck=false;P.spd=66;P.gear=P.gearTgt=0;
    const set=()=>{P.pos.set(4000,221,-700);P.heading=(90-107)*Math.PI/180;P.pitch=.02;P.roll=0;};
    for(let k=0;k<30;k++){set();animateFrame();}
    const r={coastActive:seaUniforms.uCoastActive.value};
    const shot=()=>{set();renderPacific();return renderer.domElement.toDataURL('image/jpeg',.85);};
    const holes=()=>{
     // hide everything but the sea, clear to magenta, render the plain scene (no post pass)
     const hidden=[];scene.traverse(o=>{if((o.isMesh||o.isPoints||o.isSprite||o.isLine)&&o.visible&&o.material!==sea.material){hidden.push(o);o.visible=false;}});
     const bg=scene.background,fog=scene.fog;scene.background=new THREE.Color(1,0,1);
     set();renderer.setRenderTarget(null);renderer.render(scene,camera);
     const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
     const img=renderer.domElement.toDataURL('image/jpeg',.8);scene.background=bg;for(const o of hidden)o.visible=true;holes.last=img;
     // rows below the horizon line (lower 30 % of the frame; the coast starts at about 38 %), readPixels is bottom-up
     let n=0,t=0;for(let y=0;y<Math.floor(h*.3);y++)for(let x=0;x<w;x++){const k=(y*w+x)*4;t++;if(px[k]>200&&px[k+1]<60&&px[k+2]>200)n++;}
     return n/t;
    };
    seaUniforms.uSeaState.value=1;r.calm=holes();r.calmHoles=holes.last;r.calmImage=shot();
    seaUniforms.uSeaState.value=2.1;for(const t of [0,3.7,8.1])r['storm'+t]=(seaUniforms.uTime.value=t,holes());r.stormImage=shot();
    return r;
   },index);
   out[scenery].errors=errors;await page.close();
  }
 }finally{await browser.close();server.close();}
 const dir=path.join(root,'test-visuals');fs.mkdirSync(dir,{recursive:true});
 for(const s of Object.keys(out))for(const k of ['calm','storm','calmHoles']){const u=out[s][k==='calmHoles'?k:k+'Image'];if(!u)continue;fs.writeFileSync(path.join(dir,'build292-sea-holes-'+s+'-'+k+'.jpg'),Buffer.from(u.split(',')[1],'base64'));delete out[s][k==='calmHoles'?k:k+'Image'];}
 fs.writeFileSync(path.join(root,'app/release/sea-holes-browser.json'),JSON.stringify(out,null,1)+'\n');
 console.log(JSON.stringify(out));
 for(const s of ['ultra','standard']){const r=out[s];
  assert.deepEqual(r.errors,[],s+': no shader or page errors');assert.equal(r.coastActive,1,s+': coast mask active');
  assert.ok(r.calm<.0005,s+': calm sea without holes ('+r.calm+')');
  for(const t of [0,3.7,8.1])assert.ok(r['storm'+t]<.002,s+': storm sea without holes offshore ('+r['storm'+t]+')');}
 console.log('Sea holes WebGL: ok');
})().catch(e=>{console.error(e);process.exit(1);});
