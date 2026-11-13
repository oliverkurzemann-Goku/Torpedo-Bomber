/* Small shared parachute sequence for both campaigns. Coordinates are metres, Y up. */
(function(root){
 'use strict';
 function create(THREE,scene,start,heading,speed,groundAt,options={}){
  const group=new THREE.Group();group.name='pilotParachute';
  const figures=root.CrewFigures||(typeof require==='function'?require('./crew-figures.js'):null);
  const pilot=figures.create(THREE,{service:options.service,variant:options.variant,srgbOutput:options.srgbOutput});
  const cloth=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,side:THREE.DoubleSide,vertexColors:true});
  const line=new THREE.MeshBasicMaterial({color:0xddd3b3});
  const canopyGeo=new THREE.SphereGeometry(3.1,32,12,0,Math.PI*2,0,Math.PI/2),fabric=[];
  const colors=figures.canopyColors(options.service).map(value=>new THREE.Color(value));
  if(options.srgbOutput)for(const color of colors)color.convertSRGBToLinear();
  const tint=new THREE.Color();
  for(let i=0;i<canopyGeo.attributes.uv.count;i++){
   const u=canopyGeo.attributes.uv.getX(i),v=canopyGeo.attributes.uv.getY(i),panel=Math.floor(u*16)%2;
   tint.copy(colors[panel]).multiplyScalar(.93+v*.07);fabric.push(tint.r,tint.g,tint.b);
  }
  canopyGeo.setAttribute('color',new THREE.Float32BufferAttribute(fabric,3));
  const canopy=new THREE.Mesh(canopyGeo,cloth);
  canopy.position.y=4.4;canopy.visible=false;group.add(canopy);
  pilot.position.y=-.9;group.add(pilot);
  figures.pose(pilot,'chute');
  const grips=pilot.userData.hands.map(hand=>hand.getWorldPosition(new THREE.Vector3()));
  figures.pose(pilot,'stand');
  for(let i=0;i<12;i++){
   const a=(i+.5)*Math.PI/6,p=new THREE.Vector3(Math.cos(a)*3.1,4.4,Math.sin(a)*3.1);
   const grip=grips[p.x<0?0:1],dir=p.clone().sub(grip);
   const cord=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,dir.length(),3),line);
   cord.position.copy(p).add(grip).multiplyScalar(.5);
   cord.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
   cord.visible=false;group.add(cord);
  }
  group.rotation.y=heading;
  group.position.copy(start);scene.add(group);
  const velocity=new THREE.Vector3(Math.sin(heading)*Math.min(speed,190)*.18,0,
    Math.cos(heading)*Math.min(speed,190)*.18);
  let elapsed=0,fall=0,deployed=false,landed=!!options.landed,yaw=heading,yawRate=0;
  let settled=false;
  const sequence={
   group, get position(){return group.position;},get deployed(){return deployed;},get heading(){return yaw;},
   settle(water=false){
    if(settled)return;settled=true;
    figures.pose(pilot,water?'float':'stand');
    for(const child of group.children)if(child.material===line)child.visible=false;
    canopy.scale.set(.5,.07,.34);canopy.position.set(2.2,-.65,-1.4);group.rotation.set(0,yaw,0);
    if(water){
     canopy.visible=false;pilot.position.y=-.85;
     const raft=new THREE.Mesh(new THREE.TorusGeometry(1.15,.23,8,24),new THREE.MeshStandardMaterial({color:0xbfa24d,roughness:.88}));
     raft.name='pilotDinghy';raft.rotation.x=Math.PI/2;raft.position.y=-.5;raft.scale.y=1.35;group.add(raft);
    }
   },
   update(dt,wind=0,controls=null){
    if(landed)return {landed:true,safe:deployed||!!options.landed};
    elapsed+=dt;
    const ground=groundAt(group.position.x,group.position.z);
    if(!deployed&&elapsed>.8&&group.position.y-ground>38){
     deployed=true;canopy.visible=true;
     figures.pose(pilot,'chute');
     for(const child of group.children)if(child.material===line)child.visible=true;
    }
    if(deployed)fall+=(5.5-fall)*Math.min(1,dt*1.8);
    else fall=Math.min(55,fall+9.81*dt);
    let glide=0;
    if(deployed&&controls){
     const turn=Math.max(-1,Math.min(1,controls.turn||0)),forward=Math.max(-1,Math.min(1,controls.forward||0));
     yawRate+=(turn*.24-yawRate)*(1-Math.exp(-dt*4));yaw+=yawRate*dt;
     glide=2.2*(1+forward*.65); // limited drift for the round canopy, not aircraft manoeuvres
     group.rotation.y=yaw;group.rotation.z+=(-turn*.14-group.rotation.z)*(1-Math.exp(-dt*3));
     group.rotation.x+=(forward*.06-group.rotation.x)*(1-Math.exp(-dt*3));
    }
    velocity.x+=(wind*.65+Math.sin(yaw)*glide-velocity.x)*Math.min(1,dt*(deployed?.9:.12));
    velocity.z+=(Math.cos(yaw)*glide-velocity.z)*Math.min(1,dt*(deployed?.9:.12));
    group.position.addScaledVector(velocity,dt);group.position.y-=fall*dt;
    if(controls?.bounds){
     const b=controls.bounds;group.position.x=Math.max(b.minX,Math.min(b.maxX,group.position.x));
     group.position.z=Math.max(b.minZ,Math.min(b.maxZ,group.position.z));
    }
    const floor=groundAt(group.position.x,group.position.z);
    if(group.position.y<=floor+.9){group.position.y=floor+.9;landed=true;}
    return {landed,safe:landed&&deployed};
   },
   dispose(){scene.remove(group);const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}

  };
  if(options.landed)sequence.settle(true);
  return sequence;
 }
 root.PilotBailout={create};
 if(typeof module==='object'&&module.exports)module.exports=root.PilotBailout;
})(typeof window!=='undefined'?window:globalThis);
