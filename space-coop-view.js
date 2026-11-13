(function(root){
 'use strict';
 function create(T,host,world,template,nodes){
  const scene=new T.Scene();
  scene.background=new T.Color(0x030815);
  const camera=new T.PerspectiveCamera(59,1,.8,14000);
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.outputEncoding=T.sRGBEncoding;
  renderer.setClearColor(0x030815);
  renderer.domElement.setAttribute('aria-label','Weltraumszene');
  host.append(renderer.domElement);
  scene.add(new T.HemisphereLight(0xaccdff,0x625478,1.6));
  const light=new T.DirectionalLight(0xffd7a9,1.5);
  light.position.set(-400,800,500);scene.add(light);
  const v=(x,y,z)=>new T.Vector3(x,y,z),assets=new Set();
  const own=a=>(assets.add(a),a);
  const mesh=(g,m)=>new T.Mesh(g,m);
  const solid=(color,emissive=0)=>own(new T.MeshStandardMaterial({color,emissive,roughness:.7,metalness:.35}));
  const glow=color=>own(new T.MeshBasicMaterial({color}));
  const add=(parent,g,m,position,scale)=>{
   const o=mesh(g,m);o.position.set(...position);o.scale.set(...scale);parent.add(o);return o;
  };
  const box=own(new T.BoxGeometry(1,1,1)),sphere=own(new T.SphereGeometry(1,24,16));
  const diamond=own(new T.OctahedronGeometry(1)),ring=own(new T.TorusGeometry(1,.045,6,36));
  const silver=solid(0x829bae,0x101b24),dark=solid(0x29354d,0x0b1224),alien=solid(0x605377,0x281236);
  const amber=glow(0xffbe6d),ice=glow(0x7ae9ff),magenta=glow(0xff64a4);
  const forward=v(0,0,-1),zAxis=v(0,0,1),tmp=v(),aim=v(),cameraAt=v(),camUp=v();
  const d=new T.Object3D();

  let seed=193;
  function random(){return ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
  for(const [count,radius,size] of [[1450,10700,1.1],[520,7300,1.7],[120,6400,2.3]]){
   const points=[],colors=[];
   for(let i=0;i<count;i++){
    const z=random()*2-1,angle=random()*Math.PI*2,r=Math.sqrt(1-z*z)*radius;
    points.push(Math.cos(angle)*r,z*radius,Math.sin(angle)*r);
    const shade=.42+random()*.55;colors.push(shade*(i%9===0?1:.73),shade*.84,shade);
   }
   const g=own(new T.BufferGeometry());
   g.setAttribute('position',new T.Float32BufferAttribute(points,3));
   g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
   scene.add(new T.Points(g,own(new T.PointsMaterial({size,sizeAttenuation:false,vertexColors:true}))));
  }
  const planet=add(scene,sphere,solid(0x386f9c,0x101c40),[5000,-2600,-6700],[3400,3400,3400]);
  const atmosphere=own(new T.ShaderMaterial({
   side:T.BackSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
   vertexShader:`varying vec3 n,v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalMatrix*normal;v=-p.xyz;gl_Position=projectionMatrix*p;}`,
   fragmentShader:`varying vec3 n,v;void main(){float r=pow(1.-abs(dot(normalize(n),normalize(v))),7.);gl_FragColor=vec4(.13,.55,.99,r*.45);}`
  }));
  add(scene,sphere,atmosphere,planet.position.toArray(),[3470,3470,3470]);
  const asteroid=own(new T.IcosahedronGeometry(1,1)),vertices=asteroid.attributes.position;
  const colors=[];
  for(let i=0;i<vertices.count;i++){
   const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
   const radius=.88+.16*Math.sin(x*10+y*8+z*4)+.12*Math.cos(z*10-y*7);
   vertices.setXYZ(i,x*radius,y*radius,z*radius);
   const shade=.65+.24*Math.cos(x*12+y*8)*Math.sin(z*11+y*2);
   colors.push(shade,shade*.92,shade*.88);
  }
  asteroid.setAttribute('color',new T.Float32BufferAttribute(colors,3));asteroid.computeVertexNormals();
  const rockMaterial=solid(0x756f79,0x100c11);rockMaterial.vertexColors=true;
  const belt=new T.InstancedMesh(asteroid,rockMaterial,world.rocks.length);
  belt.frustumCulled=false;
  world.rocks.forEach((rock,i)=>{
   d.position.copy(rock.position);d.rotation.set(rock.angle*.37,rock.angle,i);
   d.scale.set(rock.radius,rock.radius*.90,rock.radius*.96);
   d.updateMatrix();belt.setMatrixAt(i,d.matrix);
  });
  scene.add(belt);
  const livery=[0x238ab0,0xc96f39];
  const playerColors=[ice,amber];
  const jets=playerColors.map((color,i)=>{
   const jet=new T.Group(),model=template.clone(true),paint=new Map();
   model.rotation.y=Math.PI;
   function repaint(material){
    if(material.name!=='Gedämpftes Kupferrot')return material;
    if(!paint.has(material)){
     const clone=own(material.clone());
     clone.color.setHex(livery[i]);paint.set(material,clone);
    }
    return paint.get(material);
   }
   model.traverse(o=>{
    if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(repaint):repaint(o.material);
   });
   jet.add(model);
   for(const side of [-1,1])add(jet,sphere,color,[side*2.35,.13,2.5],[1.35,.10,.25]);
   const exhaust=add(jet,diamond,color,[0,0,8],[.5,.5,1.9]);
   jet.userData={exhaust};
   jet.name=i?'Amber Jet':'Blue Jet';scene.add(jet);return jet;
  });
  const shuttle=new T.Group();
  add(shuttle,box,silver,[0,0,0],[30,15,59]);
  add(shuttle,diamond,dark,[0,1,-25],[18,10,19]);
  add(shuttle,box,ice,[0,5,-32],[14,4,3]);
  for(const side of [-1,1]){
   add(shuttle,box,dark,[side*20,0,7],[11,11,35]);
   add(shuttle,box,amber,[side*20,0,25],[7,7,2]);
  }
  shuttle.rotation.y=.67;scene.add(shuttle);
  const station=new T.Group();station.position.copy(world.station);scene.add(station);
  add(station,ring,silver,[0,0,0],[43,43,43]);
  add(station,ring,ice,[0,0,-3],[41,41,41]);
  add(station,box,dark,[0,-30,0],[83,10,19]);
  add(station,box,silver,[0,-30,0],[19,14,58]);
  const gate=new T.Group();gate.position.copy(world.gate);scene.add(gate);
  add(gate,ring,ice,[0,0,0],[49,49,49]);
  add(gate,ring,silver,[0,0,-5],[56,56,56]);
  const cells=world.cells.map(p=>{
   const cell=add(scene,diamond,amber,p.toArray(),[12,16,12]);return cell;
  });
  const boss=new T.Group();boss.position.copy(world.boss);boss.visible=false;scene.add(boss);
  add(boss,diamond,alien,[0,0,-15],[77,26,58]);
  add(boss,diamond,dark,[0,-13,0],[97,14,36]);
  add(boss,ring,magenta,[0,0,28],[24,24,24]);
  const core=add(boss,sphere,ice,[0,0,23],[15,15,12]);
  const generators=nodes.map(p=>add(boss,sphere,magenta,p.clone().sub(world.boss).toArray(),[14,14,12]));
  const dronePool=Array.from({length:5},()=>{
   const o=new T.Group();o.visible=false;scene.add(o);
   add(o,diamond,alien,[0,0,0],[15,3.5,9]);
   add(o,diamond,dark,[0,2,-2],[6,4,8]);
   add(o,sphere,magenta,[0,0,5],[4,1.3,1.3]);
   return o;
  });
  const bolts=own(new T.BoxGeometry(.8,.8,9));
  const shotPool=Array.from({length:42},()=>{
   const o=mesh(bolts,ice);o.visible=false;scene.add(o);return o;
  });
  const direction=v(),target=v(),camQ=new T.Quaternion(),inverse=new T.Quaternion();
  let width=0,height=0,initialized=false;
  function placeMarker(el,position){
   tmp.copy(position).applyMatrix4(camera.matrixWorldInverse);
   const behind=tmp.z>=0;
   if(behind){
    tmp.set(tmp.x,tmp.y,-Math.max(1,Math.abs(tmp.z)*.22));
    if(Math.abs(tmp.x)+Math.abs(tmp.y)<5)tmp.y=-tmp.z;
   }
   tmp.applyMatrix4(camera.projectionMatrix);
   const outside=behind||Math.abs(tmp.x)>.9||Math.abs(tmp.y)>.76;
   if(outside)tmp.multiplyScalar(1/Math.max(Math.abs(tmp.x)/.9,Math.abs(tmp.y)/.76,1e-5));
   el.style.left=(50+tmp.x*50)+'%';el.style.top=(50-tmp.y*50)+'%';
   el.style.transform='translate(-50%,-50%)'+(outside?' rotate('+Math.atan2(tmp.x,tmp.y)+'rad)':'');
  }
  function placeMoving(model,state,dt,projectile=false){
   direction.fromArray(state,1);
   if(model.userData.id!==state[0])model.position.copy(direction);
   else{
    if(projectile)model.position.addScaledVector(tmp.fromArray(state,4),dt);
    model.position.lerp(direction,1-Math.exp(-dt*(projectile?13:24)));
   }
   model.userData.id=state[0];
  }
  function radar(canvas,p,partner,goal,drones){
   const ctx=canvas.getContext('2d'),center=66,radius=60;
   ctx.clearRect(0,0,132,132);
   ctx.fillStyle='#0a1627bc';ctx.strokeStyle='#6598b6aa';
   for(const r of [radius,radius*.58]){
    ctx.beginPath();ctx.arc(center,center,r,0,Math.PI*2);
    if(r===radius)ctx.fill();ctx.stroke();
   }
   ctx.beginPath();ctx.moveTo(center,8);ctx.lineTo(center,124);ctx.moveTo(8,center);ctx.lineTo(124,center);ctx.stroke();
   ctx.fillStyle='#e2f0ff';ctx.fillRect(center-2,center-2,4,4);
   inverse.copy(p.rotation).invert();
   function dot(position,color,keep=false){
    tmp.copy(position).sub(p.position).applyQuaternion(inverse).multiplyScalar(radius/550);
    const planar=Math.hypot(tmp.x,tmp.z);
    if(planar>radius-5){
     if(!keep)return;
     tmp.multiplyScalar((radius-5)/planar);
    }
    ctx.fillStyle=color;ctx.beginPath();
    ctx.arc(center+tmp.x,center+tmp.z,keep?3.7:2.8,0,Math.PI*2);ctx.fill();
   }
   dot(partner.position,'#7ae9ff',true);dot(goal,'#ffbe6d',true);
   for(const drone of drones)dot(direction.fromArray(drone,1),'#ff64a4');
  }
  function draw(pilots,snapshot,index,goal,dt,ui){
   const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
   if(w!==width||h!==height){
    width=w;height=h;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.35,Math.sqrt(1300000/(w*h))));
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
   }
   for(const [i,jet] of jets.entries()){
    jet.position.copy(pilots[i].position);jet.quaternion.copy(pilots[i].rotation);
    jet.rotateZ(pilots[i].bank);
    jet.userData.exhaust.scale.z=pilots[i].boost?4.7:1.8;
    jet.userData.exhaust.visible=!snapshot.down[i];
   }
   shuttle.position.fromArray(snapshot.shuttle);
   cells.forEach((cell,i)=>{cell.visible=!snapshot.cells[i];cell.rotation.y+=dt*1.4;});
   boss.visible=snapshot.stage==='boss'||snapshot.stage==='won';
   generators.forEach((g,i)=>g.visible=snapshot.generators[i]>0);
   core.visible=!snapshot.generators.some(Boolean)&&snapshot.core>0;
   dronePool.forEach((o,i)=>{
    const drone=snapshot.drones[i];o.visible=!!drone;if(!drone)return;
    placeMoving(o,drone,dt);
    o.quaternion.setFromUnitVectors(forward,direction.fromArray(drone,4).normalize());
   });
   shotPool.forEach((o,i)=>{
    const shot=snapshot.shots[i];o.visible=!!shot;if(!shot)return;
    placeMoving(o,shot,dt,true);
    o.material=shot[7]?magenta:ice;
    o.quaternion.setFromUnitVectors(zAxis,direction.fromArray(shot,4).normalize());
   });
   const p=pilots[index],blend=1-Math.exp(-dt*12);
   if(!initialized){camQ.copy(p.rotation);initialized=true;}
   camQ.slerp(p.rotation,blend);
   camera.position.copy(cameraAt.set(0,7.6,27).applyQuaternion(camQ).add(p.position));
   camera.up.copy(camUp.set(0,1,0).applyQuaternion(camQ));
   camera.lookAt(target.set(0,1.5,-64).applyQuaternion(camQ).add(p.position));
   camera.updateMatrixWorld(true);
   aim.set(0,0,-180).applyQuaternion(p.rotation).add(p.position).project(camera);
   ui.reticle.style.left=(50+aim.x*50)+'%';ui.reticle.style.top=(50-aim.y*50)+'%';
   placeMarker(ui.target,goal);placeMarker(ui.wingman,pilots[1-index].position);
   radar(ui.radar,p,pilots[1-index],goal,snapshot.drones);
   renderer.render(scene,camera);
  }
  return {canvas:renderer.domElement,draw,dispose(){
   scene.clear();belt.dispose();for(const a of assets)a.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
  }};
 }
 root.SpaceCoopView={create};
})(globalThis);
