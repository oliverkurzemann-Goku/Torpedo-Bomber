/* Build 295, real Rhine game, real models: take-off rockets you can see, and engine nozzles that glow with the throttle.
 *  1. Me 262 "Jet Strike" in ARCADE (the classic flight model): two RI 502 tubes under the rear fuselage from the start, they fire
 *     on the take-off run (now in ARCADE too), flames and smoke while they burn (~6 s), the empty tubes stay on; the same run with
 *     the kit removed is measured for comparison (the rockets shorten the run).
 *  2. Me 262 in REALISTIC: the rockets fire on the computed core as before (Build 223).
 *  3. Ar 234 "Bonus Blitz": two Walter 109-500 pods under the wings, fired at the start of the roll, still burning after lift-off,
 *     dropped once airborne and burnt out, coming down on parachutes onto the ground.
 *  4. Nozzle glow, both jets: rendered from astern at idle and after spooling to full throttle; the nozzle pixels turn brighter and
 *     more orange-yellow. Writes app/release/rato-glow-browser.json and test-visuals/build295-*.png. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('RATO / nozzle glow WebGL: skipped locally (no Chrome).');process.exit(0);}
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wav':'audio/wav'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:900,height:560},hasTouch:true}),errors=[];
  page.setDefaultTimeout(600000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto(origin+'/remagen-mission.html?v=295&surprises=off');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:250});
  await page.evaluate(()=>{
   renderer.setPixelRatio(.5);renderer.shadowMap.enabled=false;
   // one take-off: full throttle, rotate at 0.95 vr, return the run and the rocket/pod states seen on the way
   window.__takeoff=(seconds,watch)=>{
    const dt=1/60,x0=P.pos.x,z0=P.pos.z,out={fired:null,liftoff:null,podsAtStart:playerModel.getObjectByName('ratoPods')?.children.length||0,maxFlames:0,smoke:0,states:new Set()};
    P.throttle=1;inputRoll=0;inputPitch=0;
    for(let t=0;t<seconds&&P.alive;t+=dt){
     const vr=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall*1.1;
     if(P.onGround&&P.spd>.95*vr)inputPitch=.5;else if(!P.onGround)inputPitch=P.pos.y-groundY(P.pos.x,P.pos.z)<120?.35:0;
     updateFlight(dt);posePlayerAircraft(dt);combatFX.update?.(dt);
     if(out.fired==null&&typeof P.rato==='number')out.fired={t:+t.toFixed(2),spd:+P.spd.toFixed(1),dist:Math.round(Math.hypot(P.pos.x-x0,P.pos.z-z0))};
     if(!P.onGround&&!out.liftoff)out.liftoff={t:+t.toFixed(1),dist:Math.round(Math.hypot(P.pos.x-x0,P.pos.z-z0)),ms:+P.spd.toFixed(1),ratoBurning:P.ratoPods==='burning'};
     const flames=(playerModel.getObjectByName('ratoPods')?.children||[]).filter(p=>p.getObjectByName('ratoFlame').visible).length;
     out.maxFlames=Math.max(out.maxFlames,flames);out.states.add(P.ratoPods);
     if(watch)watch(t,out);
    }
    out.states=[...out.states];out.alive=P.alive;out.agl=Math.round(P.pos.y-groundY(P.pos.x,P.pos.z));out.rato=P.rato;out.pods=P.ratoPods;
    out.podsAtEnd=playerModel.getObjectByName('ratoPods')?.children.length||0;return out;
   };
   window.__begin=async(id,kind)=>{const i=MISSIONS.findIndex(m=>m.id===id);await ensureModel(kind);startMission(i);finishLaunchIntro(false);show('menu',false);show('brief',false);
    state=ST.FLIGHT;for(const e of enemyAir)e.alive=false;posePlayerAircraft(0);return i;};
  });

  // ---- 1. Me 262 ARCADE ----
  report.me262Arcade=await page.evaluate(async()=>{
   await __begin('jetjabo','me262');aeroMode=false;const out={coreOn:coreOn()};
   posePlayerAircraft(.016);
   const pods=playerModel.getObjectByName('ratoPods');out.podsBox=(()=>{playerModel.updateMatrixWorld(true);const b=new THREE.Box3();pods.traverse(o=>{if(o.isMesh&&o.parent.name!=='ratoFlame')b.union(new THREE.Box3().setFromObject(o));});
    const inv=new THREE.Matrix4().copy(playerModel.matrixWorld).invert();return b.applyMatrix4(inv);})();
   out.run=__takeoff(40);
   // the same take-off without the kit
   await __begin('jetjabo','me262');aeroMode=false;P.rato=undefined;P.ratoPods='gone';posePlayerAircraft(.016);
   out.noKit=__takeoff(40);
   return out;
  });
  const a=report.me262Arcade;
  assert(!a.coreOn,'ARCADE flies the classic model');assert.equal(a.run.podsAtStart,2,'two tubes fitted before the run');
  assert(a.podsBox.max.y<-.6&&a.podsBox.max.z<-.8,'tubes under the rear fuselage: '+JSON.stringify(a.podsBox));
  assert(a.run.fired&&a.run.fired.t>3,'the rockets fire on the run (ARCADE too): '+JSON.stringify(a.run.fired));
  assert.equal(a.run.maxFlames,2,'two flames while burning');assert(a.run.states.includes('burning')&&a.run.pods==='spent','burnt out');
  assert.equal(a.run.podsAtEnd,2,'the Me 262 keeps its empty tubes');
  assert(a.run.liftoff&&a.noKit.liftoff&&a.run.liftoff.dist<a.noKit.liftoff.dist,'the rockets shorten the run: '+a.run.liftoff?.dist+' vs '+a.noKit.liftoff?.dist);
  assert(a.run.alive&&a.run.agl>20,'climbs away');assert.equal(a.noKit.podsAtStart,0,'no kit, no tubes');

  // ---- 2. Me 262 REALISTIC ----
  report.me262Realistic=await page.evaluate(async()=>{await __begin('jetjabo','me262');aeroMode=true;P.flap=P.flapTgt=.5;const coreIs=coreOn();const r=__takeoff(40);r.coreOn=coreIs;return r;});
  const b=report.me262Realistic;
  assert(b.coreOn&&b.fired&&b.maxFlames===2&&b.liftoff&&b.alive,'REALISTIC: rockets fire on the core and she flies: '+JSON.stringify(b));

  // ---- 3. Ar 234 ----
  report.ar234=await page.evaluate(async()=>{
   await __begin('blitz','ar234');aeroMode=false;const out={coreOn:coreOn()};let drop=null,chute=false,maxDrops=0,landed=0,landedAt=[];
   out.run=__takeoff(70,(t,o)=>{if(!drop&&P.ratoPods==='gone'&&o.fired)drop={t:+t.toFixed(1),agl:Math.round(P.pos.y-groundY(P.pos.x,P.pos.z)),ratoT:+P.rato.toFixed(1)};
    maxDrops=Math.max(maxDrops,ratoDropped.length);if(ratoDropped.some(d=>d.chute.visible))chute=true;
    for(const d of ratoDropped)if(d.landed>=0&&!d.counted){d.counted=true;landed++;landedAt.push(+(d.holder.position.y-groundY(d.holder.position.x,d.holder.position.z)).toFixed(2));}});
   out.drop=drop;out.chute=chute;out.maxDrops=maxDrops;out.radio=radioQ.map(r=>r.text||r).join(' | ');
   // let the dropped pods come down
   for(let k=0;k<60*40&&ratoDropped.length;k++){updateRatoPods(1/60);for(const d of ratoDropped)if(d.landed>=0&&!d.counted){d.counted=true;landed++;landedAt.push(+(d.holder.position.y-groundY(d.holder.position.x,d.holder.position.z)).toFixed(2));}}
   out.landed=landed;out.landedHeight=landedAt;out.leftInScene=ratoDropped.length;
   return out;
  });
  const c=report.ar234;
  assert(c.coreOn,'the Ar 234 flies on the core');assert.equal(c.run.podsAtStart,2,'two pods under the wings');
  assert(c.run.fired&&c.run.fired.t<10&&c.run.fired.dist<40,'fired at the start of the roll (once the turbines have spooled): '+JSON.stringify(c.run.fired));
  assert(c.run.liftoff&&c.run.liftoff.dist<900&&c.run.liftoff.ratoBurning,'lifts off inside the strip with the rockets still burning: '+JSON.stringify(c.run.liftoff));
  assert(c.drop&&c.drop.ratoT>=29.9&&c.drop.agl>25,'pods dropped airborne after burn-out: '+JSON.stringify(c.drop));
  assert.equal(c.maxDrops,2);assert(c.chute,'parachutes open');assert.equal(c.landed,2,'both pods came down');assert(c.landedHeight.every(h=>Math.abs(h-.2)<.05),'on the ground: '+c.landedHeight);assert.equal(c.leftInScene,0,'and are cleared away');

  // ---- 4. nozzle glow from astern ----
  report.glow={};
  for(const [id,kind] of [['jetjabo','me262'],['blitz','ar234']]){
   const r=await page.evaluate(async([id,kind])=>{
    await __begin(id,kind);P.ratoPods='gone';P.rato=undefined;posePlayerAircraft(.016);
    const shot=(thr)=>{P.throttle=thr;for(let i=0;i<300;i++)updateJetExhaust(playerModel,thr,1/60);
     planeGroup.updateMatrixWorld(true);const fx=playerModel.getObjectByName('jetHeat'),c=fx.children[0].getWorldPosition(new THREE.Vector3());
     const back=noseDir().multiplyScalar(-1);camera.position.copy(c).addScaledVector(back,7).add(new THREE.Vector3(0,.6,0));camera.up.set(0,1,0);camera.lookAt(c);camera.fov=40;camera.updateProjectionMatrix();
     renderer.render(scene,camera);const g=renderer.getContext(),w=g.drawingBufferWidth,h=g.drawingBufferHeight;
     const p=c.clone().project(camera),cx=Math.round((p.x*.5+.5)*w),cy=Math.round((p.y*.5+.5)*h),R=Math.round(h*.04),px=new Uint8Array(4*(2*R+1)**2);
     g.readPixels(cx-R,cy-R,2*R+1,2*R+1,g.RGBA,g.UNSIGNED_BYTE,px);let sr=0,sg=0,sb=0,n=0,hot=0;
     for(let i=0;i<px.length;i+=4){sr+=px[i];sg+=px[i+1];sb+=px[i+2];n++;if(px[i]>170&&px[i+1]>90&&px[i]>px[i+2]+60)hot++;}
     const url=renderer.domElement.toDataURL('image/png');
     return {r:+(sr/n).toFixed(1),g:+(sg/n).toFixed(1),b:+(sb/n).toFixed(1),hot,url,colour:'#'+playerModel.userData.jetExhaust.nozzle.color.getHexString(),halo:+playerModel.userData.jetExhaust.glow.opacity.toFixed(3)};};
    return {idle:shot(0),full:shot(1)};
   },[id,kind]);
   for(const k of ['idle','full']){fs.writeFileSync(path.join(root,'test-visuals/build295-'+kind+'-nozzle-'+k+'.png'),Buffer.from(r[k].url.split(',')[1],'base64'));delete r[k].url;}
   report.glow[kind]=r;
   assert(r.full.r>r.idle.r+8&&r.full.g>r.idle.g+4,kind+': the nozzle is brighter at full power: '+JSON.stringify(r));
   assert(r.full.hot>r.idle.hot&&r.full.r>r.full.b,kind+': warm orange-yellow pixels at full power');
  }
  // a picture of the Ar 234 at full power with burning rockets, and the Me 262 seen from astern on the run
  const pic=await page.evaluate(async()=>{
   await __begin('blitz','ar234');P.throttle=1;
   for(let t=0;t<8;t+=1/60){updateFlight(1/60);posePlayerAircraft(1/60);combatFX.update?.(1/60);}
   for(let i=0;i<120;i++)updateJetExhaust(playerModel,1,1/60);
   planeGroup.updateMatrixWorld(true);const c=P.pos.clone(),back=noseDir().multiplyScalar(-1),side=new THREE.Vector3(-back.z,0,back.x);
   camera.position.copy(c).addScaledVector(back,16).addScaledVector(side,9).add(new THREE.Vector3(0,3,0));camera.lookAt(c);camera.fov=45;camera.updateProjectionMatrix();
   renderer.render(scene,camera);return {url:renderer.domElement.toDataURL('image/png'),state:P.ratoPods,rato:+P.rato.toFixed(1)};
  });
  fs.writeFileSync(path.join(root,'test-visuals/build295-ar234-rato-run.png'),Buffer.from(pic.url.split(',')[1],'base64'));
  report.picture={state:pic.state,rato:pic.rato};
  assert.deepEqual(errors,[],'page errors: '+errors.join('; '));
  fs.writeFileSync(path.join(root,'app/release/rato-glow-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log(JSON.stringify(report,(k,v)=>k==='podsBox'?undefined:v));
  console.log('RATO pods and nozzle glow verified in the real game');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
