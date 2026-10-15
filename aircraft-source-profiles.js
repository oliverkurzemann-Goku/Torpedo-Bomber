/* Exact-source adapters for opt-in replacement qualification. Original files stay intact. */
(function(global){
 'use strict';
 const T=global.THREE,SOURCE='bf109-manilov-remix';
 const sourceUrl='https://sketchfab.com/3d-models/manilovaps-bf-109-remix-4a663a81690b41a1a700c0a501b00001';
 const pitch=Math.atan2(.25235,.96764);
 function read(attr,i,v){
  v.fromBufferAttribute(attr,i);
  if(attr.normalized){const a=attr.array;v.divideScalar(a instanceof Int16Array?32767:a instanceof Uint16Array?65535:a instanceof Int8Array?127:255);}
  return v;
 }
 function bounds(geometry){
  const box=new T.Box3(),v=new T.Vector3(),p=geometry.attributes.position,ix=geometry.index?.array;
  if(ix){for(const i of ix)box.expandByPoint(read(p,i,v));}
  else for(let i=0;i<p.count;i++)box.expandByPoint(read(p,i,v));
  geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new T.Sphere());return box;
 }
 function prepare(scene){
  scene.userData.aircraftSourceProfile=SOURCE;
  scene.traverse(o=>{
   if(!o.isMesh)return;o.geometry=o.geometry.clone();bounds(o.geometry);
   const uv=o.geometry.attributes.uv;
   for(const material of [].concat(o.material))if(material.normalMap){
    for(const key of ['uv1','uv2']){
     const other=o.geometry.attributes[key];if(!other)continue;
     if(!uv||uv.count!==other.count||uv.itemSize!==other.itemSize)throw Error('Replacement normal UV mismatch');
     for(let i=0;i<uv.array.length;i++)if(uv.array[i]!==other.array[i])throw Error('Replacement requires a different normal UV');
    }
    material.userData.normalUVValidated=true;
   }
  });return scene;
 }
 function rig(root){
  root.updateMatrixWorld(true);
  const skin=[];root.traverse(o=>{if(o.isMesh)skin.push(o);});
  const main=skin.find(o=>o.geometry.attributes.uv2&&o.geometry.index?.count===72069);
  if(!main)throw Error('Unrecognized Bf109 replacement geometry');
  const parts=global.AircraftRotors.components(root,main),nose=new T.Box3().setFromObject(root).max.z;
  const rotorParts=parts.filter(p=>p.box.min.z>nose-.58);
  const blades=rotorParts.filter(p=>p.faces.length===512),spinner=rotorParts.find(p=>p.faces.length===576);
  const mains=[-1,1].map(side=>parts.filter(p=>p.box.min.z>1.7&&p.box.max.z<2.75&&p.box.min.y<-.8&&p.box.max.y<-.28&&(side<0?p.box.max.x<-.35:p.box.min.x>.35)));
  const tail=parts.filter(p=>p.box.min.z>-3.5&&p.box.max.z<-2.95&&p.box.min.x>-.16&&p.box.max.x<.16&&p.box.max.y<.18);
  if(blades.length!==3||!spinner||mains.some(p=>p.length<12)||tail.length<8)throw Error('Replacement mechanical stations do not match');
  const centre=spinner.box.getCenter(new T.Vector3());centre.z=nose-.43;
  const prop=global.AircraftRotors.transfer(root,main,rotorParts,centre,'prop');prop.userData.sourceProfile=SOURCE;
  const gear=new T.Group();gear.name='gear';gear.userData.originalSkinRig=SOURCE;root.add(gear);
  for(let i=0;i<2;i++){
   const side=i===0?-1:1;
   const hinge=global.AircraftRotors.transfer(root,main,mains[i],new T.Vector3(side*.43,-.31,1.835),side<0?'mainGearLeft':'mainGearRight');
   hinge.userData.gearSide=side;hinge.children[0].userData.groundWheel=true;gear.attach(hinge);
  }
  const small=global.AircraftRotors.transfer(root,main,tail,new T.Vector3(0,.12,-3.14),'tailGear');
  small.userData.smallGear=true;small.children[0].userData.groundWheel=true;gear.attach(small);
  const canopy=new T.Group();canopy.name='closedCanopy';canopy.position.set(-.33,.57,.58);root.add(canopy);
  for(const mesh of skin){
   const selected=global.AircraftRotors.components(root,mesh).filter(p=>p.box.min.x<-.3&&p.box.max.x<-.16&&p.box.min.y>.5&&p.box.min.z>.2&&p.box.max.z<.95);
   if(selected.length){const part=global.AircraftRotors.transfer(root,mesh,selected,canopy.position,'originalCanopyPart');canopy.attach(part);}
  }
  canopy.rotation.z=-Math.PI/3;
  // transfer() degenerates moved faces. Prune only those indices, retaining all UV/normal/position buffers.
  for(const mesh of skin){
   const geo=mesh.geometry,ix=geo.index.array,kept=[];
   for(let i=0;i<ix.length;i+=3)if(ix[i]!==ix[i+1]&&ix[i]!==ix[i+2]&&ix[i+1]!==ix[i+2])kept.push(ix[i],ix[i+1],ix[i+2]);
   geo.setIndex(new T.BufferAttribute(new ix.constructor(kept),1));bounds(geo);
  }
  root.userData.aircraftSourceProfile=SOURCE;
  return 'original replacement three-blade propeller, native textured gear and closed canopy';
 }
 const gearAxis=new T.Vector3(0,.30,Math.sqrt(.91));
 function poseGear(root,deployment){
  const gear=root.getObjectByName('gear');if(gear?.userData.originalSkinRig!==SOURCE)return false;
  const g=Math.max(0,Math.min(1,deployment));gear.visible=g>.005;
  for(const hinge of gear.children){const side=hinge.userData.gearSide;
   if(side)hinge.quaternion.setFromAxisAngle(gearAxis,side*1.22*(1-g));else hinge.rotation.x=1.1*(1-g);
  }
  if(gear.userData.deployment!==g){for(let o=root;o;o=o.parent)delete o.userData.groundSupports;gear.userData.deployment=g;}
  return true;
 }
 global.AircraftSourceProfiles={SOURCE,sourceUrl,pitch,prepare,rig,poseGear,bounds};
})(typeof window==='undefined'?globalThis:window);
