/* Build 264, real Pacific game: the Catalina in a rough sea, what drifts, the false contacts, the survivors' radio, light at night, fuel and the spray of the hull. GAME_TEST_CHROME selects Chrome. */
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
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=267');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{
   renderer.setPixelRatio(1);await prepareOkinawa();
   window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.step=dt=>{SortieFeatures.Damage.tick(P,dt);pollKeys(dt);updateFlight(dt);if(state!==ST.FLIGHT)return;updatePbyPatrol(dt);updateBombs(dt);updateZeros(dt);updateShips(dt);updatePlaneMesh(dt);updateNav();updateSea(performance.now()*.001);updateSmoke(dt);updateWakes(dt);updateSplashes(dt);};
   window.begin=async(title,diff='veteran',wx,time)=>{const i=MISSIONS.findIndex(m=>m.title===title);DIFF=diff;await preparePacificModels(MISSIONS[i]);startMission(i);if(wx){weather=wx;applyWeather();}if(time)applyTimeOfDay(time);launch();said.length=0;return i;};
   window.far=(ops,x,z)=>{ops.point.x=x;ops.point.z=z;if(ops.dye){ops.dye.position.x=x;ops.dye.position.z=z;}for(const m of ops.men){m.group.position.x=x;m.group.position.z=z;}};   // park the real raft far away so only the false contacts are in play
   window.put=(x,z,alt=120,heading=0)=>{P.onWater=false;P.pos.set(x,pbySea(x,z)+alt,z);P.heading=heading;P.spd=55;P.vSpeed=0;P.pbyLiftT=0;P.touchResolved=true;};
  });
  const shot=async(name)=>{const url=await page.evaluate(()=>{sea.position.x=P.pos.x;sea.position.z=P.pos.z;for(let i=0;i<40;i++)updateCamera(.1);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');});
   fs.writeFileSync(path.join(process.env.PBY_SHOTS||'/tmp',name+'.png'),Buffer.from(url.split(',')[1],'base64'));};
  const run=(fn,...a)=>page.evaluate(fn,...a);

  // ---- 1. a rough sea narrows the boat, a calm one does not ----
  const R=await run(async()=>{
   const out={};
   await begin('Sortie 24','veteran','clear');out.calm={sea:seaState,rules:pbyRules(),real:PbyPatrol.rules(aeroMode,1)};
   weather='storm';applyWeather();out.storm={sea:seaState,rules:pbyRules(),key:pbyWeatherKey(),sight:PbyPatrol.sightRange('raft',pbySight())};
   weather='clear';applyWeather();out.back={sea:seaState,sight:PbyPatrol.sightRange('raft',pbySight())};
   // the cue on the approach in a heavy sea
   weather='storm';applyWeather();put(P.pos.x-3000,P.pos.z,30,Math.PI);P.vSpeed=-2;P.seaCued=false;said.length=0;pbyApproach(.016);out.cue=P.seaCued;
   weather='clear';applyWeather();
   return out;});
  report.rough=R;
  assert.equal(R.calm.sea,1,'a clear sortie has a calm sea');assert.deepEqual(R.calm.rules,R.calm.real,'at sea state 1 the rules are the calm ones');
  assert.ok(R.storm.sea>1.9,'a storm raises the sea ('+R.storm.sea+')');
  for(const k of ['ok','hard','roll','over','pitchMax'])assert.ok(R.storm.rules[k]<R.calm.rules[k],k+' shrinks in the storm: '+R.storm.rules[k]+' < '+R.calm.rules[k]);
  assert.equal(R.storm.key,'storm');assert.ok(R.storm.sight<R.back.sight*.4,'a storm shortens the lookout ('+Math.round(R.storm.sight)+' < '+Math.round(R.back.sight)+' m)');assert.equal(R.back.sea,1,'the sea calms with the weather');
  assert.ok(R.cue,'the crew cues the heavy sea on the approach');

  // ---- 2. the roll of weather and light for the Catalina (automation keeps the plan unless the roll is switched on) ----
  const W=await run(()=>{
   const out={};const idx=t=>MISSIONS.findIndex(m=>m.title===t),sub=MISSIONS[idx('Sortie 25')],dumbo=MISSIONS[idx('Sortie 24')],shadow=MISSIONS[idx('Sortie 26')],cat=MISSIONS[idx('Sortie 27')];
   window.__wxRoll=false;DIFF='ace';out.off=Array.from({length:60},()=>rollPacificWeather(['broken'],sub)).every(w=>w==='broken')&&Array.from({length:60},()=>rollPacificTime(dumbo)).every(t=>t===null);
   window.__wxRoll=true;
   const tally=(diff,names,m)=>{DIFF=diff;const c={};for(let i=0;i<1500;i++){const w=rollPacificWeather(names,m);c[w]=(c[w]||0)+1;}return c;};
   out.ace=tally('ace',['broken'],sub);out.rookie=tally('rookie',['broken'],sub);out.vet=tally('veteran',['haze'],cat);
   const times=(diff,m)=>{DIFF=diff;const c={};for(let i=0;i<1500;i++){const t=rollPacificTime(m)||'day';c[t]=(c[t]||0)+1;}return c;};
   out.dumboAce=times('ace',dumbo);out.dumboRookie=times('rookie',dumbo);out.sub=times('veteran',sub);out.shadow=times('ace',shadow);out.cat=times('ace',cat);
   const keep=menuTime;menuTime='dusk';out.menu=rollPacificTime(dumbo);menuTime=keep;
   window.__wxRoll=false;return out;});
  report.roll=W;
  assert.ok(W.off,'without the switch automation keeps the plan: weather and light');
  const rank={clear:0,broken:1,haze:2,lowcloud:3,fog:3,rain:4,squall:5,storm:6};
  for(const [who,c] of [['ace',W.ace],['rookie',W.rookie],['veteran',W.vet]]){const worst=Math.max(...Object.keys(c).map(k=>rank[k]));assert.ok(worst<=(who==='rookie'?4:5),who+': the Catalina is never rolled into a storm ('+JSON.stringify(c)+')');}
  assert.ok((W.ace.broken||0)<1500*.4&&(W.rookie.broken||0)>(W.ace.broken||0),'Ace gets worse weather than Rookie');
  assert.ok((W.dumboAce.night||0)>200&&(W.dumboAce.dusk||0)>200&&(W.dumboRookie.night||0)===0&&(W.dumboRookie.dusk||0)>100,'the rescue falls at dusk or night, a Rookie only at dusk: '+JSON.stringify(W.dumboAce)+' '+JSON.stringify(W.dumboRookie));
  assert.ok(!W.sub.night&&((W.sub.dusk||0)+(W.sub.dawn||0))>300,'the submarine hunt never falls at night: '+JSON.stringify(W.sub));
  assert.deepEqual(W.shadow,{day:1500},'the convoy shadow stays a daylight job');assert.deepEqual(W.cat,{day:1500},'the Black Cat is night already (its own time)');assert.equal(W.menu,null,'a time chosen in the menu is kept');

  // ---- 3. what floats drifts, the search area is re-issued ----
  const D=await run(async()=>{
   await begin('Sortie 24','veteran','broken');const ops=pbyOps;put(carrierX,-3000,300,Math.PI);P.throttle=.5;
   const drift0={...ops.drift},p0={x:ops.point.x,z:ops.point.z},ring0={x:ops.ring.x,z:ops.ring.z},text0=ops.text,dye0={x:ops.dye.position.x,z:ops.dye.position.z},man0=ops.men.map(m=>({x:m.group.position.x,z:m.group.position.z}));
   ops.drift={x:.6,z:0,speed:.6,bearing:Math.PI/2};const drift=ops.drift;   // a fixed drift: due east at .6 m/s
   // hold the aeroplane high and far away while the sea moves what floats: 20 minutes
   for(let i=0;i<4800;i++){P.pos.set(carrierX,400,-3000);P.vSpeed=0;P.fuel=100;updatePbyPatrol(.25);}
   return {drift,drift0,secs:ops.t,p0,p1:{x:ops.point.x,z:ops.point.z},ring0,ring1:{x:ops.ring.x,z:ops.ring.z},text0,text1:ops.text,dye0,dye1:{x:ops.dye.position.x,z:ops.dye.position.z},man0,man1:ops.men.map(m=>({x:m.group.position.x,z:m.group.position.z})),datums:ops.datums,said:said.filter(s=>/DATUM/.test(s)),
    offset0:Math.hypot(p0.x-ring0.x,p0.z-ring0.z),offset1:Math.hypot(ops.point.x-ops.ring.x,ops.point.z-ops.ring.z),r:ops.ring.r,found:ops.found};});
  report.drift=D;
  assert.ok(D.drift0.speed>=.35&&D.drift0.speed<=.75,'broken-weather drift '+D.drift0.speed.toFixed(2)+' m/s');
  const moved=Math.hypot(D.p1.x-D.p0.x,D.p1.z-D.p0.z);assert.ok(Math.abs(moved-D.drift.speed*D.secs)<D.secs*.02,'the raft moved '+moved.toFixed(0)+' m in '+D.secs.toFixed(0)+' s ('+(D.drift.speed*D.secs).toFixed(0)+' expected)');
  assert.ok(Math.abs(D.p1.x-D.p0.x-D.drift.x*D.secs)<D.secs*.02&&Math.abs(D.p1.z-D.p0.z-D.drift.z*D.secs)<D.secs*.02,'in the direction of the drift');
  assert.ok(Math.abs(D.dye1.x-D.p1.x)<.5&&Math.abs(D.dye1.z-D.p1.z)<.5,'the dye patch moves with the raft');
  D.man1.forEach((m,i)=>assert.ok(Math.abs(m.x-D.man0[i].x-(D.p1.x-D.p0.x))<1&&Math.abs(m.z-D.man0[i].z-(D.p1.z-D.p0.z))<1,'the airmen move with the raft'));
  assert.ok(D.datums>=2&&D.said.length===D.datums,'the search area was re-issued '+D.datums+' times, each by radio');D.said.forEach(t=>assert.match(t,/HAS MOVED \d\.\d KM [NSEW]{1,3} \(SET AND DRIFT\): NOW ABOUT \d+ KM/,'the call says how far and which way: '+t));
  const rs={x:D.ring1.x-D.ring0.x,z:D.ring1.z-D.ring0.z},cosA=(rs.x*D.drift.x+rs.z*D.drift.z)/(Math.hypot(rs.x,rs.z)*D.drift.speed);assert.ok(Math.hypot(rs.x,rs.z)>150&&Math.hypot(rs.x,rs.z)<=moved+1&&cosA>.999,'the ring was moved along the drift ('+Math.hypot(rs.x,rs.z).toFixed(0)+' m of the raft\'s '+moved.toFixed(0)+' m)');
  assert.ok(Math.abs(D.offset1-D.offset0)<150+D.drift.speed*240,'the raft keeps its place inside the ring ('+D.offset0.toFixed(0)+' -> '+D.offset1.toFixed(0)+' m from its centre)');
  assert.ok(!D.found,'nothing was found from 3 km away at 400 m in broken cloud');

  // ---- 4. the false contacts ----
  const F=await run(async()=>{
   const out={};
   for(const [diff,n] of [['rookie',2],['veteran',3],['ace',3]]){await begin('Sortie 24',diff,'clear');out[diff]={n:pbyOps.decoys.length,want:n};}
   await begin('Sortie 24','veteran','clear');const ops=pbyOps;out.kinds=ops.decoys.map(d=>d.kind);
   out.ringOk=ops.decoys.every(d=>Math.hypot(d.x-ops.ring.x,d.z-ops.ring.z)<=ops.ring.r*.91&&Math.hypot(d.x-ops.point.x,d.z-ops.point.z)>=1100);
   out.meshes=ops.decoys.every(d=>d.mesh&&d.mesh.parent===ops.group&&d.mesh.children.length>0);
   far(ops,ops.point.x+40000,ops.point.z);                     // the real raft is out of play
   for(const o of ops.decoys.slice(1)){o.x+=30000;o.kind='raft';}   // only the first false contact is in play (the others are parked far away; the raft kind does not move on its own)
   const d=ops.decoys[0];d.kind='wreck';d.mesh.parent.remove(d.mesh);d.mesh=pbyDecoyMesh('wreck');ops.group.add(d.mesh);
   // 2 km away at 120 m: seen, not yet identified
   put(d.x-2000,d.z,120,0);said.length=0;updatePbyPatrol(.1);
   out.far={seen:d.seen,checked:d.checked,said:said.filter(s=>/SOMETHING ON THE WATER/.test(s)).length,found:ops.found};
   // 500 m away at 80 m: identified, with the words of the wreck
   put(d.x-500,d.z,80,0);updatePbyPatrol(.1);
   out.near={checked:d.checked,count:ops.checked,said:said.filter(s=>/FLOATING WRECKAGE/.test(s)).length,found:ops.found};
   put(d.x-500,d.z,80,0);for(let i=0;i<10;i++)updatePbyPatrol(.1);out.once=said.filter(s=>/FLOATING WRECKAGE/.test(s)).length;
   // they are not the raft: nothing was found and no score was given for them
   // a drifting one drifts, a sampan makes way
   const w=ops.decoys[1];w.x-=30000;w.kind='sampan';const s0={x:w.x,z:w.z};w.heading=0;for(let i=0;i<200;i++)updatePbyPatrol(.5);out.sampanMoved=Math.hypot(w.x-s0.x,w.z-s0.z);
   // at night nothing is seen from far; a burning flare changes that
   await begin('Sortie 24','veteran','clear','night');const o2=pbyOps;far(o2,o2.point.x+40000,o2.point.z);const e=o2.decoys[0];
   put(e.x-1100,e.z,120,0);said.length=0;updatePbyPatrol(.1);out.nightDark=e.seen;
   const dropped=flareSupport.drop(new THREE.Vector3(e.x-100,pbySea(e.x,e.z)+150,e.z),new THREE.Vector3(1,0,0),0);
   updatePbyPatrol(.1);out.flare={dropped,lit:pbyLit(e.x,e.z),seen:e.seen,said:said.filter(s=>/SOMETHING ON THE WATER/.test(s)).length};
   // the whale blows
   await begin('Sortie 25','veteran','clear');const o3=pbyOps;const wh=o3.decoys[0];wh.kind='whale';wh.mesh.parent.remove(wh.mesh);wh.mesh=pbyDecoyMesh('whale');o3.group.add(wh.mesh);wh.spoutT=.2;
   o3.sub.x+=40000;put(wh.x-1200,wh.z,100,0);const s1=smokes.length;for(let i=0;i<20;i++)updatePbyPatrol(.1);out.spout=smokes.length-s1;out.subKinds=o3.decoys.map(d=>d.kind);
   return out;});
  report.decoys=F;
  assert.deepEqual([F.rookie.n,F.veteran.n,F.ace.n],[2,3,3],'two false contacts for a Rookie, three for the others');
  assert.ok(F.ringOk&&F.meshes,'inside the ring, never on top of the raft, each with a model');assert.ok(F.kinds.every(k=>['wreck','whale','sampan','raft'].includes(k)));
  assert.ok(F.far.seen&&!F.far.checked&&F.far.said===1&&!F.far.found,'seen from 2 km, said once, not identified yet: '+JSON.stringify(F.far));
  assert.ok(F.near.checked&&F.near.count===1&&F.near.said===1&&!F.near.found,'identified from 500 m: '+JSON.stringify(F.near));assert.equal(F.once,1,'said once');
  assert.ok(F.sampanMoved>150,'a sampan makes way ('+F.sampanMoved.toFixed(0)+' m in 100 s)');
  assert.ok(!F.nightDark,'at night nothing is seen at 1 100 m');assert.ok(F.flare.dropped&&F.flare.lit&&F.flare.seen&&F.flare.said===1,'a parachute flare lights the sea: now it is seen '+JSON.stringify(F.flare));
  assert.ok(F.spout>0,'the whale blows ('+F.spout+' puffs)');assert.ok(!F.subKinds.includes('raft'),'no empty rafts in the submarine hunt: '+F.subKinds);

  // ---- 5. the survivors' radio ----
  const B=await run(async()=>{
   await begin('Sortie 24','veteran','clear');const ops=pbyOps;const out={};
   put(ops.point.x+9000,ops.point.z-1000,100,0);said.length=0;
   let first=null;for(let i=0;i<300&&!first;i++){updatePbyPatrol(.1);if(ops.df.lines.length)first=ops.t;}
   out.firstAt=first;out.msg=said.filter(s=>/SURVIVORS' SET — BEARING/.test(s));out.line=ops.df.lines[0]&&{...ops.df.lines[0]};
   const truth=ops.df.lines[0]?((Math.atan2(ops.point.x-ops.df.lines[0].x,ops.point.z-ops.df.lines[0].z)*180/Math.PI)+360)%360:0;out.truth=truth;
   // a second place: the lines pile up, only four are kept, every 25 s
   for(const [dx,dz] of [[0,6000],[-2000,-5000],[3000,2000],[-3000,3000],[2000,-2000]]){put(ops.point.x+dx,ops.point.z+dz,100,0);for(let i=0;i<520;i++){updatePbyPatrol(.1);ops.found=false;}}   // the bearings are tested apart from the lookout: found is switched off after each step
   out.count=ops.df.count;out.kept=ops.df.lines.length;
   // the map: one dashed line per bearing, only while nothing is found
   const calls={move:0,line:0};const ctx=new Proxy({},{get:(t,k)=>k==='moveTo'?()=>{calls.move++;}:k==='lineTo'?()=>{calls.line++;}:()=>{}, set:()=>true});
   pbyDrawMinimap(ctx,(x,z)=>[x*.001,z*.001],.001);out.drawn=calls.move;
   ops.found=true;const c2={move:0};pbyDrawMinimap(new Proxy({},{get:(t,k)=>k==='moveTo'?()=>{c2.move++;}:()=>{}, set:()=>true}),(x,z)=>[x,z],.001);out.drawnFound=c2.move;ops.found=false;
   // too far out: nothing heard, said once
   put(ops.point.x+30000,ops.point.z,100,0);said.length=0;const n=ops.df.count;for(let i=0;i<800;i++)updatePbyPatrol(.1);out.quiet={added:ops.df.count-n,said:said.filter(s=>/NOTHING HEARD/.test(s)).length};
   // the interval follows the difficulty
   out.interval={rookie:PBY_DF_S.rookie,veteran:PBY_DF_S.veteran,ace:PBY_DF_S.ace};
   return out;});
  report.df=B;
  assert.ok(B.firstAt!=null&&B.firstAt<20,'the first bearing comes within 20 s ('+B.firstAt+')');assert.equal(B.msg.length,1);assert.match(B.msg[0],/BEARING \d{3}, \d{1,2} O'CLOCK/);
  const err=((B.line.bearing-B.truth+540)%360)-180;assert.ok(Math.abs(err)<=2*(4+9/3)+.1,'the bearing is noisy but near the truth ('+err.toFixed(1)+' degrees at 9 km)');
  assert.ok(B.count>=8,'a bearing every 25 s ('+B.count+')');assert.equal(B.kept,4,'only the last four are kept');assert.equal(B.drawn,4,'one line per bearing on the minimap');assert.equal(B.drawnFound,0,'nothing is drawn once the raft is found');
  assert.equal(B.quiet.added,0,'nothing heard from 30 km');assert.equal(B.quiet.said,1,'and it is said only once');assert.ok(B.interval.rookie<B.interval.veteran&&B.interval.veteran<B.interval.ace,'a Rookie hears the set more often');

  // ---- 6. fuel: bingo, critical, dry on the sea ----
  const U=await run(async()=>{
   await begin('Sortie 24','veteran','clear');const ops=pbyOps,out={};
   put(carrierX-14000,0,200,Math.PI);P.fuel=100;said.length=0;updatePbyPatrol(.1);
   out.reserve=pbyReserve();out.text=document.getElementById('opsStatus').textContent;out.noCall=!said.some(s=>/BINGO FUEL/.test(s));
   P.fuel=pbyReserve()-1;put(carrierX-14000,0,200,Math.PI);P.fuel=pbyReserve()-1;updatePbyPatrol(.1);out.bingo=said.filter(s=>/BINGO FUEL/.test(s)).length;out.textBingo=document.getElementById('opsStatus').textContent;
   P.fuel=pbyReserve()-1;updatePbyPatrol(.1);out.once=said.filter(s=>/BINGO FUEL/.test(s)).length;
   P.fuel=10;updatePbyPatrol(.1);out.critical=said.filter(s=>/FUEL CRITICAL/.test(s)).length;
   out.reserveNear=(put(carrierX-2000,0,200,Math.PI),pbyReserve());
   // dry on the sea, far from the fleet: five seconds and a destroyer takes her in tow; the sortie is lost
   P.onWater=true;P.spd=0;P.pos.set(carrierX-14000,pbySea(carrierX-14000,0)+.3,0);P.fuel=0;P.throttle=0;state=ST.FLIGHT;
   for(let i=0;i<120&&state===ST.FLIGHT;i++)updatePbyPatrol(.1);
   out.stranded=ops.stranded;out.state=state===ST.RESULT;out.failed=ops.failed;
   return out;});
  report.fuel=U;
  assert.ok(U.reserve>20&&U.reserve<40,'the way home from 14 km needs about a quarter of the tank ('+U.reserve.toFixed(1)+' %)');assert.match(U.text,/FUEL 100% · BINGO \d+:\d\d/,'the status line shows fuel and time to bingo: '+U.text);assert.ok(U.noCall,'no call with a full tank');
  assert.equal(U.bingo,1,'bingo is called when the tank is down to the reserve');assert.match(U.textBingo,/BINGO — GO HOME/);assert.equal(U.once,1,'once');assert.equal(U.critical,1,'fuel critical at 12 %');assert.ok(U.reserveNear<U.reserve,'the reserve shrinks as she nears the fleet');
  assert.ok(U.stranded&&U.state&&U.failed,'dry on the sea far from the fleet ends the sortie');

  // ---- 7. the spray and the wake ----
  const S=await run(async()=>{
   await begin('Sortie 24','veteran','clear');const out={};
   // at rest nothing; running she throws a bow wave off both sides and leaves a wake; coming off the step is a burst
   for(let i=0;i<60;i++)step(1/30);out.rest={puffs:P.pbySprayPuffs||0,smokes:smokes.length};
   P.throttle=1;setThrottleUI(1);let maxSmoke=0,maxWake=0,puffsAt={};
   for(let i=0;i<60*60&&P.onWater;i++){inputPitch=P.spd>33?.55:0;step(1/60);maxSmoke=Math.max(maxSmoke,smokes.length);maxWake=Math.max(maxWake,wakeParts.length);if(i===60*8)puffsAt.t8=P.pbySprayPuffs||0;}
   out.run={onWater:P.onWater,spd:+P.spd.toFixed(1),puffs:P.pbySprayPuffs||0,maxSmoke,maxWake,bursts:P.pbySprayBursts||0};
   // alighting: she meets the sea
   const ops=pbyOps;smokes.splice(0).forEach(s=>{s.mesh.visible=false;smokePool.push(s.mesh);});wakeParts.splice(0).forEach(w=>{w.m.visible=false;wakePool.push(w.m);});
   const x=carrierX-9000,z=900;put(x,z,0,Math.PI*1.1);P.pos.y=pbySea(x,z)+.84-.05;P.vSpeed=-3.2;P.pitch=.05;P.roll=0;P.gear=0;P.gearTgt=0;P.touchResolved=false;P.onWater=false;P.spd=SortieFeatures.Handling.speeds(P,STALL_SPD,APP_SPD).reference+3;
   const b0=P.pbySprayBursts||0,s0=smokes.length,w0=wakeParts.length,sp0=splashes.length;shakeMag=0;
   pbyResolve(1/60,null,null);
   out.land={onWater:P.onWater,alive:P.alive,bursts:(P.pbySprayBursts||0)-b0,smokes:smokes.length-s0,wakes:wakeParts.length-w0,splashes:splashes.length-sp0,shake:shakeMag,white:smokes.slice(s0).every(s=>s.mesh.material.color.getHex()===0xeaf4f6),
    spread:Math.max(...smokes.slice(s0).map(s=>Math.hypot(s.mesh.position.x-P.pos.x,s.mesh.position.z-P.pos.z)))};
   // a harder arrival throws more
   const hard=n=>{const x2=carrierX-9000,z2=900;put(x2,z2,0,Math.PI*1.1);P.pos.y=pbySea(x2,z2)+.84-.05;P.vSpeed=-n;P.touchResolved=false;P.onWater=false;P.spd=SortieFeatures.Handling.speeds(P,STALL_SPD,APP_SPD).reference+3;const k=smokes.length;aeroMode=false;pbyResolve(1/60,null,null);return smokes.length-k;};
   out.soft=hard(1);out.firm=hard(5);
   return out;});
  report.spray=S;
  assert.equal(S.rest.puffs,0,'no spray at rest');
  assert.ok(S.run.puffs>20&&S.run.maxSmoke>=6&&S.run.maxWake>=1,'on the run she throws a bow wave and leaves a wake: '+JSON.stringify(S.run));
  assert.ok(!S.run.onWater&&S.run.bursts>=1,'and the spray that falls off the hull as she comes off the step: '+JSON.stringify(S.run));
  assert.ok(S.land.onWater&&S.land.alive&&S.land.bursts===1&&S.land.smokes>=8&&S.land.wakes>=3&&S.land.shake>0&&S.land.white,'a visible touch-down: '+JSON.stringify(S.land));
  assert.ok(S.land.spread>4,'the plume stands off the hull ('+S.land.spread.toFixed(1)+' m)');assert.ok(S.firm>S.soft,'a harder arrival throws more water ('+S.soft+' < '+S.firm+')');
  // a picture of it: the camera behind her a moment after the touch-down
  await run(()=>{const x=carrierX-9000,z=900;put(x,z,0,Math.PI*1.1);P.pos.y=pbySea(x,z)+.84-.05;P.vSpeed=-3;P.touchResolved=false;P.onWater=false;P.spd=SortieFeatures.Handling.speeds(P,STALL_SPD,APP_SPD).reference+3;pbyResolve(1/60,null,null);for(let i=0;i<20;i++)step(1/60);});
  await shot('pby-touchdown');
  await run(()=>{for(let i=0;i<50;i++)step(1/60);});
  await shot('pby-touchdown-1s');

  const bad=missing.filter(u=>!/favicon|\.mp3|\.wav/.test(u));
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/pby-sea-browser.json'),JSON.stringify(report,null,1));
  console.log('missing',JSON.stringify(bad));
  assert.deepEqual(errors.filter(e=>!/404/.test(e)),[],'no page errors');
  console.log('PBY sea WebGL: rough sea, weather and light roll, drift and datum, false contacts, survivors\' bearings, fuel and spray OK');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
