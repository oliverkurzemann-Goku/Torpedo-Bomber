/* Torpedo attack rules for the Pacific carrier game (Build 200).
 * Gameplay values, not certified Mark 13 ballistics:
 *  - a player torpedo runs up to MAX_RUN metres in the water instead of a 16 s life
 *    that ended after ~375 m while the HUD recommended drops out to 950 m;
 *  - it only fires after ARM_RUN metres of water run, so "TOO CLOSE" has a consequence;
 *  - it must touch the real hull rectangle (length x beam), not a 0.55*length circle;
 *  - a fine track angle can skid the fish off the hull; a beam shot never does;
 *  - captains who see the wake turn to comb the track (bow or stern onto the fish)
 *    instead of zig-zagging at random.
 * Ships move along their local +Z; world forward = (sin yaw, cos yaw). */
(function(root){
 'use strict';
 const RUN_SPEED=23,MAX_RUN=1400,ARM_RUN=200,AIR_LIFE=8;
 const DIFF={
  rookie:{detect:.6,react:5,turn:.6,glance:.4,margin:10},
  veteran:{detect:.85,react:1.5,turn:.85,glance:.85,margin:4},
  ace:{detect:1,react:0,turn:1,glance:1,margin:2.5}
 };
 const TYPE={destroyer:{turn:.06,react:3},cruiser:{turn:.035,react:5},freighter:{turn:.028,react:6},other:{turn:.03,react:5}};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 // The tracked fish is kept under a symbol so checkpoints (Object.keys) never copy it.
 const FISH=Symbol('combFish');
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 function difficulty(name){return DIFF[name]||DIFF.veteran;}
 function profile(ship){return TYPE[ship.def?.type]||TYPE.other;}
 // Bow direction from the group quaternion (third rotation-matrix column), projected on the sea.
 function forward(ship){
  const q=ship.group.quaternion,x=2*(q.x*q.z+q.w*q.y),z=1-2*(q.x*q.x+q.y*q.y),l=Math.hypot(x,z)||1;
  return {x:x/l,z:z/l};
 }
 function yaw(ship){const f=forward(ship);return Math.atan2(f.x,f.z);}
 // Hull rectangle in ship-local metres, measured once from the delivered model's
 // bounding boxes (quantized GLBs carry correct accessor bounds).
 function hull(ship){
  if(ship.hull)return ship.hull;
  const naval=ship.group.children[0]?.userData?.naval,T=root.THREE;let box=null;
  if(T&&ship.group.children.length){
   ship.group.updateWorldMatrix(true,true);
   const inv=ship.group.matrixWorld.clone().invert(),m=new T.Matrix4(),b=new T.Box3();box=new T.Box3();
   ship.group.traverse(o=>{if(!o.isMesh||!o.geometry||o.name==='shipHullBreach')return;
    if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
    box.union(b.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv,o.matrixWorld)));});
   if(box.isEmpty())box=null;
  }
  const length=naval?.length||(box?box.max.z-box.min.z:ship.radius/.55),beam=naval?.beam||(box?box.max.x-box.min.x:length*.14);
  const cz=box?(box.max.z+box.min.z)/2:0,cx=box?(box.max.x+box.min.x)/2:0;
  const result={length,beam,minZ:cz-length/2,maxZ:cz+length/2,cx};
  if(box||naval)ship.hull=result;   // invisible stand-ins are re-measured once the GLB arrives
  return result;
 }
 function local(ship,x,z){const f=forward(ship),dx=x-ship.group.position.x,dz=z-ship.group.position.z;return {x:dx*f.z-dz*f.x,z:dx*f.x+dz*f.z};}
 // Swept segment test against the hull rectangle; returns the first contact.
 function strike(ship,from,to,margin=4){
  const h=hull(ship),half=h.beam/2+margin,a=local(ship,from.x,from.z),b=local(ship,to.x,to.z);
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/1.5));
  for(let i=0;i<=steps;i++){const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
   if(Math.abs(x-h.cx)<=half&&z>=h.minZ-margin&&z<=h.maxZ+margin){
    const k=i/steps;return {t:k,x:from.x+(to.x-from.x)*k,z:from.z+(to.z-from.z)*k,local:{x,z},fraction:clamp((z-h.minZ)/(h.length||1),0,1)};}
  }
  return null;
 }
 // 90 = square on the beam, 0 = straight up the stern or into the bow.
 function trackAngle(ship,dir){const f=forward(ship),l=Math.hypot(dir.x,dir.z)||1;return Math.acos(clamp(Math.abs((dir.x*f.x+dir.z*f.z)/l),0,1))*180/Math.PI;}
 function glanceChance(angle,diff='veteran'){
  const base=angle>=40?0:angle>=15?(40-angle)/25*.6:.6+(15-angle)/15*.25;
  return clamp(base*difficulty(diff).glance,0,.9);
 }
 function section(fraction){return fraction<.28?'stern':fraction<.68?'midships':'bow';}
 // Lookouts see a wake further by day and in clear air.
 function detectRange({timeMode='day',weather='clear',diff='veteran'}={}){
  const light=timeMode==='night'?380:timeMode==='dusk'||timeMode==='dawn'?650:900;
  const air=weather==='storm'?.6:weather==='rain'?.72:weather==='haze'?.86:1;
  return light*air*difficulty(diff).detect;
 }
 // Returns a comb heading while a seen torpedo threatens the hull, otherwise null.
 function captain(ship,dt,fish,{detect=900,diff='veteran',speed=ship.speed||0,announce=null}={}){
  if(ship.def?.moored||!ship.alive){ship.comb=null;return null;}
  const p=ship.group.position,f=forward(ship),h=hull(ship),reach=h.length*.5+70;let threat=null,soonest=Infinity;
  for(const t of fish){
   if(t.phase!=='run'||t.spent)continue;
   const dx=t.mesh.position.x-p.x,dz=t.mesh.position.z-p.z;if(Math.hypot(dx,dz)>detect)continue;
   const vx=t.dir.x*(t.speed||RUN_SPEED)-f.x*speed,vz=t.dir.z*(t.speed||RUN_SPEED)-f.z*speed,v2=vx*vx+vz*vz;if(v2<1)continue;
   const tc=-(dx*vx+dz*vz)/v2;if(tc<0||tc>120)continue;
   if(Math.hypot(dx+vx*tc,dz+vz*tc)>reach)continue;
   if(tc<soonest){soonest=tc;threat=t;}
  }
  const c=ship.comb;
  if(threat){
   if(!c||c[FISH]!==threat){
    const alert=!!c;   // already at action stations: the second fish is answered faster
    ship.comb={delay:(profile(ship).react+difficulty(diff).react)*(alert?.5:1),hold:6,heading:null,announced:c?.announced};ship.comb[FISH]=threat;
   }
   const s=ship.comb;s.hold=6;s.delay-=dt;
   if(s.delay<=0&&s.heading==null){
    const along=Math.atan2(threat.dir.x,threat.dir.z),cur=yaw(ship);
    // Comb: put the stern (run with it) or the bow (turn into it) onto the track, whichever is nearer.
    s.heading=Math.abs(wrap(along-cur))<=Math.abs(wrap(along+Math.PI-cur))?along:wrap(along+Math.PI);
    if(!s.announced){s.announced=true;announce?.(ship);}
   }
  }else if(c){c.hold-=dt;if(c.hold<=0)ship.comb=null;}
  return ship.comb?.heading??null;
 }
 function steer(ship,heading,dt,steering=1,diff='veteran'){
  const rate=profile(ship).turn*difficulty(diff).turn*steering,diffYaw=wrap(heading-yaw(ship)),turn=clamp(diffYaw,-rate*dt,rate*dt);
  ship.group.rotateY(turn);return turn;
 }
 // Player torpedo life cycle: air phase, then a distance-limited run with an arming distance.
 function advance(t,dt){
  if(t.phase!=='run')return;
  t.run=(t.run||0)+(t.speed||RUN_SPEED)*dt;
  t.armed=t.run>=ARM_RUN;t.spent=t.run>=MAX_RUN;
 }
 function resolve(t,ship,hit,{diff='veteran',random=Math.random}={}){
  const angle=trackAngle(ship,t.dir),part=section(hit.fraction);
  if(!t.armed)return {result:'unarmed',angle,part,run:t.run||0};
  if(random()<glanceChance(angle,diff))return {result:'glanced',angle,part,run:t.run};
  if(t.dud)return {result:'dud',angle,part,run:t.run};
  return {result:'hit',angle,part,run:t.run,beam:angle>=60};
 }
 root.TorpedoAttack={RUN_SPEED,MAX_RUN,ARM_RUN,AIR_LIFE,DIFF,TYPE,forward,yaw,hull,local,strike,trackAngle,glanceChance,section,detectRange,captain,steer,advance,resolve,wrap};
 if(typeof module==='object'&&module.exports)module.exports=root.TorpedoAttack;
})(typeof window==='undefined'?globalThis:window);
