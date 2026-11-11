/* Rhine checkpoint adapter. Rebuild from original templates, restore state, no awards. */
'use strict';
(function(){
 const C=SortieCheckpoint,identity=(i,saved)=>CustomSortie.checkpointIdentity('europe',MISSIONS,i,saved);
 function airborne(){return (state===ST.FLIGHT||state===ST.PAUSED&&prevState===ST.FLIGHT)&&P.alive&&!P.onGround&&!P.landingRoll&&!launchIntro&&!bailout&&!missionOver&&!sortieService?.active&&!(typeof duelSession!=='undefined'&&duelSession&&duelSession.match);}
 function snapshot(){return {mission,custom:MISSIONS[mission].custom||null,identity:identity(mission),label:MISSIONS[mission].sub,
  player:C.capture(P,['_keys','_stickActive','_keyboardFlightActive']),operation:C.capture(europeOps),
  globals:C.capture({score,scoreStart,sortieKills,hitsTaken,circuitsDone,weather,baseWind,windZ,wxTime,diffIdx,weapon,aeroMode,invertPitch,steerSign,convoyAlertCalled}),
  targets:targets.filter(t=>!t.surprise&&!t.optionalSite).map(t=>C.entity(t,t.sub)),air:enemyAir.map(e=>C.entity(e)),wingmen:wingmen.map(w=>C.entity(w)),squad:squad.map(w=>C.entity(w)),squadStats:{...squadStats},squadOrder,bomberAlarm,
  traffic:(livingWorld?.entities||[]).map(e=>({alive:e.alive,phase:e.phase,last:C.capture(e.last),alertT:e.alertT,transform:C.transform(e.model)})),
  weapons:{bullets:C.projectiles(bullets),tracers:C.projectiles(tracers),bombs:C.projectiles(bombs),rockets:C.projectiles(rockets),groundFire:C.projectiles(groundFire)},
  navigation:C.navigationState(navigation),clock:clock.elapsedTime,flares:flareSupport?.checkpoint()};}
 async function load(saved){
  CustomSortie.restoreSaved('europe',saved,MISSIONS,FlightPlans.europe);selectedMission=saved.mission;
  if(!saved.operation?.config)throw Error('Missing operation in checkpoint');
  const kinds=new Set([MISSIONS[saved.mission].ac,...saved.air.map(e=>e.state.kind),...saved.wingmen.map(e=>e.state.kind)]);
  for(const kind of kinds)await ensureModel(kind);
  if(livingWorld&&(livingWorld.entities.length!==saved.traffic.length))throw Error('Traffic layout changed');
  briefPlan={config:saved.operation.config,weather:saved.globals.weather,wind:saved.globals.baseWind};
  // Build 243: the real models of the mission's ground sites (V-1 ramp, radar, searchlights) are there before the sites are placed, so a destroyed one shows its wreck
  if(typeof loadMissionSites==='function')await loadMissionSites(MISSIONS[saved.mission]);
  startMission(saved.mission);finishLaunchIntro(false);briefPlan=null;
  C.restore(P,saved.player);P.onGround=false;P.landingRoll=null;
  europeOps=new FlightOps.Operation(saved.operation.config);C.restore(europeOps,saved.operation);
  const g=C.restore({},saved.globals);
  ({score,scoreStart,sortieKills,hitsTaken,circuitsDone,weather,baseWind,windZ,wxTime,diffIdx,weapon,aeroMode,invertPitch,steerSign,convoyAlertCalled}=g);
  applyWeather();
  // Build 243: optional sites (radar, searchlights) are placed again by populate() and are not part of a checkpoint
  const core=targets.filter(t=>!t.optionalSite);
  if(core.length!==saved.targets.length)throw Error('Target layout changed');
  core.forEach((t,i)=>{
   const s=saved.targets[i];C.applyEntity(t,s,t.sub);
   if(!t.alive&&!t.entity&&t.site&&typeof siteWreck==='function')siteWreck(t,true);
   else if(!t.alive&&!t.entity){t.sub.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color.multiplyScalar(.32);}});
    if(t.kind==='bridge'){t.sub.children[0].visible=false;if(t.sub.children[2])t.sub.children[2].visible=false;}
    t.sub.userData.wreckOffset=-(t.kind==='bridge'?2:1.2);
   }
  });
  flakUnits=flakUnits.filter(t=>t.alive);
  if(livingWorld)saved.traffic.forEach((s,i)=>{
   const e=livingWorld.entities[i];if(!s.alive)livingWorld.destroyEntity(e);
   e.phase=s.phase;e.last=C.restore({},s.last);e.alertT=s.alertT;C.applyTransform(e.model,s.transform);
  });
  for(const e of enemyAir)GameRuntime.release(e.group);enemyAir=[];
  for(const s of saved.air){(s.state.bomber?spawnBombers:spawnEnemyAir)(1,s.state.kind);C.applyEntity(enemyAir.at(-1),s);}
  for(const w of wingmen)GameRuntime.release(w.group);wingmen=[];
  for(const s of saved.wingmen){const group=buildAircraft(s.state.kind);scene.add(group);const w=C.applyEntity({group},s);wingmen.push(w);}
  // Build 236: the squad (old checkpoints have none). A dead wingman stays dead; a brain is built again.
  clearSquad();
  for(const s of saved.squad||[]){
   if(!s.state.alive)continue;
   const group=buildAircraft(s.state.kind);scene.add(group);
   squad.push(C.applyEntity({group,prop:group.getObjectByName('prop'),squad:true,run:Squad.newRun()},s));
  }
  Object.assign(squadStats,saved.squadStats||{});
  squadOrder=Squad.ORDERS.includes(saved.squadOrder)?saved.squadOrder:'free';syncWingBtn();
  bomberAlarm=!!saved.bomberAlarm;
  for(const e of enemyAir){if(e.tac&&typeof e.tac.rng!=='function')e.tac=null;e.tgt=null;}
  const w=saved.weapons;
  bullets=C.restoreProjectiles(w.bullets,'round',scene);tracers=C.restoreProjectiles(w.tracers,'aa',scene);
  bombs=C.restoreProjectiles(w.bombs,'bomb',scene);rockets=C.restoreProjectiles(w.rockets,'rocket',scene);groundFire=C.restoreProjectiles(w.groundFire,()=>new THREE.Mesh(flakShellGeo,flakShellMat),scene);
  clearDropTank();if(P.tankAttached)installDropTank();syncTankButton();
  flareSupport?.restoreCheckpoint(saved.flares);clock.elapsedTime=saved.clock;killCam=null;shakeT=0;radioQ=[];radioT=0;
  C.restoreNavigation(ensureNavigation(),saved.navigation);
  show('brief',false);show('result',false);show('loading',false);show('menu',false);state=ST.FLIGHT;
  releaseHeldControls();setThrottleUI(P.throttle);applyWeaponUI();resetCtlUI();
  const aero=document.getElementById('aeroBtn');aero.classList.toggle('on',aeroMode);aero.innerHTML='REALISTIC<br>'+(aeroMode?'ON':'OFF');
  refreshModels();posePlayerAircraft(0);updateCamera(0);updateHUD();bombCue.reset();clock.getDelta();
  togglePause('Saved flight restored — tap Resume Flight.');
 }
 window.sortieCheckpoint=C.create({campaign:'europeRhine',identity,snapshot,load,canSave:airborne}).mount(async()=>{
  initAudio();soundscape.attach(actx,eng?.master);voiceRadio.unlock();
  try{await window.sortieCheckpoint.resume();}catch(error){exitToMenuFromPause(true);flash('SAVED FLIGHT COULD NOT LOAD — '+error.message,5000);}
 });
})();
