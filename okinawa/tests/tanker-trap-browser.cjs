/* Build 247, real Pacific game and the real fleet-oiler GLB: Sortie 21 "Tanker Trap" has two required oilers, the LOADED one rides deeper and, once
 * sunk, spreads burning oil for 40 s that hurts a low aeroplane and blinds / slows the escorts; the EMPTY one only sinks. Sorties 2 and 4 carry a
 * loaded oiler as an optional target. GAME_TEST_CHROME selects Chrome. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Tanker trap WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=247');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{
   renderer.setPixelRatio(1);await prepareOkinawa();
   window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.begin=async title=>{const i=MISSIONS.findIndex(m=>m.title===title);DIFF='veteran';await preparePacificModels(MISSIONS[i]);startMission(i);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;
    for(const z of zeros)z.alive=false;P.alive=true;P.onDeck=false;P.onGround=false;said.length=0;return i;};
  });

  // ---- Sortie 21: set-up ----
  const A=await page.evaluate(async()=>{
   await begin('Sortie 21');
   const oilers=ships.filter(s=>s.def.model==='oiler'),dd=ships.filter(s=>s.def.type==='destroyer');
   const sea=s=>s.group.position.y-seaHeightAt(s.group.position.x,s.group.position.z,seaUniforms.uTime.value);
   for(let i=0;i<5;i++)updateShips(.1);
   const naval=oilers[0].group.children[0].userData.naval;
   let outlets=0;oilers[0].group.traverse(o=>{if(o.userData.shipExhaust)outlets++;});
   return {n:ships.length,oilers:oilers.length,destroyers:dd.length,loaded:oilers.map(s=>!!s.def.loaded),fallback:oilers.some(s=>s.usedFallback),
    deep:oilers.map(s=>+sea(s).toFixed(2)),length:Math.round(naval.length),draft:naval.draft,outlets,radius:oilers.map(s=>Math.round(s.radius)),
    optional:oilers.map(s=>!!s.def.optional),clear:pacificTargetsClear(),label:NavalAssets.label(oilers[0].def),
primary:ships.filter(s=>!s.def.optional&&s.def.type!=='destroyer').length,
    hud:document.getElementById('hStatus')?.textContent||'',pause:pacificPauseOrders().slice(0,40)};
  });
  report.setup=A;
  assert.equal(A.n,4);assert.equal(A.oilers,2);assert.equal(A.destroyers,2);assert.deepEqual(A.loaded,[true,false]);assert.ok(!A.fallback,'the real oiler model is installed');
  assert.equal(A.length,144);assert.ok(Math.abs(A.draft-8.08)<.01);assert.ok(A.outlets>=1,'the funnel has an exhaust outlet');assert.deepEqual(A.optional,[false,false],'both oilers are required');
  assert.ok(A.deep[0]<A.deep[1]-1,'the loaded oiler rides deeper than the empty one: '+A.deep);assert.ok(A.primary===2&&!A.clear);assert.equal(A.label,'Fleet oiler');
  assert.ok(/SHIPS 2/.test(A.pause),'the pause orders count two ships: '+A.pause);
  // ---- the briefing map says which one is loaded ----
  const L=await page.evaluate(()=>{const m=MISSIONS[MISSIONS.findIndex(x=>x.title==='Sortie 21')];return m.targets.filter(t=>t.model==='oiler').map(t=>NavalAssets.label(t)+(t.model==='oiler'?(t.loaded?' — loaded, rides deep':' — empty'):''));});
  assert.deepEqual(L,['Fleet oiler — loaded, rides deep','Fleet oiler — empty']);

  // ---- the empty oiler: sinks, no fire, escorts unaffected ----
  const E=await page.evaluate(async()=>{
   await begin('Sortie 21');
   const empty=ships.find(s=>s.def.model==='oiler'&&!s.def.loaded);
   hitShip(empty,true,empty.group.position.clone(),'torpedo');
   for(let i=0;i<40;i++)updateShips(.1);updateOilFires(.1);
   return {alive:empty.alive,fires:oilFires.length,blind:ships.filter(s=>s.blindT>0).length,slow:ships.filter(s=>s.slowT>0).length,kills:sortieShipsSunk,said:said.join('|'),clear:pacificTargetsClear()};
  });
  report.empty=E;
  assert.ok(!E.alive&&E.fires===0&&E.blind===0&&E.slow===0&&E.kills===1,'the empty oiler only sinks: '+JSON.stringify(E));assert.ok(!E.clear,'one oiler does not finish the sortie');

  // ---- the loaded oiler: fire, blind and slow escorts, damage to a low flyer, burn-out after 40 s ----
  const F=await page.evaluate(async()=>{
   await begin('Sortie 21');
   const loaded=ships.find(s=>s.def.loaded),esc=ships.filter(s=>s.def.type==='destroyer'),empty=ships.find(s=>s.def.model==='oiler'&&!s.def.loaded);
   // stand two escorts well inside / one outside the 1800 m smoke range
   esc[0].group.position.set(loaded.group.position.x-500,0,loaded.group.position.z);esc[1].group.position.set(loaded.group.position.x+2600,0,loaded.group.position.z);
   const out={};const p=loaded.group.position.clone();
   hitShip(loaded,true,p.clone(),'torpedo');
   out.fires=oilFires.length;out.flames=oilFires[0].flames.length;out.said=said.join('|');said.length=0;
   out.blind=esc.map(e=>+(e.blindT||0).toFixed(1));out.slow=esc.map(e=>+(e.slowT||0).toFixed(1));
   // escorts slow down in the smoke and recover afterwards
   const mult=e=>+((e.driveMultiplier??1)).toFixed(2);
   for(let i=0;i<150;i++){updateShips(.1);updateOilFires(.1);}
   out.slowMult=esc.map(mult);out.blindAfter15=esc.map(e=>+(e.blindT||0).toFixed(1));
   // damage: a low flyer inside the fire loses hull, a high flyer and a flyer outside the ring do not
   P.alive=true;state=ST.FLIGHT;P.hull=100;const fire=oilFires[0];out.r=+fire.r.toFixed(1);
   P.pos.set(fire.x,20,fire.z);const h0=P.hull;for(let i=0;i<20;i++)updateOilFires(.1);out.low={lost:+(h0-P.hull).toFixed(1),warned:fire.warned,said:said.join('|')};
   P.hull=100;P.pos.set(fire.x,90,fire.z);for(let i=0;i<20;i++)updateOilFires(.1);out.high=+(100-P.hull).toFixed(1);
   P.hull=100;P.pos.set(fire.x+fire.r+80,10,fire.z);for(let i=0;i<20;i++)updateOilFires(.1);out.outside=+(100-P.hull).toFixed(1);
   // the fire burns out: 40 s in total (15 s before plus 6 s above, then 20 s more = 41 s)
   P.pos.set(fire.x,300,fire.z);P.hull=100;
   for(let i=0;i<200;i++)updateOilFires(.1);
   out.afterFlight=oilFires.length;out.flamesLeft=scene.children.filter(o=>o.userData&&o.userData.oilFlame).length;
   for(let i=0;i<220;i++){updateShips(.1);}   // 15 s + 22 s = 37 s: past the 32 s slow-down, 5 s of recovery
   out.slowAfter=esc.map(e=>+(e.slowT||0).toFixed(1));out.multAfter=esc.map(e=>mult(e));
   // the second oiler can still be sunk: the sortie is complete then
   hitShip(empty,true,empty.group.position.clone(),'torpedo');out.clear=pacificTargetsClear();out.kills=sortieShipsSunk;
   // a pilot who stays in the flames dies, with a reason
   fire.t=0;oilFires.push({...fire,t:0,warned:false});P.alive=true;P.hull=12;P.pos.set(fire.x,10,fire.z);try{for(let i=0;i<60;i++)updateOilFires(.1);}catch(e){out.err=e.message;}
   out.dead=!P.alive;
   return out;
  });
  report.loaded=F;
  assert.equal(F.fires,1);assert.ok(F.flames>=12,'the fire has its own flames: '+F.flames);assert.equal(F.flamesLeft,0,'the flames are removed when the fire dies');assert.ok(/BURNING OIL/.test(F.said)&&/BLIND/.test(F.said),'the radio explains it: '+F.said);
  assert.ok(F.blind[0]>25&&F.slow[0]>25,'the near escort is blind and slow: '+JSON.stringify([F.blind,F.slow]));assert.deepEqual([F.blind[1],F.slow[1]],[0,0],'the far escort is untouched');
  assert.ok(F.slowMult[0]<.75,'the near escort slows: '+F.slowMult);assert.ok(F.slowMult[1]>.95,'the far escort keeps its speed: '+F.slowMult);
  assert.ok(F.r>30&&F.r<=125);
  assert.ok(F.low.lost>8&&F.low.lost<20,'a flyer at 20 m in the flames loses hull (veteran): '+JSON.stringify(F.low));assert.ok(F.low.warned&&/FLAMES/.test(F.low.said));
  assert.equal(F.high,0,'above the flames: nothing');assert.equal(F.outside,0,'outside the ring: nothing');
  assert.equal(F.afterFlight,0,'the fire has burnt out after 40 s');assert.ok(F.slowAfter.every(v=>v===0)&&F.multAfter[0]>.9,'the escorts recover: '+JSON.stringify([F.slowAfter,F.multAfter]));
  assert.ok(F.clear&&F.kills===2,'both oilers down completes the sortie: '+JSON.stringify([F.clear,F.kills]));assert.ok(F.dead,'a pilot who stays in the flames burns');

  // ---- blind escorts really fire less (the real flak loop) ----
  const G=await page.evaluate(async()=>{
   await begin('Sortie 21');
   const d=ships.find(s=>s.def.type==='destroyer');for(const s of ships)s.flak=s===d;P.alive=true;state=ST.FLIGHT;P.hull=100;
   const count=(blind)=>{d.blindT=blind?30:0;d.flakTimer=0;tracers.length=0;let n=0;P.pos.set(d.group.position.x,120,d.group.position.z+700);P.spd=70;
    for(let i=0;i<300;i++){const b=tracers.length;updateFlak(.02);if(tracers.length>b)n++;d.blindT=blind?30:0;}return n;};
   const clear=count(false),blind=count(true);return {clear,blind};
  });
  report.flak=G;assert.ok(G.blind*1.8<G.clear,'blind escorts fire much less: '+JSON.stringify(G));

  // ---- Sortie 2 and 4: a loaded oiler as an optional target ----
  for(const title of ['Sortie 2','Sortie 4']){
   const H=await page.evaluate(async title=>{
    await begin(title);
    const o=ships.find(s=>s.def.model==='oiler');if(!o)return {found:false};
    const out={found:true,optional:!!o.def.optional,loaded:!!o.def.loaded,fallback:o.usedFallback,primary:ships.filter(s=>!s.def.optional&&s.def.type!=='destroyer').length,
     contacts:pacificContacts().filter(c=>c.kind==='SHIP').length,body:MISSIONS[mission].body.includes('oiler')};
    hitShip(o,true,o.group.position.clone(),'torpedo');out.fire=oilFires.length;out.clearAfterOiler=pacificTargetsClear();
    out.pause=pacificPauseOrders().slice(0,30);
    return out;
   },title);
   report[title]=H;
   assert.ok(H.found&&H.optional&&H.loaded&&!H.fallback,title+': optional loaded oiler present '+JSON.stringify(H));assert.ok(H.body,'the briefing mentions the oiler');assert.equal(H.fire,1,'she burns when sunk');
   assert.ok(!H.clearAfterOiler,'she does not complete the sortie');assert.ok(H.primary>=1);
  }
  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/tanker-trap-browser.json'),JSON.stringify(report,null,1));
  console.log('Tanker trap WebGL: OK',JSON.stringify({lost:F.low.lost,r:F.r,flak:G}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
