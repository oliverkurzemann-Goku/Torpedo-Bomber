// Remagen's fictional 1945 field strip. Coordinates are relative to the
// existing gameplay runway; keep the 40m active strip and approaches clear.
// No independent assets or new model downloads. See TERRAIN.md.
function buildRemagenAirfieldDetails(terrain,osm,originX,originZ){
  const group=new THREE.Group(); group.name='RemagenFieldDetails';
  const boxGeo=new THREE.BoxGeometry(1,1,1),batches=new Map(),hangarRoofs=[];
  const wheelGeo=new THREE.CylinderGeometry(.5,.5,1,10);wheelGeo.rotateZ(Math.PI/2);
  const colours={timber:0x655945,canvas:0x636551,roof:0x484c45,dark:0x252c29,
    stone:0x94917b,olive:0x535c42,rubber:0x262923,white:0xc8bf98};
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3();
  function part(kind,x,z,y,w,h,d,rot=0){
    if(!batches.has(kind)) batches.set(kind,[]);
    batches.get(kind).push({x:originX+x,z:originZ+z,y,w,h,d,rot});
  }
  const height=(x,z)=>terrain.getRenderedHeight(originX+x,originZ+z);
  function pad(x,z,w,d,colour,offset){
    const geo=new THREE.PlaneGeometry(w,d); geo.rotateX(-Math.PI/2);
    geo.translate(originX+x,0,originZ+z);
    const mat=new THREE.MeshStandardMaterial({color:colour,roughness:1});
    const mesh=new THREE.Mesh(geo,mat);mesh.name='airfieldGround';
    osm._prepareWaterSurface(mesh,Math.floor(originX/4000)*4000,Math.floor(originZ/4000)*4000,offset);
    group.add(mesh);
  }
  // Apron, parallel taxiway and three joining lanes: no modern asphalt,
  // painted runway numbers or airport lighting.
  pad(-100,-86,690,16,0x716b50,0.28);
  pad(-60,-159,510,112,0x777058,0.25);
  for(const x of [-330,0,230]) pad(x,-48,15,70,0x797054,0.30);
  // Dispersed open-front timber/canvas maintenance sheds; all within the
  // existing cleared field rectangle. Buildings sample their own corners.
  for(const x of [-275,-120,80]){
    const z=-192,w=43,d=31;
    const top=Math.max(...[[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]].map(([dx,dz])=>height(x+dx,z+dz)));
    const floor=Math.min(...[[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]].map(([dx,dz])=>height(x+dx,z+dz)))-.5;
    for(const sx of [-w/2,w/2]) part('timber',x+sx,z,(floor+top+10)/2,1.2,top+10-floor,d);
    part('timber',x,z-d/2,(floor+top+10)/2,w,top+10-floor,1.2);
    hangarRoofs.push({x:originX+x,z:originZ+z,y:top+10,w:w+3,d:d+3});
    for(const sx of [-17,0,17]) part('stone',x+sx,z+d/2,top+5,.65,10,.65);
    part('dark',x,z-d/2+.7,top+5.5,18,2.3,.25);
  }
  // A small operations hut, glazed lookout and antenna.
  const hutX=300,hutZ=-140,hy=height(hutX,hutZ);
  part('timber',hutX,hutZ,hy+3,22,6,12);
  part('roof',hutX,hutZ,hy+6.3,24,.8,14);
  for(const x of [293,300,307]) part('dark',x,hutZ+6.1,hy+3.6,3,1.8,.2);
  part('stone',hutX+16,hutZ,hy+8,.35,16,.35);
  // Sparse military utility trucks: period-inspired generic silhouettes,
  // not claimed to represent a particular museum-verified vehicle model.
  for(const [x,z] of [[-250,-123],[160,-131],[180,-143]]){
    const y=height(x,z);
    part('olive',x,z,y+1.5,2.5,1,5.6);
    part('canvas',x,z-1,y+2.5,2.45,1.6,3.4);
    part('olive',x,z+1.8,y+2.2,2.5,1.7,1.8);
    part('dark',x,z+2.72,y+2.55,1.95,.65,.06);
    for(const sx of [-1.25,1.25])for(const sz of [-1.9,1.8])part('rubber',x+sx,z+sz,y+.7,.45,1.1,1.1);
  }
  // Supplies and low revetments outside every taxi lane.
  for(let i=0;i<18;i++){
    const x=-350+(i%6)*3,z=-221-Math.floor(i/6)*3,y=height(x,z);
    part('timber',x,z,y+.8,2,1.6,2);
  }
  for(const x of [-410,210]){
    const z=-235;
    for(let i=0;i<8;i++)part('stone',x+i*3,z,height(x+i*3,z)+.65,3,1.3,2);
  }
  // Low whitewashed runway-edge stones, with the touchdown corridor open.
  for(let x=-420;x<=420;x+=60) for(const z of [-24,24])
    part('white',x,z,height(x,z)+.35,2,.7,1.5);
  for(const [kind,items]of batches){
    const mesh=new THREE.InstancedMesh(kind==='rubber'?wheelGeo:boxGeo,new THREE.MeshStandardMaterial({color:colours[kind],roughness:1}),items.length);
    mesh.name='airfieldDetails_'+kind;
    items.forEach((p,i)=>{
      q.setFromAxisAngle(new THREE.Vector3(0,1,0),p.rot);
      pos.set(p.x,p.y,p.z);scale.set(p.w,p.h,p.d);matrix.compose(pos,q,scale);mesh.setMatrixAt(i,matrix);
    });
    mesh.instanceMatrix.needsUpdate=true; group.add(mesh);
  }
  const roofs=new THREE.InstancedMesh(osm.gableRoofGeo,osm.roofSlateMat,hangarRoofs.length);
  roofs.name='airfieldHangarRoofs';
  hangarRoofs.forEach((p,i)=>{
    q.setFromAxisAngle(new THREE.Vector3(0,1,0),0);
    pos.set(p.x,p.y,p.z);scale.set(p.w,4.5,p.d);matrix.compose(pos,q,scale);roofs.setMatrixAt(i,matrix);
  });
  group.add(roofs);
  return group;
}
