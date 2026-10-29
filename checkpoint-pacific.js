/* Pacific checkpoint adapter: restore world state without replaying kills or awards. */
'use strict';
(function(){
 const C=SortieCheckpoint;
 const identity=(i,saved)=>CustomSortie.checkpointIdentity('pacific',MISSIONS,i,saved);
 function airborne(){return (state===ST.FLIGHT||state===ST.PAUSED&&prePauseState===ST.FLIGHT)&&P.alive&&!P.onDeck&&!P.deckRun&&!P.arrestRun&&!carrierIntro&&!bailout&&!ditching;}
 function snapshot(){
  return {mission,custom:MISSIONS[mission].custom||null,identity:identity(mission),label:MISSIONS[mission].sub,
   player:C.capture(P,['_keys','_stickActive','_keyboardFlightActive']),operation:C.capture(pacificOps),plan:C.capture(pacificPlan),
   globals:C.capture({carrierX,CARRIER_SPD,score,scoreStart,loadout,DIFF,aeroMode,invertPitch,steerSign,weather,seaState,windZ,windHead,windGust,timeMode,menuTime,
    qualTraps,qualStep,carrierHP,sortieTorpFired,sortieTorpHit,sortieBombFired,sortieBombHit,sortieShipsSunk,sortieZeros,hitsTaken,sortieWingmenLost,
    reinforcementsLaunched,radioEvadeCalled,wingmenPending,wingmenPendingT,launchTimer,lastTorpDud}),
   ships:ships.map(s=>({...C.entity(s),damage:shipDamage?.checkpoint(s)})),support:supportFleet.map(s=>C.entity(s)),shore:shoreTargets.map(t=>C.entity(t)),
   zeros:zeros.map(z=>C.entity(z)),raiders:raiders.map(r=>C.entity(r)),
   wingmen:wingmen.map(w=>({...C.entity(w),targetIndex:ships.indexOf(w.target)})),patrolIndex:wingmen.indexOf(patrolRecovery),
   weapons:{torpedoes:C.projectiles(torpedoes),bombs:C.projectiles(bombs),bullets:C.projectiles(bullets),tracers:C.projectiles(tracers),
    etorps:C.projectiles(etorps),enemyBombs:C.projectiles(enemyBombs),wingShots:wingShots.map(w=>({...C.entity(w),targetIndex:ships.indexOf(w.tgt)}))},
   clock:clock.elapsedTime,sceneryTime:operationalScenery?.time||0,navigation:C.navigationState(navigation),
   flares:flareSupport?.checkpoint()};
 }
 async function load(saved){
  CustomSortie.restoreSaved('pacific',saved,MISSIONS,FlightPlans.pacific);
  if(!saved.operation?.config||!saved.plan?.config)throw Error('Missing operation in checkpoint');
  await prepareOkinawa();
  await preparePacificModels(MISSIONS[saved.mission]);
  for(const s of [...saved.ships,...saved.support])if(s.state.def?.model)await NavalAssets.load(s.state.def.model);
  loadout=saved.globals.loadout;menuTime=saved.globals.menuTime;
  startMission(saved.mission);finishCarrierIntro();
  C.restore(P,saved.player);
  if(isCorsair()&&!saved.player.corsairLoadout){P.corsairLoadout='bombs';P.corsairWeapon='bombs';P.torps=Math.min(2,P.torps);P.rockets=0;P.ammo=Math.min(2400,P.ammo);}
  P.onDeck=false;P.deckRun=P.arrestRun=P.deckQuaternion=null;
  pacificPlan=C.restore({},saved.plan);pacificOps=new FlightOps.Operation(saved.operation.config);C.restore(pacificOps,saved.operation);
  const g=C.restore({},saved.globals);
  ({carrierX,CARRIER_SPD,score,scoreStart,loadout,DIFF,aeroMode,invertPitch,steerSign,weather,seaState,windZ,windHead,windGust,timeMode,menuTime,
   qualTraps,qualStep,carrierHP,sortieTorpFired,sortieTorpHit,sortieBombFired,sortieBombHit,sortieShipsSunk,sortieZeros,hitsTaken,sortieWingmenLost,
   reinforcementsLaunched,radioEvadeCalled,wingmenPending,wingmenPendingT,launchTimer,lastTorpDud}=g);
  if(!isSBD()&&!isDefend()&&loadout==='torpedo')P.torps=Math.max(0,Math.min(1,P.torps||0));
  P.avengerBayPending=false;P.avengerBayHold=0;
  for(const s of ships)GameRuntime.release(s.group);ships=[];
  for(const s of saved.ships){spawnShip(s.state.def);const ship=ships.at(-1);C.applyEntity(ship,s);shipDamage?.restoreCheckpoint(ship,s.damage);}
  for(const s of supportFleet)GameRuntime.release(s.group);supportFleet=[];
  for(const s of saved.support){const def=s.state.def,group=new THREE.Group();group.add(NavalAssets.get(def.model).clone(true));scene.add(group);
   const ship=PacificTheater.initializeConvoy({def,group,length:NavalAssets.get(def.model).userData.naval.length,wakeT:0});supportFleet.push(C.applyEntity(ship,s));}
  if(shoreTargets.length!==saved.shore.length)throw Error('Shore target layout changed');
  shoreTargets.forEach((t,i)=>{C.applyEntity(t,saved.shore[i]);
   // Shore GLBs may finish later. Reinstall skin, not the old loaded flag.
   if(!t.group.children.length)t.loaded=false;
   if(!t.alive&&t.def.kind==='fuel'&&operationalScenery)t.group.traverse(o=>{if(o.isMesh)o.material=operationalScenery.charred;});
  });
  for(const z of zeros)GameRuntime.release(z.mesh);zeros=[];
  saved.zeros.forEach((s,i)=>{spawnZero(i,saved.zeros.length);C.applyEntity(zeros.at(-1),s);});
  for(const r of raiders)GameRuntime.release(r.mesh);raiders=[];
  saved.raiders.forEach((s,i)=>{(s.state.japanese?spawnJapaneseRaider:spawnRaider)(i,saved.raiders.length);const r=raiders.at(-1);C.applyEntity(r,s);if(r.bombRack)r.bombRack.visible=!r.dropped;});
  for(const w of wingmen)GameRuntime.release(w.mesh);wingmen=[];
  saved.wingmen.forEach((s,i)=>{spawnWingman(i);const w=wingmen.at(-1);C.applyEntity(w,s);w.target=ships[s.targetIndex]||null;});
  patrolRecovery=wingmen[saved.patrolIndex]||null;
  const w=saved.weapons;
  torpedoes=C.restoreProjectiles(w.torpedoes,'torpedo',scene);bombs=C.restoreProjectiles(w.bombs,'bomb',scene);
  bullets=C.restoreProjectiles(w.bullets,'round',scene);tracers=C.restoreProjectiles(w.tracers,'aa',scene);
  etorps=C.restoreProjectiles(w.etorps,'torpedo',scene);enemyBombs=C.restoreProjectiles(w.enemyBombs,'bomb',scene);
  wingShots=w.wingShots.map(s=>{const shot=C.restoreProjectiles([s],s.state.kind==='bomb'?'bomb':'torpedo',scene)[0];shot.tgt=ships[s.targetIndex]||null;return shot;});
  carrier.position.x=carrierX;
  for(const hull of [carrierModel,ijnCarrierModel])if(hull){hull.position.x=CARRIER_DX+carrierX;hull.rotation.x=hull.rotation.z=0;}
  applyTimeOfDay(timeMode);applyWeather();seaUniforms.uSeaState.value=seaState;
  if(operationalScenery)operationalScenery.time=saved.sceneryTime;
  flareSupport?.restoreCheckpoint(saved.flares);clock.elapsedTime=saved.clock;killCam=null;shakeT=0;radioQ=[];radioT=0;
  C.restoreNavigation(ensureNavigation(),saved.navigation);
  hideOverlays();state=ST.FLIGHT;releaseHeldControls();setThrottleUI(P.throttle);applyLoadoutUI();resetControlUI();
  const aero=document.getElementById('aeroBtn');aero.classList.toggle('on',aeroMode);aero.innerHTML='AERO<br>'+(aeroMode?'ON':'OFF');
  updatePlaneMesh(0);updateCamera(0);updateHUD();bombCue.reset();clock.getDelta();
  togglePause('Saved flight restored — tap Resume Flight.');
 }
 window.sortieCheckpoint=C.create({campaign:'pacific',identity,snapshot,load,canSave:airborne}).mount(async()=>{
  initAudio();soundscape.attach(actx,eng?.master);voiceRadio.unlock();
  try{await window.sortieCheckpoint.resume();}catch(error){exitToMenu(true);flash('SAVED FLIGHT COULD NOT LOAD — '+error.message,5000);}
 });
})();
