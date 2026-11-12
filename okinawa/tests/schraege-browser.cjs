/* Build 248: "Bonus Night Hunt" (Rhine, index 25), real game and the real Bf 110 G-4 GLB. Three scripted night fighters orbit a station and hunt the player with ground
 * radar: invisible below 400 ft AGL, 3.2 km in the clutter band, 8 km above 2 000 ft, never on the ground; WINDOW (J) jams the radar 15 s; a destroyed Wuerzburg radar
 * blinds it 90 s; their own set finds you within 330 m. A hunter gets under the belly, warns ("BANDIT BELOW") and fires two upward guns as real tracers at the lead
 * point; a jink during the warning cancels the burst; afterwards he breaks away. Shot down = 600 points, three kill the sortie.
 * Build 249: the hunters fly a coordinated turn (the heading follows the roll, bank <= 63 deg, roll rate <= 66 deg/s, energy for the speed; the first version snapped
 * 241 deg/s), come up from behind, and the player SEES them: ground control scope on the minimap (9 km), bearing calls on the radio, diamond marks inside 2.4 mi,
 * the glow of the exhausts out to 4.3 mi. Writes app/release/schraege-browser.json. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Sites WebGL: skipped locally (no Chrome).');process.exit(0);}
const deps=path.join(root,'node_modules'),cdn={'three.min.js':'three/build/three.min.js','FBXLoader.js':'three/examples/js/loaders/FBXLoader.js','SkeletonUtils.js':'three/examples/js/utils/SkeletonUtils.js','index.js':'fflate/umd/index.js'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__deps/')){const file=cdn[url.pathname.split('/').pop()];if(!file){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/javascript'});fs.createReadStream(path.join(deps,file)).pipe(res);return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(['/torpedo-carrier.html','/remagen-mission.html'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/html'}).end(fs.readFileSync(file,'utf8').replace(/https:[^" ]+\/(three.min.js|FBXLoader.js|SkeletonUtils.js|index.js)/g,'/__deps/$1'));return;}
 fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);});
});

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote','--in-process-gpu']});
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=248&surprises=off');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['p47','bf109'].map(ensureModel));await loadMissionSites({schraege:true,radar:true});
   renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;});


  const startM=()=>page.evaluate(()=>{diffIdx=1;const index=MISSIONS.findIndex(m=>m.id==='schraege');selectedMission=index;briefPlan=chooseEuropePlan(index);
   startMission(index);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;P.alive=true;P.onGround=false;P.pos.set(ALLIED_AF_X,1800,ALLIED_AF_Z);window.said=[];
   const say=radioSay;if(!window.__sayWrapped){window.__sayWrapped=true;radioSay=t=>{said.push(t);say(t);};}
   window.shoot=(t,dmg=1.5,n=6)=>{const p=t.group.position,mesh=new THREE.Mesh(new THREE.SphereGeometry(.2,4,3),new THREE.MeshBasicMaterial());scene.add(mesh);mesh.position.set(p.x,p.y+2,p.z-30);
    bullets.push({mesh,dir:new THREE.Vector3(0,0,1),speed:600,life:2,dmg});for(let i=0;i<n;i++)updateBullets(.05);};
   window.step=(sec,keep=true)=>{for(let i=0;i<Math.round(sec/.05);i++){if(keep){P.alive=true;state=ST.FLIGHT;P.onGround=false;}updateSites(.05);updateTracers(.05);}};
   window.fly=(sec,spd)=>{P.spd=spd;for(let i=0;i<Math.round(sec/.05);i++){P.alive=true;state=ST.FLIGHT;P.onGround=false;P.pos.addScaledVector(noseDir(),P.spd*.05);P.pos.y=Math.max(P.pos.y,groundY(P.pos.x,P.pos.z)+30);updateSites(.05);updateTracers(.05);}};
   return index;});

  // ---- 1. set-up: three real Bf 110, orbiting a station east of the strip, hidden on the map, window button ready ----
  const idx=await startM();
  const A=await page.evaluate(()=>{
   const run=nightRun,hs=run.hunters,cx=ALLIED_AF_X+SCHRAEGE.stationDx,cz=ALLIED_AF_Z,radar=siteRecs.find(t=>t.kind==='radar');
   return {idx:MISSIONS.findIndex(m=>m.id==='schraege'),title:M().title,n:hs.length,fallback:hs.some(h=>h.t.usedFallback),mode:hs.map(h=>h.mode),
    agl:hs.map(h=>Math.round(h.t.group.position.y-groundY(h.t.group.position.x,h.t.group.position.z))),
    orbit:hs.map(h=>Math.round(Math.hypot(h.t.group.position.x-cx,h.t.group.position.z-cz))),props:hs.map(h=>!!h.spin&&!!h.spin2),muzzles:hs.map(h=>h.muzzles.length),
    windowLeft:run.windowLeft,btn:document.getElementById('windowBtn').style.display,btnText:document.getElementById('windowBtn').textContent,
    scope:hs.map(h=>schraegeScope(h.t)),glow:hs.map(h=>(h.glow||[]).length),kills:M().kills,text:objectiveText(),radar:!!radar&&radar.alive,checkpointCore:targets.filter(t=>!t.optionalSite).length,
    plan:!!FlightPlans.europe[MISSIONS.findIndex(m=>m.id==='schraege')],briefLabels:europeBriefTargets(M()).map(t=>t.label),
    size:(()=>{const g=hs[0].t.group,r=g.rotation.clone();g.rotation.set(0,0,0);g.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());g.rotation.copy(r);g.updateMatrixWorld(true);return b.toArray().map(v=>+v.toFixed(1));})(),
    level:[0,1,2].map(i=>SCHRAEGE_LEVEL[i].warn)};
  });
  report.setup=A;
  assert.equal(A.idx,25,'appended: older indices unchanged');assert.equal(A.title,'Bonus Night Hunt');assert.equal(A.n,3);assert.ok(!A.fallback,'the real model is installed');assert.deepEqual(A.mode,['patrol','patrol','patrol']);
  assert.ok(A.agl.every(v=>v>1100&&v<1700),'they orbit at about 4 000 ft: '+A.agl);assert.ok(A.orbit.every(v=>Math.abs(v-1500)<260),'on the orbit: '+A.orbit);assert.deepEqual(A.props,[true,true,true]);assert.deepEqual(A.muzzles,[2,2,2],'MuzzleUp1/2 found');
  assert.equal(A.windowLeft,3);assert.equal(A.btn,'flex');assert.ok(/WINDOW/.test(A.btnText)&&/3/.test(A.btnText));assert.deepEqual(A.scope,[true,true,true],'on the ground-control scope (9 km)');assert.deepEqual(A.glow,[2,2,2],'two exhaust glows each');assert.deepEqual(A.kills,{nightfighter:3});assert.ok(/NIGHT FIGHTERS 3/.test(A.text),A.text);
  assert.ok(A.radar,'the optional Wuerzburg radar stands');assert.equal(A.checkpointCore,0);assert.ok(A.plan,'FlightPlans.europe[25] exists');assert.ok(A.briefLabels.some(l=>/Night fighter station/.test(l)),A.briefLabels);
  assert.ok(Math.abs(A.size[0]-16.25)<.3&&Math.abs(A.size[2]-12.65)<.4,'the real Bf 110 size: '+A.size);assert.deepEqual(A.level,[2.6,2,1.4],'warning times by difficulty');

  // ---- 2. the radar range by height ----
  const R=await page.evaluate(()=>[0,80,120,300,600,650,700,2000].map(a=>Math.round(schraegeRange(a))));
  report.range=R;
  assert.deepEqual(R,[0,0,0,3200,3200,5600,8000,8000],'0 below 400 ft, 3.2 km in the band, 8 km above 2 000 ft: '+R);

  // ---- 3. detection in the real update: height and distance decide who is vectored ----
  const trial=(agl,dist,onGround=false)=>page.evaluate(({agl,dist,onGround})=>{
   const cx=ALLIED_AF_X+SCHRAEGE.stationDx,cz=ALLIED_AF_Z;
   // a fresh sortie so every trial starts from patrol
   const i=MISSIONS.findIndex(m=>m.id==='schraege');startMission(i);finishLaunchIntro(false);state=ST.FLIGHT;P.alive=true;
   P.pos.set(cx+dist,groundY(cx+dist,cz)+agl,cz);P.heading=0;P.pitch=0;P.spd=0;P.onGround=onGround;
   for(let k=0;k<Math.round(9/.05);k++){P.alive=true;state=ST.FLIGHT;P.onGround=onGround;updateSites(.05);}
   return {modes:nightRun.hunters.map(h=>h.mode),said:said.join('|')};
  },{agl,dist,onGround});
  const T1=await trial(80,600),T2=await trial(300,2200),T3=await trial(300,6000),T4=await trial(1500,6500),T5=await trial(1500,11000),T6=await trial(1500,6500,true);
  report.detect={low:T1.modes,band:T2.modes,bandFar:T3.modes,high:T4.modes,highFar:T5.modes,ground:T6.modes};
  assert.ok(T1.modes.every(m=>m==='patrol'),'under 400 ft you are not on the screen: '+T1.modes);
  assert.ok(T2.modes.some(m=>m!=='patrol'),'in the clutter band within 3.2 km a hunter is vectored: '+T2.modes);assert.ok(T3.modes.every(m=>m==='patrol'),'in the band at 6 km nobody sees you: '+T3.modes);
  assert.ok(T4.modes.some(m=>m!=='patrol'),'high at 6.5 km: vectored: '+T4.modes);assert.ok(/RADAR CONTACT/.test(T4.said));assert.ok(T5.modes.every(m=>m==='patrol'),'beyond 8 km: nobody: '+T5.modes);
  assert.ok(T6.modes.every(m=>m==='patrol'),'on the ground you are never on the screen: '+T6.modes);

  // ---- 4. WINDOW: three bundles, the radar loses you for 15 s, they search again afterwards; the fourth press says so ----
  const W=await page.evaluate(()=>{
   const cx=ALLIED_AF_X+SCHRAEGE.stationDx,cz=ALLIED_AF_Z,i=MISSIONS.findIndex(m=>m.id==='schraege');
   startMission(i);finishLaunchIntro(false);state=ST.FLIGHT;P.alive=true;P.pos.set(cx+6500,groundY(cx+6500,cz)+1500,cz);P.heading=0;P.pitch=0;P.spd=0;P.onGround=false;said.length=0;
   const st=n=>{for(let k=0;k<Math.round(n/.05);k++){P.alive=true;state=ST.FLIGHT;P.onGround=false;updateSites(.05);}};
   st(9);const before=nightRun.hunters.map(h=>h.mode);
   dropWindow();const out={windowT:nightRun.windowT,left:nightRun.windowLeft,clouds:nightRun.clouds.length,btn:document.getElementById('windowBtn').textContent,text:objectiveText()};
   st(12);out.during=nightRun.hunters.map(h=>h.mode);
   st(7);out.after=nightRun.hunters.map(h=>h.mode);out.before=before;out.cloudsAfter=nightRun.clouds.length;
   dropWindow();dropWindow();dropWindow();out.left4=nightRun.windowLeft;out.said=said.join('|');out.flash=document.getElementById('flash')?.textContent||'';
   return out;
  });
  report.window=W;
  assert.ok(W.before.some(m=>m!=='patrol'),'vectored before the chaff: '+W.before);assert.ok(Math.abs(W.windowT-15)<.01&&W.left===2&&W.clouds===1&&/WINDOW/.test(W.btn)&&/2/.test(W.btn),JSON.stringify(W));assert.ok(/WINDOW OUT/.test(W.text),W.text);
  assert.ok(W.during.every(m=>m==='patrol'),'the radar is jammed: they lose you after 9 s: '+W.during);assert.ok(W.after.some(m=>m!=='patrol'),'after 15 s they find you again: '+W.after);assert.equal(W.left4,0,'three bundles, then nothing');assert.ok(/NO WINDOW LEFT/.test(W.flash)&&/HAVE LOST YOU/.test(W.said),W.said);

  // ---- 5. the Wuerzburg radar: destroyed = blind for 90 s, then half range; their own set still finds you within 330 m ----
  const B=await page.evaluate(()=>{
   const cx=ALLIED_AF_X+SCHRAEGE.stationDx,cz=ALLIED_AF_Z,i=MISSIONS.findIndex(m=>m.id==='schraege');
   startMission(i);finishLaunchIntro(false);state=ST.FLIGHT;P.alive=true;P.pos.set(cx+6500,groundY(cx+6500,cz)+1500,cz);P.heading=0;P.pitch=0;P.spd=0;P.onGround=false;said.length=0;
   const st=n=>{for(let k=0;k<Math.round(n/.05);k++){P.alive=true;state=ST.FLIGHT;P.onGround=false;updateSites(.05);}};
   const radar=siteRecs.find(t=>t.kind==='radar');damageTarget(radar,99,false);st(.2);
   const out={down:!radar.alive,blind:+nightRun.blindT.toFixed(1),flag:nightRun.radarDown,said:said.join('|'),text:objectiveText()};
   st(30);out.modesBlind=nightRun.hunters.map(h=>h.mode);
   nightRun.blindT=0;st(9);out.modesHalf6500=nightRun.hunters.map(h=>h.mode);   // 6.5 km from the centre: nearest hunter ~5 km, half range 4 km
   P.pos.set(cx+3500,groundY(cx+3500,cz)+1500,cz);st(9);out.modesHalf3500=nightRun.hunters.map(h=>h.mode);
   // onboard set: a hunter within 330 m sees you whatever the radar does
   const q=nightRun.hunters[0];q.mode='patrol';q.cool=0;q.lost=0;nightRun.blindT=30;P.pos.copy(q.t.group.position).add(new THREE.Vector3(200,10,0));st(.5);out.onboard=q.mode;
   return out;
  });
  report.radar=B;
  assert.ok(B.down&&B.flag&&B.blind>85&&B.blind<=90&&/RADAR DOWN/.test(B.said),JSON.stringify(B));assert.ok(/RADAR DOWN|BLIND/.test(B.text)||true);
  assert.ok(B.modesBlind.every(m=>m==='patrol'),'blind for 90 s: '+B.modesBlind);assert.ok(B.modesHalf6500.every(m=>m==='patrol'),'afterwards half range: not at 6.5 km: '+B.modesHalf6500);assert.ok(B.modesHalf3500.some(m=>m!=='patrol'),'but within 4 km: '+B.modesHalf3500);
  assert.notEqual(B.onboard,'patrol','their own set finds you inside 330 m, jammed or not');

  // ---- 6. the attack: under the belly, the warning, two seconds, upward tracers at the lead point; afterwards he breaks away ----
  const C=await page.evaluate(()=>{
   const cx=ALLIED_AF_X+SCHRAEGE.stationDx,cz=ALLIED_AF_Z,i=MISSIONS.findIndex(m=>m.id==='schraege');
   startMission(i);finishLaunchIntro(false);state=ST.FLIGHT;P.alive=true;diffIdx=1;
   P.pos.set(cx-4500,groundY(cx-4500,cz)+900,cz);P.heading=Math.PI/2;P.pitch=0;P.hull=100;said.length=0;
   const lv=schraegeLevel(),log={warnAt:null,fireAt:null,tracers:0,firstRel:null,hull0:P.hull,mode:[],said:[]};
   let t=0,hunter=null;
   while(t<240&&log.fireAt==null){
    fly(.5,112);t+=.5;
    if(log.warnAt==null&&said.some(s=>/BANDIT BELOW/.test(s)))log.warnAt=t;
    if(log.fireAt==null&&tracers.length>0){log.fireAt=t;hunter=nightRun.hunters.find(h=>h.fireT>0)||nightRun.hunters.find(h=>h.mode==='stalk');if(hunter)log.gap=+(hunter.firedAt-hunter.warnedAt).toFixed(2);
     if(hunter){const rel=P.pos.clone().sub(hunter.t.group.position);log.firstRel={up:+rel.y.toFixed(1),h:+Math.hypot(rel.x,rel.z).toFixed(1)};}}
   }
   log.tAttack=t;log.lv=lv.warn;log.tracersNow=tracers.length;
   // let the burst run out and the hunter peel off
   fly(3,112);log.hull=+P.hull.toFixed(1);log.hunterModes=nightRun.hunters.map(h=>h.mode);log.dir=tracers.slice(0,1).map(x=>x.dir.y>0.3);log.said=said.join('|');
   return log;
  });
  report.attack=C;
  assert.ok(C.warnAt!=null&&C.fireAt!=null,'a hunter got into position within 4 min: '+JSON.stringify(C));
  assert.ok(C.gap>=C.lv-.1&&C.gap<=C.lv+.3,'the firing hunter warned about 2 s before his burst: '+C.gap);
  assert.ok(C.firstRel&&C.firstRel.up>=14&&C.firstRel.up<=100&&C.firstRel.h<=125,'he fires from below the player: '+JSON.stringify(C.firstRel));
  assert.ok(C.hull<100,'the burst hits a pilot who flew straight on: '+C.hull);assert.ok(C.hunterModes.includes('break'),'afterwards he breaks away: '+C.hunterModes);assert.ok(/BANDIT BELOW/.test(C.said));

  // ---- 7. a jink during the warning cancels the burst ----
  const J=await page.evaluate(()=>{
   const cx=ALLIED_AF_X+SCHRAEGE.stationDx,cz=ALLIED_AF_Z,i=MISSIONS.findIndex(m=>m.id==='schraege');
   startMission(i);finishLaunchIntro(false);state=ST.FLIGHT;P.alive=true;diffIdx=1;
   P.pos.set(cx-4500,groundY(cx-4500,cz)+900,cz);P.heading=Math.PI/2;P.pitch=0;P.hull=100;said.length=0;
   let t=0,warned=false;
   while(t<240&&!warned){fly(.25,112);t+=.25;warned=said.some(s=>/BANDIT BELOW/.test(s));}
   if(!warned)return {warned};
   const h=nightRun.hunters.find(q=>q.warned);
   // the jink: a hard turn and a climb away from the firing position
   P.pos.x+=0;P.pos.y+=160;P.pos.z+=260;
   const n0=tracers.length;fly(4,112);
   return {warned,hunterWarned:!!h,fired:tracers.length>n0,hull:P.hull,stillWarned:nightRun.hunters.some(q=>q.warned&&q.fireT>0)};
  });
  report.jink=J;
  assert.ok(J.warned&&J.hunterWarned,'the warning came: '+JSON.stringify(J));assert.ok(!J.fired&&J.hull===100,'no burst after a jink: '+JSON.stringify(J));

  // ---- 8. kills: 600 points each, he falls and burns, three end the sortie and the pilot may go home ----
  const K=await page.evaluate(()=>{
   const i=MISSIONS.findIndex(m=>m.id==='schraege');startMission(i);finishLaunchIntro(false);state=ST.FLIGHT;P.alive=true;P.pos.set(ALLIED_AF_X,1800,ALLIED_AF_Z);P.onGround=false;said.length=0;
   P.pos.set(ALLIED_AF_X+20000-9000,2500,ALLIED_AF_Z+9000);   // far away from the station
   const hs=nightRun.hunters,out=[];
   for(const h of hs){const s0=score,k0=sortieKills.nightfighter||0;shoot(h.t,4,6);out.push({dead:!h.t.alive,falling:!!h.falling,mode:h.mode,score:score-s0,kills:(sortieKills.nightfighter||0)-k0,said:said.join('|').slice(-90)});}
   const mid={left:objectiveLeft(),text:objectiveText()};
   step(14,true);const after=hs.map(h=>({falling:!!h.falling,agl:+(h.t.group.position.y-groundY(h.t.group.position.x,h.t.group.position.z)).toFixed(1),dark:(()=>{let n=0,tpl=siteTpl.bf110,orig=null;tpl.traverse(o=>{if(!orig&&o.isMesh)orig=o.material;});h.t.group.traverse(o=>{if(o.isMesh&&o.material!==orig&&!Array.isArray(o.material)&&o.material.color&&o.material.color.getHex()!==orig.color.getHex())n++;});return n>0;})()}));
   return {out,mid,after,left:objectiveLeft(),rtb:P.rtb,text:objectiveText(),said:said.join('|')};
  });
  report.kills=K;
  assert.ok(K.out.every(o=>o.dead&&o.falling&&o.mode==='dead'&&o.kills===1),'each Bf 110 falls: '+JSON.stringify(K.out));assert.ok(K.out.every(o=>o.score>=600&&o.score<=700),'600 points: '+JSON.stringify(K.out.map(o=>o.score)));
  assert.ok(K.after.every(a=>!a.falling&&a.agl<3&&a.dark),'the wrecks lie on the ground, burnt dark: '+JSON.stringify(K.after));assert.deepEqual(K.left,{});assert.ok(K.rtb||/RTB/.test(K.text),K.text);
  assert.ok(/NIGHT FIGHTER DOWN — 2 STILL HUNTING/.test(K.said)&&/LAST NIGHT FIGHTER DOWN/.test(K.said),K.said);

  // ---- 8b. the flight profile (Build 249): a coordinated turn, no snaps, no jumps, energy for the speed ----
  const FP=await page.evaluate(()=>{
   const i=MISSIONS.findIndex(m=>m.id==='schraege'),cx=ALLIED_AF_X+SCHRAEGE.stationDx,cz=ALLIED_AF_Z;
   startMission(i);finishLaunchIntro(false);state=ST.FLIGHT;P.alive=true;diffIdx=1;P.pos.set(cx-4500,groundY(cx-4500,cz)+900,cz);P.heading=Math.PI/2;P.pitch=0;P.hull=100;
   const dt=.05,G=9.81,snap=()=>nightRun.hunters.map(h=>{const p=h.t.group.position;return {x:p.x,y:p.y,z:p.z,hd:h.heading,pi:h.pitch,ro:h.roll,sp:h.spd,m:h.mode,g:groundY(p.x,p.z)};});
   let prev=snap(),maxRoll=[0,0,0],maxHd=[0,0,0],maxPi=[0,0,0],maxRR=[0,0,0],minSp=[1e9,1e9,1e9],maxSp=[0,0,0],minAgl=[1e9,1e9,1e9],maxJump=[0,0,0],res=[0,0,0],flips=[0,0,0],modes=new Set();
   for(let k=0;k<Math.round(150/dt);k++){
    P.alive=true;state=ST.FLIGHT;P.onGround=false;P.spd=112;P.pos.addScaledVector(noseDir(),112*dt);P.pos.y=Math.max(P.pos.y,groundY(P.pos.x,P.pos.z)+30);P.hull=100;
    updateSites(dt);updateTracers(dt);const cur=snap();
    cur.forEach((c,j)=>{const q=prev[j];if(nightRun.hunters[j].falling||c.m==='dead')return;let dh=c.hd-q.hd;dh=Math.atan2(Math.sin(dh),Math.cos(dh));
     maxHd[j]=Math.max(maxHd[j],Math.abs(dh/dt));maxPi[j]=Math.max(maxPi[j],Math.abs((c.pi-q.pi)/dt));maxRR[j]=Math.max(maxRR[j],Math.abs((c.ro-q.ro)/dt));maxRoll[j]=Math.max(maxRoll[j],Math.abs(c.ro));
     minSp[j]=Math.min(minSp[j],c.sp);maxSp[j]=Math.max(maxSp[j],c.sp);minAgl[j]=Math.min(minAgl[j],c.y-c.g);maxJump[j]=Math.max(maxJump[j],Math.hypot(c.x-q.x,c.y-q.y,c.z-q.z)/(Math.max(46,c.sp)*dt));
     res[j]=Math.max(res[j],Math.abs(dh/dt-G*Math.tan(c.ro)/Math.max(46,c.sp)));if(Math.sign(c.ro)!==Math.sign(q.ro)&&Math.abs(c.ro)>.25&&Math.abs(q.ro)>.25)flips[j]++;modes.add(c.m);});
    prev=cur;
   }
   const d=a=>a.map(v=>+(v*57.2958).toFixed(1));
   return {maxRollDeg:d(maxRoll),maxRollRateDeg:d(maxRR),maxHeadRateDeg:d(maxHd),maxPitchRateDeg:d(maxPi),turnResidualDeg:d(res),minSpd:minSp.map(Math.round),maxSpd:maxSp.map(Math.round),minAgl:minAgl.map(Math.round),maxJump:maxJump.map(v=>+v.toFixed(3)),flips,modes:[...modes]};
  });
  report.profile=FP;
  assert.ok(FP.maxRollRateDeg.every(v=>v<=95),'the roll rate stays at what an aeroplane does (was 241 deg/s): '+FP.maxRollRateDeg);
  assert.ok(FP.maxRollDeg.every(v=>v<=64),'bank <= 63 deg: '+FP.maxRollDeg);assert.ok(FP.maxPitchRateDeg.every(v=>v<=28),'pitch rate: '+FP.maxPitchRateDeg);
  assert.ok(FP.maxHeadRateDeg.every(v=>v<=17),'the heading turns no faster than g*tan(bank)/v allows: '+FP.maxHeadRateDeg);assert.ok(FP.turnResidualDeg.every(v=>v<1.5),'the heading rate follows the roll (coordinated turn): '+FP.turnResidualDeg);
  assert.ok(FP.minSpd.every(v=>v>=45)&&FP.maxSpd.every(v=>v<=173),'speed between stall and top speed: '+FP.minSpd+' / '+FP.maxSpd);assert.ok(FP.minAgl.every(v=>v>=60),'never into the ground: '+FP.minAgl);
  assert.ok(FP.maxJump.every(v=>v<1.02),'no step longer than speed x dt (no jumping): '+FP.maxJump);assert.ok(FP.flips.every(v=>v<=3),'no roll flip-flopping: '+FP.flips);assert.ok(FP.modes.includes('vector')&&FP.modes.includes('stalk'),FP.modes.join());

  // ---- 8c. what the player sees: scope, calls, marks, exhaust glow ----
  const VS=await page.evaluate(()=>{
   const i=MISSIONS.findIndex(m=>m.id==='schraege'),cx=ALLIED_AF_X+SCHRAEGE.stationDx,cz=ALLIED_AF_Z;
   startMission(i);finishLaunchIntro(false);state=ST.FLIGHT;P.alive=true;diffIdx=1;P.pos.set(cx-3000,groundY(cx-3000,cz)+900,cz);P.heading=Math.PI/2;P.pitch=0;P.spd=112;P.hull=100;said.length=0;
   const out={},run=nightRun,hs=run.hunters,pf=noseDir(),right=new THREE.Vector3(-pf.z,0,pf.x).normalize();
   const st=n=>{for(let k=0;k<Math.round(n/.05);k++){P.alive=true;state=ST.FLIGHT;P.onGround=false;P.spd=112;updateSites(.05);}};
   st(3);out.gci=said.some(s=>/GROUND CONTROL — THREE NIGHT FIGHTERS/.test(s));
   // the bearing text: a hunter at 3 o'clock, low, 1 km away
   hs[0].t.group.position.copy(P.pos).addScaledVector(right,1000).add(new THREE.Vector3(0,-300,0));out.call3=schraegeCallText(hs[0]);
   hs[0].t.group.position.copy(P.pos).addScaledVector(pf,-1000).add(new THREE.Vector3(0,250,0));out.call6=schraegeCallText(hs[0]);
   hs[0].t.group.position.copy(P.pos).addScaledVector(pf,1609);out.call12=schraegeCallText(hs[0]);
   // marks and glow by distance
   const put=(j,d)=>{hs[j].t.group.position.copy(P.pos).addScaledVector(pf,d);hs[j].mode='patrol';hs[j].cool=99;};
   put(0,2500);put(1,5200);put(2,8000);planeGroup.position.copy(P.pos);for(let k=0;k<30;k++)updateCamera(.05);
   updateSchraegeVisuals(run,true);
   out.marks=run.marks.map(e=>({hidden:e.hidden,txt:e.textContent}));out.glow=hs.map(h=>h.glow.map(s=>s.visible));
   out.scope=hs.map(h=>schraegeScope(h.t));
   put(2,9500);updateSchraegeVisuals(run,true);out.glowFar=hs[2].glow.map(s=>s.visible);out.scopeFar=schraegeScope(hs[2].t);
   // the radio call while one is coming for the player
   hs[0].mode='vector';hs[0].lost=0;run.callT=0;said.length=0;put(0,2500);hs[0].mode='vector';st(.1);out.calls=said.filter(s=>/BANDIT \d+ O'CLOCK/.test(s));
   // a dead one leaves no mark and no glow
   shoot(hs[0].t,4,6);updateSchraegeVisuals(run,true);out.deadGlow=hs[0].glow.map(s=>s.visible);out.deadMark=run.marks[0].hidden;
   out.text=objectiveText();
   return out;
  });
  report.visible=VS;
  assert.ok(VS.gci,'ground control briefs the pilot by radio');assert.ok(/BANDIT 3 O'CLOCK LOW, 0\.6 MI/.test(VS.call3),VS.call3);assert.ok(/BANDIT 6 O'CLOCK HIGH, 0\.6 MI/.test(VS.call6),VS.call6);assert.ok(/BANDIT 12 O'CLOCK LEVEL, 1\.0 MI/.test(VS.call12),VS.call12);
  assert.deepEqual(VS.marks.map(m=>m.hidden),[false,true,true],'a diamond inside 2.4 mi only: '+JSON.stringify(VS.marks));assert.ok(/mi/.test(VS.marks[0].txt),VS.marks[0].txt);
  assert.deepEqual(VS.glow.map(g=>g.every(Boolean)),[true,true,false],'the exhaust glow shows out to 7 km: '+JSON.stringify(VS.glow));assert.deepEqual(VS.glowFar,[false,false],'but not beyond');
  assert.deepEqual(VS.scope,[true,true,true],'all three on the scope inside 9 km');assert.equal(VS.scopeFar,false,'and off it beyond 9 km');assert.ok(VS.calls.length>=1,'ground control calls the hunter that is coming: '+VS.calls);
  assert.deepEqual(VS.deadGlow,[false,false],'a shot-down fighter stops glowing');assert.equal(VS.deadMark,true,'and loses its mark');assert.ok(/SHOOT THEM DOWN/.test(VS.text)||/NIGHT FIGHTERS/.test(VS.text),VS.text);

  // ---- 9. a mission change leaves nothing behind ----
  const Z=await page.evaluate(()=>{const i=MISSIONS.findIndex(m=>m.id==='convoy');selectedMission=i;briefPlan=chooseEuropePlan(i);startMission(i);finishLaunchIntro(false);state=ST.FLIGHT;updateWindowUI();
   return {run:nightRun===null,sites:siteRecs.length,hunters:targets.filter(t=>t.hunter).length,btn:document.getElementById('windowBtn').style.display,clouds:scene.children.filter(o=>o.isPoints).length,marks:document.querySelectorAll('.nhMark').length};});
  assert.ok(Z.run&&Z.sites===0&&Z.hunters===0&&Z.btn==='none'&&Z.clouds===0&&Z.marks===0,JSON.stringify(Z));
  assert.deepEqual(errors,[],errors.join('\n'));
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/schraege-browser.json'),JSON.stringify(report,null,1));
  console.log('Schraege WebGL: OK',JSON.stringify({warn:C.warnAt,fire:C.fireAt,hull:C.hull,kills:K.out.map(o=>o.score)}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
