/* Build 246: a PBY-5A Catalina (assets/aircraft/pby5a-own.glb) rescues survivors who ditched far from the carrier, where the motor launch of
 * pilot-rescue.js would take minutes. A scripted flight, no flight physics: it glides in on a straight line from the carrier side, settles on the
 * water, brakes to a stop 30 m from the first survivor, waits while they climb aboard, taxis to others who drifted nearby, and takes off again.
 * Same coordinator shape as PilotRescue.createCrew (add / update / group / dispose), so the game only chooses which one to ask.
 *   add(position) -> ticket {water,pby,group,marker,elapsed,pickup,update()->{done,pickup},dispose()} or null when she cannot serve that survivor
 * Rig names from the model README: PropellerLeft/Right (spin about local +Z), GearLeft/Right/NoseGear (retracted for water landings),
 * FloatLeft/FloatRight (0 = deployed, folded 1.5708 rad about +Z in flight), SteppedFlyingBoatHull (waterline reference).
 * Tuning values are game decisions (category C), not flight-test data. */
(function(root){
 'use strict';
 const TUNE={startDistance:950,startHeight:75,approachSpeed:48,touchDistance:260,stopDistance:30,boardSeconds:3.2,doneAfter:2.5,
  taxiSpeed:8,stopShort:25,maxRegroup:450,takeoffAccel:3.3,liftSpeed:36,climb:5.5,goneAfter:30,sink:.25,floatRate:1.6,gearUp:1.47,noseGearUp:-1.37,floatFold:1.5708};
 const CANDIDATES=[0,.87,-.87,1.75,-1.75,Math.PI];   // approach lines tried around the carrier bearing (rad)

 function createCrew(THREE,scene,options={}){
  const template=options.template;if(!template)return null;
  const waterAt=options.waterAt||(()=>true),surfaceAt=options.surfaceAt||(()=>0),say=options.say||(()=>{});
  const group=new THREE.Group();group.name='pbyRescue';group.rotation.order='YXZ';group.visible=false;
  const plane=template.clone(true);group.add(plane);scene.add(group);
  const marker=new THREE.Group();marker.name='pbyBeacon';
  const part=n=>plane.getObjectByName(n);
  const gear=[[part('GearLeft'),'z',TUNE.gearUp],[part('GearRight'),'z',-TUNE.gearUp],[part('NoseGear'),'x',TUNE.noseGearUp]].filter(g=>g[0]);
  const floats=[[part('FloatLeft'),-TUNE.floatFold],[part('FloatRight'),TUNE.floatFold]].filter(f=>f[0]);
  const props=[part('PropellerLeft'),part('PropellerRight')].filter(Boolean);
  for(const [node,axis,angle] of gear)node.rotation[axis]=angle;         // wheels up for a water landing
  // the keel: how far the hull's lowest point sits below the model origin, so the hull (not the origin) meets the water
  group.updateMatrixWorld(true);
  const hull=part('SteppedFlyingBoatHull'),keel=hull?new THREE.Box3().setFromObject(hull).min.y:0;
  let floatAngle=1,disposed=false;                                    // 1 = folded (flight), 0 = deployed (water)
  const tickets=[];let active=null,phase='idle',t=0,clock=0;
  const pos=new THREE.Vector3(),dir=new THREE.Vector3(0,0,1);             // dir: horizontal travel direction (unit)
  let height=0,speed=0,pitch=0,spin=0,plan=null,wakeAt=new THREE.Vector3(),lifted=false;

  function lineIsWater(p,u){for(let s=TUNE.stopDistance-5;s<=TUNE.touchDistance+60;s+=20)if(!waterAt(p.x+u.x*s,p.z+u.z*s))return false;return true;}
  function approachLine(p){
   const o=options.origin?options.origin():new THREE.Vector3(0,0,0);
   const base=Math.atan2(o.x-p.x,o.z-p.z),u=new THREE.Vector3();
   for(const a of CANDIDATES){u.set(Math.sin(base+a),0,Math.cos(base+a));if(lineIsWater(p,u))return u.clone();}
   return null;
  }
  function begin(ticket,u){
   plan={p:ticket.position.clone(),u:u.clone()};dir.copy(u).multiplyScalar(-1);
   pos.copy(plan.p).addScaledVector(u,TUNE.startDistance);height=TUNE.startHeight;speed=TUNE.approachSpeed;
   phase='inbound';t=0;active=ticket;lifted=false;pitch=0;group.visible=true;marker.position.copy(plan.p);
   say('CATALINA INBOUND — SURVIVORS IN THE WATER, HOLD ON');
  }
  function axisDistance(){return (pos.x-plan.p.x)*plan.u.x+(pos.z-plan.p.z)*plan.u.z;}   // distance of the plane from the survivor along the approach line
  function nextPending(){
   let best=null,bd=1e9;
   for(const k of tickets){if(k.status.done||k===active||k.status.pickup||k.queued!==true)continue;const d=Math.hypot(k.position.x-pos.x,k.position.z-pos.z);if(d<bd){bd=d;best=k;}}
   return best;
  }
  function apply(dt){
   group.position.set(pos.x,0,pos.z);
   const sea=surfaceAt(pos.x,pos.z),bob=height<.5?Math.sin(clock*1.7)*.06:0;
   group.position.y=sea-keel-TUNE.sink+height+bob;
   group.rotation.y=Math.atan2(dir.x,dir.z);group.rotation.x=-pitch;group.rotation.z=phase==='board'||phase==='taxi'?Math.sin(clock*1.3)*.02:0;
   for(let i=0;i<props.length;i++)props[i].rotation.z+=spin*dt*(i?1.07:1);
   for(const [node,fold] of floats)node.rotation.z=fold*floatAngle;
  }
  function wake(dt,sp){
   if(!options.wakes||height>.6||sp<1)return;
   options.wakes.track(group,group.position,{x:dir.x,z:dir.z},14,3.2,sp,dt);
  }
  function update(dt){
   if(disposed||phase==='idle')return;
   dt=Math.max(0,Math.min(dt,.25));clock+=dt;t+=dt;
   if(phase==='inbound'){
    pos.addScaledVector(dir,TUNE.approachSpeed*dt);speed=TUNE.approachSpeed;
    const a=axisDistance(),k=Math.max(0,Math.min(1,(a-TUNE.touchDistance)/(TUNE.startDistance-TUNE.touchDistance)));
    height=TUNE.startHeight*k;pitch=.03+(1-k)*.04;spin=34;
    if(a<=TUNE.touchDistance+160)floatAngle=Math.max(0,floatAngle-TUNE.floatRate*dt);   // floats down on the final
    if(a<=TUNE.touchDistance){phase='roll';t=0;height=0;pitch=.07;}
   }else if(phase==='roll'){
    const brake=TUNE.approachSpeed*TUNE.approachSpeed/(2*(TUNE.touchDistance-TUNE.stopDistance));
    speed=Math.max(0,speed-brake*dt);pos.addScaledVector(dir,speed*dt);spin=Math.max(10,spin-6*dt);pitch=Math.max(0,pitch-.05*dt);floatAngle=0;
    if(speed<=.2||axisDistance()<=TUNE.stopDistance){speed=0;phase='board';t=0;pitch=0;spin=9;}
   }else if(phase==='taxi'){
    const to=new THREE.Vector3(active.position.x-pos.x,0,active.position.z-pos.z),d=to.length();
    if(d>TUNE.stopShort+.5){to.divideScalar(d);dir.lerp(to,Math.min(1,dt*1.2)).normalize();speed=TUNE.taxiSpeed;pos.addScaledVector(dir,Math.min(d-TUNE.stopShort,speed*dt));spin=14;}
    else{speed=0;phase='board';t=0;spin=9;}
   }else if(phase==='board'){
    speed=0;
    if(t>=TUNE.boardSeconds&&!active.status.pickup){
     active.status={done:false,pickup:true};active.doneAt=clock+TUNE.doneAfter;marker.visible=false;
     const next=nextPending();
     if(next&&Math.hypot(next.position.x-pos.x,next.position.z-pos.z)<=TUNE.maxRegroup){active=next;phase='taxi';t=0;}
     else{phase='takeoff';t=0;speed=0;spin=34;say('CATALINA HAS THEM — LIFTING OFF');
      for(const k of tickets)if(!k.status.pickup&&!k.status.done)k.status={done:true,pickup:false};}   // nobody is left hanging
    }
   }else if(phase==='takeoff'){
    speed+=TUNE.takeoffAccel*dt;pos.addScaledVector(dir,speed*dt);spin=34;floatAngle=Math.min(1,floatAngle+(lifted?TUNE.floatRate*dt:0));
    if(!lifted&&speed>=TUNE.liftSpeed){lifted=true;}
    if(lifted){height+=TUNE.climb*dt;pitch=Math.min(.16,pitch+.12*dt);}
    if(t>=TUNE.goneAfter){phase='gone';group.visible=false;}
   }
   // pickup bookkeeping for tickets that were served earlier on this run
   for(const k of tickets){
    if(k.status.pickup&&!k.status.done&&clock>=k.doneAt)k.status={done:true,pickup:true};
    k.time=clock;
   }
   if(phase!=='gone'){apply(dt);wake(dt,speed);}
  }
  return {
   add(position){
    if(disposed||phase==='takeoff'||phase==='gone')return null;
    const p=position.clone();
    const ticket={position:p,status:{done:false,pickup:false},time:0,doneAt:0,queued:false,
     water:true,pby:true,get group(){return group;},get marker(){return marker;},get elapsed(){return ticket.time;},get pickup(){return ticket.status.pickup;},update(){return ticket.status;},dispose(){}};
    if(phase==='idle'){
     const u=approachLine(p);if(!u)return null;
     tickets.push(ticket);begin(ticket,u);return ticket;
    }
    // a second survivor: only while she is still on the water, and near enough to taxi to
    const ref=active?active.position:plan.p;
    if(Math.hypot(p.x-ref.x,p.z-ref.z)>TUNE.maxRegroup-70)return null;   // she stops up to 30 m short of the first survivor: always within her regroup range
    ticket.queued=true;tickets.push(ticket);return ticket;
   },
   update,
   get group(){return group;},
   get phase(){return phase;},
   get plan(){return plan;},
   dispose(){
    if(disposed)return;disposed=true;options.wakes?.forget(group);scene.remove(group);tickets.length=0;active=null;
   }
  };
 }
 root.PbyRescue={createCrew,TUNE};
 if(typeof module==='object'&&module.exports)module.exports=root.PbyRescue;
})(typeof window!=='undefined'?window:globalThis);
