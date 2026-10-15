/* Exact supplied source + actual game loader, textured render and mechanical proof. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),requirements=require('../../app/model-candidates/requirements.json');
const candidate=requirements.aircraft.bf109,bytes=fs.readFileSync(path.join(root,candidate.candidateFile));
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),candidate.sha256);
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
assert.equal(json.asset.extras.source,candidate.source);assert.match(json.asset.extras.license,/CC-BY-4\.0/);
assert.equal(requirements.aircraft.p47.requiredCanopy,'bubble');assert.equal(requirements.aircraft.p47.excludedCanopy,'razorback');
assert(requirements.aircraft.p47.preserveCurrentUntilQualified&&!requirements.aircraft.p47.releaseApproved&&!candidate.releaseApproved);
assert(!fs.readFileSync(path.join(root,'scripts/build-app.mjs'),'utf8').includes('app/model-candidates'));
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Replacement source checks passed; WebGL proof skipped (no Chrome).');process.exit(0);}
const {chromium}=require('playwright');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);
 });
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.GAME_TEST_SINGLE_PROCESS?['--single-process','--no-zygote','--in-process-gpu']:[])]});
  const out=path.join(root,'test-visuals');fs.mkdirSync(out,{recursive:true});const results={status:'TECHNICAL_PREVIEW_ONLY',models:[]};
  const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true}),errors=[];
   page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/shader error|VALIDATE_STATUS|Error compiling/i.test(m.text()))errors.push(m.text());});
   await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  for(const preview of [false,true]){
   errors.length=0;
   await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html'+(preview?'?appModels=preview':''));
   await page.waitForFunction(()=>state===ST.MENU&&typeof ensureModel==='function'&&renderer,null,{polling:200});
   const result=await page.evaluate(async preview=>{
    await ensureModel('bf109');
    const raw=[];modelRaw.bf109.traverse(o=>{if(o.isMesh)raw.push({mesh:o,positions:o.geometry.attributes.position.array.slice()});});
    const model=buildAircraft('bf109');AircraftArticulation.pose(model,1,{left:0,right:0});
    if(preview&&model.userData.aircraftSourceProfile!==AircraftSourceProfiles.SOURCE)throw Error('Wrong candidate loaded');
    if(preview&&window.__modelSrc.bf109!=='app/model-candidates/bf109-manilov-remix.glb')throw Error('Unexpected source fallback');
    const gear=model.getObjectByName('gear'),wheels=[];gear.traverse(o=>{if(o.userData.groundWheel)wheels.push(o);});
    const fit=AircraftGround.fit(model,'bf109',0,0,.35,()=>0);
    if(!fit||wheels.length!==3)throw Error('Three actual wheel supports required');
    const groundGap=Math.max(...fit.contacts.map(p=>Math.abs(fit.y+p.y)));if(groundGap>.0001)throw Error('Wheel ground gap '+groundGap);
    const rates=[];
    for(const fps of [20,60,120]){
     AircraftArticulation.pose(model,1,{left:0,right:0});const hinge=gear.children.find(h=>h.userData.gearSide),down=hinge.quaternion.clone();let half;
     for(let i=1;i<=fps*2;i++){const g=1-i/(fps*2);AircraftArticulation.pose(model,g,{left:.7,right:.2});if(i===fps)half=hinge.quaternion.clone();}
     if(down.angleTo(half)<.1||half.angleTo(hinge.quaternion)<.1||gear.visible)throw Error('Continuous gear motion unavailable '+fps);
     const a=model.getObjectByName('flapLeft'),b=model.getObjectByName('flapRight');
     if(!a||!b||!(a.rotation.x<b.rotation.x&&b.rotation.x<0))throw Error('Independent flap pose unavailable');
     rates.push({fps,halfAngle:down.angleTo(half),upAngle:down.angleTo(hinge.quaternion)});
    }
    for(const {mesh,positions} of raw){const now=mesh.geometry.attributes.position.array;if(now.length!==positions.length||now.some((v,i)=>v!==positions[i]))throw Error('Original vertex data changed');}
    AircraftArticulation.pose(model,1,{left:0,right:0});
    const proof=new THREE.Scene();proof.background=new THREE.Color(0xa1bdcf);proof.add(new THREE.HemisphereLight(0xd2e6ff,0x60624a,1.1));
    const sun=new THREE.DirectionalLight(0xfff5dc,1.2);sun.position.set(-8,15,10);proof.add(sun);proof.add(model);
    const cam=new THREE.PerspectiveCamera(40,1194/834,.1,100);cam.position.set(12,5,14);cam.lookAt(0,0,0);cam.updateMatrixWorld(true);
    renderer.setPixelRatio(1);renderer.setSize(1194,834);renderer.shadowMap.enabled=false;
    for(const node of document.body.children)if(node!==renderer.domElement&&node.tagName!=='SCRIPT')node.style.display='none';
    document.body.appendChild(renderer.domElement);renderer.domElement.style.cssText='position:fixed;inset:0;display:block;visibility:visible;opacity:1;z-index:999999';
    const gl=renderer.getContext();
    const draw=()=>{proof.updateMatrixWorld(true);renderer.render(proof,cam);const pixels=new Uint8Array(1194*834*4);gl.readPixels(0,0,1194,834,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
    const pixels=draw(),calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;
    proof.remove(model);const sky=draw();proof.add(model);let visible=0,painted=0;
    for(let i=0;i<pixels.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(pixels[i+k]-sky[i+k])))>8){visible++;if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>20)painted++;}
    if(visible<5000||painted/visible<.65)throw Error('Missing textured aircraft '+JSON.stringify({visible,painted}));
    const prop=model.getObjectByName('prop');if(!prop)throw Error('Original propeller missing');
    const before=draw();prop.rotation.z+=.24;const after=draw();let rotorPixels=0;
    for(let i=0;i<before.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(before[i+k]-after[i+k])))>8)rotorPixels++;
    if(rotorPixels<30)throw Error('Propeller does not visibly move '+rotorPixels);
    window.__replacementProof={model,proof,cam,draw};draw();
    return {preview,source:window.__modelSrc.bf109,calls,triangles,visible,painted,rotorPixels,groundGap,rates};
   },preview);
   await page.screenshot({path:path.join(out,(preview?'candidate':'current')+'-bf109-front.png')});
   const flapPixels=await page.evaluate(()=>{
    const {model,cam,draw}=window.__replacementProof;cam.position.set(0,-2,-14);cam.lookAt(0,0,0);cam.updateMatrixWorld(true);
    AircraftArticulation.pose(model,1,{left:1,right:1});const before=draw(),flaps=model.getObjectByName('flightFlaps');flaps.visible=false;const after=draw();flaps.visible=true;draw();
    let changed=0;for(let i=0;i<before.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(before[i+k]-after[i+k])))>8)changed++;return changed;
   });assert(flapPixels>20,'Flaps must reach actual framebuffer');result.flapPixels=flapPixels;
   await page.screenshot({path:path.join(out,(preview?'candidate':'current')+'-bf109-flaps.png')});
   for(const deployment of [.5,0]){
    await page.evaluate(g=>{const p=window.__replacementProof;AircraftArticulation.pose(p.model,g,{left:0,right:0});p.draw();},deployment);
    await page.screenshot({path:path.join(out,(preview?'candidate':'current')+'-bf109-gear-'+deployment+'.png')});
   }
   assert.deepEqual(errors,[]);results.models.push(result);console.log(result);
  }
  const [old,next]=results.models;assert(next.calls<=old.calls+6);assert(next.triangles<=old.triangles*1.5);
  fs.writeFileSync(path.join(out,'model-replacement-bf109.json'),JSON.stringify(results,null,2)+'\n');
  console.log('Textured replacement, propeller, flap pixels, gear at 20/60/120 FPS and original vertex buffers passed.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
