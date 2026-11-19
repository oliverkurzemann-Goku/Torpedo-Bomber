/* Build 283: Pacific Ultra scenery. The real game, the same three views (fleet, into the sun, Okinawa's west coast, weather 'broken')
 * with Pacific scenery Standard and Ultra: no shader or page error, the standard path keeps its Build 282 shaders (no ULTRA define,
 * 170-row sea), Ultra switches sea and sky shaders, the tiled 320-row sea, the wave map, the post pass and weather-driven cloud shadows,
 * and visibly changes each picture. Writes app/release/pacific-ultra-browser.json and test-visuals/build283-pacific-*.jpg. */
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
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660}});page.setDefaultTimeout(900000);
  let errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled|ERROR:/.test(m.text()))errors.push(m.text().slice(0,400));});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  const pixels={};
  for(const mode of ['standard','ultra']){
   errors=[];
   await page.goto(base+'/torpedo-carrier.html?v=293&campaign=1&graphics=high&scenery='+mode);
   await page.waitForFunction(()=>state===ST.MENU,null,{polling:250});
   const index=await page.evaluate(()=>MISSIONS.findIndex(m=>/Sortie 3\b/.test(m.title)));
   await page.evaluate(async i=>{
    renderer.setPixelRatio(1);
    if(pacificUltra){
     await launchCampaignMission(i);
     if(state!==ST.BRIEF||!pacificLand.uniforms.uPacReliefOn.value)throw Error('Ultra briefing did not prepare the scenery');
    }else{await prepareOkinawa();await preparePacificModels(MISSIONS[i]);}
   },index);
   const out=await page.evaluate(i=>{
    if(state===ST.MENU)startMission(i);
    finishCarrierIntro();hideOverlays();weather='broken';applyWeather();
    clock.getDelta=()=>1/60;state=ST.FLIGHT;P.deckRun=null;P.onDeck=false;P.spd=90;P.gear=P.gearTgt=0;
    const pics={},gl=renderer.getContext(),seaDraws={};
    const countCells=()=>{
     const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4()
      .multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
     return seaUltraGrid.children.filter(cell=>frustum.intersectsObject(cell)).length;
    };
    const view=(name,x,y,z,heading,pitch)=>{for(let k=0;k<30;k++){P.pos.set(x,y,z);P.heading=heading;P.pitch=pitch;animateFrame();}
     renderPacific();const W=gl.drawingBufferWidth,H=gl.drawingBufferHeight,a=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,a);
     pics[name]={W,H,data:Array.from(a.filter((_,j)=>j%4!==3&&((j>>2)%W)%4===0&&(((j>>2)/W|0)%4===0)))};
     if(pacificUltra)seaDraws[name]=countCells();
     pics[name].jpg=renderer.domElement.toDataURL('image/jpeg',.85);};
    view('fleet',carrierX+600,120,-300,Math.PI*.75,-.05);
    view('sunward',carrierX+2000,60,0,Math.atan2(420,-600),0);
    const c=new THREE.Vector3().applyMatrix4(okinawaWorld.root.matrixWorld);
    view('coast',c.x-5200,220,c.z+800,0,-.06);
    const shade=seaUniforms.uCloudShade.value;
    let finish=null;
    if(pacificUltra){
     timeMode='dusk';weather='storm';applyWeather();
     P.pos.set(carrierX-150,43,-62);updateSea(clock.elapsedTime);
     camera.position.set(carrierX-150,43,-62);camera.lookAt(carrierX-20,17,0);
     placePacificShadow(1/60);updateRain(1/60);
     spawnSplash(carrierX-20,-32,true);
     pacificLightning=.8;
     renderPacific();
     finish={lamps:ultraDeckLights.lights.visible,particles:ultraSpray.mesh.geometry.drawRange.count,
      flash:seaUniforms.uStormFlash.value,wetness:pacificLand.uniforms.uPacWet.value,
      gardens:okinawaWorld.kitchenGardens.reduce((n,m)=>n+m.count,0)};
     pics.deck={jpg:renderer.domElement.toDataURL('image/jpeg',.85)};
     graphicsQuality.setFrameMode('hold60',false);
     const ratio=graphicsQuality.pixelRatio(2),tier=graphicsQuality.tier;
     for(let i=0;i<1000;i++)graphicsQuality.sample(.045,true);
     if(graphicsQuality.pixelRatio(2)!==ratio||graphicsQuality.tier!==tier)throw Error('Ultra switched quality under load');
    }
    return {pics,ultra:pacificUltra,define:Object.prototype.hasOwnProperty.call(sea.material.defines||{},'ULTRA'),sky:Object.prototype.hasOwnProperty.call(skyMat.defines||{},'ULTRA'),
      rows:pacificUltra?seaUltraGrid.children[0].geometry.parameters.widthSegments*Math.sqrt(seaUltraGrid.children.length):seaGeo.parameters.widthSegments,
      post:graphicsPost.enabled,shade,waveTex:!!seaUniforms.uWaveTex.value,seaDraws,finish,
      menu:document.getElementById('pacificSceneryMenu').value,gl:gl.getError()};
   },index);
   pixels[mode]=out.pics;delete out.pics;res[mode]={...out,errors:errors.slice()};
  }
  // the same views: how much of the picture the Ultra sea and sky change
  res.changed={};
  for(const k of Object.keys(pixels.standard)){const a=pixels.standard[k].data,b=pixels.ultra[k].data;let n=0;for(let j=0;j<a.length;j+=3)if(Math.abs(a[j]-b[j])+Math.abs(a[j+1]-b[j+1])+Math.abs(a[j+2]-b[j+2])>24)n++;res.changed[k]=+(n/(a.length/3)).toFixed(3);}
  fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});
  for(const mode of ['standard','ultra'])for(const [k,v] of Object.entries(pixels[mode]))fs.writeFileSync(path.join(root,'test-visuals',`build287-pacific-${mode}-${k}.jpg`),Buffer.from(v.jpg.split(',')[1],'base64'));
  fs.writeFileSync(path.join(root,'app/release/pacific-ultra-browser.json'),JSON.stringify(res,null,1)+'\n');
  for(const mode of ['standard','ultra'])assert.deepEqual(res[mode].errors,[],mode+' shader/page errors');
  assert.equal(res.standard.define,false);assert.equal(res.standard.sky,false);assert.equal(res.standard.rows,170,'standard sea mesh as before');
  assert.equal(res.ultra.ultra,true);assert.equal(res.ultra.define,true);assert.equal(res.ultra.sky,true);assert.equal(res.ultra.rows,320);assert.equal(res.ultra.waveTex,true);
  assert.equal(res.ultra.post,true,'Ultra draws through the multisampled post pass');assert.equal(res.ultra.menu,'ultra');
  assert.ok(res.ultra.shade>.3&&res.ultra.shade<.7,'cloud shadows under broken cloud: '+res.ultra.shade);
  assert(Object.values(res.ultra.seaDraws).every(n=>n>0&&n<16),'sea cells outside each view are skipped');
  const finish=res.ultra.finish;
  assert(finish.lamps&&finish.particles>0&&finish.particles<=256&&finish.flash>.5&&finish.wetness>.5&&finish.gardens>20,JSON.stringify(finish));
  for(const [k,v] of Object.entries(res.changed))assert.ok(v>.15,'Ultra visibly changes the '+k+' view: '+v);
  console.log('Pacific Ultra WebGL: OK',JSON.stringify(res));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
