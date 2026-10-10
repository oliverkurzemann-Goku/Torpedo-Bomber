/* Eight detailed, articulated deck hands in six instanced draws. */
(function(root){
 'use strict';
 function create(THREE,parent,options={}){
  const group=new THREE.Group();group.name='deckActivity';parent.add(group);
  const y=options.deckY||14,srgb=!!options.srgbOutput,crew=[],buckets=[];
  const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1),euler=new THREE.Euler();let time=0;
  function geometry(part){
   part.updateWorldMatrix(true,true);const inverse=part.matrixWorld.clone().invert(),data={position:[],normal:[],color:[]};
   part.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
    for(const key of ['position','normal'])data[key].push(...g.attributes[key].array);
    const c=o.material.color;for(let i=0;i<g.attributes.position.count;i++)data.color.push(c.r,c.g,c.b);g.dispose();
   });const g=new THREE.BufferGeometry();for(const key of Object.keys(data))g.setAttribute(key,new THREE.Float32BufferAttribute(data[key],3));g.computeBoundingSphere();return g;
  }
  for(let type=0;type<2;type++){
   const template=CrewVisuals.create(THREE,{service:options.service||'usnavy',role:'sailor',srgbOutput:srgb,jacketColor:type?0xc9ad59:options.service==='ijn'?0x98846a:undefined});
   const geometries=new Set(),materials=new Set();template.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
   const arm=template.getObjectByName('leftArm'),leg=template.getObjectByName('leftLeg');
   const armGeo=geometry(arm),legGeo=geometry(leg);for(const name of ['leftArm','rightArm','leftLeg','rightLeg'])template.remove(template.getObjectByName(name));
   const bodyGeo=geometry(template),count=type?1:7,material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,side:THREE.DoubleSide});
   const set={};for(const [name,geo,n] of [['body',bodyGeo,count],['arms',armGeo,count*2],['legs',legGeo,count*2]]){
    const mesh=new THREE.InstancedMesh(geo,material,n);mesh.name='deckCrew-'+name;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);set[name]=mesh;
   }buckets.push(set);
   for(const part of [arm,leg])part.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
  // Flight/landing path is Z=0. People and walking routes stay beyond ±9 m.
  const stations=[[-81,-12,'carry'],[-35,-12,'walk'],[14,-12,'repair'],[66,-12,'repair'],[-66,12,'walk'],[-9,12,'carry'],[42,12,'repair'],[-70,-10,'signal']];
  stations.forEach(([x,z,job],i)=>crew.push({x,z,job,type:i===7?1:0,index:i===7?0:i,phase:i*.83}));
  function place(mesh,i,x,y,z,rx,ry,rz,sx=1){pos.set(x,y,z);euler.set(rx,ry,rz);q.setFromEuler(euler);scale.set(sx,1,1);matrix.compose(pos,q,scale);mesh.setMatrixAt(i,matrix);}
  function update(dt,state={}){
   time+=Math.max(0,dt);group.visible=state.visible!==false;
   if(!group.visible)return;
   for(const c of crew){
    const y=options.heightAt?options.heightAt(group.position.x+c.x,c.z):options.deckY||14;
    const set=buckets[c.type],walk=c.job==='walk'||c.job==='carry',stride=walk?Math.sin(time*3+c.phase)*.34:0;
    const x=c.x+(walk?Math.sin(time*.19+c.phase)*7:0),z=c.z,heading=c.job==='signal'?Math.PI/2:walk?Math.cos(time*.19+c.phase)>0?Math.PI/2:-Math.PI/2:c.z<0?0:Math.PI;
    const active=state.launching&&c.job==='signal',service=state.servicing&&c.job==='repair';
    const bend=service?.20:0;place(set.body,c.index,x,y,z,bend,heading,0);
    for(let side=0;side<2;side++){
     const s=side?1:-1,armZ=active?s*(1.65+Math.sin(time*4)*.18):0,armX=c.job==='carry'?-.95:service?-.8+Math.sin(time*3+c.phase)*.18:-stride*s;
     const local=new THREE.Vector3(s*.235,1.39,0).applyAxisAngle(new THREE.Vector3(0,1,0),heading);
     // Mirrored left geometry gives matching hands without duplicating resources.
     euler.set(armX,0,armZ);q.setFromEuler(euler);q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading));pos.set(x+local.x,y+local.y,z+local.z);scale.set(side?-1:1,1,1);matrix.compose(pos,q,scale);set.arms.setMatrixAt(c.index*2+side,matrix);
     local.set(s*.11,.82,0).applyAxisAngle(new THREE.Vector3(0,1,0),heading);place(set.legs,c.index*2+side,x+local.x,y+.82,z+local.z,stride*s,heading,0,side?-1:1);
    }
   }for(const set of buckets)for(const mesh of Object.values(set))mesh.instanceMatrix.needsUpdate=true;
  }
  update(0);return {group,crew,update,reset(){time=0;update(0);},get time(){return time;},dispose(){parent.remove(group);const materials=new Set();group.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());}};
 }
 root.DeckActivity={create};if(typeof module==='object'&&module.exports)module.exports=root.DeckActivity;
})(typeof window==='undefined'?globalThis:window);
