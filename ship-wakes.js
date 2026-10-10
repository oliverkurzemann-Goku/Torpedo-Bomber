/* Curved, world-space course histories: one bounded draw for the whole fleet. */
(function(root){
 'use strict';
 function create(THREE,scene,options={}){
  const maxShips=24,maxPoints=80,life=38,tracks=new Map(),height=options.height||(()=>.12);
  const capacity=maxShips*(maxPoints*18+12),positions=new Float32Array(capacity*3),uvs=new Float32Array(capacity*2),alphas=new Float32Array(capacity);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('uv',new THREE.BufferAttribute(uvs,2).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('opacity',new THREE.BufferAttribute(alphas,1).setUsage(THREE.DynamicDrawUsage));geo.setDrawRange(0,0);
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true,uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{time:{value:0}}]),
   vertexShader:'attribute float opacity; varying float fade; varying vec2 waterUv; #include <fog_pars_vertex>\nvoid main(){fade=opacity;waterUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition; #include <fog_vertex>\n}',
   fragmentShader:'varying float fade; varying vec2 waterUv; uniform float time; #include <fog_pars_fragment>\nvoid main(){float edge=pow(max(0.,1.-abs(waterUv.x*2.-1.)),.65);float foam=.55+.20*sin(waterUv.y*2.1+waterUv.x*21.)+.15*sin(waterUv.y*4.7-waterUv.x*39.+time*.8);gl_FragColor=vec4(.70,.83,.82,fade*edge*foam); #include <fog_fragment>\n#include <encodings_fragment>\n}'});
  // Shader directives must start on their own lines in WebGL 1 as well.
  material.vertexShader=material.vertexShader.replace(/ #include/g,'\n#include');material.fragmentShader=material.fragmentShader.replace(/ #include/g,'\n#include');
  const mesh=new THREE.Mesh(geo,material);mesh.name='fleetWakes';mesh.frustumCulled=false;mesh.renderOrder=1;scene.add(mesh);let time=0,vertices=0,drawClock=.1;
  function track(key,position,forward,length,beam,speed,dt){
   if(!key||!position||!forward)return;
   let t=tracks.get(key);if(!t){if(tracks.size>=maxShips)return;t={points:[],seen:time,timer:0};tracks.set(key,t);}
   t.seen=time;t.position={x:position.x,z:position.z};const norm=Math.hypot(forward.x,forward.z)||1;t.f={x:forward.x/norm,z:forward.z/norm};t.length=length;t.beam=beam;t.moving=speed>.35;
   if(!t.moving)return;t.timer+=Math.max(0,dt);
   const p={x:position.x-t.f.x*length*.48,z:position.z-t.f.z*length*.48,fx:t.f.x,fz:t.f.z,age:0,beam:Math.max(1.2,beam),speed};
   const last=t.points[t.points.length-1],distance=last?Math.hypot(p.x-last.x,p.z-last.z):Infinity;
   if(distance>length*4+100)t.points=[];
   if(distance>Math.max(.6,length*.025)&&t.timer>=.18){t.timer=0;t.points.push(p);if(t.points.length>maxPoints)t.points.shift();}
  }
  function vertex(x,z,u,v,a){const i=vertices++;positions[i*3]=x;positions[i*3+1]=height(x,z)+.14;positions[i*3+2]=z;uvs[i*2]=u;uvs[i*2+1]=v;alphas[i]=options.waterAt&&!options.waterAt(x,z)?0:a;}
  function ribbon(a,b,wa,wb,alphaA,alphaB,offset=0){
   const ax=a.x+a.fz*wa*(offset-1),az=a.z-a.fx*wa*(offset-1),bx=a.x+a.fz*wa*(offset+1),bz=a.z-a.fx*wa*(offset+1);
   const cx=b.x+b.fz*wb*(offset-1),cz=b.z-b.fx*wb*(offset-1),dx=b.x+b.fz*wb*(offset+1),dz=b.z-b.fx*wb*(offset+1);
   vertex(ax,az,0,a.age,alphaA);vertex(cx,cz,0,b.age,alphaB);vertex(bx,bz,1,a.age,alphaA);vertex(bx,bz,1,a.age,alphaA);vertex(cx,cz,0,b.age,alphaB);vertex(dx,dz,1,b.age,alphaB);
  }
  function update(dt){
   dt=Math.max(0,dt);time+=dt;drawClock+=dt;material.uniforms.time.value=time;
   for(const t of tracks.values())for(const p of t.points)p.age+=dt;
   if(drawClock<.10)return;drawClock=0;vertices=0;
   for(const [key,t] of tracks){
    t.points=t.points.filter(p=>p.age<life);
    if(time-t.seen>life){tracks.delete(key);continue;}
    for(let i=1;i<t.points.length;i++){
     const a=t.points[i-1],b=t.points[i],wa=a.beam*.24+a.age*.23,wb=b.beam*.24+b.age*.23;
     const aa=.63*Math.pow(1-a.age/life,1.5)*Math.min(1,i/4),ab=.63*Math.pow(1-b.age/life,1.5)*Math.min(1,(i+1)/4);
     ribbon(a,b,wa,wb,aa,ab);
     // Fine diverging feathered rails spread from each recorded stern bearing.
     ribbon(a,b,wa*.23,wb*.23,aa*.5,ab*.5,-4.0);ribbon(a,b,wa*.23,wb*.23,aa*.5,ab*.5,4.0);
    }
    if(t.moving&&time-t.seen<.25){
     const f=t.f,c={x:t.position.x+f.x*t.length*.42,z:t.position.z+f.z*t.length*.42,fx:f.x,fz:f.z,age:0,beam:t.beam};
     const b={...c,x:c.x-f.x*t.beam*.7,z:c.z-f.z*t.beam*.7,age:1};ribbon(c,b,t.beam*.08,t.beam*.62,.58,.10);
    }
   }
   geo.setDrawRange(0,vertices);for(const key of ['position','uv','opacity'])geo.attributes[key].needsUpdate=true;
  }
  return {mesh,track,update,forget(key){tracks.delete(key);},clear(){tracks.clear();vertices=0;drawClock=.1;geo.setDrawRange(0,0);},get tracks(){return tracks;},get stats(){return {ships:tracks.size,points:[...tracks.values()].reduce((n,t)=>n+t.points.length,0),vertices,maxShips,maxPoints,life};},dispose(){scene.remove(mesh);geo.dispose();material.dispose();tracks.clear();}};
 }
 root.ShipWakes={create};if(typeof module==='object'&&module.exports)module.exports=root.ShipWakes;
})(typeof window==='undefined'?globalThis:window);
