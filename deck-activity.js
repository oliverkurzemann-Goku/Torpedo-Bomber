/* Eight articulated deck hands, batched into ten instanced draws. */
(function(root){
 'use strict';
 function create(THREE,parent,options={}){
  const group=new THREE.Group();group.name='deckActivity';parent.add(group);
  const srgb=!!options.srgbOutput,crew=[],buckets=[],stride=.875,stance=.6,turnTime=1.8;
  const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),yaw=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1),euler=new THREE.Euler(0,0,0,'YXZ');
  const up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0),local=new THREE.Vector3(),hip=new THREE.Vector3(),ankle=new THREE.Vector3(),axis=new THREE.Vector3(),bend=new THREE.Vector3(),knee=new THREE.Vector3(),direction=new THREE.Vector3();let time=0;
  const smooth=x=>x*x*(3-2*x),mod=(x,n)=>((x%n)+n)%n;
  function geometry(part){
   part.updateWorldMatrix(true,true);const inverse=part.matrixWorld.clone().invert(),data={position:[],normal:[],color:[]};
   part.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
    for(const key of ['position','normal'])data[key].push(...g.attributes[key].array);
    const c=o.material.color;for(let i=0;i<g.attributes.position.count;i++)data.color.push(c.r,c.g,c.b);g.dispose();
   });const g=new THREE.BufferGeometry();for(const key of Object.keys(data))g.setAttribute(key,new THREE.Float32BufferAttribute(data[key],3));g.computeBoundingSphere();return g;
  }
  function legSection(source,upper){
   // Complete rounded trouser sections overlap at the knee. Cutting the old
   // welded leg at a triangle boundary left open, jagged seams when it bent.
   const color=source.attributes.color,data={position:[],normal:[],color:[]};
   function append(g,index){
    const flat=g.index?g.toNonIndexed():g;for(const key of ['position','normal'])data[key].push(...flat.attributes[key].array);
    for(let i=0;i<flat.attributes.position.count;i++)data.color.push(color.getX(index),color.getY(index),color.getZ(index));
    if(flat!==g)flat.dispose();g.dispose();
   }
   const sphere=new THREE.SphereGeometry(1,10,7);
   if(upper)sphere.scale(.105,.23,.11).translate(0,-.22,0);
   else sphere.scale(.08,.16,.09).translate(-.025,-.128,.02);
   append(sphere,0);
   if(!upper)append(new THREE.SphereGeometry(1,10,7).scale(.078,.060,.082),0);
   if(upper)append(new THREE.BoxGeometry(.065,.14,.025).translate(-.09,-.29,.045),color.count-1);
   const g=new THREE.BufferGeometry();for(const key of Object.keys(data))g.setAttribute(key,new THREE.Float32BufferAttribute(data[key],3));g.computeBoundingSphere();return g;
  }
  for(let type=0;type<2;type++){
   const template=CrewVisuals.create(THREE,{service:options.service||'usnavy',role:'sailor',srgbOutput:srgb,jacketColor:type?0xc9ad59:options.service==='ijn'?0x98846a:undefined});
   const geometries=new Set(),materials=new Set();template.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
   const arm=template.getObjectByName('leftArm'),leg=template.getObjectByName('leftLeg'),boot=template.getObjectByName('leftBoot');
   const bootGeo=geometry(boot);bootGeo.translate(0,.68,0);leg.remove(boot);
   const armGeo=geometry(arm),legGeo=geometry(leg),upperGeo=legSection(legGeo,true),lowerGeo=legSection(legGeo,false);legGeo.dispose();
   for(const name of ['leftArm','rightArm','leftLeg','rightLeg'])template.remove(template.getObjectByName(name));
   const bodyGeo=geometry(template),count=type?1:7,material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,side:THREE.DoubleSide});
   const set={};for(const [name,geo,n] of [['body',bodyGeo,count],['arms',armGeo,count*2],['upper',upperGeo,count*2],['lower',lowerGeo,count*2],['boots',bootGeo,count*2]]){
    const mesh=new THREE.InstancedMesh(geo,material,n);mesh.name='deckCrew-'+name;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);set[name]=mesh;
   }buckets.push(set);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
  // Keep people and their complete routes outside the aircraft's Z=0 lane.
  const stations=[[-81,-12,'carry'],[-35,-12,'walk'],[14,-12,'repair'],[66,-12,'repair'],[-66,12,'walk'],[-9,12,'carry'],[42,12,'repair'],[-70,-10,'signal']];
  stations.forEach(([x,z,job],i)=>crew.push({x,z,job,type:i===7?1:0,index:i===7?0:i,phase:i*.83,speed:.68+(i%3)*.04,feet:[{},{}]}));
  function place(mesh,i,x,y,z,rx,ry,rz,sx=1){pos.set(x,y,z);euler.set(rx,ry,rz);q.setFromEuler(euler);scale.set(sx,1,1);matrix.compose(pos,q,scale);mesh.setMatrixAt(i,matrix);}
  function height(x,z){return options.heightAt?options.heightAt(group.position.x+x,z):options.deckY??14;}
  function gait(distance,side){
   const phase=mod(distance/stride+side*.5,1),u=(phase-stance)/(1-stance),reach=stride*stance/2;
   return phase<stance?{forward:reach-stride*phase,lift:0,pitch:0,planted:true}:
    {forward:-reach+2*reach*smooth(u),lift:.10*Math.sin(Math.PI*u),pitch:.10*Math.sin(Math.PI*u),planted:false};
  }
  function feet(c,x,z,heading,distance,turn){
   const fx=Math.sin(heading),fz=Math.cos(heading),rx=Math.cos(heading),rz=-Math.sin(heading);
   for(let side=0;side<2;side++){
    const f=c.feet[side],s=side?1:-1;
    if(turn){
     const stage=Math.min(3,Math.floor(turn.u*4)),u=turn.u*4-stage,active=stage%2===side;
     function pose(step){
      const angle=turn.heading+(step<0?0:step<2?Math.PI/2:Math.PI),forward=step<0||step>=2?gait(0,side).forward:0;
      return {x:x+Math.cos(angle)*s*.11+Math.sin(angle)*forward,z:z-Math.sin(angle)*s*.11+Math.cos(angle)*forward,heading:angle};
     }
     const previous=stage-1-((stage-1-side+2)%2),from=pose(previous),to=active?pose(stage):from,t=active?smooth(u):0;
     f.x=from.x+(to.x-from.x)*t;f.z=from.z+(to.z-from.z)*t;f.heading=from.heading+(to.heading-from.heading)*t;
     f.lift=active?.10*Math.sin(Math.PI*u):0;f.pitch=active?.08*Math.sin(Math.PI*u):0;f.planted=!active;
    }else{
     const g=c.job==='walk'||c.job==='carry'?gait(distance,side):{forward:0,lift:0,pitch:0,planted:true};
     f.x=x+rx*s*.11+fx*g.forward;f.z=z+rz*s*.11+fz*g.forward;f.heading=heading;f.lift=g.lift;f.pitch=g.pitch;f.planted=g.planted;
    }
    f.y=height(f.x,f.z)+f.lift+.1325;
   }
  }
  function segment(mesh,i,from,to,heading,s){
   direction.copy(to).sub(from).applyAxisAngle(up,-heading).normalize();q.setFromUnitVectors(down,direction);yaw.setFromAxisAngle(up,heading);q.premultiply(yaw);
   scale.set(s,1,1);matrix.compose(from,q,scale);mesh.setMatrixAt(i,matrix);
  }
  function update(dt,state={}){
   time+=Math.max(0,dt);group.visible=state.visible!==false;if(!group.visible)return;
   for(const c of crew){
    const set=buckets[c.type],walk=c.job==='walk'||c.job==='carry',walkTime=14/c.speed,cycle=2*(walkTime+turnTime),t=mod(time+c.phase*1.15,cycle);
    let x=c.x,z=c.z,heading=c.job==='signal'?Math.PI/2:c.z<0?0:Math.PI,distance=0,turn=null;
    if(walk){
     if(t<walkTime){x=c.x-7+c.speed*t;heading=Math.PI/2;distance=c.speed*t;}
     else if(t<walkTime+turnTime){x=c.x+7;turn={u:(t-walkTime)/turnTime,heading:Math.PI/2};heading=turn.heading+Math.PI*smooth(turn.u);}
     else if(t<2*walkTime+turnTime){distance=c.speed*(t-walkTime-turnTime);x=c.x+7-distance;heading=3*Math.PI/2;}
     else{x=c.x-7;turn={u:(t-2*walkTime-turnTime)/turnTime,heading:3*Math.PI/2};heading=turn.heading+Math.PI*smooth(turn.u);}
    }
    const y=height(x,z),active=state.launching&&c.job==='signal',service=state.servicing&&c.job==='repair';
    feet(c,x,z,heading,distance,turn);
    let hipY=y+(walk?.798+.010*Math.sin(distance/stride*4*Math.PI):.82);
    // Keep both legs within reach, including planted feet during a turnaround.
    for(let side=0;side<2;side++){
     local.set((side?1:-1)*.11,0,0).applyAxisAngle(up,heading);
     const f=c.feet[side],d=Math.hypot(f.x-x-local.x,f.z-z-local.z);
     hipY=Math.min(hipY,f.y+Math.sqrt(Math.max(0,.72*.72-d*d))-.002);
    }
    const hipHeight=hipY-y;
    place(set.body,c.index,x,y+hipHeight-.82,z,service?.20:0,heading,0);
    for(let side=0;side<2;side++){
     const s=side?1:-1,i=c.index*2+side,f=c.feet[side],armZ=active?s*(1.65+Math.sin(time*4)*.18):0;
     const armX=c.job==='carry'?-.95:service?-.8+Math.sin(time*3+c.phase)*.18:walk&&!turn?-Math.sin(distance/stride*2*Math.PI)*.28*s:0;
     local.set(s*.235,1.39+hipHeight-.82,0).applyAxisAngle(up,heading);
     euler.set(armX,0,armZ);q.setFromEuler(euler);yaw.setFromAxisAngle(up,heading);q.premultiply(yaw);pos.set(x+local.x,y+local.y,z+local.z);scale.set(side?-1:1,1,1);matrix.compose(pos,q,scale);set.arms.setMatrixAt(i,matrix);
     local.set(s*.11,0,0).applyAxisAngle(up,heading);hip.set(x+local.x,hipY,z+local.z);ankle.set(f.x,f.y,f.z);
     axis.copy(ankle).sub(hip);const length=Math.min(.7199,Math.max(.081,axis.length()));axis.normalize();
     const along=(.40*.40+length*length-.32*.32)/(2*length),radius=Math.sqrt(Math.max(0,.40*.40-along*along));
     bend.set(Math.sin(heading),0,Math.cos(heading));bend.addScaledVector(axis,-bend.dot(axis)).normalize();
     knee.copy(hip).addScaledVector(axis,along).addScaledVector(bend,radius);
     segment(set.upper,i,hip,knee,heading,side?-1:1);segment(set.lower,i,knee,ankle,heading,side?-1:1);
     place(set.boots,i,f.x,f.y,f.z,f.pitch,f.heading,0,side?-1:1);
    }
   }for(const set of buckets)for(const mesh of Object.values(set))mesh.instanceMatrix.needsUpdate=true;
  }
  update(0);return {group,crew,update,reset(){time=0;update(0);},get time(){return time;},dispose(){parent.remove(group);const materials=new Set();group.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());}};
 }
 root.DeckActivity={create};if(typeof module==='object'&&module.exports)module.exports=root.DeckActivity;
})(typeof window==='undefined'?globalThis:window);
