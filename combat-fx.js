/* Bounded, pooled combat sprites shared by both campaigns. Three.js r128. */
(function(root){
 'use strict';
 // The long axis is local Z, matching Object3D.lookAt. Mixing a Y-axis
 // cylinder with lookAt made the Pacific AA appear as upright sticks.
 const rounds=new Map();let roundNumber=0,pooledRounds=0,allocatedRounds=0;
 function recycleRound(mesh){
  if(!mesh.userData.roundActive)return;
  mesh.userData.roundActive=false;mesh.visible=false;
  if(pooledRounds<512){rounds.get(mesh.userData.roundKind).pool.push(mesh);pooledRounds++;}
 }
 function round(kind='rifle',shotIndex=null){
  if(!rounds.has(kind)){
   const [width,length]=kind==='aa'?[.13,2]:kind==='cannon'?[.10,1.35]:[.08,1.15];
   const geometry=new THREE.BoxGeometry(width,width,length);
   const materials=[0x373a37,0xffd395].map(color=>new THREE.MeshBasicMaterial({color,fog:false,toneMapped:false}));
   rounds.set(kind,{geometry,materials,pool:[]});
  }
  const {geometry,materials,pool}=rounds.get(kind);
  const tracer=(shotIndex===null?roundNumber++:shotIndex)%4===0;
  let mesh=pool.pop();
  if(mesh)pooledRounds--;else{mesh=new THREE.Mesh(geometry,materials[tracer?1:0]);allocatedRounds++;}
  mesh.material=materials[tracer?1:0];mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);mesh.visible=true;
  mesh.userData.roundKind=kind;mesh.userData.litTracer=tracer;mesh.userData.roundActive=true;
  mesh.userData.runtimeRecycle=recycleRound;delete mesh.userData.roundBarrel;delete mesh.userData.roundSide;
  // Short exposure streak; physical flight/hit geometry stays in the callers.
  if(tracer)mesh.scale.z=kind==='aa'?6:kind==='cannon'?7:7.5;
  return mesh;
 }
 function updateRounds(items,camera,renderer){
  if(!camera||!renderer)return;
  const height=renderer.domElement.clientHeight||renderer.domElement.height||768;
  const metresPerPixel=2*Math.tan((camera.fov||50)*Math.PI/360)/height;
  for(const item of items){const mesh=item.mesh;if(!mesh?.userData.roundKind)continue;
   // Dark rounds remain fully simulated. Beyond 80m they contribute no useful
   // chase-view detail, but used to cost three extra draw calls per tracer.
   const distanceSq=mesh.position.distanceToSquared(camera.position);
   mesh.visible=mesh.userData.litTracer||distanceSq<=6400;
   if(!mesh.userData.litTracer)continue;
   const width=mesh.userData.roundKind==='aa'?.13:mesh.userData.roundKind==='cannon'?.10:.08;
   // End-on shots otherwise vanish below one pixel in the chase camera.
   const visibleWidth=Math.min(1.7,Math.max(width,Math.sqrt(distanceSq)*metresPerPixel*1.15));
   mesh.scale.x=mesh.scale.y=visibleWidth/width;
  }
 }
 function texture(flare){
  const n=64,p=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const dx=(x-31.5)/31.5,dy=(y-31.5)/31.5,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
   const edge=flare?.48+.20*Math.pow(Math.cos(a*3),8):.80+.09*Math.sin(a*5)+.07*Math.cos(a*3);
   const alpha=flare?Math.max(0,1-r/edge):Math.max(0,1-r/edge)*( .78+.22*Math.sin(x*.48)*Math.sin(y*.39));
   const i=(y*n+x)*4;p[i]=p[i+1]=p[i+2]=255;p[i+3]=Math.round(Math.min(1,alpha*(flare?2.8:1.5))*255);
  }
  const t=new THREE.DataTexture(p,n,n,THREE.RGBAFormat);t.needsUpdate=true;return t;
 }
 function create(scene){
  const cloud=texture(false),flash=texture(true),ember=new THREE.Color(0xa13c14),live=[],pools=[[],[],[]];let allocated=0,shots=0;
  const flameGeo=new THREE.ConeGeometry(1,1,9);flameGeo.translate(0,.5,0);flameGeo.rotateX(Math.PI/2);
  function emit(pos,size,color,life,velocity,hot=false,parent=scene,growth=1,gravity=0){
   if(live.length>=220)return;
   let m=pools[hot?1:0].pop();if(!m){if(allocated>=220)return;allocated++;m=new THREE.Sprite(new THREE.SpriteMaterial({map:hot?flash:cloud,blending:hot?THREE.AdditiveBlending:THREE.NormalBlending,transparent:true,depthWrite:false}));}
   m.material.color.setHex(color);m.material.opacity=hot?1:.72;
   m.material.rotation=Math.random()*6.28;m.visible=true;m.position.copy(pos);m.scale.set(size,size,1);m.material.fog=false;m.material.toneMapped=false;parent.add(m);
   live.push({m,t:0,life,size,velocity,growth,gravity,hot});
  }
  function recycle(i){const e=live[i];if(e.m.parent)e.m.parent.remove(e.m);e.m.visible=false;pools[e.flame?2:e.hot?1:0].push(e.m);live.splice(i,1);}
  function muzzleFlame(parent,p,direction,heavy){
   if(live.length>=220)return;
   let m=pools[2].pop();
   if(!m){
    if(allocated>=220)return;allocated++;m=new THREE.Group();
    for(const color of [0xffa43b,0xffefd2])m.add(new THREE.Mesh(flameGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,toneMapped:false})));
   }
   const radius=heavy?.19:.12,length=(heavy?.85:.55)*(.85+Math.random()*.3);
   m.children[0].scale.set(radius,radius,length);m.children[1].scale.set(radius*.48,radius*.48,length*.62);
   m.position.copy(p);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);m.visible=true;m.scale.setScalar(1);parent.add(m);
   live.push({m,t:0,life:.055,flame:true});
  }
  return {
   sparks(pos,count=4){for(let i=0;i<Math.min(10,count);i++)emit(pos.clone(),.20,0xffdc99,.18+Math.random()*.15,new THREE.Vector3((Math.random()-.5)*10,Math.random()*6,(Math.random()-.5)*10),true,scene,.3,12);},
   muzzle(parent,points,heavy=false,direction=new THREE.Vector3(0,0,1)){
    parent.updateMatrixWorld(true);shots++;
    for(const p of points){
     muzzleFlame(parent,p,direction,heavy);
     if(shots%3===0)emit(parent.localToWorld(p.clone()),heavy?.40:.26,0x97958e,.55,new THREE.Vector3(0,.6,0),false,scene,2.2);
    }
   },
   impact(x,y,z,water=false){
    const at=new THREE.Vector3(x,y+.8,z);
    emit(at,water?4.2:3.5,water?0xd7f5ff:0xa9946e,water?.75:1.05,new THREE.Vector3(0,water?5:2,0),false,scene,1.4);
    for(let i=0;i<2;i++)emit(at.clone(),water?1.4:.65,water?0xf0fcff:0x5e4932,.5,new THREE.Vector3(i?3:-3,water?8:4,i?1:-1),false,scene,.5,12);
   },
   blast(x,y,z,scale,ground){
    const s=Math.max(.5,Math.min(3.5,scale||1)),at=new THREE.Vector3(x,y,z);
    emit(at,12*s,0xfff2d0,.12,null,true,scene,2);
    for(let i=0;i<9;i++){
     const a=i*2.3999,r=(2+Math.random()*4)*s;
     emit(at.clone().add(new THREE.Vector3(Math.cos(a)*r,Math.random()*4*s,Math.sin(a)*r)),(6+Math.random()*4)*s,i%2?0xf78426:0xffcd62,.45+Math.random()*.4,new THREE.Vector3(Math.cos(a)*3,5+Math.random()*5,Math.sin(a)*3),true,scene,2.3);
     emit(at.clone().add(new THREE.Vector3(Math.cos(a)*r,2*s,Math.sin(a)*r)),5*s,i%2?0x48443f:0x696158,2.5+Math.random()*2,new THREE.Vector3(Math.cos(a)*2,4+Math.random()*5,Math.sin(a)*2),false,scene,3);
    }
    if(Number.isFinite(ground)&&Math.abs(y-ground)<25*s){
     for(let i=0;i<12;i++){const a=i*Math.PI/6,v=7+Math.random()*10;
      emit(new THREE.Vector3(x,Math.max(y,ground+1),z),3*s,0x928574,1.4+Math.random(),new THREE.Vector3(Math.cos(a)*v,1.5,Math.sin(a)*v),false,scene,3.8);
      if(i%2===0)emit(at.clone(),1.1*s,0x65513c,1.1,new THREE.Vector3(Math.cos(a)*v,13+Math.random()*13,Math.sin(a)*v),false,scene,.7,25);
     }
    }
   },
   update(dt){for(let i=live.length-1;i>=0;i--){const e=live[i];e.t+=dt;if(e.t>=e.life){recycle(i);continue;}const k=e.t/e.life;
    if(e.flame){e.m.scale.setScalar(1-k*.35);for(const c of e.m.children)c.material.opacity=.85*(1-k);continue;}
    if(e.velocity){e.velocity.y-=e.gravity*dt;e.m.position.addScaledVector(e.velocity,dt);}
    e.m.scale.setScalar(e.size*(1+k*e.growth));e.m.material.opacity=(e.hot?1:.72)*Math.pow(1-k,e.hot?1.3:.8);
    if(e.hot&&e.life>.2)e.m.material.color.lerp(ember,dt*2);
   }},
   clear(){for(let i=live.length-1;i>=0;i--)recycle(i);},
   get count(){return live.length;}
  };
 }
 root.CombatFX={create,round,updateRounds,get roundStats(){return {allocated:allocatedRounds,pooled:pooledRounds};}};
})(typeof window==='undefined'?globalThis:window);
