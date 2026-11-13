/* Eight articulated deck hands, batched into ten instanced draws. */
(function(root){
 'use strict';
 function create(THREE,parent,options={}){
  const group=new THREE.Group();group.name='deckActivity';parent.add(group);
  const srgb=!!options.srgbOutput,crew=[],buckets=[],stride=.875,stance=.6,turnTime=1.8;
  const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),yaw=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1),euler=new THREE.Euler(0,0,0,'YXZ');
  const up=new THREE.Vector3(0,1,0),right=new THREE.Vector3(1,0,0),down=new THREE.Vector3(0,-1,0),local=new THREE.Vector3(),hip=new THREE.Vector3(),ankle=new THREE.Vector3(),axis=new THREE.Vector3(),bend=new THREE.Vector3(),knee=new THREE.Vector3(),direction=new THREE.Vector3();let time=0;
  const smooth=x=>x*x*(3-2*x),mod=(x,n)=>((x%n)+n)%n;
  const figures=root.CrewFigures||(typeof require==='function'?require('./crew-figures.js'):null);
  const hipHeight=.82,soleOffset=.1325,thighLength=.40,shinLength=.32,legReach=thighLength+shinLength;
  for(let type=0;type<2;type++){
   const template=figures.create(THREE,{service:options.service||'usnavy',role:type?'deckSignal':'deckhand',variant:type?2:0,srgbOutput:srgb});
   const {arms,legs,shins}=template.userData,arm=arms[0],leg=legs[0],shin=shins[0],boot=shin.getObjectByName('leftBoot');
   const body=figures.bake(THREE,template,[...arms,...legs]).translate(0,-leg.parent.position.y,0);
   const sleeve=figures.bake(THREE,arm),upper=figures.bake(THREE,leg,[shin]).scale(1,thighLength/-shin.position.y,1);
   const lower=figures.bake(THREE,shin,[boot]).scale(1,shinLength/-boot.position.y,1);
   const shoe=figures.bake(THREE,boot);shoe.computeBoundingBox();shoe.translate(0,-soleOffset-shoe.boundingBox.min.y,0);
   const count=type?1:7,material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,side:THREE.DoubleSide});
   const meshes={};
   for(const [name,geometry,n] of [['body',body,count],['arms',sleeve,count*2],['upper',upper,count*2],['lower',lower,count*2],['boots',shoe,count*2]]){
    const mesh=new THREE.InstancedMesh(geometry,material,n);mesh.name='deckCrew-'+name;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);meshes[name]=mesh;
   }
   buckets.push({meshes,shoulder:arm.position.clone(),hipOffset:Math.abs(leg.position.x)});figures.dispose(template);
  }
  // Keep people and their complete routes outside the aircraft's Z=0 lane.
  // The crew keeps to the deck edge strips; a narrow real deck (options.deckHalfWidth) pulls them in, the old 35 m decks keep 12 m.
  const lane=Math.min(12,(options.deckHalfWidth??16)-2.6);
  const stations=[[-81,-lane,'carry'],[-35,-lane,'walk'],[14,-lane,'repair'],[66,-lane,'repair'],[-66,lane,'walk'],[-9,lane,'carry'],[42,lane,'repair'],[-70,-(lane-2),'signal']];
  stations.forEach(([x,z,job],i)=>crew.push({x,z,job,type:i===7?1:0,index:i===7?0:i,phase:i*.83,speed:.68+(i%3)*.04,feet:[{},{}]}));
  function place(mesh,i,x,y,z,rx,ry,rz,sx=1){pos.set(x,y,z);euler.set(rx,ry,rz);q.setFromEuler(euler);scale.set(sx,1,1);matrix.compose(pos,q,scale);mesh.setMatrixAt(i,matrix);}
  function height(x,z){return options.heightAt?options.heightAt(group.position.x+x,z):options.deckY??14;}
  function gait(distance,side){
   const phase=mod(distance/stride+side*.5,1),u=(phase-stance)/(1-stance),reach=stride*stance/2;
   return phase<stance?{forward:reach-stride*phase,lift:0,pitch:0,planted:true}:
    {forward:-reach+2*reach*smooth(u),lift:.10*Math.sin(Math.PI*u),pitch:.10*Math.sin(Math.PI*u),planted:false};
  }
  function feet(c,x,z,heading,distance,turn,hipOffset){
   const fx=Math.sin(heading),fz=Math.cos(heading),rx=Math.cos(heading),rz=-Math.sin(heading);
   for(let side=0;side<2;side++){
    const f=c.feet[side],s=side?1:-1;
    if(turn){
     const stage=Math.min(3,Math.floor(turn.u*4)),u=turn.u*4-stage,active=stage%2===side;
     function pose(step){
      const angle=turn.heading+(step<0?0:step<2?Math.PI/2:Math.PI),forward=step<0||step>=2?gait(0,side).forward:0;
      return {x:x+Math.cos(angle)*s*hipOffset+Math.sin(angle)*forward,z:z-Math.sin(angle)*s*hipOffset+Math.cos(angle)*forward,heading:angle};
     }
     const previous=stage-1-((stage-1-side+2)%2),from=pose(previous),to=active?pose(stage):from,t=active?smooth(u):0;
     f.x=from.x+(to.x-from.x)*t;f.z=from.z+(to.z-from.z)*t;f.heading=from.heading+(to.heading-from.heading)*t;
     f.lift=active?.10*Math.sin(Math.PI*u):0;f.pitch=active?.08*Math.sin(Math.PI*u):0;f.planted=!active;
    }else{
     const g=c.job==='walk'||c.job==='carry'?gait(distance,side):{forward:0,lift:0,pitch:0,planted:true};
     f.x=x+rx*s*hipOffset+fx*g.forward;f.z=z+rz*s*hipOffset+fz*g.forward;f.heading=heading;f.lift=g.lift;f.pitch=g.pitch;f.planted=g.planted;
    }
    f.y=height(f.x,f.z)+f.lift+soleOffset;
   }
  }
  function segment(mesh,i,from,to,heading,s){
   direction.copy(to).sub(from).applyAxisAngle(up,-heading).normalize();q.setFromUnitVectors(down,direction);yaw.setFromAxisAngle(up,heading);q.premultiply(yaw);
   scale.set(s,1,1);matrix.compose(from,q,scale);mesh.setMatrixAt(i,matrix);
  }
  function update(dt,state={}){
   time+=Math.max(0,dt);group.visible=state.visible!==false;if(!group.visible)return;
   for(const c of crew){
    const {meshes:set,shoulder,hipOffset}=buckets[c.type],walk=c.job==='walk'||c.job==='carry',walkTime=14/c.speed,cycle=2*(walkTime+turnTime),t=mod(time+c.phase*1.15,cycle);
    let x=c.x,z=c.z,heading=c.job==='signal'?Math.PI/2:c.z<0?0:Math.PI,distance=0,turn=null;
    if(walk){
     if(t<walkTime){x=c.x-7+c.speed*t;heading=Math.PI/2;distance=c.speed*t;}
     else if(t<walkTime+turnTime){x=c.x+7;turn={u:(t-walkTime)/turnTime,heading:Math.PI/2};heading=turn.heading+Math.PI*smooth(turn.u);}
     else if(t<2*walkTime+turnTime){distance=c.speed*(t-walkTime-turnTime);x=c.x+7-distance;heading=3*Math.PI/2;}
     else{x=c.x-7;turn={u:(t-2*walkTime-turnTime)/turnTime,heading:3*Math.PI/2};heading=turn.heading+Math.PI*smooth(turn.u);}
    }
    const y=height(x,z),active=state.launching&&c.job==='signal',service=state.servicing&&c.job==='repair';
    feet(c,x,z,heading,distance,turn,hipOffset);
    let hipY=y+hipHeight-(walk?.022-.010*Math.sin(distance/stride*4*Math.PI):0);
    // Keep both legs within reach, including planted feet during a turnaround.
    for(let side=0;side<2;side++){
     local.set((side?1:-1)*hipOffset,0,0).applyAxisAngle(up,heading);
     const f=c.feet[side],d=Math.hypot(f.x-x-local.x,f.z-z-local.z);
     hipY=Math.min(hipY,f.y+Math.sqrt(Math.max(0,legReach*legReach-d*d))-.002);
    }
    const pitch=service?.20:0;
    place(set.body,c.index,x,hipY,z,pitch,heading,0);
    for(let side=0;side<2;side++){
     const s=side?1:-1,i=c.index*2+side,f=c.feet[side],armZ=active?s*(1.65+Math.sin(time*4)*.18):0;
     const armX=c.job==='carry'?-.95:service?-.8+Math.sin(time*3+c.phase)*.18:walk&&!turn?-Math.sin(distance/stride*2*Math.PI)*.28*s:0;
     local.set(s*Math.abs(shoulder.x),shoulder.y,shoulder.z).applyAxisAngle(right,pitch).applyAxisAngle(up,heading);
     euler.set(pitch+armX,0,armZ);q.setFromEuler(euler);yaw.setFromAxisAngle(up,heading);q.premultiply(yaw);pos.set(x+local.x,hipY+local.y,z+local.z);scale.set(side?-1:1,1,1);matrix.compose(pos,q,scale);set.arms.setMatrixAt(i,matrix);
     local.set(s*hipOffset,0,0).applyAxisAngle(up,heading);hip.set(x+local.x,hipY,z+local.z);ankle.set(f.x,f.y,f.z);
     axis.copy(ankle).sub(hip);const length=Math.min(legReach-.0001,Math.max(thighLength-shinLength+.001,axis.length()));axis.normalize();
     const along=(thighLength*thighLength+length*length-shinLength*shinLength)/(2*length),radius=Math.sqrt(Math.max(0,thighLength*thighLength-along*along));
     bend.set(Math.sin(heading),0,Math.cos(heading));bend.addScaledVector(axis,-bend.dot(axis)).normalize();
     knee.copy(hip).addScaledVector(axis,along).addScaledVector(bend,radius);
     segment(set.upper,i,hip,knee,heading,side?-1:1);segment(set.lower,i,knee,ankle,heading,side?-1:1);
     place(set.boots,i,f.x,f.y,f.z,f.pitch,f.heading,0,side?-1:1);
    }
   }for(const {meshes} of buckets)for(const mesh of Object.values(meshes))mesh.instanceMatrix.needsUpdate=true;
  }
  update(0);return {group,crew,update,reset(){time=0;update(0);},get time(){return time;},dispose(){parent.remove(group);const materials=new Set();group.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});materials.forEach(m=>m.dispose());}};
 }
 root.DeckActivity={create};if(typeof module==='object'&&module.exports)module.exports=root.DeckActivity;
})(typeof window==='undefined'?globalThis:window);
