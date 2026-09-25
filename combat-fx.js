/* Bounded, pooled combat sprites shared by both campaigns. Three.js r128. */
(function(root){
 'use strict';
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
  const cloud=texture(false),flash=texture(true),ember=new THREE.Color(0xa13c14),live=[],pools=[[],[]];let allocated=0,shots=0;
  function emit(pos,size,color,life,velocity,hot=false,parent=scene,growth=1,gravity=0){
   if(live.length>=220)return;
   let m=pools[hot?1:0].pop();if(!m){if(allocated>=220)return;allocated++;m=new THREE.Sprite(new THREE.SpriteMaterial({map:hot?flash:cloud,blending:hot?THREE.AdditiveBlending:THREE.NormalBlending,transparent:true,depthWrite:false}));}
   m.material.color.setHex(color);m.material.opacity=hot?1:.72;
   m.material.rotation=Math.random()*6.28;m.visible=true;m.position.copy(pos);m.scale.set(size,size,1);parent.add(m);
   live.push({m,t:0,life,size,velocity,growth,gravity,hot});
  }
  function recycle(i){const e=live[i];e.m.removeFromParent?e.m.removeFromParent():e.m.parent.remove(e.m);e.m.visible=false;pools[e.hot?1:0].push(e.m);live.splice(i,1);}
  return {
   muzzle(parent,points,heavy=false){
    parent.updateMatrixWorld(true);shots++;
    for(const p of points){
     emit(p,heavy?2.8:1.9,0xffbc57,.075,null,true,parent,1.4);
     if(shots%3===0)emit(parent.localToWorld(p.clone()),heavy?.95:.65,0xc6bca6,.65,new THREE.Vector3(0,1.3,0),false,scene,3.4);
    }
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
    if(e.velocity){e.velocity.y-=e.gravity*dt;e.m.position.addScaledVector(e.velocity,dt);}
    e.m.scale.setScalar(e.size*(1+k*e.growth));e.m.material.opacity=(e.hot?1:.72)*Math.pow(1-k,e.hot?1.3:.8);
    if(e.hot&&e.life>.2)e.m.material.color.lerp(ember,dt*2);
   }},
   clear(){for(let i=live.length-1;i>=0;i--)recycle(i);},
   get count(){return live.length;}
  };
 }
 root.CombatFX={create};
})(typeof window==='undefined'?globalThis:window);
