/* Build 294, real Rhine game, real models:
 *  1. Ar 234 B-2 "Bonus Blitz": the generated tricycle gear stands on the strip (three tyres), the take-off rockets fire, it lifts off,
 *     the SC 500 under the fuselage is gone after the drop, and the two rear guns fire by themselves at a pursuer astern.
 *  2. Storch: the observer fires on revealed ground troops - in the air in his rear cone, on the ground over the rear hemisphere - and
 *     kills a squad; troops ahead of a standing Storch get the "swing the tail" call and are not shot at.
 *  3. Storch checkpoint: a rescue sortie with a nest killed, a nest shown and one hidden, the wire broken and hunters on the way is
 *     saved in the air, the page is reloaded cold, Continue restores the same units (place, hit points, shown/hidden), the wire and the timers.
 * Writes app/release/ar234-storch-browser.json on success. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Ar 234 / Storch WebGL: skipped locally (no Chrome).');process.exit(0);}
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
  const page=await browser.newPage({viewport:{width:1024,height:600},hasTouch:true}),errors=[];
  page.setDefaultTimeout(600000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto(origin+'/remagen-mission.html?v=294&surprises=off');
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady&&window.sortieCheckpoint?.ready,null,{polling:250});

  // ---- 1. Ar 234 ----
  report.ar234=await page.evaluate(async()=>{
   renderer.setPixelRatio(.25);renderer.shadowMap.enabled=false;
   const i=MISSIONS.findIndex(m=>m.id==='blitz');await ensureModel('ar234');
   startMission(i);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;for(const e of enemyAir)e.alive=false;
   aeroMode=false;inputRoll=0;inputPitch=0;
   const tyres=[];playerModel.traverse(o=>{if(o.userData.groundWheel)tyres.push(o);});
   const bomb=playerModel.getObjectByName('Bomb'),out={index:i,tyres:tyres.length,bombs:P.bombs,bombVisible:!!bomb?.visible,coreOn:coreOn(),stall:+SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall.toFixed(1)};
   const x0=P.pos.x,z0=P.pos.z,dt=1/60;P.throttle=1;let off=null,rato=false,t=0;
   for(;t<80&&P.alive;t+=dt){
    const vr=SortieFeatures.Handling.speeds(P,acDef().stall,acDef().app).stall*1.1;
    if(P.onGround&&P.spd>.95*vr)inputPitch=.5;updateFlight(dt);if(P.rato>0)rato=true;
    if(!P.onGround&&off==null)off={t:+t.toFixed(1),dist:Math.round(Math.hypot(P.pos.x-x0,P.pos.z-z0)),ms:+P.spd.toFixed(1)};
    if(off&&t-off.t>8)break;
   }
   out.rato=rato;out.liftoff=off;out.alive=P.alive;out.agl=Math.round(P.pos.y-groundY(P.pos.x,P.pos.z));
   P.gearTgt=0;for(let k=0;k<240;k++)updateFlight(dt);posePlayerAircraft(0);
   out.gearHiddenUp=!playerModel.getObjectByName('gear').visible;
   weapon='bomb';dropBomb();posePlayerAircraft(0);out.afterDrop={bombs:P.bombs,bombVisible:!!bomb?.visible,heavy:!!bombs.at(-1)?.heavy};
   // a pursuer 300 m astern and a little high
   spawnEnemyAir(1,'p47');const e=enemyAir.at(-1),back=noseDir().multiplyScalar(-300);e.pos.copy(P.pos).add(back);e.pos.y+=20;e.hp=99;
   const ammo=P.ammo,before=bullets.length;let gunner=0;
   for(let k=0;k<180;k++){updateStorchGunner(1/60);gunner=Math.max(gunner,bullets.filter(b=>b.by==='gunner').length);}
   out.gunner={rounds:ammo-P.ammo,inFlight:gunner,cannon:bullets.filter(b=>b.by==='gunner').every(b=>b.dmg>.5)};
   e.alive=false;for(const b of bullets)GameRuntime.release(b.mesh);bullets.length=0;
   return out;
  });
  const a=report.ar234;
  assert.equal(a.tyres,3,'three generated tyres');assert.equal(a.bombs,1);assert(a.bombVisible,'SC 500 shown before the drop');assert(a.coreOn,'flies on the flight core');
  assert(a.rato,'take-off rockets fired');assert(a.liftoff&&a.liftoff.t<45&&a.liftoff.dist<1300,'lifts off from the strip: '+JSON.stringify(a.liftoff));
  assert(a.alive&&a.agl>15,'climbs away: '+a.agl);assert(a.gearHiddenUp,'retracted gear hidden');
  assert.equal(a.afterDrop.bombs,0);assert(!a.afterDrop.bombVisible,'SC 500 gone after the drop');assert(a.afterDrop.heavy,'heavy bomb blast');
  assert(a.gunner.rounds>5&&a.gunner.cannon,'rear guns fire 20 mm rounds at a pursuer: '+JSON.stringify(a.gunner));

  // ---- 2. Storch observer against ground troops ----
  report.storch=await page.evaluate(async()=>{
   const i=MISSIONS.findIndex(m=>m.rescue);await ensureModel('fi156');
   startMission(i);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;for(const e of enemyAir)e.alive=false;
   const s=sts,rand=Math.random,out={};
   // on the ground: a squad 250 m astern, one 250 m ahead
   P.onGround=true;P.spd=0;P.throttle=0;P.landingRoll=null;
   const nose=noseDir(),put=(d)=>({x:P.pos.x+nose.x*d,z:P.pos.z+nose.z*d});
   const behind=put(-250),ahead=put(250);
   const A=stsUnit(behind.x,behind.z,rand,{mobile:false,range:380}),B=stsUnit(ahead.x,ahead.z,rand,{mobile:false,range:380});
   for(const u of [A,B]){u.revealed=true;u.group.visible=true;const y=terrain.getRenderedHeight(u.x,u.z);u.group.position.set(u.x,y,u.z);targets.push(u.t);flakUnits.push(u.t);}
   radioQ=[];P.gunner=null;const ammo=P.ammo;
   for(let k=0;k<60*12&&A.t.alive;k++){updateStorchGunner(1/60);updateBullets(1/60);}
   out.ground={behindKilled:!A.t.alive,aheadAlive:B.t.alive,rounds:ammo-P.ammo,calls:radioQ.map(r=>r.text||r).join(' | ')};
   // only the one ahead is left: the observer says to turn, and does not fire
   radioQ=[];const ammo2=P.ammo;for(let k=0;k<120;k++){updateStorchGunner(1/60);updateBullets(1/60);}
   out.ahead={rounds:ammo2-P.ammo,calls:radioQ.map(r=>r.text||r).join(' | ')};
   // in the air at 120 m: a nest in the rear cone below
   B.t.alive=false;P.onGround=false;P.pos.y=groundY(P.pos.x,P.pos.z)+120;P.spd=40;
   const nest=put(-330),C=stsUnit(nest.x,nest.z,rand,{range:380});C.revealed=true;C.group.visible=true;C.group.position.set(C.x,terrain.getRenderedHeight(C.x,C.z),C.z);targets.push(C.t);flakUnits.push(C.t);
   const ammo3=P.ammo;for(let k=0;k<60*3;k++){updateStorchGunner(1/60);}
   out.air={rounds:ammo3-P.ammo};
   for(const b of bullets)GameRuntime.release(b.mesh);bullets.length=0;
   return out;
  });
  const st=report.storch;
  assert(st.ground.behindKilled,'observer kills the squad astern: '+JSON.stringify(st.ground));assert(st.ground.aheadAlive,'the squad ahead is not shot');
  assert(/ENGAGING THE INFANTRY/.test(st.ground.calls),'engaging call');
  assert.equal(st.ahead.rounds,0,'no rounds at troops ahead of the nose');assert(/SWING THE TAIL/.test(st.ground.calls+st.ahead.calls),'turn call');
  assert(st.air.rounds>3,'in the air he fires at a nest in his rear cone');

  // ---- 3. Storch checkpoint across a cold reload ----
  const saved=await page.evaluate(async()=>{
   const i=MISSIONS.findIndex(m=>m.rescue);
   startMission(i);finishLaunchIntro(false);show('menu',false);show('brief',false);state=ST.FLIGHT;
   const s=sts;P.onGround=false;P.landingRoll=null;P.alive=true;
   const lz=s.plan.lz;P.pos.set(lz.x+2600,groundY(lz.x+2600,lz.z)+180,lz.z);P.spd=40;P.throttle=.7;
   // shape a state: first unit killed, second shown, the rest hidden; the wire broken; a hunters' timer; some calls said
   const units=s.units;if(units.length<2)throw Error('need two units, have '+units.length);
   stsReveal(units[0],'%c');damageTarget(units[0].t,99,true);stsReveal(units[1],'%c');units[1].t.hp=.6;
   if(s.wire){s.wire.broken=true;for(const o of s.wire.group.children)if(o.isLine)o.visible=false;}
   s.hunt={n:2,t:17.5};s.said.near=1;s.clock=123.4;
   const r=window.sortieCheckpoint.save();if(!r.ok)throw Error('save failed '+JSON.stringify(r));
   const sum=()=>({kind:sts.kind,clock:sts.clock,hunt:sts.hunt,said:sts.said,wire:sts.wire?{broken:sts.wire.broken,lines:sts.wire.group.children.filter(o=>o.isLine).map(o=>o.visible)}:null,
     units:sts.units.map(u=>({x:+u.x.toFixed(2),z:+u.z.toFixed(2),alive:u.t.alive,hp:+(+u.t.hp).toFixed(2),revealed:u.revealed,visible:u.group.visible,decoy:!!u.decoy})),
     inTargets:targets.filter(t=>sts.units.some(u=>u.t===t)).length,pos:P.pos.toArray().map(v=>+v.toFixed(2))});
   window.__sum=sum;return sum();
  });
  await page.reload();
  await page.waitForFunction(()=>state===ST.MENU&&realWorldReady&&window.sortieCheckpoint?.ready,null,{polling:250});
  await page.locator('#continueFlight').click();
  await page.waitForFunction(()=>state===ST.PAUSED&&!window.sortieCheckpoint.restoring,null,{polling:250});
  const restored=await page.evaluate(()=>({kind:sts.kind,clock:sts.clock,hunt:sts.hunt,said:sts.said,wire:sts.wire?{broken:sts.wire.broken,lines:sts.wire.group.children.filter(o=>o.isLine).map(o=>o.visible)}:null,
     units:sts.units.map(u=>({x:+u.x.toFixed(2),z:+u.z.toFixed(2),alive:u.t.alive,hp:+(+u.t.hp).toFixed(2),revealed:u.revealed,visible:u.group.visible,decoy:!!u.decoy})),
     inTargets:targets.filter(t=>sts.units.some(u=>u.t===t)).length,pos:P.pos.toArray().map(v=>+v.toFixed(2))}));
  report.checkpoint={saved,restored};
  // the dead unit: alive false (its group is hidden either way); compare the rest field by field
  assert.equal(restored.kind,saved.kind);assert.equal(restored.clock,saved.clock);assert.deepEqual(restored.hunt,saved.hunt);assert.deepEqual(restored.said,saved.said);
  assert.deepEqual(restored.wire,saved.wire,'wire state');assert.deepEqual(restored.pos,saved.pos);
  assert.equal(restored.units.length,saved.units.length,'same number of units');
  restored.units.forEach((u,k)=>{const v=saved.units[k];assert.equal(u.x,v.x);assert.equal(u.z,v.z);assert.equal(u.alive,v.alive);assert.equal(u.decoy,v.decoy);
   if(v.alive){assert.equal(u.hp,v.hp);assert.equal(u.revealed,v.revealed);assert.equal(u.visible,v.visible);}});
  assert.equal(restored.inTargets,1,'only the shown, living unit is a target again (the killed one is not)');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'app/release/ar234-storch-browser.json'),JSON.stringify(report,null,1)+'\n');
  console.log('ar234-storch-browser: ok',JSON.stringify({ar234:a.liftoff,gunner:a.gunner,storch:st,units:saved.units.length}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});
