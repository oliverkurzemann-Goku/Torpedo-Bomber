/* Build 248, real Pacific game and the real Yamato GLB: Sortie 23 "Ten-Go". The 62 anti-aircraft stands (yamato-aa.js) are the model's own gun-mount markers and fire only into their own fields:
 * beams full, quarters thin, stern almost nothing, bow no light guns; inside 35 degrees of the bow the main battery fires scatter shells (Sanshiki) at the position reached by holding course.
 * A weave survives them, a straight run does not; a hit silences the stands around it on its flank. GAME_TEST_CHROME selects Chrome. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Ten-Go WebGL: skipped locally (no Chrome).');process.exit(0);}
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
 const report={};
 try{
  const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true}),errors=[];
  page.setDefaultTimeout(300000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|not compiled/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=248');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{
   renderer.setPixelRatio(1);await prepareOkinawa();
   window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.begin=async title=>{const i=MISSIONS.findIndex(m=>m.title===title);DIFF='veteran';await preparePacificModels(MISSIONS[i]);startMission(i);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;
    for(const z of zeros)z.alive=false;P.alive=true;P.onDeck=false;P.onGround=false;said.length=0;return i;};
  });

  // ---- pure layout: the markers of the model are the stands, the profile is the design ----
  const Y=require(path.join(root,'yamato-aa.js'));
  const glb=fs.readFileSync(path.join(root,'assets/ships/yamato-1945-own.glb')),json=JSON.parse(glb.slice(20,20+glb.readUInt32LE(12)).toString());
  const markers=json.asset.extras.markers;
  assert.equal(markers.length,62);assert.equal(Y.count,62,'62 stands');
  const key=(c,x,y,z)=>[c,x,y,z].map(v=>Math.round(v*100)/100).join(',');
  const fromModel=new Set(markers.map(m=>key(m.properties.calibreMm,...m.point))),fromLayout=new Set(Y.MOUNTS.map(m=>key(m.calibre,m.x,m.y,m.z)));
  assert.deepEqual([...fromLayout].sort(),[...fromModel].sort(),'the layout is the model\'s own marker table');
  assert.equal(Y.MOUNTS.filter(m=>m.heavy).length,12);assert.equal(Y.MOUNTS.filter(m=>!m.heavy).length,50);
  const cov=b=>Y.coverage(b,'light');
  report.profile=Object.fromEntries([0,20,40,60,90,120,135,150,165,180].map(b=>[b,cov(b)]));
  assert.equal(cov(0),0,'no light stand fires dead ahead');assert.equal(cov(90),25,'the starboard beam: all 25 light stands of the side');assert.equal(cov(-90),25,'and the port beam');
  assert.ok(cov(150)<cov(90)*.7&&cov(180)<=4,'the quarters are thinner and the stern almost bare: '+JSON.stringify(report.profile));
  assert.equal(Y.weakest().count,Math.min(...Y.profile(5).filter(p=>Math.abs(p.bearing)>35).map(p=>p.count)));assert.equal(Y.sector(Y.weakest().bearing),'stern');
  for(let b=5;b<180;b+=5)assert.equal(Y.coverage(b),Y.coverage(-b),'port and starboard mirror at '+b);

  // ---- set-up ----
  const A=await page.evaluate(async()=>{
   await begin('Sortie 23');
   const y=ships.find(s=>s.def.aa==='yamato'),dd=ships.filter(s=>s.def.type==='destroyer');
   for(let i=0;i<5;i++)updateShips(.1);
   const naval=y.group.children[0].userData.naval;
   let outlets=0;y.group.traverse(o=>{if(o.userData.shipExhaust)outlets++;});
   return {n:ships.length,destroyers:dd.length,destroyersOptional:dd.every(s=>s.def.optional),hp:y.hp,fallback:y.usedFallback,length:Math.round(naval.length),draft:naval.draft,outlets,
    label:NavalAssets.label(y.def),flak:y.flak,primary:ships.filter(s=>!s.def.optional).length,clear:pacificTargetsClear(),capital:typeof cruiserTemplate!=='undefined'&&!!cruiserTemplate&&pacificModelTasks?.has('capital')||false,
    points:y.def.points,theater:MISSIONS[mission].theater,torps:P.torps,body:MISSIONS[mission].body.length,pause:pacificPauseOrders().slice(0,40)};
  });
  report.setup=A;
  assert.equal(A.n,3);assert.equal(A.destroyers,2);assert.ok(A.destroyersOptional);assert.equal(A.hp,3);assert.ok(!A.fallback,'the real Yamato model is installed');
  assert.equal(A.length,263);assert.ok(Math.abs(A.draft-10.4)<.01);assert.ok(A.outlets>=1);assert.equal(A.label,'Battleship Yamato');assert.ok(A.flak);assert.equal(A.primary,1);assert.ok(!A.clear);
  assert.ok(!A.capital,'the Kaga model is not loaded for the Yamato');assert.equal(A.points,5000);assert.equal(A.theater,'tengo');

  // helper in the page: a straight run along the ship's bow axis (or a weave), the real updateFlak
  await page.evaluate(()=>{
   window.runIn=(y,opts)=>{
    const o=Object.assign({from:3200,to:500,alt:60,spd:65,weave:0,dt:1/30,bearing:0,seed:1},opts);
    P.alive=true;state=ST.FLIGHT;P.hull=100;P.spd=o.spd;P.pitch=0;tracers.length=0;y.aa=undefined;y.group.rotation.y=.1;y.group.updateMatrixWorld(true);
    const st=()=>y.aa;
    const b=o.bearing*Math.PI/180,fwd=new THREE.Vector3(Math.sin(y.group.rotation.y),0,Math.cos(y.group.rotation.y)),right=new THREE.Vector3(-fwd.z,0,fwd.x);
    // start position: o.from metres from the ship at bearing o.bearing (0 = dead ahead, positive = starboard)
    const dir=fwd.clone().multiplyScalar(Math.cos(b)).addScaledVector(right,Math.sin(b));
    P.pos.copy(y.group.position).addScaledVector(dir,o.from);P.pos.y=o.alt;
    P.heading=Math.atan2(-dir.z,-dir.x);   // noseDir = (cos h, ., sin h): fly towards the ship
    const base=P.heading;let t=0;const out={fired:0,shellHits:0,hullStart:100};
    const start=y.group.position.clone();
    const dist=()=>Math.hypot(P.pos.x-y.group.position.x,P.pos.z-y.group.position.z);
    for(let i=0;i<5000&&dist()>o.to&&P.alive;i++){
     if(o.weave)P.heading=base+o.weave*Math.sin(t*1.3);   // a weave: o.weave rad either side of the line to the ship, 4.8 s period
     P.pos.addScaledVector(noseDir(),P.spd*o.dt);P.pos.y=o.alt;
     updateFlak(o.dt);t+=o.dt;
     if(!window.__freeze)updateShips(0);
    }
    const s=y.aa||{};
    return {alive:P.alive,hull:Math.round(P.hull*10)/10,fired:s.fired||0,shellHits:s.hits||0,near:s.near||0,volleys:s.volleys||0,bursts:s.bursts||0,t:Math.round(t),bearing:Math.round(s.bearing??999),sector:s.sector,engaged:s.engaged};
   };
  });

  // ---- a straight run at the bow: the scatter shells find a pilot who holds his course ----
  const S=await page.evaluate(()=>{const y=ships.find(s=>s.def.aa==='yamato');for(const d of ships)if(d!==y)d.flak=false;
   const results=[];for(let k=0;k<3;k++)results.push(runIn(y,{alt:30}));return results;});
  report.straightBow=S;
  assert.ok(S.every(r=>r.fired>=5),'the main battery fires every ~3 s inside the cone: '+JSON.stringify(S));
  assert.ok(S.every(r=>r.volleys===0),'no light stand bears on the bow: '+JSON.stringify(S));
  const straightLoss=S.map(r=>100-r.hull),meanStraight=straightLoss.reduce((a,b)=>a+b)/3;
  assert.ok(meanStraight>35,'a straight run into the bow cone is costly (veteran): '+straightLoss);
  // ---- a weave through the same cone survives ----
  const W=await page.evaluate(()=>{const y=ships.find(s=>s.def.aa==='yamato');const results=[];for(let k=0;k<3;k++)results.push(runIn(y,{weave:.9,alt:30}));return results;});
  report.weaveBow=W;
  const weaveLoss=W.map(r=>100-r.hull),meanWeave=weaveLoss.reduce((a,b)=>a+b)/3;
  assert.ok(W.every(r=>r.fired>=5),'the cone is the same');assert.ok(meanWeave<meanStraight*.6,'a weave costs much less than a straight run: '+JSON.stringify({weaveLoss,straightLoss,W,S}));
  // ---- below the fuse limit and outside the range window the shells do not fly ----
  const L=await page.evaluate(()=>{const y=ships.find(s=>s.def.aa==='yamato');const low=runIn(y,{alt:12,from:3200,to:500}),far=runIn(y,{from:4600,to:3700}),close=runIn(y,{from:850,to:300}),high=runIn(y,{alt:1500,from:3200,to:500});return {low:low.fired,far:far.fired,close:close.fired,high:high.fired};});
  report.limits=L;assert.deepEqual(L,{low:0,far:0,close:0,high:0},'no scatter shell below 20 m, beyond 3500 m, inside 900 m or above 1200 m');
  // ---- the warning: flash message and one radio call ----
  const R=await page.evaluate(()=>{const y=ships.find(s=>s.def.aa==='yamato');said.length=0;runIn(y,{from:3000,to:2000});return {said:said.filter(t=>/YAMATO|MAIN BATTERY|SCATTER/.test(t)).length,text:said.find(t=>/SCATTER/.test(t))||''};});
  assert.equal(R.said,1,'one radio warning per sortie');

  // ---- the beam: the light guns fire, the shells do not; the stern is quiet ----
  const B=await page.evaluate(()=>{const y=ships.find(s=>s.def.aa==='yamato');
   const run=(bearing,alt)=>{const r=runIn(y,{bearing,from:1500,to:1500,alt});return r;};
   // fly a fixed point at 1300 m for 20 s at the given bearing and count the volleys the stands send
   const stand=(bearing,alt)=>{P.alive=true;state=ST.FLIGHT;P.hull=100;P.spd=60;y.aa=undefined;tracers.length=0;
    const b=bearing*Math.PI/180,fwd=new THREE.Vector3(Math.sin(y.group.rotation.y),0,Math.cos(y.group.rotation.y)),right=new THREE.Vector3(-fwd.z,0,fwd.x);
    const dir=fwd.clone().multiplyScalar(Math.cos(b)).addScaledVector(right,Math.sin(b));P.pos.copy(y.group.position).addScaledVector(dir,1300);P.pos.y=alt;P.heading=0;
    for(let i=0;i<600;i++){updateFlak(1/30);P.pos.copy(y.group.position).addScaledVector(dir,1300);P.pos.y=alt;}
    return {v:y.aa.volleys||0,h:y.aa.bursts||0,s:y.aa.fired||0};};
   return {starboard:stand(90,30),port:stand(-90,30),quarter:stand(150,30),stern:stand(180,30),bow:stand(0,30),highBeam:stand(90,300)};});
  report.beam=B;
  assert.ok(B.starboard.v>60&&B.port.v>60,'the beams are loud: '+JSON.stringify(B));assert.ok(B.starboard.s===0&&B.port.s===0,'no scatter shell at the beam');
  assert.ok(B.quarter.v<B.starboard.v*.8,'the quarter is thinner: '+JSON.stringify(B));assert.ok(B.stern.v<B.starboard.v*.25,'the stern is nearly quiet: '+JSON.stringify(B));assert.equal(B.bow.v,0);assert.ok(B.bow.s>=5,'the bow has the shells instead');
  assert.ok(B.highBeam.h>10&&B.starboard.h===0,'the 127 mm airbursts reach a high flyer only (above 40 m; the others fly at 30 m): '+JSON.stringify(B));
  assert.ok(Math.abs(B.starboard.v-B.port.v)<B.starboard.v*.3,'port and starboard are alike');

  // ---- light-gun damage is real but small per hit ----
  const D=await page.evaluate(()=>{const y=ships.find(s=>s.def.aa==='yamato');y.aa=undefined;P.alive=true;state=ST.FLIGHT;P.hull=100;tracers.length=0;P.spd=0;
   const right=new THREE.Vector3(Math.cos(y.group.rotation.y),0,-Math.sin(y.group.rotation.y));P.pos.copy(y.group.position).addScaledVector(right,-800);P.pos.y=40;let hits=0,lost=0;
   for(let i=0;i<2400;i++){const h0=P.hull;updateFlak(1/30);P.pos.copy(y.group.position).addScaledVector(right,-800);P.pos.y=40;if(P.hull<h0){hits++;lost+=h0-P.hull;}if(P.hull<30){P.hull=100;}}
   return {hits,lost:Math.round(lost)};});
  report.lightDamage=D;assert.ok(D.hits>=3,'tracers hit a flyer in their field: '+JSON.stringify(D));

  // ---- a hit silences the stands around it, on its own flank ----
  const K=await page.evaluate(()=>{const y=ships.find(s=>s.def.aa==='yamato');y.aa=undefined;said.length=0;P.alive=true;state=ST.FLIGHT;
   const before=Object.keys(yamatoState(y).dead).length;
   // a torpedo hit on the starboard quarter: local (-19, 0, -70) -> world
   const hit=y.group.localToWorld(new THREE.Vector3(-19,0,-70));hitShip(y,true,hit,'torpedo');
   const dead=Object.keys(yamatoState(y).dead).map(Number),mk=YamatoAA.MOUNTS;
   const stbd=dead.filter(i=>mk[i].x<0).length,port=dead.filter(i=>mk[i].x>0).length;
   const left=y.hp;const msg=said.find(t=>/SILENCED/.test(t))||'';
   // the silenced stands stay quiet: a run on the starboard quarter now meets fewer volleys
   const engagedAt=(bearing)=>{const yy=y;P.spd=0;
    const b=bearing*Math.PI/180,fwd=new THREE.Vector3(Math.sin(yy.group.rotation.y),0,Math.cos(yy.group.rotation.y)),right=new THREE.Vector3(-fwd.z,0,fwd.x),dir=fwd.clone().multiplyScalar(Math.cos(b)).addScaledVector(right,Math.sin(b));
    P.pos.copy(yy.group.position).addScaledVector(dir,1300);P.pos.y=40;P.hull=100;updateFlak(1/30);return yy.aa.engaged.light;};
   const quarterAfter=engagedAt(135),portQuarter=engagedAt(-135);
   return {before,stbd,port,hp:left,msg,quarterAfter,portQuarter};});
  report.silence=K;
  assert.equal(K.before,0);assert.ok(K.stbd>=6&&K.port===0,'the hit silences stands on its own flank only: '+JSON.stringify(K));assert.ok(/SILENCED/.test(K.msg));assert.equal(K.hp,2);
  assert.ok(K.quarterAfter<K.portQuarter*.7,'the silenced starboard quarter is quieter than the untouched port quarter: '+JSON.stringify(K));

  // ---- three hits sink her, 5000 points, and the sortie is complete ----
  const E=await page.evaluate(()=>{const y=ships.find(s=>s.def.aa==='yamato');const s0=score;hitShip(y,true,y.group.position.clone(),'torpedo');hitShip(y,true,y.group.position.clone(),'torpedo');
   const out={alive:y.alive,hp:y.hp,gained:score-s0,clear:pacificTargetsClear(),sunk:sortieShipsSunk};for(let i=0;i<30;i++)updateShips(.1);updateFlak(.1);return out;});
  report.sink=E;assert.ok(!E.alive&&E.hp<=0&&E.clear,'three hits and she is down: '+JSON.stringify(E));assert.ok(E.gained>=5000,'5000 points for the battleship: '+E.gained);

  // ---- a checkpoint keeps the plain-data state (silenced stands, shells in flight) ----
  const C=await page.evaluate(async()=>{await begin('Sortie 23');const y=ships.find(s=>s.def.aa==='yamato');yamatoState(y).dead[3]=true;yamatoState(y).shells.push({t:2,x:1,y:50,z:2});
   const back=JSON.parse(JSON.stringify(y.aa));return {dead:back.dead[3],shells:back.shells.length};});
  assert.ok(C.dead&&C.shells===1,'the state is plain data');

  // ---- the destroyers keep the ordinary flak ----
  const O=await page.evaluate(async()=>{await begin('Sortie 23');const d=ships.find(s=>s.def.type==='destroyer');const y=ships.find(s=>s.def.aa==='yamato');y.flak=false;for(const s of ships)if(s!==d)s.flak=false;
   P.alive=true;state=ST.FLIGHT;P.hull=100;P.pos.set(d.group.position.x,120,d.group.position.z+700);P.spd=70;tracers.length=0;d.flakTimer=0;let n=0;for(let i=0;i<300;i++){const b=tracers.length;updateFlak(.02);if(tracers.length>b)n++;}return {n,aa:!!d.aa};});
  assert.ok(O.n>5&&!O.aa,'a destroyer fires its ordinary bursts: '+JSON.stringify(O));

  // ---- the briefing card and the map call her by name ----
  const T=await page.evaluate(()=>{const m=MISSIONS.find(x=>x.title==='Sortie 23');return {labels:m.targets.map(t=>NavalAssets.label(t)),sub:m.sub,body:/Sanshiki/.test(m.body)&&/stern/.test(m.body)&&/35°/.test(m.body)};});
  assert.deepEqual(T.labels,['Battleship Yamato','Destroyer','Destroyer'].map((v,i)=>T.labels[i]===v?v:T.labels[i]));assert.equal(T.labels[0],'Battleship Yamato');assert.ok(T.body,'the briefing explains the Sanshiki cone and the thin stern');
  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/tengo-browser.json'),JSON.stringify(report,null,1));
  console.log('Ten-Go WebGL: OK',JSON.stringify({straight:straightLoss,weave:weaveLoss,beam:{s:B.starboard.v,q:B.quarter.v,st:B.stern.v},silence:K.stbd}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
