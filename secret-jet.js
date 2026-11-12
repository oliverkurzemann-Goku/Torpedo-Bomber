/* Player station controls for the original Secret Jet GLB, +Z nose, +Y up. */
(function(root){
 'use strict';
 const URL='assets/aircraft/geheimer-jet.glb?v=1';
 const AMMO=2100,FUEL_SECONDS=1200;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const ease=(a,b,r,dt)=>a+(b-a)*(1-Math.exp(-r*dt));
 const modes=['chase','cockpit','top','bottom'];
 const label={chase:'PILOT · EXTERIOR',cockpit:'PILOT · COCKPIT',top:'UPPER TURRET',bottom:'LOWER TURRET'};
 const angle={top:[.24,1.25,.31],bottom:[-1.25,-.17,-.25]};
 function stepFlight(p,dt,controls){
  const hold=controls.gunner,hasFuel=p.fuel>0;
  const boost=hasFuel&&p.jetBoost;
  if(hasFuel)p.fuel=Math.max(0,p.fuel-100*dt/FUEL_SECONDS*(boost?1.65:1));
  const thrust=hasFuel?clamp(p.throttle,0,1):0;
  const ceiling=boost?1600/3.6:900/3.6;
  const target=hasFuel?53+(ceiling-53)*thrust:39;
  p.spd=ease(p.spd,target,boost?.21:hasFuel?.16:.086,dt);
  p.roll=ease(p.roll,hold?0:controls.roll*.93,hold?3.5:2.95,dt);
  const stall=clamp((65-p.spd)/32,0,1);
  p.pitch=ease(p.pitch,(hold?0:controls.pitch*.59)-stall*.16,2.9,dt);
  if(!hold)p.heading-=clamp(Math.tan(p.roll)*52/Math.max(82,p.spd),-.70,.70)*dt;
  p.vSpeed=p.spd*Math.sin(p.pitch)-stall*12;
  p.nLoad=1/Math.max(.45,Math.cos(p.roll));
  const horiz=p.spd*Math.cos(p.pitch);
  p.pos.x+=(Math.cos(p.heading)*horiz+controls.wind)*dt;
  p.pos.z+=Math.sin(p.heading)*horiz*dt;
  p.pos.y+=p.vSpeed*dt;
 }
 function create(THREE,template){
  const model=template.clone(true);
  model.name='secretJetPlayer';
  model.rotation.y=Math.PI;
  const node=name=>{
   const n=model.getObjectByName(name);
   if(!n)throw Error('Secret Jet rig lacks '+name);
   return n;
  };
  const stations={};
  for(const mode of ['top','bottom']){
   const prefix=mode==='top'?'JetTop':'JetBottom';
   stations[mode]={yaw:node(prefix+'Yaw'),pitch:node(prefix+'Pitch'),eye:node(prefix+'Eye'),
    ports:[node(prefix+'MuzzleLeft'),node(prefix+'MuzzleRight')],heading:0,elevation:angle[mode][2]};
  }
  const pilot=node('JetPilotEye');
  const nose=[node('JetNoseLeft'),node('JetNoseRight')];
  const exhaust=node('JetExhaust');
  const flame=new THREE.Mesh(new THREE.ConeGeometry(.212,1.85,24,1,true),new THREE.MeshBasicMaterial({
   color:0xf88c39,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  }));
  flame.position.z=-.88;flame.rotation.x=-Math.PI/2;flame.visible=false;exhaust.add(flame);
  const previousVisibility=new Map();
  const pos=new THREE.Vector3(),aim=new THREE.Vector3(),up=new THREE.Vector3(),q=new THREE.Quaternion(),matrix=new THREE.Matrix4();
  const localEnd=new THREE.Vector3(),localNow=new THREE.Vector3();
  let mode='chase',transition=1,origin=null;
  function orient(station){
   station.yaw.rotation.y=station.heading;
   station.pitch.rotation.x=-station.elevation;
  }
  for(const s of Object.values(stations))orient(s);
  return {model,
   get mode(){return mode;},
   get label(){return label[mode];},
   get isGunner(){return !!stations[mode];},
   get canFire(){return mode==='chase'||transition>.87;},
   select(wanted){
    if(!modes.includes(wanted)||wanted===mode)return false;
    mode=wanted;transition=0;origin=null;
    return true;
   },
   cycle(){return this.select(modes[(modes.indexOf(mode)+1)%modes.length]);},
   attach(frame){
    if(model.parent!==frame)frame.add(model);
    for(const n of frame.children)if(n!==model){
     if(!previousVisibility.has(n))previousVisibility.set(n,n.visible);
     n.visible=false;
    }
   },
   detach(){
    for(const [n,v] of previousVisibility)n.visible=v;
    previousVisibility.clear();
    model.parent?.remove(model);
    flame.geometry.dispose();flame.material.dispose();
   },
   animate(dt,roll,pitch,boost){
    const s=stations[mode];
    if(s){
     s.heading=Math.atan2(Math.sin(s.heading+roll*1.8*dt),Math.cos(s.heading+roll*1.8*dt));
     s.elevation=clamp(s.elevation+pitch*1.12*dt,angle[mode][0],angle[mode][1]);
     orient(s);
    }
    flame.visible=boost;
    if(boost)flame.scale.y=1+.11*Math.sin(performance.now()*.039);
   },
   shots(){
    const s=stations[mode];
    const ports=s?s.ports:nose;
    (s?s.pitch:model).getWorldQuaternion(q);
    return {points:ports.map(n=>n.getWorldPosition(new THREE.Vector3())),
     direction:new THREE.Vector3(0,0,1).applyQuaternion(q).normalize()};
   },
   camera(camera,dt){
    if(mode==='chase')return false;
    const eye=stations[mode]?.eye||pilot;
    eye.getWorldPosition(pos);eye.getWorldQuaternion(q);
    aim.set(0,0,1).applyQuaternion(q);
    model.getWorldQuaternion(q);up.set(0,1,0).applyQuaternion(q);
    if(!origin){
     origin=model.worldToLocal(camera.position.clone());
     if(origin.length()>50)transition=1;
    }
    transition=Math.min(1,transition+dt*4.0);
    const s=transition*transition*(3-2*transition);
    localEnd.copy(pos);model.worldToLocal(localEnd);
    localNow.copy(origin).lerp(localEnd,s);model.localToWorld(localNow);
    camera.position.copy(localNow);
    matrix.lookAt(localNow,pos.clone().addScaledVector(aim,60),up);
    q.setFromRotationMatrix(matrix);
    camera.quaternion.slerp(q,transition===1?1:1-Math.exp(-dt*21));
    if(camera.near!==.035||camera.fov!==66){camera.near=.035;camera.fov=66;camera.updateProjectionMatrix();}
    return true;
   },
  };
 }
 const api={URL,AMMO,FUEL_SECONDS,stepFlight,create};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SecretJet=api;
})(typeof globalThis==='undefined'?window:globalThis);
