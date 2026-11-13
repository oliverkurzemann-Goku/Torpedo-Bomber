/* Build 258, real Pacific game and the real PBY-5A: the Catalina patrol sorties 24-27. GAME_TEST_CHROME selects Chrome. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('PBY patrol WebGL: skipped locally (no Chrome).');process.exit(0);}
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
const report={};
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true}),errors=[];
  const missing=[];page.on('response',r=>{if(r.status()===404)missing.push(new URL(r.url()).pathname);});
  page.setDefaultTimeout(300000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/i.test(m.text())||m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=262');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{
   renderer.setPixelRatio(1);await prepareOkinawa();
   window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.step=dt=>{SortieFeatures.Damage.tick(P,dt);pollKeys(dt);updateFlight(dt);if(state!==ST.FLIGHT)return;updatePbyPatrol(dt);updateTorpedoes(dt);updateBombs(dt);updateGuns(dt);updateFlak(dt);updateZeros(dt);updateShips(dt);updatePlaneMesh(dt);updateNav();updateSea(performance.now()*.001);};
   window.begin=async(title,diff='veteran')=>{const i=MISSIONS.findIndex(m=>m.title===title);DIFF=diff;await preparePacificModels(MISSIONS[i]);startMission(i);launch();said.length=0;return i;};
  });
  const shot=async(name)=>{const url=await page.evaluate(()=>{sea.position.x=P.pos.x;sea.position.z=P.pos.z;for(let i=0;i<40;i++)updateCamera(.1);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');});
   fs.writeFileSync(path.join(process.env.PBY_SHOTS||'/tmp',name+'.png'),Buffer.from(url.split(',')[1],'base64'));};
  await page.evaluate(()=>{
   // a scripted pilot: take off, climb, come back round and alight (the glide rate and the flare are the stick's job)
   window.fly=(opts)=>{
    const out={log:[],said:[]};const dt=1/60;P.throttle=1;setThrottleUI(1);
    let phase='run',t=0,td=null,alive0=true,pv=0,pg=1;
    for(let k=0;k<60*600;k++){
     t=k*dt;
     const keel=P.pos.y-.84-pbySea(P.pos.x,P.pos.z);
     if(phase==='run'){inputPitch=P.spd>33?.55:0;if(!P.onWater)phase='climb';}
     else if(phase==='climb'){inputPitch=P.vSpeed<5?.4:0;P.throttle=1;if(keel>(opts.alt||120)){phase='level';out.climbT=+t.toFixed(1);}}
     else if(phase==='level'){inputPitch=-.12*(P.vSpeed)*.1;P.throttle=.8;if(P.spd>(opts.speed||52)){phase='descend';}}
     else if(phase==='descend'){
      if(opts.wheels&&keel>30){P.gear=1;P.gearTgt=1;}
      const tgt=(keel>40?-opts.sink:keel>8?-opts.sink*.6:-.8);
      inputPitch=Math.max(-.6,Math.min(.6,(tgt-P.vSpeed)*.14));
      P.throttle=keel>40?.25:.1;
      if(opts.noflare&&keel<8)inputPitch=Math.max(-.6,Math.min(.6,(-opts.sink-P.vSpeed)*.14));
      if(P.onWater){phase='down';td=t;out.touch={t:+t.toFixed(1),speed:+P.spd.toFixed(1),pitch:+(P.pitch*57.3).toFixed(1),roll:+(P.roll*57.3).toFixed(1),sink:+(-pv).toFixed(1),gear:+pg.toFixed(2)};}
     }
     else if(phase==='down'){P.throttle=0;inputPitch=0;if(P.spd<2||t-td>60){out.stopT=+(t-td).toFixed(1);out.stopSpeed=+P.spd.toFixed(1);break;}}
     setThrottleUI(P.throttle);
     pv=P.vSpeed;pg=P.gear;
     step(dt);
     if(k%300===0)out.log.push([+t.toFixed(0),phase,+P.spd.toFixed(1),+keel.toFixed(0),+(P.pitch*57.3).toFixed(1),+P.vSpeed.toFixed(1)]);
     if(!P.alive||state!==ST.FLIGHT){out.dead=true;break;}
    }
    out.phase=phase;out.alive=P.alive;out.hull=P.hull;out.said=said.slice();out.result=document.getElementById('resultTitle')?.textContent;out.state=state;
    return out;
   };
  });
  await page.evaluate(async()=>{const i=MISSIONS.findIndex(m=>m.title==='Sortie 25');DIFF='veteran';await preparePacificModels(MISSIONS[i]);startMission(i);});
  try{await page.screenshot({path:path.join(process.env.PBY_SHOTS||'/tmp','pby-brief.png'),timeout:30000});}catch(e){console.log('screenshot failed',e.message.slice(0,80));}
  await page.evaluate(()=>{launch();});
  await page.evaluate(()=>{for(let i=0;i<30;i++)step(1/30);updateHUD();updateMinimap();});
  try{await page.screenshot({path:path.join(process.env.PBY_SHOTS||'/tmp','pby-hud.png'),timeout:30000});}catch(e){console.log('screenshot failed',e.message.slice(0,80));}
  // ---- Dumbo: ring, flare, dye, alighting beside the raft, boarding, the Zeros, the way home ----
  const D=await page.evaluate(async()=>{
   const out={};await begin('Sortie 24');const ops=pbyOps;
   out.ringKnown=!!ops.ring;out.hiddenInsideRing=Math.hypot(ops.point.x-ops.ring.x,ops.point.z-ops.ring.z)<ops.ring.r;out.offCentre=Math.hypot(ops.point.x-ops.ring.x,ops.point.z-ops.ring.z)/ops.ring.r;
   out.navBefore=pbyNavTarget()?.kind;out.briefText=ops.text;
   // fly in a straight line towards the raft from 6 km, 150 m up
   const dx=ops.point.x-ops.ring.x,dz=ops.point.z-ops.ring.z;const h=Math.atan2(-6000*0+(ops.point.z-ops.ring.z-0)+0.0001,1);
   const ang=Math.atan2(ops.ring.z-0,ops.ring.x-carrierX);
   P.onWater=false;P.gear=0;P.gearTgt=0;P.heading=Math.atan2(ops.point.z-(ops.point.z-3000*0),1);
   const dir={x:Math.cos(ang+Math.PI*.0),z:Math.sin(ang)};
   const start={x:ops.point.x-6000,z:ops.point.z};P.pos.set(start.x,150,start.z);P.heading=0;P.spd=55;P.vSpeed=0;
   let flareAt=null,dyeAt=null;const dt=1/30;
   for(let k=0;k<30*140;k++){P.pos.x+=55*dt;P.pos.y=150;state=ST.FLIGHT;updatePbyPatrol(dt);
    const d=Math.hypot(ops.point.x-P.pos.x,ops.point.z-P.pos.z);
    if(!flareAt&&said.some(t=>/RED FLARE/.test(t)))flareAt=Math.round(d);
    if(!dyeAt&&ops.found){dyeAt=Math.round(d);break;}}
   out.flareAt=flareAt;out.dyeAt=dyeAt;out.found=ops.found;out.navAfter=pbyNavTarget()?.kind;out.said=said.slice();
   // alight beside the raft
   P.onWater=true;P.spd=3;P.pos.set(ops.point.x+60,pbySea(ops.point.x+60,ops.point.z),ops.point.z);
   for(let k=0;k<30*14;k++){P.onWater=true;P.spd=3;updatePbyPatrol(dt);}
   out.aboard=ops.aboard;out.boarded=ops.boarded;out.phase=ops.phase;out.rtb=P.rtb;
   for(let k=0;k<30*8;k++){updatePbyPatrol(dt);}
   out.zeros=zeros.filter(z=>z.alive).length;
   // back beside the fleet
   P.onWater=true;P.spd=0;P.pos.set(carrierX+40,0,-210);
   for(let k=0;k<30*4;k++){updatePbyPatrol(dt);if(state===ST.RESULT)break;}
   out.state=state===ST.RESULT;out.title=document.getElementById('resultTitle')?.textContent;out.sub=document.getElementById('resultSub')?.textContent;
   return out;
  });
  report.dumbo=D;
  assert.ok(D.ringKnown&&D.hiddenInsideRing,'the ring is on the map and the raft hides inside it');
  assert.ok(D.offCentre>=.17&&D.offCentre<=.63,'the raft is not in the middle of the ring ('+D.offCentre.toFixed(2)+')');
  assert.equal(D.navBefore,'SEARCH','the arrow points at the ring, not at the raft');assert.match(D.briefText,/^about \d+ km [NSEW]+ of the fleet, course \d{3}$/,'the briefing names an approximate course and distance only');
  assert.ok(D.flareAt>D.dyeAt&&D.flareAt<=4300,'the flare is seen before the dye ('+D.flareAt+' m / '+D.dyeAt+' m)');assert.ok(D.dyeAt<=3300&&D.dyeAt>=1500,'the dye patch is seen at about 3 km, not from far away');
  assert.ok(D.found&&D.navAfter==='TARGET','once the dye is seen the arrow points at the raft');
  assert.equal(D.aboard,2,'both airmen come aboard');assert.ok(D.boarded&&D.phase==='home'&&D.rtb,'boarded, the way home');assert.equal(D.zeros,2,'the Zeros come after the pick-up');
  assert.ok(D.state&&/ALIGHTED/.test(D.title),'the sortie ends alighted beside the fleet: '+D.title);
  // ---- Submarine hunt ----
  const S=await page.evaluate(async()=>{
   const out={};await begin('Sortie 25');const ops=pbyOps,sub=ops.sub,dt=1/30;
   out.charges=P.torps;out.state0=sub.state;
   P.onWater=false;P.gear=0;P.gearTgt=0;P.heading=0;P.spd=60;P.vSpeed=0;state=ST.FLIGHT;
   P.pos.set(sub.x-5000,100,sub.z);
   let foundAt=null,diveAt=null,subDist=null;
   for(let k=0;k<30*120;k++){P.pos.x+=60*dt;P.pos.y=100;updatePbyPatrol(dt);
    const d=Math.hypot(sub.x-P.pos.x,sub.z-P.pos.z);
    if(!foundAt&&ops.found)foundAt=Math.round(d);
    if(!diveAt&&sub.state==='diving'){diveAt=Math.round(d);break;}}
   out.foundAt=foundAt;out.diveAt=diveAt;out.state1=sub.state;out.said=said.slice();
   // the release point that puts a charge on (tx,tz): 60 m up, 50 m/s, the bomb falls 2.6 s and carries 129 m
   const dropOn=(tx,tz)=>{P.pitch=0;P.heading=0;P.spd=50;P.vSpeed=0;P.pos.set(tx-50*Math.sqrt(2*58/18),60,tz);pbyDrop();for(let i=0;i<30*6;i++){updateBombs(dt);updatePbyPatrol(dt);}};
   out.dropped=P.torps;
   dropOn(sub.x+50,sub.z);out.afterMiss=sub.state;out.sunkAfterMiss=!!ops.subSunk;out.missSaid=said.filter(t=>/NEAR MISS/.test(t)).length;
   for(let i=0;i<30*40&&sub.state!=='submerged';i++){updatePbyPatrol(dt);}
   out.state2=sub.state;
   for(let i=0;i<30*20;i++){updatePbyPatrol(dt);}
   out.trailMarks=ops.trail.length;
   dropOn(sub.x+40,sub.z);out.sunk40=!!ops.subSunk;      // 40 m from a submerged boat: outside her 26 m
   dropOn(sub.x+12,sub.z);out.sunk12=!!ops.subSunk;out.rtb=P.rtb;out.chargesLeft=P.torps;out.score=score;out.subState=sub.state;
   return out;
  });
  report.sub=S;
  assert.equal(S.charges,4);assert.equal(S.state0,'surfaced');assert.ok(S.foundAt<=2400&&S.foundAt>=800,'the surfaced boat is seen at about 2 km ('+S.foundAt+' m)');
  assert.ok(S.diveAt<S.foundAt&&S.state1==='diving','she crash-dives once she has seen the Catalina');
  assert.ok(!S.sunkAfterMiss&&S.missSaid>=1,'a charge 50 m away is a near miss');assert.equal(S.state2,'submerged');assert.ok(S.trailMarks>=10,'a bubble trail marks her course ('+S.trailMarks+')');
  assert.ok(!S.sunk40,'a charge 40 m from a submerged boat does nothing');assert.ok(S.sunk12&&S.subState==='sunk','12 m from her is a kill');assert.ok(S.rtb,'then the way home');assert.equal(S.chargesLeft,1);
  // ---- Contact report: find the convoy, keep contact 3-8.5 km for four minutes, the Zeros scramble after a minute ----
  const C=await page.evaluate(async()=>{
   const out={};await begin('Sortie 26');const ops=pbyOps,dt=1/30;
   out.ships=ships.length;out.freighters=ships.filter(s=>s.def.type==='freighter').length;out.destroyers=ships.filter(s=>s.def.type==='destroyer').length;
   const lead=ships[0].group.position;
   P.onWater=false;P.gear=0;P.gearTgt=0;P.heading=0;P.spd=60;P.pitch=0;state=ST.FLIGHT;
   P.pos.set(lead.x-9500,120,lead.z);
   let foundAt=null;
   for(let k=0;k<30*200;k++){P.pos.x+=60*dt;P.pos.y=120;updatePbyPatrol(dt);updateShips(dt);const d=Math.hypot(lead.x-P.pos.x,lead.z-P.pos.z);if(ops.found){foundAt=Math.round(d);break;}}
   out.foundAt=foundAt;out.navKind=(()=>{const n=pbyNavTarget();return n?(n.ref.group?'ship':n.kind):null;})();
   // hold station 5 km off, going round at her speed (the convoy moves 5 m/s)
   const t0=ops.t;let zerosAt=null,doneAt=null;
   for(let k=0;k<30*300;k++){P.spd=60;P.pos.set(lead.x-5000,120,lead.z);updatePbyPatrol(dt);updateShips(dt);
    if(!zerosAt&&zeros.length)zerosAt=Math.round(ops.t-t0);
    if(!doneAt&&ops.phase==='home'){doneAt=Math.round(ops.t-t0);break;}}
   out.zerosAt=zerosAt;out.doneAt=doneAt;out.hold=Math.round(ops.hold);out.rtb=P.rtb;out.score=score;out.reports=said.filter(t=>/CONTACT REPORT SENT/.test(t)).length;
   out.escortsFired=0;
   return out;
  });
  report.shadow=C;
  assert.equal(C.ships,5);assert.equal(C.freighters,3);assert.equal(C.destroyers,2);assert.ok(C.foundAt<=8000&&C.foundAt>=3000,'the convoy is found at 3-8 km: 6.5 km clear-air range from the nearest ship, which is up to 1 km nearer than the leader ('+C.foundAt+' m)');
  assert.equal(C.navKind,'ship','the arrow follows the convoy once found');assert.ok(C.zerosAt>=55&&C.zerosAt<=75,'the Zeros scramble after about a minute ('+C.zerosAt+' s)');
  assert.ok(C.doneAt>=235&&C.doneAt<=250&&C.rtb,'four minutes of contact finish the task ('+C.doneAt+' s)');assert.ok(C.reports>=6,'radio reports go out while she holds contact ('+C.reports+')');
  // ---- Black Cat: radar, two freighters, four bombs ----
  const K=await page.evaluate(async()=>{
   const out={};await begin('Sortie 27');const ops=pbyOps,dt=1/30;
   out.night=timeMode;out.flares=flareSupport?.night;out.ships=ships.length;
   const lead=ships[0].group.position;P.onWater=false;P.gear=0;P.gearTgt=0;P.heading=0;P.spd=70;P.pitch=0;state=ST.FLIGHT;
   P.pos.set(lead.x-17000,150,lead.z);let foundAt=null;
   for(let k=0;k<30*200;k++){P.pos.x+=70*dt;P.pos.y=150;updatePbyPatrol(dt);updateShips(dt);const d=Math.hypot(lead.x-P.pos.x,lead.z-P.pos.z);if(ops.found){foundAt=Math.round(d);break;}}
   out.foundAt=foundAt;out.said=said.slice();
   const dropOn=(s)=>{const p=s.group.position;P.pitch=0;P.heading=0;P.spd=60;P.vSpeed=0;P.pos.set(p.x-60*Math.sqrt(2*58/18)-5*2.6,60,p.z);pbyDrop();for(let i=0;i<30*6;i++){updateBombs(dt);updatePbyPatrol(dt);updateShips(dt);}};
   const fr=ships.filter(s=>s.def.type==='freighter');
   dropOn(fr[0]);out.sunk1=!fr[0].alive;out.rtb1=P.rtb;
   dropOn(fr[1]);out.sunk2=!fr[1].alive;out.rtb2=P.rtb;out.phase=ops.phase;out.bombsLeft=P.torps;
   P.onWater=true;P.spd=0;P.pos.set(carrierX+40,0,-210);for(let k=0;k<30*4;k++){updatePbyPatrol(dt);if(state===ST.RESULT)break;}
   out.finished=state===ST.RESULT;out.title=document.getElementById('resultTitle')?.textContent;
   return out;
  });
  report.blackcat=K;
  assert.equal(K.night,'night');assert.ok(K.flares);assert.equal(K.ships,3);assert.ok(K.foundAt<=16000&&K.foundAt>=10000,'the radar shows the convoy at about 8 miles, measured to the leader ('+K.foundAt+' m)');
  assert.match(K.said.join(' '),/RADAR CONTACT/);assert.ok(K.sunk1&&!K.rtb1,'one freighter is not enough');assert.ok(K.sunk2&&K.rtb2&&K.phase==='home','both freighters end the task');assert.equal(K.bombsLeft,2);
  assert.ok(K.finished&&/WAR CRUISE COMPLETE/.test(K.title),'the last combat sortie closes the cruise: '+K.title);
  // ---- Build 259: the flap panels of the Catalina follow the lever in the Pacific game too ----
  const FL=await page.evaluate(async()=>{await begin('Sortie 25');const hs=[];playerPBY.userData.inner.traverse(n=>{if(n.userData.flapHinge)hs.push(n);});
   const st=a=>{P.flap=P.flapTgt=a;pbyPoseModel(1/60);return {vis:hs.filter(h=>h.visible).length,rot:+hs[0].rotation.x.toFixed(3)};};return {n:hs.length,up:st(0),to:st(.5),dn:st(1)};});
  report.flaps=FL;console.log('flap panels',JSON.stringify(FL));
  assert.deepEqual([FL.n,FL.up.vis,FL.to.vis,FL.dn.vis],[4,0,4,4],'four generated flap panels: hidden at UP, out at T/O and DN: '+JSON.stringify(FL));assert.ok(FL.to.rot<0&&FL.dn.rot<FL.to.rot-.1,'the panels hang further down with the lever');
  // ---- Build 259: the chase camera sits at the same height and distance in ARCADE and REALISTIC (the Catalina's extra 5 m applied to ARCADE only: user photos) ----
  const CAM=await page.evaluate(async()=>{await begin('Sortie 25');const out={};
   for(const [k,aero] of [['arcade',false],['real',true]]){aeroMode=aero;camera.userData.aeroRig=null;camera.position.copy(P.pos).add(new THREE.Vector3(0,40,60));for(let i=0;i<240;i++)updateCamera(1/60);
    out[k]={up:+(camera.position.y-P.pos.y).toFixed(2),back:+Math.hypot(camera.position.x-P.pos.x,camera.position.z-P.pos.z).toFixed(2)};}
   aeroMode=false;camera.userData.aeroRig=null;return out;});
  report.camera=CAM;console.log('chase camera',JSON.stringify(CAM));
  assert.ok(Math.abs(CAM.arcade.up-CAM.real.up)<.6&&Math.abs(CAM.arcade.back-CAM.real.back)<1,'ARCADE and REALISTIC chase camera agree (height '+CAM.arcade.up+' / '+CAM.real.up+' m, distance '+CAM.arcade.back+' / '+CAM.real.back+' m)');
  // ---- the flying: a scripted pilot takes off from the water, climbs and alights again (ARCADE forgiving, REALISTIC strict) ----
  const F={};
  F.arcade=await page.evaluate(async()=>{await begin('Sortie 25');aeroMode=false;return fly({alt:120,speed:46,sink:3.5});});
  F.arcadeSteep=await page.evaluate(async()=>{await begin('Sortie 25');aeroMode=false;return fly({alt:120,speed:46,sink:7,noflare:true});});
  F.arcadeWheels=await page.evaluate(async()=>{await begin('Sortie 25');aeroMode=false;return fly({alt:120,speed:46,sink:3.5,wheels:true});});
  F.real=await page.evaluate(async()=>{await begin('Sortie 25');aeroMode=true;switchFlightModel();return fly({alt:120,speed:46,sink:3.5});});
  F.realSteep=await page.evaluate(async()=>{await begin('Sortie 25');aeroMode=true;switchFlightModel();return fly({alt:120,speed:46,sink:7,noflare:true});});
  F.realWheels=await page.evaluate(async()=>{await begin('Sortie 25');aeroMode=true;switchFlightModel();return fly({alt:120,speed:46,sink:3.5,wheels:true});});
  await page.evaluate(()=>{aeroMode=false;});
  report.flying=F;
  for(const k of ['arcade','real']){const f=F[k];
   assert.ok(f.climbT>0&&f.climbT<90,k+': off the water and 120 m up in '+f.climbT+' s');assert.ok(f.touch,k+': she came back down');assert.ok(f.alive&&!f.dead,k+': a flared alighting is survived (hull '+f.hull+')');
   assert.ok(f.stopSpeed<2.5,k+': she runs out and stops ('+f.stopSpeed+' m/s after '+f.stopT+' s)');assert.ok(f.hull>=90,k+': a clean alighting costs almost nothing ('+f.hull+')');}
  assert.ok(F.arcadeSteep.alive&&F.arcadeSteep.hull<F.arcade.hull,'ARCADE forgives an unflared 7 m/s alighting with hull damage (hull '+F.arcadeSteep.hull+')');
  assert.ok(F.realSteep.dead||!F.realSteep.alive,'REALISTIC breaks the boat at 7 m/s sink: '+F.realSteep.result);assert.match(F.realSteep.result||'',/HARD LANDING|TOO FAST/,'an unflared 7 m/s alighting at speed is a wreck in REALISTIC (the same flight is only a dent in ARCADE)');
  assert.ok(F.arcadeWheels.alive&&F.arcadeWheels.touch.gear<.1,'in ARCADE the crew raises the wheels in time: gear '+F.arcadeWheels.touch.gear+' at touch-down (the hull loss of '+(100-F.arcadeWheels.hull)+' % is the firm alighting at '+F.arcadeWheels.touch.sink+' m/s, not the wheels)');assert.ok(F.arcadeWheels.said.some(t=>/WHEELS COMING UP/.test(t)),'and says so');
  assert.ok(F.realWheels.dead&&/GEAR DOWN ON THE WATER/.test(F.realWheels.result||''),'in REALISTIC wheels down on the water are fatal: '+F.realWheels.result);
  // the briefing, the contact list and the minimap never show a hidden thing
  const H=await page.evaluate(async()=>{await begin('Sortie 24');const ops=pbyOps,out={};
   out.targets=MISSIONS[mission].targets.length+ships.length;out.contactKinds=pacificContacts().map(c=>c.kind||c.type||c.label||'');out.ringOnly=!!ops.ring&&!ops.found;
   return out;});
  assert.equal(H.targets,0,'no target and no ship exists for the rescue search');assert.ok(H.ringOnly,'only the ring until the raft is seen');
  assert.ok(!H.contactKinds.some(k=>/raft|dye|survivor|sub|convoy/i.test(String(k))),'the contact list does not give the hidden thing away: '+JSON.stringify(H.contactKinds));
  const bad=missing.filter(u=>!/favicon|\.mp3|\.wav/.test(u));
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/pby-pacific-browser.json'),JSON.stringify(report,null,1));
  console.log('missing',JSON.stringify(missing));
  assert.deepEqual(errors.filter(e=>!/404/.test(e)),[],'no page errors');
  console.log('PBY patrol WebGL: take-off, alighting (ARCADE/REALISTIC), search rings and the four sorties OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
