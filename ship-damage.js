/* Gameplay flooding in three compartments, local fires and hit-dependent trim.
 * Weapon HP and objective credit stay authoritative; flooding animates the loss. */
(function(root){
 'use strict';
 function create(THREE,scene,{fire=null,smoke=null}={}){
  const states=new Map(),ray=new THREE.Raycaster(),material=new THREE.MeshBasicMaterial({color:0x201c18,side:THREE.DoubleSide,transparent:true,opacity:.86,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),geometry=new THREE.CircleGeometry(1,16);
  function state(ship){
   if(states.has(ship))return states.get(ship);
   const g=ship.group;g.updateWorldMatrix(true,true);const inv=g.matrixWorld.clone().invert(),box=new THREE.Box3(),surfaces=[];
   g.traverse(o=>{if(!o.isMesh||!o.geometry)return;
    const geo=o.geometry.clone(),p=geo.attributes.position;if(p.normalized){const data=new Float32Array(p.count*3),div=p.array instanceof Int16Array?32767:65535;for(let i=0;i<p.count;i++){data[i*3]=p.getX(i)/div;data[i*3+1]=p.getY(i)/div;data[i*3+2]=p.getZ(i)/div;}geo.setAttribute('position',new THREE.BufferAttribute(data,3));}
    geo.computeBoundingBox();const m=new THREE.Mesh(geo,material);m.matrixWorld.multiplyMatrices(inv,o.matrixWorld);box.union(geo.boundingBox.clone().applyMatrix4(m.matrixWorld));surfaces.push(m);
   });
   const s={ship,box,surfaces,compartments:[0,0,0],breaches:[0,0,0],hits:[],side:0,trim:0,flood:0,sunk:false,elapsed:0,emitT:0,patches:[]};
   states.set(ship,s);g.rotation.order='YXZ';return s;
  }
  function hit(ship,worldPoint=null,weapon='torpedo'){
   const s=state(ship),b=s.box,local=worldPoint?ship.group.worldToLocal(worldPoint.clone()):new THREE.Vector3(b.max.x,1,0);
   local.x=Math.max(b.min.x,Math.min(b.max.x,local.x));local.z=Math.max(b.min.z,Math.min(b.max.z,local.z));
   const fraction=(local.z-b.min.z)/(b.max.z-b.min.z||1),compartment=Math.min(2,Math.floor(fraction*3));
   const side=local.x>=0?1:-1,underwater=weapon==='torpedo',severity=underwater?.32:weapon==='bomb'?.16:.035;
   s.breaches[compartment]=Math.min(.018,s.breaches[compartment]+severity*.022);s.compartments[compartment]=Math.min(1,s.compartments[compartment]+severity);
   s.side+=side*severity;s.trim+=(fraction-.5)*severity*2;
   let origin,direction;
   if(underwater){origin=new THREE.Vector3(side*(Math.max(Math.abs(b.min.x),Math.abs(b.max.x))+8),Math.max(b.min.y+.5,Math.min(b.max.y-.5,local.y)),local.z);direction=new THREE.Vector3(-side,0,0);}
   else {origin=new THREE.Vector3(local.x,b.max.y+8,local.z);direction=new THREE.Vector3(0,-1,0);}
   ray.set(origin,direction);const skin=ray.intersectObjects(s.surfaces,false)[0];
   const at=skin?skin.point.clone():new THREE.Vector3(local.x,Math.min(8,b.max.y),local.z);
   const normal=skin?skin.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(skin.object.matrixWorld)).normalize():new THREE.Vector3(0,1,0);
   if(normal.dot(direction)>0)normal.negate();
   if(s.patches.length<12&&skin){const patch=new THREE.Mesh(geometry,material);patch.name='shipHullBreach';patch.position.copy(at).addScaledVector(normal,.05);patch.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);patch.scale.setScalar(underwater?2.1:weapon==='bomb'?3:1);ship.group.add(patch);s.patches.push(patch);}
   if(s.hits.length<8)s.hits.push({at,fire:!underwater||ship.hp<=0});
   if(ship.hp<=0){if(!s.sunk)s.elapsed=0;s.sunk=true;s.breaches[compartment]=.09;s.compartments[compartment]=Math.max(.65,s.compartments[compartment]);}
   return s;
  }
  return {hit,
   update(ship,dt,seaY=0){
    const s=states.get(ship);if(!s)return false;s.elapsed+=dt;s.emitT-=dt;
    for(let i=0;i<3;i++)s.compartments[i]=Math.min(s.sunk?1:.65,s.compartments[i]+s.breaches[i]*dt);
    if(s.sunk)for(let i=0;i<3;i++)s.compartments[i]=Math.min(1,s.compartments[i]+dt*.025);
    s.flood=s.compartments.reduce((n,c)=>n+c,0)/3;
    const lost=s.sunk?Math.min(1,s.elapsed/38):0,sign=s.side>=0?-1:1;
    const roll=sign*(Math.min(.22,Math.abs(s.side)*.28)+lost*.82),pitch=-s.trim*(.18+lost*.9);
    ship.group.rotation.z+=(roll-ship.group.rotation.z)*(1-Math.exp(-dt*.45));ship.group.rotation.x+=(pitch-ship.group.rotation.x)*(1-Math.exp(-dt*.35));
    const depth=s.sunk?lost*(s.box.max.y-s.box.min.y+Math.max(Math.abs(s.box.min.x),Math.abs(s.box.max.x))+6):s.flood*1.3;
    ship.group.position.y=seaY-depth;
    if(s.emitT<=0&&depth<s.box.max.y+4){s.emitT=.32;
     for(const h of s.hits){const p=ship.group.localToWorld(h.at.clone());if(p.y<seaY-.4)continue;
      if(h.fire&&fire)fire(p.x,p.y+.7,p.z,.65);
      if(smoke)smoke(p.x,p.y+2,p.z,0x4b4741,.52);
     }
    }
    if(s.sunk&&lost>=1)ship.group.visible=false;return true;
   },
   get(ship){return states.get(ship);},
   clear(){for(const s of states.values()){for(const p of s.patches)s.ship.group.remove(p);for(const m of s.surfaces)m.geometry.dispose();}states.clear();},
   dispose(){this.clear();geometry.dispose();material.dispose();}
  };
 }
 root.ShipDamage={create};if(typeof module==='object'&&module.exports)module.exports=root.ShipDamage;
})(typeof window==='undefined'?globalThis:window);
