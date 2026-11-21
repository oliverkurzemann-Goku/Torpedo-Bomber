/* Build 295: visible take-off rockets (RATO) for the Me 262 and the Ar 234.
 *
 * Me 262 A-1a (/R2 kit): two Rheinmetall-Borsig RI 502 solid rockets under the rear fuselage, either side of the keel. NASM lists the
 *   RI 502 at 127 cm long and 16.5 cm across, about 6 s burn, 600 kp nominal (flight-core.js SOURCES.me262.rato). A solid rocket: an
 *   orange flame and grey-white smoke. Whether the Me 262 dropped its spent tubes is not confirmed by the sources found, so they stay on.
 * Ar 234 B-2: two Walter HWK 109-500 pods under the wings, outboard of the engines, 500 kp for 30 s (SOURCES.ar234.rato). A cold
 *   hydrogen-peroxide motor: a short pale flame and a dense white steam cloud. After take-off the pods were dropped and came down on
 *   parachutes to be used again (Wikipedia, HWK 109-500). The pod's size is not published in the sources found: 1.9 m x 0.5 m is an
 *   estimate from photographs (C).
 * Positions are in the game's aircraft frame (metres, +Z nose), measured on the shipped models: Me 262 belly y -0.65 at z -1.5,
 * Ar 234 wing underside y -0.28 at x 4.0 (between the nacelle, x 2.43-3.23, and the aileron, x 4.76).
 * Geometries and materials are shared and never disposed; a jettisoned pod moves its own group into the world. No THREE at load time. */
