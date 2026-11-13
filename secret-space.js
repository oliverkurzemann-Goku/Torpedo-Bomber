/* Secret Jet bonus sortie. The arcade scene owns its geometry and never mutates the Pacific world. */
(function(root){
 'use strict';
 const GOAL=6,MAX_HULL=4;
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 function segmentHits(from,to,previous,current,radius){
  const ax=from.x-previous.x,ay=from.y-previous.y,az=from.z-previous.z;
  const dx=to.x-current.x-ax,dy=to.y-current.y-ay,dz=to.z-current.z-az;
  const length=dx*dx+dy*dy+dz*dz;
  const t=length?clamp(-(ax*dx+ay*dy+az*dz)/length,0,1):0;
  return (ax+t*dx)**2+(ay+t*dy)**2+(az+t*dz)**2<=radius*radius;
 }
 function create(T,template,options={}){
  const random=options.random||Math.random,signal=options.onEvent||(()=>{});
  const range=(a,b)=>a+(b-a)*random();
  const scene=new T.Scene();scene.name='secretJetSpace';scene.background=new T.Color(0x010106);
  scene.add(new T.HemisphereLight(0xa4beff,0x523058,1.6));
  const rim=new T.DirectionalLight(0xc2d8ff,1.6);rim.position.set(45,55,-80);scene.add(rim);
  const camera=new T.PerspectiveCamera(55,1,.6,1900),ship=new T.Group();ship.name='SpaceJet';
  const jet=template.clone(true);jet.rotation.y=Math.PI;ship.add(jet);scene.add(ship);
  const owned=new Set();
  const own=asset=>(owned.add(asset),asset);
  const mesh=(geometry,material)=>new T.Mesh(geometry,material);
  const material=(color,emissive=0)=>own(new T.MeshStandardMaterial({color,emissive,roughness:.65,metalness:.25}));
  const glow=(color,opacity=1)=>own(new T.MeshBasicMaterial({color,opacity,transparent:opacity<1,depthWrite:opacity===1,blending:opacity<1?T.AdditiveBlending:T.NormalBlending}));
  const sphere=own(new T.SphereGeometry(1,10,7));
  const drive=mesh(sphere,glow(0x777dff,.76));drive.position.set(0,0,7.7);ship.add(drive);
  const rockMaterial=material(0x777181,0x09070c),cometMaterial=material(0x88b7d7,0x214b7a),tail=glow(0x60caff,.24),tailCore=glow(0x93e7ff,.46);
  const starCore=glow(0xffd184),starHalo=glow(0xff842b,.28);
  const alienShell=material(0x5d648a,0x111328),alienLight=glow(0xf785ff),alienGlass=material(0x7273ce,0x361b65);
  const laser=glow(0x75eaff),enemyLaser=glow(0xff6dc1),burst=glow(0xff9f79,.56);
  const boltsGeometry=own(new T.BoxGeometry(.26,.26,5.5));
  const tailGeometry=own(new T.ConeGeometry(1,1,12,1,true));
  const saucer=own(new T.CylinderGeometry(.71,1,.24,6));
  const wing=own(new T.OctahedronGeometry(1));
  const rocks=Array.from({length:4},()=>{
   const g=own(new T.IcosahedronGeometry(1,1)),p=g.attributes.position;
   for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),size=.86+.20*Math.sin(x*9+y*4+z*7)+.11*Math.cos(z*8-y*11);
    p.setXYZ(i,x*size,y*size,z*size);
   }
   g.computeVertexNormals();return g;
  });
  const starData=new Float32Array(720*3),starColors=new Float32Array(starData.length);
  for(let i=0;i<starData.length;i+=3){
   starData[i]=range(-820,820);starData[i+1]=range(-510,510);starData[i+2]=range(-1430,-45);
   const light=range(.27,.92);starColors.set([light*.83,light*.92,light],i);
  }
  const starGeometry=own(new T.BufferGeometry());starGeometry.setAttribute('position',new T.BufferAttribute(starData,3));starGeometry.setAttribute('color',new T.BufferAttribute(starColors,3));
  const stars=new T.Points(starGeometry,own(new T.PointsMaterial({size:1.65,sizeAttenuation:false,vertexColors:true,depthWrite:false})));
  stars.name='Starfield';stars.frustumCulled=false;scene.add(stars);

  const threats=[],shots=[],particles=[],previousShip=new T.Vector3(),look=new T.Vector3(),aim=new T.Vector3();
  let time=0,hull=MAX_HULL,kills=0,dodged=0,status='flying',hitDelay=0,fireDelay=0,rockDelay=.75,alienDelay=1.55,wave=0;
  let speed=135,disposed=false;
  function hazard(){
   const pattern=wave++%5,comet=pattern===1||pattern===3,star=pattern===4;
   const kind=star?'star':comet?'comet':'rock',size=comet?range(4.5,7):range(6,11);
   const model=new T.Group();model.name=star?'StarCore':comet?'Comet':'Asteroid';
   const core=star?mesh(sphere,starCore):mesh(rocks[Math.floor(random()*rocks.length)],comet?cometMaterial:rockMaterial);
   core.scale.set(size,star?size:size*.84,star?size:size*1.13);model.add(core);
   if(star){const halo=mesh(sphere,starHalo);halo.scale.setScalar(size*1.55);model.add(halo);}
   if(comet){
    for(const [mat,width,length] of [[tail,size*.98,size*9],[tailCore,size*.46,size*6]]){
     const trail=mesh(tailGeometry,mat);trail.scale.set(width,length,width);trail.rotation.x=-Math.PI/2;
     trail.position.z=-length*.5;model.add(trail);
    }
   }
   const centre=wave%4!==0;
   model.position.set(clamp((centre?ship.position.x:0)+range(-34,34),-53,53),clamp((centre?ship.position.y:0)+range(-24,24),-27,27),-560);
   scene.add(model);
   threats.push({kind,model,core,previous:model.position.clone(),radius:size*.90,drift:range(-9,9),spin:range(-.8,.8)});
  }
  function alien(){
   const model=new T.Group();model.name='AlienShip';
   const hull=mesh(saucer,alienShell);hull.scale.set(9,8,6);hull.rotation.y=Math.PI/6;model.add(hull);
   const dome=mesh(sphere,alienGlass);dome.scale.set(3.4,1.9,2.8);dome.position.y=1.25;model.add(dome);
   for(const side of [-1,1]){
    const panel=mesh(wing,alienShell);panel.position.set(side*6.3,.15,-.5);panel.scale.set(6.3,.65,3.8);panel.rotation.z=side*.27;model.add(panel);
    const lamp=mesh(sphere,alienLight);lamp.position.set(side*5.6,-.2,3.5);lamp.scale.set(1.65,.36,.42);model.add(lamp);
   }
   const lane=clamp(ship.position.x+range(-31,31),-42,42),level=clamp(ship.position.y+range(-19,19),-23,23);
   model.position.set(lane,level,-510);scene.add(model);
   threats.push({kind:'alien',model,previous:model.position.clone(),radius:8.6,life:2,lane,level,phase:range(0,Math.PI*2),shotDelay:range(1.2,2.4)});
  }
  function projectile(start,velocity,hostile){
   const model=mesh(boltsGeometry,hostile?enemyLaser:laser);model.position.copy(start);
   model.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),velocity.clone().normalize());scene.add(model);
   shots.push({model,velocity,hostile,remaining:hostile?3.8:1.65,previous:start.clone()});
  }
  function effect(at,big){
   if(particles.length>=20)return;
   const model=mesh(sphere,burst);model.position.copy(at);model.scale.setScalar(big?4.6:1.8);scene.add(model);
   particles.push({model,remaining:big?.36:.18});
  }
  function remove(list,i){scene.remove(list[i].model);list.splice(i,1);}
  function damage(){
   if(hitDelay>0)return;
   hull--;hitDelay=1.05;effect(ship.position,true);signal('damage');
   if(!hull)status='lost';
  }
  function update(dt,input={}){
   if(status!=='flying'||disposed)return;
   dt=clamp(dt,0,.05);if(!dt)return;
   time+=dt;hitDelay=Math.max(0,hitDelay-dt);fireDelay-=dt;rockDelay-=dt;alienDelay-=dt;
   const roll=clamp(input.roll||0,-1,1),pitch=clamp(input.pitch||0,-1,1),throttle=clamp(input.throttle??.75,0,1);
   previousShip.copy(ship.position);speed=95+85*throttle+(input.boost?45:0);
   ship.position.x=clamp(ship.position.x+roll*66*dt,-54,54);ship.position.y=clamp(ship.position.y+pitch*46*dt,-29,29);
   ship.rotation.z+=(roll*-.39-ship.rotation.z)*Math.min(1,dt*8);ship.rotation.x+=(pitch*.16-ship.rotation.x)*Math.min(1,dt*8);
   drive.scale.set(.65,.6,(input.boost?2.1:1.1)+.35*Math.sin(time*22));
   drive.position.z=7.7+drive.scale.z*.40;
   jet.visible=hitDelay===0||Math.floor(hitDelay*18)%2===0;
   for(let i=2;i<starData.length;i+=3){starData[i]+=speed*.55*dt;if(starData[i]>-45)starData[i]-=1385;}
   starGeometry.attributes.position.needsUpdate=true;
   if(rockDelay<=0){if(threats.length<16)hazard();rockDelay=range(.85,1.45);}
   if(alienDelay<=0){if(threats.filter(t=>t.kind==='alien').length<3)alien();alienDelay=range(2,3.6);}
   if(input.fire&&fireDelay<=0){
    fireDelay=.14;
    for(const side of [-1,1])projectile(ship.position.clone().add(new T.Vector3(side*1.9,.18,-7)),new T.Vector3(0,0,-660),false);
    signal('fire');
   }
   for(let i=threats.length-1;i>=0;i--){
    const t=threats[i],p=t.model.position;t.previous.copy(p);
    if(t.kind==='alien'){
     p.z+=(speed*.57+30)*dt;p.x=t.lane+Math.sin(time*1.85+t.phase)*11;p.y=t.level+Math.sin(time*1.15+t.phase)*6;
     t.model.rotation.z=Math.cos(time*1.85+t.phase)*.23;
     t.shotDelay-=dt;
     if(p.z>-360&&p.z<-75&&t.shotDelay<=0){
      const velocity=ship.position.clone().sub(p).normalize().multiplyScalar(225+speed*.28);
      projectile(p.clone().addScaledVector(velocity,4/velocity.length()),velocity,true);t.shotDelay=range(1.3,2.7);
     }
    }else{
     p.z+=(speed+(t.kind==='comet'?70:0))*dt;p.x+=t.drift*dt;t.core.rotation.x+=t.spin*dt;t.core.rotation.y+=.68*dt;
     if(t.kind==='star')t.model.children[1].scale.setScalar(t.radius*(1.68+.1*Math.sin(time*5+t.spin)));
    }
    if(segmentHits(previousShip,ship.position,t.previous,p,t.radius+1.7)){damage();remove(threats,i);}
    else if(p.z>22){if(t.kind!=='alien')dodged++;remove(threats,i);}
   }
   for(let i=shots.length-1;i>=0;i--){
    const shot=shots[i],p=shot.model.position;shot.previous.copy(p);p.addScaledVector(shot.velocity,dt);shot.remaining-=dt;
    if(shot.remaining<=0||p.z>35){remove(shots,i);continue;}
    if(shot.hostile){if(segmentHits(shot.previous,p,previousShip,ship.position,2.5)){damage();remove(shots,i);}continue;}
    for(let j=threats.length-1;j>=0;j--){
     const t=threats[j];if(!segmentHits(shot.previous,p,t.previous,t.model.position,t.radius))continue;
     if(t.kind==='alien'){
      t.life--;effect(p,t.life===0);
      if(!t.life){kills++;signal('kill');remove(threats,j);}
     }
     remove(shots,i);break;
    }
   }
   for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.remaining-=dt;p.model.scale.multiplyScalar(1+dt*2);if(p.remaining<=0)remove(particles,i);}
   if(kills>=GOAL&&hull>0)status='won';
  }
  function view(aspect){
   if(camera.aspect!==aspect){camera.aspect=aspect;camera.updateProjectionMatrix();}
   camera.position.set(ship.position.x*.42,ship.position.y*.38+13,62);
   camera.lookAt(look.set(ship.position.x*.55,ship.position.y*.54,-146));camera.updateMatrixWorld(true);
   aim.set(ship.position.x,ship.position.y+.18,-220).project(camera);
   return {x:(1+aim.x)*.5,y:(1-aim.y)*.5};
  }
  return {scene,camera,update,view,get status(){return status;},get hull(){return hull;},get kills(){return kills;},get dodged(){return dodged;},get time(){return time;},
   dispose(){if(disposed)return;disposed=true;scene.clear();for(const asset of owned)asset.dispose();threats.length=shots.length=particles.length=0;}};
 }
 const api={GOAL,MAX_HULL,create,segmentHits};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SecretSpace=api;
})(typeof globalThis==='undefined'?window:globalThis);
