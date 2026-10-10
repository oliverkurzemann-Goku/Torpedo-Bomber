/* Persistent damage on each aircraft's own skin, plus recoverable wreck motion.
 * Original GLB geometry/materials are shared and never modified or disposed. */
(function(root){
 'use strict';
 function create(THREE,scene,groundAt,options={}){
  const rigs=new Map(),wrecks=[],ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0),v=new THREE.Vector3();
  const n=64,data=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const dx=(x+.5)/n*2-1,dy=(y+.5)/n*2-1,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),edge=.78+.08*Math.sin(a*7)+.06*Math.cos(a*11);
   const i=(y*n+x)*4,c=r<.27?9:r<.40?133:37;
   data[i]=c;data[i+1]=c*.94;data[i+2]=c*.81;data[i+3]=Math.round(255*Math.min(1,Math.max(0,(edge-r)*7)));
  }
  const map=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);map.needsUpdate=true;
  const holeGeometry=new THREE.PlaneGeometry(1,1),holeMaterial=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide});
  const fireData=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=(x+.5)/n*2-1,t=(y+.5)/n,w=.78*(1-t)+.10*Math.sin(t*23),r=Math.abs(u+.10*Math.sin(t*18));const i=(y*n+x)*4;fireData[i]=fireData[i+1]=fireData[i+2]=255;fireData[i+3]=Math.round(200*Math.max(0,1-r/Math.max(.05,w))*Math.sin(t*Math.PI));}
  const fireMap=new THREE.DataTexture(fireData,n,n,THREE.RGBAFormat);fireMap.needsUpdate=true;
  function decoded(geometry){
   const g=geometry.clone(),p=g.attributes.position;
   if(p.normalized){const array=new Float32Array(p.count*3),div=p.array instanceof Int16Array?32767:p.array instanceof Uint16Array?65535:p.array instanceof Int8Array?127:255;
    for(let i=0;i<p.count;i++){array[i*3]=Math.max(-1,p.getX(i)/div);array[i*3+1]=Math.max(-1,p.getY(i)/div);array[i*3+2]=Math.max(-1,p.getZ(i)/div);}g.setAttribute('position',new THREE.BufferAttribute(array,3));
   }
   g.computeBoundingBox();return g;
  }
  function attach(model,forward=1,kind=''){
   if(rigs.has(model))return rigs.get(model);
   if(rigs.size>=24)return null;
   model.updateWorldMatrix(true,true);
   const inverse=model.matrixWorld.clone().invert(),parts=[],box=new THREE.Box3(),overlay=new THREE.Group();overlay.name='aircraftBattleDamage';
   model.traverse(o=>{
    if(!o.isMesh||!o.geometry||o.userData.roundKind||[].concat(o.material||[]).every(m=>m.transparent&&m.opacity<.8))return;
    for(let p=o;p&&p!==model;p=p.parent)if(!p.visible||/prop|rotor|gear|wheel|jetHeat|BattleDamage/i.test(p.name))return;
    const transform=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),g=decoded(o.geometry);
    const proxy=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));proxy.matrixWorld.copy(transform);
    const bounds=g.boundingBox.clone().applyMatrix4(transform);box.union(bounds);
    parts.push({mesh:o,proxy,transform,original:o.geometry,deformed:null,base:null,bounds});
   });
   if(box.isEmpty()){for(const p of parts){p.proxy.geometry.dispose();p.proxy.material.dispose();}return null;}
   model.add(overlay);
   const worldScale=model.getWorldScale(new THREE.Vector3()),scale=Math.max(.01,Math.max(worldScale.x,worldScale.y,worldScale.z));
   const engines=[];model.traverse(o=>{if(o.userData.bomberRotor)engines.push(model.worldToLocal(o.getWorldPosition(new THREE.Vector3())));});
   const rig={model,overlay,parts,box,forward,kind,engines,scale,holes:0,lastHull:1,side:1,bend:0,fire:null,time:0};rigs.set(model,rig);return rig;
  }
  function probe(rig,point=null){
   const b=rig.box,k=rig.holes;
   // Offset successive rounds across fuselage and inner wing. A provided hit
   // point is preferred; the player damage API also permits location-less flak.
   const target=point?rig.model.worldToLocal(point.clone()):new THREE.Vector3((k%3-1)*b.max.x*.43,0,b.min.z+(b.max.z-b.min.z)*(.25+((k*7)%11)/22));
   target.x=Math.max(b.min.x+.05,Math.min(b.max.x-.05,target.x));target.z=Math.max(b.min.z+.05,Math.min(b.max.z-.05,target.z));
   ray.set(new THREE.Vector3(target.x,b.max.y+5,target.z),new THREE.Vector3(0,-1,0));
   let hits=ray.intersectObjects(rig.parts.map(p=>p.proxy),false);
   if(!hits.length){target.x=0;ray.set(new THREE.Vector3(0,b.max.y+5,target.z),new THREE.Vector3(0,-1,0));hits=ray.intersectObjects(rig.parts.map(p=>p.proxy),false);}
   if(!hits.length)return null;
   const hit=hits[0],normal=hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
   if(normal.y<0)normal.negate();return {point:hit.point.clone().addScaledVector(normal,.014),normal};
  }
  function bend(rig,severity){
   if(severity<.12||severity-rig.bend<.12)return;rig.bend=severity;
   const span=Math.max(Math.abs(rig.box.min.x),Math.abs(rig.box.max.x)),side=rig.side;
   for(const p of rig.parts){
    if(p.bounds.max.x-p.bounds.min.x<span*.4)continue;
    if(!p.deformed){p.deformed=decoded(p.original);p.base=p.deformed.attributes.position.array.slice();p.mesh.geometry=p.deformed;}
    const pos=p.deformed.attributes.position,inv=p.transform.clone().invert();let changed=false;
    for(let i=0;i<pos.count;i++){
     v.set(p.base[i*3],p.base[i*3+1],p.base[i*3+2]).applyMatrix4(p.transform);
     const wing=Math.max(0,(v.x*side/span-.50)/.50);
     if(wing>0){v.y-=wing*wing*severity*span*.13;v.z+=wing*severity*.35;changed=true;}
     v.applyMatrix4(inv);pos.setXYZ(i,v.x,v.y,v.z);
    }
    if(changed){pos.needsUpdate=true;p.deformed.computeVertexNormals();p.deformed.computeBoundingSphere();p.proxy.geometry.setAttribute('position',pos.clone());p.proxy.geometry.computeBoundingBox();p.proxy.geometry.computeBoundingSphere();}
   }
  }
  function damage(model,health,engine=1,point=null,forward=1,kind=''){
   const rig=attach(model,forward,kind);if(!rig)return;forward=rig.forward;
   health=Math.max(0,Math.min(1,health));
   if(health<rig.lastHull-.015){
    const count=Math.min(3,Math.max(1,Math.round((rig.lastHull-health)*18)));
    for(let i=0;i<count&&rig.holes<28;i++){
     const hit=probe(rig,point);if(!hit)break;
     const m=new THREE.Mesh(holeGeometry,holeMaterial);m.name='skinBulletHole';m.position.copy(hit.point);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),hit.normal);
     m.scale.setScalar((.20+(rig.holes%4)*.035)/rig.scale);m.userData.skinNormal=hit.normal.toArray();rig.overlay.add(m);rig.holes++;
    }
    rig.lastHull=health;
   }
   bend(rig,Math.max(0,(.45-health)/.45));
   const burning=health<.27||engine<.74;
   if(burning&&!rig.fire){
    const fire=new THREE.Group();fire.name='localEngineFire';
    const b=rig.box,z=forward>0?b.max.z*.86:b.min.z*.86;
    fire.position.set(0,b.max.y*.2,z);
    if(rig.engines.length){fire.position.copy(rig.engines[rig.engines.length-1]);fire.position.z-=forward*.45/rig.scale;}
    else if(rig.kind==='b17'||rig.kind==='b24')fire.position.set(b.max.x*.40,b.max.y*.12,b.max.z*.28);
    else if(rig.kind==='me262')fire.position.set(2.22,-1.0,-.25);
    for(let i=0;i<3;i++){
     const color=new THREE.Color(i?0xea6b16:0xffb642);if(options.srgbOutput)color.convertSRGBToLinear();
     const m=new THREE.Sprite(new THREE.SpriteMaterial({map:fireMap,color,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,fog:true}));
     m.position.set((i-1)*.20/rig.scale,(.1+i*.18)/rig.scale,-forward*i*.50/rig.scale);m.scale.set(.85/rig.scale,1.5/rig.scale,1);fire.add(m);
    }
    rig.overlay.add(fire);rig.fire=fire;
   }
   if(rig.fire)rig.fire.visible=burning;
  }
  function forget(model){
   const r=rigs.get(model);if(!r)return;
   r.model.remove(r.overlay);
   for(const p of r.parts){p.proxy.geometry.dispose();p.proxy.material.dispose();if(p.deformed){if(p.mesh.geometry===p.deformed)p.mesh.geometry=p.original;p.deformed.dispose();}}
   if(r.fire)for(const m of r.fire.children)m.material.dispose();rigs.delete(model);
  }
  function wreck(model,aircraft,impact){
   if(!model||wrecks.some(w=>w.model===model))return;
   if(wrecks.length>=10){const old=wrecks.shift();forget(old.model);root.GameRuntime.release(old.model);}
   model.updateWorldMatrix(true,true);model.position.copy(aircraft.pos);
   const velocity=aircraft.vel?.clone()||new THREE.Vector3(Math.sin(aircraft.heading||0)*(aircraft.spd||90),0,Math.cos(aircraft.heading||0)*(aircraft.spd||90));
   damage(model,.05,.5,null,aircraft.forward||1,aircraft.kind||aircraft.def?.type||'');
   wrecks.push({model,velocity,t:0,spin:(aircraft.roll||0)>=0?.55:-.55,impact});
  }
  return {damage,forget,wreck,
   update(dt){
    for(const r of rigs.values())if(r.fire){r.time+=dt;for(let i=0;i<r.fire.children.length;i++){const m=r.fire.children[i];m.material.opacity=.65+.25*Math.sin(r.time*24+i*2);m.material.rotation=Math.sin(r.time*3+i)*.10;m.scale.set((1+Math.sin(r.time*19+i)*.15)/r.scale,(1.7+i*.4)/r.scale,1);}}
    for(let i=wrecks.length-1;i>=0;i--){const w=wrecks[i];w.t+=dt;w.velocity.y-=9.81*dt;w.velocity.multiplyScalar(Math.exp(-dt*.055));w.model.position.addScaledVector(w.velocity,dt);w.model.rotateZ(w.spin*dt);w.model.rotateX(.22*dt);
     const p=w.model.position,floor=groundAt(p.x,p.z);
     if(options.smoke)options.smoke.trail(w.model,p,w.velocity.clone().normalize(),w.velocity.length(),1,dt);
     if(p.y<=floor+1||w.t>35){if(p.y<=floor+1&&w.impact)w.impact(p.x,floor+1,p.z);forget(w.model);root.GameRuntime.release(w.model);wrecks.splice(i,1);}
    }
   },
   clear(){for(const w of wrecks){forget(w.model);root.GameRuntime.release(w.model);}wrecks.length=0;for(const model of [...rigs.keys()])forget(model);},
   get stats(){return {rigs:rigs.size,wrecks:wrecks.length,holes:[...rigs.values()].reduce((n,r)=>n+r.holes,0)};},
   dispose(){this.clear();holeGeometry.dispose();holeMaterial.dispose();map.dispose();fireMap.dispose();}
  };
 }
 root.AircraftDamage={create};if(typeof module==='object'&&module.exports)module.exports=root.AircraftDamage;
})(typeof window==='undefined'?globalThis:window);
