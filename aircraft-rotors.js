/* Rotate complete original GLB components. Never cut a radius through an airframe. */
(function(g){
 'use strict';
 function vertex(attr,i,out){
  out.fromBufferAttribute(attr,i);
  if(attr.normalized){const a=attr.array;out.divideScalar(a instanceof Int16Array?32767:a instanceof Uint16Array?65535:a instanceof Int8Array?127:255);}
  return out;
 }
 function components(root,mesh){
  root.updateMatrixWorld(true);
  const geo=mesh.geometry,ix=geo.index?.array,p=geo.attributes.position;if(!ix)return [];
  const parent=Int32Array.from({length:p.count},(_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let i=0;i<ix.length;i+=3){const a=find(ix[i]),b=find(ix[i+1]),c=find(ix[i+2]);parent[b]=a;parent[c]=a;}
  const matrix=new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld),v=new THREE.Vector3(),parts=new Map();
  for(let i=0;i<ix.length;i+=3){
   const id=find(ix[i]);if(!parts.has(id))parts.set(id,{faces:[],box:new THREE.Box3()});
   const part=parts.get(id);part.faces.push(i);
   for(let j=0;j<3;j++)part.box.expandByPoint(vertex(p,ix[i+j],v).applyMatrix4(matrix));
  }
  return [...parts.values()];
 }
 function transfer(root,mesh,parts,pivot,name){
  // Own only the index buffer; vertex data, normals, UVs and paint stay intact.
  mesh.geometry=mesh.geometry.clone();const geo=mesh.geometry,ix=geo.index.array,selected=[];
  for(const p of parts)for(const i of p.faces)selected.push(ix[i],ix[i+1],ix[i+2]);
  const rotorGeo=new THREE.BufferGeometry();
  for(const [key,attribute] of Object.entries(geo.attributes))rotorGeo.setAttribute(key,attribute);
  rotorGeo.setIndex(new THREE.BufferAttribute(new ix.constructor(selected),1));
  // r128's CPU bounds do not decode normalized integer positions. Bound only
  // the selected, decoded vertices so turrets/culling cannot grow kilometres wide.
  const bounds=new THREE.Box3(),v=new THREE.Vector3();
  for(const i of selected)bounds.expandByPoint(vertex(geo.attributes.position,i,v));
  rotorGeo.boundingBox=bounds;rotorGeo.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
  const rotor=new THREE.Group();rotor.name=name;rotor.position.copy(pivot);
  const copy=new THREE.Mesh(rotorGeo,mesh.material);copy.name='original rotor blades';
  copy.applyMatrix4(new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z)
   .multiply(new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld)));
  rotor.add(copy);root.add(rotor);
  for(const p of parts)for(const i of p.faces){ix[i+1]=ix[i];ix[i+2]=ix[i];}
  geo.index.needsUpdate=true;rotor.userData.originalRotorFaces=selected.length/3;
  return rotor;
 }
 function nose(root,kind){
  const corsair=kind==='corsair',mesh=root.getObjectByName(corsair?'Object_12':'Object_4');
  if(!mesh?.geometry?.index)return null;
  const parts=components(root,mesh),box=new THREE.Box3().setFromObject(root),sz=box.getSize(new THREE.Vector3());
  const threshold=box.max.z-sz.z*(corsair?.057:.068);
  const front=parts.filter(p=>p.box.min.z>threshold);
  const shells=front.filter(p=>p.faces.length>100&&Math.max(p.box.max.x-p.box.min.x,p.box.max.y-p.box.min.y)>sz.x*.09);
  if(shells.length!==6)return null; // Two textured sides on each of the three blades.
  const hub=front.find(p=>p.faces.length>(corsair?24:100)&&p.box.max.z>box.max.z-.02);
  if(!hub)return null;
  const centre=hub.box.getCenter(new THREE.Vector3());
  centre.z=shells.reduce((n,p)=>n+p.box.min.z,0)/shells.length+.055*sz.x/10.51;
  return transfer(root,mesh,front,centre,'prop');
 }
 function b17(root){
  const mesh=root.getObjectByName('0_0');if(!mesh?.geometry?.index)return [];
  const parts=components(root,mesh),box=new THREE.Box3().setFromObject(root),scale=box.getSize(new THREE.Vector3()).x/31.15;
  // Measured stations in this specific export, before centring/scaling.
  const rawMin=new THREE.Vector3(-15.661,-4.003,-15.399);
  const local=p=>new THREE.Vector3(...p).sub(rawMin).multiplyScalar(scale).add(box.min);
  const stations=[[-3.021,.864,5.02,4.90],[3.021,.864,5.02,4.90],[-6.505,1.19,4.40,4.28],[6.505,1.19,4.40,4.28]];
  const choices=stations.map(([x,y,z,front])=>{
   const pivot=local([x,y,z]),limit=local([x,y,front]).z;
   return {pivot,parts:parts.filter(p=>p.box.min.z>limit&&Math.abs(p.box.getCenter(new THREE.Vector3()).x-pivot.x)<1.05*scale)};
  });
  if(choices.some(c=>c.parts.length<10||c.parts.reduce((n,p)=>n+p.faces.length,0)<60))return [];
  return choices.map(c=>{const rotor=transfer(root,mesh,c.parts,c.pivot,'b17OriginalRotor');
   rotor.userData.bomberRotor=true;rotor.userData.spinAxis='z';return rotor;});
 }
 g.AircraftRotors={components,transfer,nose,b17};
})(typeof window!=='undefined'?window:globalThis);
