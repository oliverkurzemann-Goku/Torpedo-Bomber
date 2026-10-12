/* Local maritime weather for the Pacific game. Distances/effects are gameplay
 * curves; CB cells are world-anchored and leave a clear carrier recovery zone. */
(function(root){
 'use strict';
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
 const hash=n=>{const v=Math.sin(n*127.1+91.7)*43758.5453;return v-Math.floor(v);};
 function cellsFor(name,home=0,targets=[]){
  const count=name==='storm'?3:name==='squall'?2:name==='broken'?1:0;
  const goal=targets.find(t=>Math.hypot((t.x??t.pos?.[0]??0)-home,t.z??t.pos?.[2]??0)>3000)||{x:home+6500,z:1700};
  const gx=goal.x??goal.pos[0],gz=goal.z??goal.pos[2];
  return Array.from({length:count},(_,i)=>{
   let x=home+(gx-home)*(.48+i*.20),z=gz*(.48+i*.20)+(i%2?-1:1)*(450+i*750);
   if(Math.hypot(x-home,z)<3500){x=home+3900+i*1600;z+=650;}
   return {x,z,radius:name==='broken'?650:850+i*140,base:420+i*80,top:name==='broken'?2400:3200+i*400,
    cb:name!=='broken',seed:i+4};
  });
 }
 function sample(name,cells,banks,pos){
  let intensity=0,fog=0,rain=0,warning='',nearest=Infinity;
  for(const c of cells){
   const d=Math.hypot(pos.x-c.x,pos.z-c.z),vertical=smooth((c.top+300-pos.y)/500);
   const core=smooth(1-d/c.radius)*vertical;
   if(c.cb)intensity=Math.max(intensity,core);
   if(pos.y<c.base+180)rain=Math.max(rain,smooth(1-d/(c.radius*1.6))*(c.cb?1.8:.25));
   if(c.cb&&pos.y<c.top+300&&d-c.radius<nearest){nearest=d-c.radius;warning=core>.15?'INSIDE CB — EXIT THE CELL':d<c.radius+1800?'CB AHEAD — FLY AROUND':'';}
  }
  for(const b of banks){const d=Math.hypot(pos.x-b.x,pos.z-b.z)/b.radius;
   fog=Math.max(fog,smooth(1-d)*smooth((190-pos.y)/140));
  }
  const w=root.FlightOps?.wx(name)||{rain:0,base:620};
  const below=smooth((w.base+180-pos.y)/200);
  const front=.35+.30*(Math.sin(pos.x*.0006+pos.z*.00023)+1)/2;
  rain=Math.max(rain,w.rain*below*front);
  return {intensity,fog,rain,warning,far:intensity>.02?Math.max(140,1800*(1-intensity)):fog>.02?Math.max(250,3000*(1-fog)):Infinity};
 }
 function create(THREE,scene,texture){
  const group=new THREE.Group();group.name='maritimeWeather';scene.add(group);
  const capacity=160,cloudGeo=new THREE.PlaneGeometry(1,1);
  const cloudMat=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.72,depthWrite:false,alphaTest:.005,side:THREE.DoubleSide,fog:true});
  // Elevated cloud towers remain visible above the shallow maritime fog layer;
  // sea-level scenery still follows the unchanged short weather visibility.
  cloudMat.onBeforeCompile=shader=>{
   shader.vertexShader='varying float vWeatherHeight;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWeatherHeight=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).y;');
   shader.fragmentShader='varying float vWeatherHeight;\n'+shader.fragmentShader.replace('#include <fog_fragment>',
    '#ifdef USE_FOG\nfloat weatherFar=mix(fogFar,max(fogFar,8500.0),smoothstep(250.0,1200.0,vWeatherHeight));float weatherFog=smoothstep(fogNear,weatherFar,fogDepth);gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,weatherFog);\n#endif');
  };
  cloudMat.customProgramCacheKey=()=> 'maritime-height-fog-190';
  const layers=new THREE.InstancedMesh(cloudGeo,cloudMat,capacity);layers.frustumCulled=false;layers.count=0;group.add(layers);
  const drops=1000,positions=new Float32Array(drops*3);
  for(let i=0;i<drops;i++){positions[i*3]=(hash(i*3)-.5)*180;positions[i*3+1]=(hash(i*3+1)-.5)*100;positions[i*3+2]=(hash(i*3+2)-.5)*180;}
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  const uniforms={uRatio:{value:1},uWet:{value:0},uNear:{value:0},uFar:{value:3000},uFog:{value:new THREE.Color(0x9ba7ac)}};
  const rainMat=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
   vertexShader:'uniform float uRatio;varying float vDepth;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);vDepth=-p.z;gl_Position=projectionMatrix*p;gl_PointSize=clamp(28.0/max(1.0,-p.z),0.8,2.0)*uRatio;}',
   fragmentShader:'uniform float uWet,uNear,uFar;uniform vec3 uFog;varying float vDepth;void main(){vec2 p=gl_PointCoord-0.5;p.x*=1.6;float a=(1.0-smoothstep(0.12,0.5,length(p)))*min(0.58,0.20+uWet*0.15);if(a<0.02)discard;float f=smoothstep(uNear,uFar,vDepth);gl_FragColor=vec4(mix(vec3(0.72,0.78,0.81),uFog,f),a*(1.0-f));}'});
  const rainMesh=new THREE.Points(rainGeo,rainMat);rainMesh.name='fineMaritimeRain';rainMesh.frustumCulled=false;rainMesh.visible=false;scene.add(rainMesh);
  const dummy=new THREE.Object3D(),color=new THREE.Color(),lastCamera=new THREE.Vector3();
  let cells=[],banks=[],parts=[],name='clear',time=0,exposure=0,damageTimer=0,lastWet=0,cameraReady=false;
  function reset(next,home=0,targets=[]){
   name=next;time=exposure=damageTimer=0;cameraReady=false;cells=cellsFor(name,home,targets);
   banks=['fog','lowcloud','rain','squall','storm'].includes(name)?[{x:home+3100,z:-1900,radius:1700},{x:home+5800,z:2400,radius:1900}]:[];
   parts=[];
   for(const c of cells){
    for(let level=0;level<6;level++)for(let j=0;j<4;j++){
     const a=j*Math.PI/2+level*.47,r=c.radius*(level<2?.48:.30),h=c.base+(c.top-c.base)*level/6;
     parts.push({x:c.x+Math.cos(a)*r,z:c.z+Math.sin(a)*r,y:h,w:c.radius*(1.02+hash(level*9+j+c.seed)*.3),h:c.radius*.78,shade:.56+level*.057});
    }
    for(let j=0;j<6;j++)parts.push({x:c.x+(j-2.5)*c.radius*.52,z:c.z+(hash(j+44)-.5)*c.radius,y:c.top,
     w:c.radius*1.5,h:c.radius*.5,shade:.86});
    parts.push({x:c.x,z:c.z,y:c.base-70,w:c.radius*2.5,h:280,shade:.48});
   }
   for(const b of banks)for(let j=0;j<14;j++){
    const a=j*2.399,r=Math.sqrt((j+.5)/14)*b.radius;
    parts.push({x:b.x+Math.cos(a)*r,z:b.z+Math.sin(a)*r,y:35+hash(j+7)*45,w:950,h:150,shade:.82});
   }
   layers.count=Math.min(capacity,parts.length);layers.visible=parts.length>0;rainMesh.visible=false;
   for(let i=0;i<layers.count;i++){const p=parts[i];color.setRGB(p.shade,p.shade*1.015,p.shade*1.03);layers.setColorAt(i,color);}
   if(layers.instanceColor)layers.instanceColor.needsUpdate=true;
  }
  function conditions(pos){return sample(name,cells,banks,pos);}
  function render(dt,camera,renderer,budget={rain:1}){
   time+=dt;const s=conditions(camera.position);lastWet=s.rain;
   for(let i=0;i<layers.count;i++){
    const p=parts[i];dummy.position.set(p.x+Math.sin(time*.025+i)*12,p.y,p.z);
    dummy.quaternion.copy(camera.quaternion);dummy.scale.set(p.w,p.h,1);dummy.updateMatrix();layers.setMatrixAt(i,dummy.matrix);
   }
   if(layers.count)layers.instanceMatrix.needsUpdate=true;
   rainMesh.visible=s.rain>.015;
   if(!rainMesh.visible){lastCamera.copy(camera.position);cameraReady=true;return s;}
   const drift=cameraReady?camera.position.clone().sub(lastCamera):new THREE.Vector3();lastCamera.copy(camera.position);cameraReady=true;
   // World-relative falling droplets; a large camera cut reseeds the local field.
   if(drift.length()>300)drift.set(0,0,0);
   for(let i=0;i<drops;i++){
    const k=i*3;positions[k]-=drift.x;positions[k+1]-=drift.y+(24+s.rain*10)*dt;positions[k+2]-=drift.z;
    positions[k]=((positions[k]+90)%180+180)%180-90;positions[k+1]=((positions[k+1]+50)%100+100)%100-50;positions[k+2]=((positions[k+2]+90)%180+180)%180-90;
   }
   rainMesh.position.copy(camera.position);rainGeo.attributes.position.needsUpdate=true;
   rainGeo.setDrawRange(0,Math.ceil(drops*clamp(s.rain*.8,.18,1)*(budget.rain??1)));
   uniforms.uWet.value=s.rain;uniforms.uRatio.value=renderer.getPixelRatio();
   if(scene.fog){uniforms.uNear.value=scene.fog.near;uniforms.uFar.value=scene.fog.far;uniforms.uFog.value.copy(scene.fog.color);}
   return s;
  }
  function disturb(p,dt,hit){
   const s=conditions(p.pos);if(!p.alive||p.onDeck||p.onGround)return s;
   const k=s.intensity;
   if(k>.03){
    p.rollVel=(p.rollVel||0)+Math.sin(time*4.1)*k*.35*dt;
    p.pitchVel=(p.pitchVel||0)+Math.cos(time*3.7)*k*.18*dt;
    const vertical=(Math.sin(time*1.9)*7-2.5)*k;p.pos.y+=vertical*dt;p.vSpeed+=vertical;
   }
   exposure=k>.55?exposure+dt:Math.max(0,exposure-dt*2);damageTimer-=dt;
   if(k>.55&&exposure>4&&damageTimer<=0){damageTimer=2;hit?.(3*k);}
   return s;
  }
  return {reset,render,conditions,disturb,rainMesh,group,layers,get cells(){return cells;},get banks(){return banks;},
   report:()=>({cells:cells.length,cb:cells.filter(c=>c.cb).length,banks:banks.length,puffs:layers.count,draws:2,rain:lastWet,exposure}),
   dispose(){scene.remove(group,rainMesh);cloudGeo.dispose();cloudMat.dispose();rainGeo.dispose();rainMat.dispose();}};
 }
 root.MaritimeWeather={create,cellsFor,sample};if(typeof module==='object'&&module.exports)module.exports=root.MaritimeWeather;
})(typeof window==='undefined'?globalThis:window);
