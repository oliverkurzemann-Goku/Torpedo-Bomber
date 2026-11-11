/* Build 246, real Pacific game and the real hospital-ship GLB: the neutral white ship sails beside the convoy in Sortie 2 and 4. It is in no objective and
 * in no HUD count, its funnel makes smoke, and every shot at it (shell through the real gun loop, bomb through the real ordnance step, torpedo/rocket
 * through hitShip) costs points with a radio call; sinking her costs a lot and still leaves the real targets. GAME_TEST_CHROME selects Chrome. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Hospital ship WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  await page.goto('http://127.0.0.1:'+server.address().port+'/torpedo-carrier.html?v=246');
  await page.waitForFunction(()=>state===ST.MENU,null,{polling:100});
  await page.evaluate(async()=>{
   renderer.setPixelRatio(1);await prepareOkinawa();
   window.said=[];const say=radioSay;radioSay=t=>{said.push(t);say(t);};
   window.begin=async title=>{const i=MISSIONS.findIndex(m=>m.title===title);DIFF='veteran';await preparePacificModels(MISSIONS[i]);startMission(i);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;
    for(const z of zeros)z.alive=false;P.alive=true;P.onDeck=false;P.onGround=false;said.length=0;return i;};
  });
  for(const title of ['Sortie 2','Sortie 4']){
   const A=await page.evaluate(async title=>{
    await begin(title);
    const h=ships.find(s=>s.def.neutral),others=ships.filter(s=>!s.def.neutral);
    let outlets=0;h.group.traverse(o=>{if(o.userData.shipExhaust)outlets++;});
    const naval=h.group.children[0]?.userData.naval;
    const nav=pacificContacts().map(c=>c.label);
    return {found:!!h,fallback:h.usedFallback,hp:h.hp,type:h.def.type,optional:!!h.def.optional,radius:Math.round(h.radius),length:Math.round(naval.length),draft:naval.draft,outlets,
     meshes:(()=>{let n=0;h.group.traverse(o=>{if(o.isMesh)n++;});return n;})(),others:others.map(s=>s.def.type),
     hud:document.getElementById('hStatus')?.textContent||'',clear:pacificTargetsClear(),neutralFlak:h.flak,label:NavalAssets.label(h.def),nav:nav.filter(l=>/HOSPITAL/.test(l)),
     primary:ships.filter(s=>!s.def.optional&&s.def.type!=='destroyer').length,briefHtml:MISSIONS[ships&&mission].body.includes('hospital ship')};
   },title);
   assert.ok(A.found&&!A.fallback,title+': the real hospital-ship model is installed');
   assert.equal(A.type,'hospital');assert.ok(A.optional,'not an objective');assert.equal(A.hp,4);assert.ok(!A.neutralFlak,'a hospital ship has no flak');
   assert.equal(A.length,163);assert.ok(Math.abs(A.draft-9.23)<.01,'draft '+A.draft);assert.ok(A.radius>85&&A.radius<95,'radius '+A.radius);
   assert.ok(A.outlets>=1,'the funnel has an exhaust outlet');assert.ok(A.meshes>10);assert.ok(A.briefHtml,'the briefing mentions the hospital ship');
   assert.equal(A.label,'Hospital ship');assert.ok(A.nav.some(l=>/NEUTRAL/.test(l)),'the contact list marks her neutral: '+A.nav);
   assert.ok(!A.others.includes('hospital'));assert.ok(A.primary>=1);assert.ok(!A.clear,'the real targets are still afloat');
   assert.ok(!/SHIPS\s*3\b/.test(A.hud)||title==='Sortie 4','HUD does not count her');
   report[title]=A;
  }
  // ---- all four hit paths, in Sortie 2 ----
  const B=await page.evaluate(async()=>{
   await begin('Sortie 2');
   const h=ships.find(s=>s.def.neutral),p=h.group.position,real=ships.filter(s=>!s.def.neutral&&s.def.type==='freighter');
   const out={};const s0=score;
   // 1. a shell through the real gun loop
   const mesh=new THREE.Mesh(new THREE.SphereGeometry(.3),new THREE.MeshBasicMaterial());mesh.position.set(p.x,6,p.z);scene.add(mesh);
   bullets.push({mesh,dir:new THREE.Vector3(0,0,1),life:.5,speed:650,weapon:'rifle'});
   P.pos.set(p.x,60,p.z-400);P.heading=Math.PI/2;updateGuns(.001);
   out.gun={score:score-s0,said:said.join('|'),hp:h.hp,strafe:h.strafe||0};said.length=0;
   // 2. a bomb through the real ordnance step
   const s1=score,bm=new THREE.Mesh(new THREE.SphereGeometry(.4),new THREE.MeshBasicMaterial());bm.position.set(p.x,14,p.z);scene.add(bm);
   bombs.push({mesh:bm,vel:new THREE.Vector3(0,-30,0),life:8});updateOrdnanceStep(.02);
   out.bomb={score:score-s1,hp:h.hp,said:said.join('|'),alive:h.alive,flashText:document.getElementById('flash')?.textContent||'',bombs:bombs.length};said.length=0;
   // 3. a torpedo hit (hitShip is the path of torpedoes and rockets)
   const s2=score;hitShip(h,false,p.clone(),'torpedo');out.torp={score:score-s2,hp:h.hp,said:said.join('|'),alive:h.alive};said.length=0;
   out.torpEnemy={sunk:real.some(r=>!r.alive),kills:sortieShipsSunk,neutralHits:sortieNeutralHits};
   // 4. sinking her
   hitShip(h,false,p.clone(),'rocket');out.third={hp:h.hp,alive:h.alive};
   const s3=score;hitShip(h,false,p.clone(),'bomb');out.sunk={score:score-s3,hp:h.hp,alive:h.alive,said:said.join('|'),sinkT:h.sinkT,kills:sortieShipsSunk,flash:document.getElementById('flash')?.textContent||''};
   for(let i=0;i<60;i++)updateShips(.1);
   out.afterSink={groupY:+h.group.position.y.toFixed(2),objectiveClear:pacificTargetsClear(),realAlive:real.every(r=>r.alive),neutralHits:sortieNeutralHits};
   // 5. the real targets are untouched: sinking the freighter and the destroyer still completes the sortie
   for(const s of ships)if(!s.def.neutral&&s.alive)hitShip(s,true,s.group.position.clone(),'torpedo');
   out.done={clear:pacificTargetsClear(),kills:sortieShipsSunk,rtb:P.rtb};
   return out;
  });
  report.paths=B;
  assert.ok(B.gun.score<0,'a shell is punished, not rewarded: '+B.gun.score);assert.ok(/HOSPITAL SHIP/.test(B.gun.said),'the radio warns: '+B.gun.said);assert.equal(B.gun.hp,4,'a few shells do not sink her');
  assert.equal(B.bomb.score,-600,'a bomb costs 600: '+JSON.stringify(B.bomb));assert.equal(B.bomb.hp,3);assert.ok(/HOSPITAL SHIP/.test(B.bomb.said));assert.ok(/HOSPITAL SHIP HIT/.test(B.bomb.flashText),B.bomb.flashText);assert.equal(B.bomb.bombs,0,'the bomb is used up');
  assert.equal(B.torp.score,-600);assert.equal(B.torp.hp,2);assert.ok(B.torp.alive);assert.ok(!B.torpEnemy.sunk&&B.torpEnemy.kills===0,'no ship of the convoy counts: '+JSON.stringify(B.torpEnemy));assert.equal(B.torpEnemy.neutralHits,2,'the bomb and the torpedo count (a few shells never reach the hit threshold): '+JSON.stringify(B.torpEnemy));
  assert.ok(B.third.alive&&B.third.hp===1,'three hits leave her afloat: '+JSON.stringify(B.third));assert.equal(B.sunk.score,-2500,'sinking her costs 2500: '+JSON.stringify(B.sunk));assert.ok(!B.sunk.alive&&B.sunk.sinkT>0);assert.equal(B.sunk.kills,0,'a sunk hospital ship is not a kill');assert.ok(/YOU SUNK A HOSPITAL SHIP/.test(B.sunk.said)&&/HOSPITAL SHIP SUNK/.test(B.sunk.flash));
  assert.ok(B.afterSink.groupY<-.5,'she sinks: '+B.afterSink.groupY);assert.ok(!B.afterSink.objectiveClear&&B.afterSink.realAlive,'her loss does not complete or fail the real objective');
  assert.ok(B.done.clear&&B.done.kills===2,'the real targets still complete the sortie: '+JSON.stringify(B.done));
  // ---- a checkpoint keeps her neutral, her hp and her position ----
  await page.evaluate(async()=>{await begin('Sortie 4');const h=ships.find(s=>s.def.neutral);h.hp=2;P.pos.set(h.group.position.x+2500,150,h.group.position.z-1200);P.spd=60;P.fuel=80;
   const saved=window.sortieCheckpoint.save();if(!saved.ok)throw Error('save failed '+JSON.stringify(saved));window.__h={x:h.group.position.x,z:h.group.position.z,hp:h.hp};});
  const saved=await page.evaluate(()=>window.__h);
  await page.reload();
  await page.waitForFunction(()=>state===ST.MENU&&window.sortieCheckpoint?.ready,null,{polling:200});
  await page.locator('#continueFlight').click();
  await page.waitForFunction(()=>state===ST.PAUSED&&!window.sortieCheckpoint.restoring,null,{polling:200});
  const C=await page.evaluate(()=>{const h=ships.find(s=>s.def.neutral);return h?{hp:h.hp,x:h.group.position.x,z:h.group.position.z,fallback:h.usedFallback,optional:!!h.def.optional,neutral:!!h.def.neutral}:null;});
  report.checkpoint={saved,restored:C};
  assert.ok(C&&C.neutral&&C.optional&&!C.fallback,'she is restored as a neutral ship with her real model: '+JSON.stringify(C));
  assert.equal(C.hp,2);assert.ok(Math.abs(C.x-saved.x)<1&&Math.abs(C.z-saved.z)<1,'same position: '+JSON.stringify([C,saved]));
  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/hospital-ship-browser.json'),JSON.stringify(report,null,1));
  console.log('Hospital ship WebGL: OK',JSON.stringify({gun:B.gun.score,bomb:B.bomb.score,torpedo:B.torp.score,sunk:B.sunk.score}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
