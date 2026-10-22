/* Build 200, real game and real ship GLBs: a led 600 m beam shot actually reaches and sinks
 * the freighter (the old 16 s fish died after ~375 m), a 150 m drop does not arm, a bow-on
 * shot glances, an alert destroyer combs the tracks, and a stern hit leaves the light carrier
 * circling with a jammed rudder. Fixed steps at 20/60/120 FPS. GAME_TEST_CHROME selects Chrome. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Torpedo attack WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const name=url.pathname.split('/').pop(),file=cdn[name];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 if(url.pathname==='/torpedo-carrier.html'){const html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1');res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.webp':'image/webp','.png':'image/png'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true}),errors=[];
  page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=200');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{
   renderer.setPixelRatio(1);await prepareOkinawa();
   window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.rand=null;const real=Math.random;Math.random=()=>rand==null?real():rand;
   // Fire a real player torpedo from `range` metres off the hull, on a bearing `track` degrees
   // from the bow, led so a ship holding course would be met at `aim` (-.5 stern .. +.5 bow).
   window.attack=async(title,{index=0,range=600,track=90,aim=0,fps=60,diff='veteran',seconds=90,after=0,quiet=false}={})=>{
    const i=MISSIONS.findIndex(m=>m.title===title);DIFF=diff;
    await preparePacificModels(MISSIONS[i]);startMission(i);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;
    for(const z of zeros)z.alive=false;for(const s of ships)s.flak=false;   // isolate the attack geometry
    const s=ships[index];s.group.updateMatrixWorld(true);updateShips(1/fps);
    // quiet: suppress the Build-185 'spotted the attacker' turn-away so the hit point is exact.
    if(quiet)s.tacticCool=1e9;
    const hull=TorpedoAttack.hull(s),f=TorpedoAttack.forward(s),speed=s.speed*(s.driveMultiplier??1);
    const a=track*Math.PI/180,side={x:f.z,z:-f.x},dir={x:-(f.x*Math.cos(a)+side.x*Math.sin(a)),z:-(f.z*Math.cos(a)+side.z*Math.sin(a))};
    const dist=range+hull.beam/2,tof=dist/23,aimX=s.group.position.x+f.x*(speed*tof+aim*hull.length),aimZ=s.group.position.z+f.z*(speed*tof+aim*hull.length);
    P.alive=true;P.onDeck=false;P.onGround=false;P.torps=2;P.roll=0;P.spd=55;P.heading=Math.atan2(dir.z,dir.x);
    P.pos.set(aimX-dir.x*dist,30,aimZ-dir.z*dist);torpedoReport.length=0;said.length=0;
    const yaw0=TorpedoAttack.yaw(s);dropTorpedo();const fish=torpedoes[torpedoes.length-1];let runMax=0,steps=0,minYaw=0;
    let maxYaw=0;while(torpedoes.length&&steps<fps*seconds){updateTorpedoes(1/fps);updateShips(1/fps);runMax=Math.max(runMax,fish.run||0);steps++;maxYaw=Math.max(maxYaw,Math.abs(TorpedoAttack.wrap(TorpedoAttack.yaw(s)-yaw0)));}
    const yawHit=TorpedoAttack.yaw(s);
    for(let k=0;k<fps*after;k++)updateShips(1/fps);
    return {report:torpedoReport.slice(),alive:s.alive,hp:s.hp,run:Math.round(runMax),yawChange:+(TorpedoAttack.wrap(yawHit-yaw0)*180/Math.PI).toFixed(1),maxYaw:+(maxYaw*180/Math.PI).toFixed(1),
     yawAfter:+(TorpedoAttack.wrap(TorpedoAttack.yaw(s)-yawHit)*180/Math.PI).toFixed(1),status:shipDamage.status(s),jam:shipDamage.rudderJam(s),
     damageBox:(()=>{const b=shipDamage.get(s)?.box;return b?[b.min.z,b.max.z,b.min.x,b.max.x].map(v=>+v.toFixed(1)):null;})(),hullZ:[hull.minZ,hull.maxZ].map(v=>+v.toFixed(1)),said:said.slice(),hull:{length:Math.round(hull.length),beam:+hull.beam.toFixed(1)},type:s.def.type,speedNow:+(s.speed*(s.driveMultiplier??1)).toFixed(2)};
   };
  });
  const results={};
  if(!process.env.ONLY_STERN)for(const fps of [20,60,120]){
   rand(0.5);
   const r=await page.evaluate(fps=>attack('Sortie 1',{fps}),fps);results['beam'+fps]=r;
   assert.equal(r.report[0]?.result,'hit','led 600 m beam shot hits at '+fps+' FPS: '+JSON.stringify(r));
   assert(!r.alive&&r.run>500,'the fish ran '+r.run+' m (old life ended ~375 m) and sank the freighter');
   assert(r.report[0].angle>=55,'track angle reported '+r.report[0].angle);
  }
  function rand(v){return page.evaluate(v=>{window.rand=v;},v);}
  await rand(0.5);results.close=await page.evaluate(()=>attack('Sortie 1',{range:150}));
  assert.equal(results.close.report[0]?.result,'unarmed','150 m drop does not arm: '+JSON.stringify(results.close));
  assert(results.close.alive&&results.close.said.some(t=>/DIDN'T ARM/.test(t)));
  await rand(0);results.bow=await page.evaluate(()=>attack('Sortie 1',{range:450,track:4}));
  assert.equal(results.bow.report[0]?.result,'glanced','bow-on shot skids off: '+JSON.stringify(results.bow));
  assert(results.bow.alive&&results.bow.said.some(t=>/GLANCED/.test(t)));
  await rand(0.5);results.destroyer=await page.evaluate(()=>attack('Sortie 2',{index:1,range:700}));
  assert(results.destroyer.said.some(t=>/COMBING/.test(t)),'the destroyer captain reports combing');
  assert(results.destroyer.maxYaw>30&&results.destroyer.maxYaw<125,'destroyer turned '+results.destroyer.maxYaw+'° onto the track and no further');
  assert(results.destroyer.report[0]?.result!=='hit'||results.destroyer.report[0].angle<45,'combed: no square beam hit');
  await rand(0.5);results.stern=await page.evaluate(()=>attack('Sortie 3',{index:0,range:380,aim:-.36,diff:'rookie',after:20,quiet:true}));
  assert.equal(results.stern.report[0]?.result,'hit',JSON.stringify(results.stern));
  assert.equal(results.stern.report[0].part,'stern',JSON.stringify(results.stern));
  assert(results.stern.alive&&results.stern.hp===1&&results.stern.jam!==0&&/RUDDER JAMMED/.test(results.stern.status),'light carrier survives with a jammed rudder');
  assert(Math.abs(results.stern.yawAfter)>25&&Math.sign(results.stern.yawAfter)===Math.sign(results.stern.jam),'and keeps turning one way ('+results.stern.yawAfter+'° in 20 s)');
  // HUD: the advisory TRACK row reads the current attack geometry
  const hud=await page.evaluate(async()=>{
   const i=MISSIONS.findIndex(m=>m.title==='Sortie 1');await preparePacificModels(MISSIONS[i]);startMission(i);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;
   const s=ships[0];s.group.updateMatrixWorld(true);updateShips(1/60);const f=TorpedoAttack.forward(s);P.pos.set(s.group.position.x+f.z*700,30,s.group.position.z-f.x*700);P.heading=Math.atan2(f.x,-f.z);P.alive=true;state=ST.FLIGHT;
   updateTorpRun();const el=document.getElementById('trTrack'),panel=document.getElementById('torpRun').getBoundingClientRect();
   const others=['steerBtn','gearBtn','flapBtn','diveBtn','hookBtn','fireBtn','dropBtn','mmap','obj','systemsStatus'].map(id=>document.getElementById(id)).filter(e=>e&&e.offsetParent!==null)
    .map(e=>({id:e.id,r:e.getBoundingClientRect()})).filter(o=>o.r.width>0&&!(o.r.right<=panel.left||o.r.left>=panel.right||o.r.bottom<=panel.top||o.r.top>=panel.bottom)).map(o=>o.id);
   renderer.render(scene,camera);
   return {text:el.textContent,cls:el.className,shown:document.getElementById('torpRun').classList.contains('show'),overlap:others,panel:[panel.left,panel.top,panel.right,panel.bottom].map(Math.round)};
  });
  results.hud=hud;
  assert(hud.shown&&/BEAM/.test(hud.text)&&hud.cls==='ok','TRACK row shows a beam set-up: '+JSON.stringify(hud));
  assert.deepEqual(hud.overlap,[],'torpedo panel stays clear of controls');
  await page.screenshot({path:path.join(root,'test-visuals','build200-torpedo-run-hud.png')});
  assert.deepEqual(errors,[],'no page errors');
  console.log('Torpedo attack in the real game:',JSON.stringify(results));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
