/* Build 277 (GRAPHICS-PLAN phase 0): render budget in the real games.
   Rhine Ultra High and the Pacific carrier, both at graphics=high, eight view
   directions in free flight. Budgets for High: <= 2.5 M triangles per frame
   (shadow pass included), <= 800 draw calls, <= 350 MB textures. Counts do not
   depend on the GPU; times here are software rendering and are not asserted. */
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
const BUDGET={triangles:2.5e6,calls:800,textureMB:350};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,report={};
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const open=async()=>{const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true});page.setDefaultTimeout(900000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/.test(m.text()))errors.push(m.text());});
   await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});return {page,errors};};
  // --- Rhine, Ultra High, graphics High ----------------------------------
  {
   const {page,errors}=await open();
   await page.goto(base+'/remagen-mission.html?v=283&surprises=off&scenery=ultra&graphics=high');
   await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:250});
   await page.evaluate(async()=>{await ensureModel('p47');});
   const out=await page.evaluate(()=>{
    const i=MISSIONS.findIndex(m=>m.free&&(m.ac||'p47')==='p47');
    startMission(i);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
    P.onGround=false;P.landingRoll=null;P.pos.set(12000,0,15000);P.pos.y=groundY(P.pos.x,P.pos.z)+350;P.spd=150;P.throttle=.8;P.gear=0;P.gearTgt=0;
    clock.getDelta=()=>1/60;
    if(graphicsQuality.tier!=='high'||!rhineUltra)throw Error('test link did not select Ultra/High');
    // Let terrain LOD, tree cells, near forest and relief settle at the spot.
    for(let k=0;k<240;k++){P.pos.y=groundY(P.pos.x,P.pos.z)+350;animate();}
    const views=[];
    for(let d=0;d<8;d++){
     P.heading=d*Math.PI/4;
     for(let k=0;k<20;k++){P.pos.y=groundY(P.pos.x,P.pos.z)+350;animate();}
     const info=renderer.__sceneInfo||renderer.info.render;
     views.push({heading:d*45,triangles:info.triangles,calls:info.calls});
    }
    return {views,textureMB:GraphicsQuality.textureBytes(renderer,scene)/1048576,
     shadows:renderer.shadowMap.enabled,post:!!graphicsPost?.enabled,cells:osmMgr.treeCells.length};
   });
   report.rhine=out;assert.deepEqual(errors,[]);
   assert.ok(out.shadows&&out.post,'High in Ultra uses shadows and post-processing');
   for(const v of out.views){
    assert.ok(v.triangles<=BUDGET.triangles,'Rhine heading '+v.heading+': '+v.triangles+' triangles');
    assert.ok(v.calls<=BUDGET.calls,'Rhine heading '+v.heading+': '+v.calls+' draws');
   }
   assert.ok(out.textureMB<=BUDGET.textureMB,'Rhine textures '+out.textureMB.toFixed(0)+' MB');
   console.log('Rhine',JSON.stringify(out));
   await page.close();
  }
  // --- Pacific carrier, graphics High -------------------------------------
  {
   const {page,errors}=await open();
   await page.goto(base+'/torpedo-carrier.html?v=283&campaign=1&graphics=high&scenery=ultra');
   await page.waitForFunction(()=>state===ST.MENU,null,{polling:250});
   const index=await page.evaluate(()=>MISSIONS.findIndex(m=>/Sortie 3\b/.test(m.title)));
   await page.evaluate(async i=>{renderer.setPixelRatio(1);await prepareOkinawa();await preparePacificModels(MISSIONS[i]);},index);
   const out=await page.evaluate(i=>{
    startMission(i);finishCarrierIntro();hideOverlays();
    clock.getDelta=()=>1/60;state=ST.FLIGHT;P.deckRun=null;P.onDeck=false;P.pos.set(carrierX+3000,320,0);P.spd=90;P.gear=P.gearTgt=0;
    const views=[],sweep=(where,y)=>{for(let d=0;d<8;d++){P.heading=d*Math.PI/4;for(let k=0;k<20;k++){P.pos.y=y;animateFrame();}
     const info=renderer.__sceneInfo||renderer.info.render;views.push({where,heading:d*45,triangles:info.triangles,calls:info.calls});}};
    sweep('fleet',320);
    // Worst case: over Okinawa's west coast, looking across the whole wooded island.
    const centre=new THREE.Vector3().applyMatrix4(okinawaWorld.root.matrixWorld);P.pos.set(centre.x-3500,450,centre.z);sweep('island',450);
    return {views,textureMB:GraphicsQuality.textureBytes(renderer,scene)/1048576,shadows:renderer.shadowMap.enabled,tier:graphicsQuality.tier};
   },index);
   report.pacific=out;assert.deepEqual(errors,[]);
   assert.equal(out.tier,'high');
   for(const v of out.views){
    assert.ok(v.triangles<=BUDGET.triangles,'Pacific '+v.where+' heading '+v.heading+': '+v.triangles+' triangles');
    assert.ok(v.calls<=BUDGET.calls,'Pacific '+v.where+' heading '+v.heading+': '+v.calls+' draws');
   }
   assert.ok(out.textureMB<=BUDGET.textureMB,'Pacific textures '+out.textureMB.toFixed(0)+' MB');
   await page.close();
  }
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});
  fs.writeFileSync(path.join(root,'app/release/render-budget-browser.json'),JSON.stringify({budget:BUDGET,...report},null,1)+'\n');
  const sum=r=>r.views.map(v=>(v.triangles/1e6).toFixed(2)+'M/'+v.calls).join(' ');
  console.log('render budget OK · Rhine',sum(report.rhine),Math.round(report.rhine.textureMB)+' MB · Pacific',sum(report.pacific),Math.round(report.pacific.textureMB)+' MB');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