(function(root){
 'use strict';
 const SPEC={
  me262:{len:1.27,dia:.165,body:0x6e7262,nozzle:0x2b2a26,pack:null,pylon:false,motor:'solid',jettison:false,
   pods:[{x:-.30,y:-.75,z:-1.55},{x:.30,y:-.75,z:-1.55}],flame:{len:1.5,rad:.11,core:0xfff0c0,outer:0xff8a2a},smoke:{color:0xc9c6bd,size:1.4,life:2.4}},
  ar234:{len:1.9,dia:.5,body:0x8f989b,nozzle:0x2f302d,pack:0xc4bea6,pylon:true,motor:'steam',jettison:true,
   pods:[{x:-4.0,y:-.59,z:.75},{x:4.0,y:-.59,z:.75}],flame:{len:.7,rad:.15,core:0xfff6dc,outer:0xffc070},smoke:{color:0xf2f1ec,size:2.6,life:3.2}}
 };
 let shared=null;
 function assets(T){
  if(shared)return shared;
  const body=new T.CylinderGeometry(.5,.5,1,16,1);body.rotateX(Math.PI/2);            // unit tube along Z
  const nose=new T.SphereGeometry(.5,16,8,0,Math.PI*2,0,Math.PI/2);nose.rotateX(Math.PI/2); // hemisphere bulging +Z
  const bell=new T.CylinderGeometry(.36,.46,1,16,1,true);bell.rotateX(Math.PI/2);       // nozzle skirt
  const flame=new T.ConeGeometry(1,1,10,1,true);flame.translate(0,.5,0);flame.rotateX(-Math.PI/2); // base at 0, tip toward -Z
  const pylon=new T.BoxGeometry(1,1,1),throat=new T.CircleGeometry(.4,16);throat.rotateY(Math.PI);   // the dark inside of the nozzle, facing aft
  const canopy=new T.SphereGeometry(1,14,6,0,Math.PI*2,0,Math.PI*.42);
  const lines=new T.BufferGeometry();const lp=[];
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2;lp.push(Math.cos(a)*.97,.24,Math.sin(a)*.97,0,-1.6,0);}
  lines.setAttribute('position',new T.Float32BufferAttribute(lp,3));
  const add=c=>new T.MeshBasicMaterial({color:c,transparent:true,opacity:.9,depthWrite:false,blending:T.AdditiveBlending,fog:false,toneMapped:false,side:T.DoubleSide});
  shared={body,nose,bell,flame,pylon,throat,canopy,lines,mats:new Map(),add,
   chute:new T.MeshLambertMaterial({color:0xe9e4d6,side:T.DoubleSide}),cord:new T.LineBasicMaterial({color:0x6f6a5e})};
  return shared;
 }
 function mat(T,kind,key,factory){const a=assets(T),k=kind+':'+key;if(!a.mats.has(k))a.mats.set(k,factory());return a.mats.get(k);}
 function has(kind){return !!SPEC[kind];}
 // One pod: a group at the pod's centre, built along +Z (nose forward), flame at the tail.
 function buildPod(T,kind,spec,p){
  const a=assets(T),g=new T.Group();g.name='ratoPod';g.position.set(p.x,p.y,p.z);
  const paint=mat(T,kind,'body',()=>new T.MeshStandardMaterial({color:spec.body,roughness:.62,metalness:.25}));
  const dark=mat(T,kind,'nozzle',()=>new T.MeshStandardMaterial({color:spec.nozzle,roughness:.5,metalness:.6,side:T.DoubleSide}));
  const L=spec.len,D=spec.dia;
  const tube=new T.Mesh(a.body,paint);tube.scale.set(D,D,L*.86);tube.position.z=.04*L;g.add(tube);
  const nose=new T.Mesh(a.nose,spec.pack?mat(T,kind,'pack',()=>new T.MeshStandardMaterial({color:spec.pack,roughness:.8})):paint);
  nose.scale.set(D,D,D*1.3);nose.position.z=.47*L;g.add(nose);
  const bell=new T.Mesh(a.bell,dark);bell.scale.set(D,D,.12*L);bell.position.z=-.43*L;g.add(bell);
  const throat=new T.Mesh(a.throat,mat(T,kind,'throat',()=>new T.MeshBasicMaterial({color:0x121110})));throat.scale.set(D,D,1);throat.position.z=-.40*L;g.add(throat);
  if(spec.pylon){const py=new T.Mesh(a.pylon,paint);py.scale.set(.08,.10,L*.55);py.position.set(0,D*.5+.04,.05*L);g.add(py);}
  else{for(const s of [-.25,.2]){const strap=new T.Mesh(a.body,dark);strap.scale.set(D*1.08,D*1.08,.05);strap.position.z=s*L;g.add(strap);}}
  const flame=new T.Group();flame.name='ratoFlame';flame.position.z=-.49*L;flame.visible=false;
  const outer=new T.Mesh(a.flame,mat(T,kind,'outer',()=>a.add(spec.flame.outer)));
  const core=new T.Mesh(a.flame,mat(T,kind,'core',()=>a.add(spec.flame.core)));
  outer.scale.set(spec.flame.rad,spec.flame.rad,.01);core.scale.set(spec.flame.rad*.5,spec.flame.rad*.5,.01);
  flame.add(outer,core);flame.userData={outer,core};g.add(flame);
  g.userData.tail=new T.Vector3(0,0,-.5*L-.1);
  return g;
 }
 function attach(T,aircraft,kind){
  const spec=SPEC[kind];if(!spec||!aircraft)return null;
  let g=aircraft.getObjectByName('ratoPods');if(g)return g;
  g=new T.Group();g.name='ratoPods';g.userData.kind=kind;
  for(const p of spec.pods)g.add(buildPod(T,kind,spec,p));
  aircraft.add(g);return g;
 }
 function detach(aircraft){const g=aircraft?.getObjectByName('ratoPods');if(g)g.parent.remove(g);}
 // phase: 'burning' shows the flames and emits smoke from each tail (emit(worldPosition,size,life,color));
 // t = seconds since ignition, burn = burn time, dt = frame step, travel = metres flown this frame.
 function update(T,aircraft,kind,o){
  const g=aircraft?.getObjectByName('ratoPods'),spec=SPEC[kind];if(!g||!spec)return 0;
  const burning=o.phase==='burning',tail=o.burn-o.t,fade=burning?Math.min(1,o.t/.25,Math.max(.15,tail/1.2)):0;
  // puffs per second per pod: 12-14 standing, up to 10 more with speed - two pods stay under ~100 live puffs in CombatFX's shared trail pool (240)
  let puffs=0;g.userData.smokeAcc=(g.userData.smokeAcc||0)+(burning?o.dt*(spec.motor==='steam'?14:12)+Math.min(10*o.dt,(o.travel||0)/12):0);
  const emitNow=Math.floor(g.userData.smokeAcc);g.userData.smokeAcc-=emitNow;
  g.userData.clock=(g.userData.clock||0)+o.dt;
  g.children.forEach((pod,i)=>{
   const f=pod.getObjectByName('ratoFlame');f.visible=fade>.01;
   if(!f.visible)return;
   const flick=.82+.18*Math.sin(g.userData.clock*(37+i*5))*Math.sin(g.userData.clock*(23+i*3)+i);
   const len=spec.flame.len*fade*flick,rad=spec.flame.rad*(.85+.15*fade);
   f.userData.outer.scale.set(rad,rad,len);f.userData.core.scale.set(rad*.5,rad*.5,len*.55);
   if(emitNow&&o.emit){
    const w=pod.localToWorld(pod.userData.tail.clone());
    for(let k=0;k<emitNow;k++){o.emit(w,spec.smoke.size*(.8+.4*Math.random())*(.5+.5*fade),spec.smoke.life,spec.smoke.color);puffs++;}
   }
  });
  return puffs;
 }
 // Drop the pods (Ar 234): each pod leaves the aircraft with its velocity and opens a small parachute.
 function jettison(T,aircraft,scene,velocity){
  const g=aircraft?.getObjectByName('ratoPods');if(!g)return [];
  aircraft.updateMatrixWorld(true);const out=[];
  for(const pod of [...g.children]){
   const holder=new T.Group();holder.name='ratoDropped';
   const p=pod.getWorldPosition(new T.Vector3()),q=pod.getWorldQuaternion(new T.Quaternion());
   holder.position.copy(p);scene.add(holder);
   pod.position.set(0,0,0);pod.quaternion.copy(q);pod.getObjectByName('ratoFlame').visible=false;holder.add(pod);
   const a=assets(T),chute=new T.Group();chute.name='ratoChute';chute.visible=false;
   const canopy=new T.Mesh(a.canopy,a.chute);canopy.scale.setScalar(1.3);canopy.position.y=1.6*1.3;
   const cords=new T.LineSegments(a.lines,a.cord);cords.scale.setScalar(1.3);cords.position.y=1.6*1.3;
   chute.add(canopy,cords);holder.add(chute);
   out.push({holder,pod,chute,vel:velocity.clone().add(new T.Vector3((Math.random()-.5)*1.5,-1.5,(Math.random()-.5)*1.5)),t:0,landed:-1,spin:(Math.random()-.5)*.6});
  }
  g.parent.remove(g);return out;
 }
 // Falling pods: drag and gravity, the chute opens after 1.2 s and holds the descent near 7 m/s.
 // groundY(x,z) gives the surface. Returns the list without the ones that are gone.
 function updateFalling(T,list,dt,groundY){
  const keep=[];
  for(const d of list){
   d.t+=dt;const h=d.holder;
   if(d.landed<0){
    const open=Math.min(1,Math.max(0,(d.t-1.2)/.6));
    d.chute.visible=open>0;d.chute.scale.set(open,.35+.65*open,open);
    const k=.04+open*.9;                      // drag per second
    d.vel.y-=9.81*dt;d.vel.multiplyScalar(Math.exp(-k*dt));
    if(open>0)d.vel.y=Math.max(d.vel.y,-7);
    h.position.addScaledVector(d.vel,dt);
    // the pod hangs nose down under the chute
    d.pod.quaternion.slerp(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2),Math.min(1,dt*1.6*open));
    h.rotation.y+=d.spin*dt;
    const g=groundY(h.position.x,h.position.z);
    if(h.position.y<=g+.2){h.position.y=g+.2;d.landed=d.t;d.chute.scale.set(1,.15,1);d.chute.position.y=-1.2;}
   }
   if(d.landed>=0&&d.t-d.landed>8||d.t>45){if(h.parent)h.parent.remove(h);continue;}
   keep.push(d);
  }
  return keep;
 }
 function clear(list){for(const d of list||[])if(d.holder.parent)d.holder.parent.remove(d.holder);return [];}
 root.RatoPods={SPEC,has,attach,detach,update,jettison,updateFalling,clear};
 if(typeof module==='object'&&module.exports)module.exports=root.RatoPods;
})(typeof window==='undefined'?globalThis:window);
