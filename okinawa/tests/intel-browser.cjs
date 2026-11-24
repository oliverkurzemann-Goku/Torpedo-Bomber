/* Build 296: target search at Veteran/Ace in both real games (search areas = briefing rings, nothing marked until seen, spotting range, hills hide,
 * flak that fires is marked, Ace guard gun, fighters per difficulty). Writes app/release/intel-browser.json. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Intel WebGL: skipped locally (no Chrome).');process.exit(0);}
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
 const launch=()=>chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--single-process','--no-zygote']});
 let browser=await launch();
 const report={};
 try{
  // ================= RHINE =================
  const page=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),errors=[];
  page.setDefaultTimeout(900000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.__intel=true;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/remagen-mission.html?v=intel&surprises=off');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady,null,{polling:200});
  await page.evaluate(async()=>{await Promise.all(['p47','bf109'].map(ensureModel));renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;if(typeof flightQuality!=='undefined')flightQuality.enabled=false;
   window.said=[];const r=radioSay;radioSay=m=>{said.push(m);r(m);};
   window.begin=(id,diff)=>{diffIdx=diff;const i=MISSIONS.findIndex(m=>m.id===id);selectedMission=i;showBrief(i);const brief=(briefPlan.intelAreas||[]).map(a=>({key:a.key,x:a.x,z:a.z,r:a.r}));
    startMission(i);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;said.length=0;return {i,brief};};
   window.fly=(sec,dt=.05)=>{for(let k=0;k<sec/dt;k++)updateIntel(dt);};
   window.hover=(x,z,agl,off)=>{P.pos.set(x+(off||0),groundY(x+(off||0),z)+agl,z);P.onGround=false;P.alive=true;};});

  const rookie=await page.evaluate(()=>{const b=begin('convoy',0),c=europeContacts();updateHUD();drawMinimap();
   return {brief:b.brief.length,search:intel.search,areas:intel.areas().length,trucks:c.filter(x=>x.kind==='TRUCK').length,nav:document.getElementById('navKind').textContent};});
  assert.equal(rookie.search,false);assert.equal(rookie.areas,0);assert.equal(rookie.brief,0);assert.equal(rookie.trucks,4,'Rookie: the column is marked');
  assert.equal(rookie.nav,'TRUCK','Rookie: the arrow leads to the column');
  report.rookie=rookie;

  for(const [diff,name] of [[1,'veteran'],[2,'ace']]){
   const R=await page.evaluate((diff)=>{
    const b=begin('convoy',diff),areas=intel.areas(),c=europeContacts();updateHUD();
    const trucks=targets.filter(t=>t.kind==='truck'&&t.primary);
    const inside=trucks.map(t=>{const a=areas.find(a=>a.key===intel.entries().find(e=>e.ref===t).group);return Math.hypot(t.group.position.x-a.x,t.group.position.z-a.z)/a.r;});
    return {brief:b.brief,areas:areas.map(a=>({key:a.key,x:a.x,z:a.z,r:a.r})),hidden:c.filter(x=>x.kind==='TRUCK').length,inside,
     nav:document.getElementById('navKind').textContent,obj:document.getElementById('objText').textContent,fighters:enemyAir.filter(e=>e.alive).length,
     guard:ambushes.filter(a=>a.guard).map(a=>Math.hypot(a.x-trucks[0].group.position.x,a.z-trucks[0].group.position.z)|0)};
   },diff);
   assert.ok(R.areas.length>=1,name+': search areas');
   assert.deepEqual(R.areas.map(a=>[a.key,Math.round(a.x),Math.round(a.z)]),R.brief.map(a=>[a.key,Math.round(a.x),Math.round(a.z)]),name+': the briefing rings are the sortie rings');
   assert.equal(R.hidden,0,name+': no vehicle on the map or in the contact list before it is seen');
   assert.ok(R.inside.every(f=>f<=1),name+': every vehicle inside its ring '+R.inside);
   assert.equal(R.nav,'SEARCH',name+': the arrow leads to the search area');assert.match(R.obj,/FOUND 0\/4/);
   report[name]=R;
   // fly over at 300 m from 6 km out - spotted only when close
   const S=await page.evaluate(()=>{const t=targets.find(t=>t.kind==='truck'&&t.primary),p=t.group.position;
    hover(p.x,p.z,300,6000);fly(3);const far=intel.known(t);
    const range=TargetIntel.sightRange({size:'small',moving:true},intel.level,{vis:intelVisAt(p),agl:300}),off=Math.sqrt(Math.max(0,(range*.7)**2-300*300));
    hover(p.x,p.z,300,off);fly(2);
    const c=europeContacts();updateHUD();drawMinimap();
    return {far,near:intel.known(t),weather,range:range|0,off:off|0,radio:said.filter(m=>/TARGET IN SIGHT/.test(m)),contacts:c.filter(x=>x.kind==='TRUCK').length,nav:document.getElementById('navKind').textContent,score};});
   assert.equal(S.far,false,name+': not seen 6 km away');assert.equal(S.near,'live',name+': seen inside its sight range (70 %)');
   assert.ok(S.radio.length>=1&&/O'CLOCK/.test(S.radio[0]),name+': radio call with clock bearing: '+S.radio[0]);
   assert.ok(S.contacts>=1,name+': now on the map');assert.equal(S.nav,'TRUCK',name+': the arrow now leads to it');
   report[name+'Spot']=S;
  }
  assert.ok(report.ace.areas[0].r>report.veteran.areas[0].r,'Ace rings are bigger');
  assert.equal(report.ace.guard.length,1,'Ace: one hidden guard gun near the target');assert.ok(report.ace.guard[0]<=330);
  assert.equal(report.veteran.guard.length,0,'Veteran: no guard gun');

  // a hill between the pilot and the target hides it
  const L=await page.evaluate(()=>{begin('convoy',1);const t=targets.find(t=>t.kind==='truck'&&t.primary),p=t.group.position;
   // search a spot 1.2 km away where the ground rises above the line of sight from 40 m
   for(let a=0;a<64;a++){const x=p.x+Math.cos(a/10)*1200,z=p.z+Math.sin(a/10)*1200,o={x,y:groundY(x,z)+40,z};if(!intelLos(o,p)){P.pos.set(o.x,o.y,o.z);fly(3);return {hidden:intel.known(t),found:true};}}
   return {found:false};});
  if(L.found)assert.equal(L.hidden,false,'behind the ridge: not spotted');
  report.ridge=L;

  // a flak gun that opens fire gives itself away
  const F=await page.evaluate(()=>{begin('flak',1);const f=flakUnits.find(f=>f.alive);const before=intel.known(f),p=f.group.position;
   P.pos.set(p.x+2500,groundY(p.x+2500,p.z)+600,p.z);P.heading=-Math.PI/2;f.cool=0;for(let i=0;i<40;i++)updateFlak(.05);
   return {before,after:intel.known(f),radio:said.filter(m=>/MUZZLE FLASHES/.test(m))};});
  assert.equal(F.before,false);assert.equal(F.after,'live','the gun that fired is marked');assert.ok(F.radio.length>=1,'a radio call: '+F.radio.length);
  report.flak=F;

  // difficulty: fighters
  const A=await page.evaluate(()=>[0,1,2].map(d=>{begin('libs',d);return enemyAir.filter(e=>e.alive&&!e.bomber&&!e.optional).length;}));
  assert.deepEqual(A,[1,2,3],'Liberators at Noon fighters: Rookie 1, Veteran 2, Ace 3');report.fighters=A;

  assert.deepEqual(errors,[]);
  await browser.close();browser=await launch();

  // ================= PACIFIC =================
  const pg=await browser.newPage({viewport:{width:1194,height:660},hasTouch:true,deviceScaleFactor:1}),perr=[];
  pg.setDefaultTimeout(900000);pg.on('pageerror',e=>perr.push(e.message));
  await pg.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.__intel=true;});
  await pg.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=intel&surprises=off');
  await pg.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await pg.evaluate(async()=>{renderer.setPixelRatio(.5);await prepareOkinawa();window.said=[];const r=radioSay;radioSay=m=>{said.push(m);r(m);};
   window.begin=async(title,diff)=>{const i=MISSIONS.findIndex(m=>m.title===title);DIFF=diff;await preparePacificModels(MISSIONS[i]);startMission(i);launch();finishCarrierIntro();state=ST.FLIGHT;if(pacificOps)pacificOps.reconDone=true;said.length=0;return i;};});
  for(const diff of ['rookie','veteran','ace']){
   const R=await pg.evaluate(async(diff)=>{await begin('Sortie 1',diff);const c=pacificContacts();updateNav();
    const ships_=ships.filter(s=>s.alive&&!s.def.neutral),areas=intel.areas();
    const inside=ships_.filter(s=>!(s.def.optional||s.def.type==='destroyer')).map(s=>{const g=intel.entries().find(e=>e.ref===s).group,a=areas.find(a=>a.key===g);return a?Math.hypot(s.group.position.x-a.x,s.group.position.z-a.z)/a.r:null;});
    return {areas:areas.length,ships:c.filter(x=>x.kind==='SHIP').length,nav:document.getElementById('navKind').textContent,obj:document.getElementById('objText').textContent,inside,zeros:zeros.length};},diff);
   report['pacific_'+diff]=R;
   if(diff==='rookie'){assert.equal(R.areas,0);assert.ok(R.ships>=1,'Rookie: ships marked');}
   else{assert.ok(R.areas>=1,diff+': search area');assert.equal(R.ships,0,diff+': no ship marked before it is seen');assert.equal(R.nav,'SEARCH');assert.match(R.obj,/^SEARCH: /);assert.ok(R.inside.every(f=>f!=null&&f<=1),'ship inside its ring '+R.inside);}
  }
  const PS=await pg.evaluate(async()=>{await begin('Sortie 1','veteran');const s=ships.find(s=>s.alive&&['freighter','cruiser'].includes(s.def.type));
   P.pos.set(s.group.position.x-9000,300,s.group.position.z);for(let i=0;i<60;i++)updateIntel(.05);const far=intel.known(s);
   const range=TargetIntel.sightRange({size:'huge',moving:true},intel.level,{vis:intelVisAt(s.group.position),agl:300}),off=Math.min(2500,range*.7);
   P.pos.set(s.group.position.x-off,300,s.group.position.z);const los=intelLos(P.pos,s.group.position);for(let i=0;i<60;i++)updateIntel(.05);updateNav();
   return {weather,timeMode,range:range|0,off:off|0,los,far,near:intel.known(s),radio:said.filter(m=>/TARGET IN SIGHT/.test(m)),nav:document.getElementById('navKind').textContent};});
  assert.equal(PS.far,false,'9 km: not seen');assert.equal(PS.near,'live','seen inside 70 % of its sight range: '+JSON.stringify(PS));assert.ok(PS.radio.length>=1);assert.equal(PS.nav,'SHIP');
  report.pacificSpot=PS;
  assert.deepEqual(perr,[]);
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/intel-browser.json'),JSON.stringify(report,null,1));
  console.log('Intel browser: OK',JSON.stringify({vetR:report.veteran.areas.map(a=>a.r|0),aceR:report.ace.areas.map(a=>a.r|0),fighters:report.fighters,pacific:report.pacific_veteran}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
