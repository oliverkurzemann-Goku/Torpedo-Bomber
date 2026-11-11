/* Build 247, real Pacific game and the real G4M1 Betty GLB: Sortie 22 "Betty Alarm" (and the second wave of Sortie 19) fly Betty torpedo raids at 30 m.
 * The flight leader carries yellow caps; with him down the followers that have not dropped drop from far out (the fish run out of range); a Betty that blows
 * up hurts the raiders (and a pilot) near her; two hits and she burns down by herself; after the drop she withdraws; the state survives a checkpoint round trip.
 * GAME_TEST_CHROME selects Chrome. Writes app/release/betty-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Betty WebGL: skipped locally (no Chrome).');process.exit(0);}
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
   window.begin=async(title,keep=false)=>{const i=MISSIONS.findIndex(m=>m.title===title);DIFF='veteran';await preparePacificModels(MISSIONS[i]);startMission(i);finishCarrierIntro();hideOverlays();state=ST.FLIGHT;
    for(const z of zeros)z.alive=false;P.alive=true;P.onDeck=false;P.onGround=false;P.hull=100;P.pos.set(carrierX-3000,3500,-5000);if(!keep)said.length=0;return i;};
   // one step of the raid: the carrier moves, the raiders fly, the fish run
   window.tick=(n,dt=.1)=>{for(let i=0;i<n;i++){carrierX+=CARRIER_SPD*dt;if(carrier)carrier.position.x=carrierX;updateRaiders(dt);updateEnemyTorps(dt);}};
   // a burst of real player bullets (the real gun loop) along the line to a raider
   window.burst=(r,n=6,miss=0)=>{const to=r.pos.clone(),from=to.clone().add(new THREE.Vector3(-120,0,0)),dir=new THREE.Vector3(1,0,0);
    from.z+=miss;for(let k=0;k<n;k++){const m=new THREE.Mesh(new THREE.SphereGeometry(.2,4,3),new THREE.MeshBasicMaterial());scene.add(m);m.position.copy(from);bullets.push({mesh:m,dir:dir.clone(),life:1,speed:600,weapon:'rifle'});}
    for(let k=0;k<5;k++)updateGuns(.05);};
  });

  // ---- 1. Sortie 22: set-up ----
  const A=await page.evaluate(async()=>{
   await begin('Sortie 22',true);
   const rs=raiders.slice(),yaw=rs[0].mesh.rotation.y;rs[0].mesh.rotation.set(0,0,0);rs[0].mesh.updateMatrixWorld(true);   // measured unrotated
   const box=new THREE.Box3().setFromObject(rs[0].mesh),size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());rs[0].mesh.rotation.set(0,yaw,0);rs[0].mesh.updateMatrixWorld(true);
   return {n:rs.length,betty:rs.every(r=>r.betty),fromModel:rs.every(r=>r.fromModel),template:!!bettyTemplate,leader:rs.map(r=>!!r.leader),wave:rs.map(r=>r.wave),hp:rs.map(r=>r.hp),
    marks:rs.map(r=>r.visual.marks.visible),marksCount:rs[0].visual.marks.children.length,torpedo:rs.map(r=>r.visual.torpedo.visible),
    alt:rs.map(r=>Math.round(r.pos.y)),dist:rs.map(r=>Math.round(Math.hypot(r.pos.x-carrierX,r.pos.z))),
    toward:rs.map(r=>+(Math.sin(r.heading)*(carrierX-r.pos.x)+Math.cos(r.heading)*(0-r.pos.z)).toFixed(0)>0),
    size:size.toArray().map(v=>+v.toFixed(1)),centreOffset:+(c.y-rs[0].pos.y).toFixed(2),props:rs[0].rotors.length,
    gearUp:rs[0].mesh.children[0].getObjectByName('GearLeft').rotation.x,fire:[...rs[0].mesh.children[0].children].length>0,
    label:null,said:said.join('|'),mission:{betty:MISSIONS[mission].betty,theater:MISSIONS[mission].theater,raiders:MISSIONS[mission].raiders},
    rotorsMarked:(()=>{let n=0;rs[0].mesh.traverse(o=>{if(o.userData&&o.userData.bomberRotor)n++;});return n;})()};
  });
  report.setup=A;
  assert.equal(A.n,3);assert.ok(A.betty&&A.fromModel&&A.template,'three real Bettys: '+JSON.stringify(A));assert.deepEqual(A.leader,[true,false,false]);assert.deepEqual(A.wave,[1,1,1]);assert.deepEqual(A.hp,[5,5,5]);
  assert.deepEqual(A.marks,[true,false,false],'only the leader carries the yellow caps');assert.ok(A.marksCount>=3,'fin cap and two wingtips: '+A.marksCount);assert.deepEqual(A.torpedo,[true,true,true],'the torpedoes hang under the Bettys');
  assert.ok(A.dist.every(d=>d>4000&&d<5400),'they start 4–5.4 km out: '+A.dist);assert.ok(A.alt.every(a=>a>=160&&a<=200),'at about 170 m: '+A.alt);assert.ok(A.toward.every(Boolean),'heading for the carrier');
  assert.ok(Math.abs(A.size[0]-24.9)<.2&&Math.abs(A.size[2]-20)<.5,'the real model size (span / length): '+A.size);assert.ok(Math.abs(A.centreOffset)<2.2,'the fuselage centre sits on the raider position: '+A.centreOffset);
  assert.equal(A.props,2);assert.equal(A.rotorsMarked,2,'both propellers are flagged as rotors for the engine fire');assert.ok(A.gearUp>1.3,'wheels up: '+A.gearUp);
  assert.ok(A.mission.betty&&A.mission.theater==='fleet'&&A.mission.raiders===3);assert.ok(/YELLOW CAPS/.test(A.said),'the radio names the leader mark: '+A.said);

  // ---- 2. nobody interferes: the leader drops first, all drop between 260 and 620 m at 30–70 m height, the fish hit, then every Betty withdraws ----
  const B=await page.evaluate(async()=>{
   await begin('Sortie 22');
   const rs=raiders.slice(),drops=[];let hp0=carrierHP;const seen=new Set();let torpMax=0,minAlt=1e9;
   for(let s=0;s<1100;s++){tick(1);torpMax=Math.max(torpMax,etorps.length);
    for(const r of rs){if(r.alive)minAlt=Math.min(minAlt,r.pos.y);if(r.dropped&&!seen.has(r)){seen.add(r);drops.push({slot:r.slot,t:s/10,dist:Math.round(Math.hypot(r.pos.x-carrierX,r.pos.z)),alt:Math.round(r.pos.y),rattled:r.rattled});}}
    if(rs.every(r=>!r.alive)&&!etorps.length)break;}
   return {drops,carrierHP,hp0,withdrawn:rs.map(r=>!!r.withdrawn),alive:rs.map(r=>r.alive),torpMax,minAlt:Math.round(minAlt),etorps:etorps.length,clear:pacificTargetsClear(),said:said.join('|'),kills:raiders.filter(r=>!r.alive).length};
  });
  report.attack=B;
  assert.equal(B.drops.length,3,'all three drop: '+JSON.stringify(B.drops));assert.equal(B.drops[0].slot,0,'the leader drops first');
  assert.ok(B.drops.every(d=>d.dist>=260&&d.dist<=640&&d.alt>=32&&d.alt<=70&&!d.rattled),'normal drops at 260–620 m and 32–70 m: '+JSON.stringify(B.drops));
  assert.ok(B.minAlt<=45,'the run-in is flown at about 30 m: '+B.minAlt);assert.ok(B.carrierHP<=75,'unhindered fish hit the carrier: '+B.carrierHP);
  assert.ok(B.withdrawn.every(Boolean)&&B.alive.every(v=>!v),'every Betty withdraws after the drop: '+JSON.stringify(B.withdrawn));assert.equal(B.etorps,0);assert.ok(B.clear,'nothing left in the air or the water: the raid is over');
  assert.ok(/A BETTY GOT AWAY/.test(B.said)&&/TORPEDO IN THE WATER/.test(B.said));

  // ---- 3. the leader is shot down first: reward, followers drop early, their fish run short ----
  const C=await page.evaluate(async()=>{
   await begin('Sortie 22');
   const rs=raiders.slice(),leader=rs[0];tick(250);   // 25 s: closer, nobody has dropped
   const s0=score,hull0=P.hull;
   burst(leader,6);
   const out={leaderDead:!leader.alive,hp:rs.map(r=>+r.hp.toFixed(1)),score:score-s0,rattled:rs.map(r=>r.rattled),said:said.join('|'),flash:document.getElementById('flash')?.textContent||''};
   const drops=[];const seen=new Set();let maxLife=0;
   for(let s=0;s<900;s++){tick(1);for(const t of etorps)if(t.life>maxLife)maxLife=t.life;
    for(const r of rs.slice(1)){if(r.dropped&&!seen.has(r)){seen.add(r);drops.push({slot:r.slot,dist:Math.round(Math.hypot(r.pos.x-carrierX,r.pos.z)),alt:Math.round(r.pos.y),rattled:r.rattled});}}
    if(rs.every(r=>!r.alive)&&!etorps.length)break;}
   out.drops=drops;out.carrierHP=carrierHP;out.maxLife=+maxLife.toFixed(1);out.clear=pacificTargetsClear();out.said2=said.join('|');out.hull=P.hull;
   return out;
  });
  report.leader=C;
  assert.ok(C.leaderDead&&C.rattled[1]&&C.rattled[2]&&!C.rattled[0],'the followers are rattled: '+JSON.stringify(C));
  assert.ok(C.score>=800&&C.score<=1000,'500 for the Betty, 300 for the leader, 30 per hit: '+C.score);assert.ok(/LEAD BETTY DOWN/.test(C.said),C.said);
  assert.equal(C.drops.length,2,'both followers still drop');assert.ok(C.drops.every(d=>d.rattled&&d.dist>1500&&d.alt<=85),'they drop from far out: '+JSON.stringify(C.drops));
  assert.equal(C.carrierHP,100,'the early fish run out of range: carrier untouched');assert.ok(C.maxLife<=11.5,'short-lived torpedoes: '+C.maxLife);assert.ok(/DROPPED TOO EARLY/.test(C.said2));assert.ok(C.clear,'the raid is over');

  // ---- 4. a follower shot first: the leader and the other follower are not rattled and drop normally ----
  const D=await page.evaluate(async()=>{
   await begin('Sortie 22');
   const rs=raiders.slice();tick(250);const s0=score;burst(rs[2],6);
   const out={dead:!rs[2].alive,score:score-s0,rattled:rs.map(r=>r.rattled),said:said.join('|')};
   const drops=[];const seen=new Set();
   for(let s=0;s<900;s++){tick(1);for(const r of rs.slice(0,2)){if(r.dropped&&!seen.has(r)){seen.add(r);drops.push({slot:r.slot,dist:Math.round(Math.hypot(r.pos.x-carrierX,r.pos.z))});}}if(rs.every(r=>!r.alive)&&!etorps.length)break;}
   out.drops=drops;out.carrierHP=carrierHP;return out;
  });
  report.follower=D;
  assert.ok(D.dead&&D.score>=500&&D.score<=700,'follower: 500 + hits: '+D.score);assert.deepEqual(D.rattled,[false,false,false]);assert.ok(!/BREAKS/.test(D.said));
  assert.ok(D.drops.length===2&&D.drops.every(d=>d.dist<=640),'the leader and the other follower drop normally: '+JSON.stringify(D.drops));assert.ok(D.carrierHP<=75&&D.carrierHP>=50,'two fish (25 each) hit: '+D.carrierHP);

  // ---- 5. the real hit radius: 10 m beside the fuselage centre hits, 15 m does not ----
  const E=await page.evaluate(async()=>{
   await begin('Sortie 22');
   const r=raiders[1];r.mesh.position.copy(r.pos);
   const hp0=r.hp;burst(r,3,15);const miss=r.hp;burst(r,3,9);const hit=r.hp;
   return {hp0,miss,hit,hitR:r.hitR};
  });
  report.radius=E;
  assert.equal(E.hitR,11);assert.equal(E.miss,E.hp0,'15 m wide: miss');assert.ok(E.hit<E.miss,'9 m wide: a hit: '+JSON.stringify(E));

  // ---- 6. an exploding Betty hurts her neighbours and a pilot in the fireball; far ones and far pilots are untouched ----
  const F=await page.evaluate(async()=>{
   await begin('Sortie 22');
   const rs=raiders.slice(),[a,b,c]=rs;b.pos.copy(a.pos).add(new THREE.Vector3(40,0,25));c.pos.copy(a.pos).add(new THREE.Vector3(0,0,420));
   for(const r of rs)r.mesh.position.copy(r.pos);
   P.pos.copy(a.pos).add(new THREE.Vector3(-30,5,0));P.hull=100;said.length=0;
   killRaider(a);
   return {neighbour:b.hp,far:c.hp,aliveFar:c.alive,hull:+P.hull.toFixed(1),said:said.join('|'),rattled:[b.rattled,c.rattled]};
  });
  report.blast=F;
  assert.equal(F.neighbour,3,'the neighbour takes 2: '+JSON.stringify(F));assert.equal(F.far,5,'420 m away: untouched');assert.ok(F.hull<100&&F.hull>=88,'a pilot 30 m from the fireball is hurt (veteran): '+F.hull);
  assert.ok(/FIREBALL ON YOUR WING/.test(F.said)&&/LEAD BETTY DOWN/.test(F.said));
  const F2=await page.evaluate(async()=>{
   await begin('Sortie 22');
   const [a,b]=raiders;b.pos.copy(a.pos).add(new THREE.Vector3(30,0,0));b.hp=2;P.pos.set(a.pos.x+2000,a.pos.y,a.pos.z);P.hull=100;
   killRaider(a);return {chainDead:!b.alive,hull:P.hull,said:said.join('|'),left:raiders.filter(r=>r.alive).length};
  });
  assert.ok(F2.chainDead&&F2.hull===100&&F2.left===1,'a weak neighbour burns with her; a distant pilot is untouched: '+JSON.stringify(F2));

  // ---- 7. two hits and she burns: burnt down in a few seconds without further hits, smoke and the engine fire show ----
  const G=await page.evaluate(async()=>{
   await begin('Sortie 22');
   const r=raiders[1];tick(5);burst(r,3);const hp1=r.hp;let burningAt=null;
   const t0=r.hp;for(let s=0;s<80&&r.alive;s++){tick(1);if(burningAt==null&&r.hp<hp1-.3)burningAt=s/10;}
   return {hp1,t0,dead:!r.alive,rig:aircraftDamage.stats,left:raiders.filter(x=>x.alive).length,said:said.join('|')};
  });
  report.burn=G;
  assert.ok(G.hp1<=2.1&&G.hp1>0,'three hits leave two hit points: '+G.hp1);assert.ok(G.dead,'she burns down by herself within 8 s: '+JSON.stringify(G));
  const G2=await page.evaluate(async()=>{
   await begin('Sortie 22');const r=raiders[0];burst(r,3);tick(10);const engines=aircraftDamage.stats.rigs;
   let fire=false;r.mesh.traverse(o=>{if(o.name==='localEngineFire')fire=true;});return {engines,fire,hp:r.hp};
  });
  assert.ok(G2.fire,'the engine fire sits on the model: '+JSON.stringify(G2));

  // ---- 8. the Sortie 19 second wave is Betty (the first stays A6M) ----
  const H=await page.evaluate(async()=>{
   await begin('Sortie 19');
   const first=raiders.map(r=>({betty:!!r.betty,japanese:!!r.japanese}));
   P.pos.set(carrierX+800,1500,300);let said2=[];
   for(let s=0;s<95;s++){state=ST.FLIGHT;P.alive=true;P.onDeck=false;updatePacificOperation(1);if(raiders.some(r=>r.betty))break;}
   const second=raiders.filter(r=>r.betty);
   return {first,secondN:second.length,leaders:second.map(r=>!!r.leader),wave:second.map(r=>r.wave),elapsed:Math.round(pacificOps.elapsed),said:said.join('|'),theater:MISSIONS[mission].theater,total:raiders.length};
  });
  report.sortie19=H;
  assert.ok(H.first.length===2&&H.first.every(r=>!r.betty&&r.japanese),'the first wave of Sortie 19 stays A6M: '+JSON.stringify(H.first));
  assert.equal(H.secondN,2,'the second wave is two Bettys: '+JSON.stringify(H));assert.deepEqual(H.leaders,[true,false]);assert.ok(H.elapsed>=84&&H.elapsed<=95);assert.ok(/BETTY TORPEDO BOMBERS/.test(H.said));assert.equal(H.total,4);

  // ---- 9. checkpoint state: JSON-safe and restored through the same entity path the adapter uses ----
  const K=await page.evaluate(async()=>{
   await begin('Sortie 22');
   const rs=raiders.slice();tick(250);burst(rs[0],6);rs[1].dropped=true;rs[1].hp=3;
   const saved=rs.map(r=>SortieCheckpoint.entity(r));const text=JSON.stringify(saved);
   for(const r of raiders)GameRuntime.release(r.mesh);raiders=[];bettyWaveSeq=0;
   JSON.parse(text).forEach((s,i)=>{(s.state.betty?spawnBettyRaider:spawnJapaneseRaider)(i,3);const r=raiders.at(-1);SortieCheckpoint.applyEntity(r,s);if(r.betty)bettyApplyLook(r);});
   bettyWaveSeq=raiders.reduce((m,r)=>Math.max(m,r.wave||0),0);
   const r=raiders;
   return {bytes:text.length,alive:r.map(x=>x.alive),dropped:r.map(x=>x.dropped),rattled:r.map(x=>x.rattled),hp:r.map(x=>+x.hp.toFixed(1)),torpedo:r.map(x=>x.visual.torpedo.visible),marks:r.map(x=>x.visual.marks.visible),
    wave:r.map(x=>x.wave),seq:bettyWaveSeq,betty:r.map(x=>x.betty),pos:r.map(x=>x.mesh.position.distanceTo(x.pos)<.01)};
  });
  report.checkpoint=K;
  assert.ok(K.bytes<9000,'a few kB: '+K.bytes);assert.deepEqual(K.alive,[false,true,true]);assert.deepEqual(K.dropped,[false,true,false]);assert.deepEqual(K.rattled,[false,true,true]);assert.deepEqual(K.torpedo,[true,false,true]);
  assert.deepEqual(K.marks,[false,false,false],'the dead leader shows no marks, the followers never had them');assert.deepEqual(K.wave,[1,1,1]);assert.equal(K.seq,1);assert.ok(K.betty.every(Boolean));assert.ok(K.pos.every(Boolean));

  assert.deepEqual(errors,[],errors.join('\n'));
  fs.mkdirSync(path.join(root,'app/release'),{recursive:true});fs.writeFileSync(path.join(root,'app/release/betty-browser.json'),JSON.stringify(report,null,1));
  console.log('Betty WebGL: OK',JSON.stringify({drops:B.drops.map(d=>d.dist),early:C.drops.map(d=>d.dist),hp:C.carrierHP}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
