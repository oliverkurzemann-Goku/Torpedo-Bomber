/* Small shared parachute sequence for both campaigns. Coordinates are metres, Y up. */
(function(root){
 'use strict';
 function create(THREE,scene,start,heading,speed,groundAt,options={}){
  const group=new THREE.Group();group.name='pilotParachute';
  const cloth=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,side:THREE.DoubleSide,vertexColors:true});
  const line=new THREE.MeshBasicMaterial({color:0xddd3b3});
  const canopyGeo=new THREE.SphereGeometry(3.1,32,12,0,Math.PI*2,0,Math.PI/2),fabric=[];
  for(let i=0;i<canopyGeo.attributes.uv.count;i++){
   const u=canopyGeo.attributes.uv.getX(i),v=canopyGeo.attributes.uv.getY(i),panel=Math.floor(u*16)%2;
   const c=new THREE.Color(panel?0xdedbd1:0xf0eee4);c.multiplyScalar(.94+v*.06);fabric.push(c.r,c.g,c.b);
  }
  canopyGeo.setAttribute('color',new THREE.Float32BufferAttribute(fabric,3));
  const canopy=new THREE.Mesh(canopyGeo,cloth);
  canopy.position.y=4.4;canopy.visible=false;group.add(canopy);
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4,p=new THREE.Vector3(Math.cos(a)*3.05,4.4,Math.sin(a)*3.05);
   const dir=p.clone().sub(new THREE.Vector3(0,.5,0));
   const cord=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,dir.length(),3),line);
   cord.position.copy(p).add(new THREE.Vector3(0,.5,0)).multiplyScalar(.5);
   cord.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
   cord.visible=false;group.add(cord);
  }
  const visuals=root.CrewVisuals||(typeof require==='function'?require('./crew-visuals.js'):null);
  const pilot=visuals.create(THREE,{service:options.service||'usaaf',variant:options.variant||0,pose:'chute',srgbOutput:options.srgbOutput});
  pilot.position.y=-.9;group.add(pilot);
  group.rotation.y=heading;
  group.position.copy(start);scene.add(group);
  const velocity=new THREE.Vector3(Math.sin(heading)*Math.min(speed,190)*.18,0,
    Math.cos(heading)*Math.min(speed,190)*.18);
  let elapsed=0,fall=0,deployed=false,landed=false,yaw=heading,yawRate=0;
  return {
   group, get position(){return group.position;},get deployed(){return deployed;},get heading(){return yaw;},
   settle(water=false){
    for(const child of group.children)if(child.material===line)child.visible=false;
    canopy.scale.set(.5,.07,.34);canopy.position.set(2.2,-.65,-1.4);group.rotation.set(0,yaw,0);
    if(water){
     canopy.visible=false;pilot.position.y=-.3;
     const raft=new THREE.Mesh(new THREE.TorusGeometry(1.15,.23,8,24),new THREE.MeshStandardMaterial({color:0xbfa24d,roughness:.88}));
     raft.name='pilotDinghy';raft.rotation.x=Math.PI/2;raft.position.y=-.5;raft.scale.y=1.35;group.add(raft);
    }
   },
   update(dt,wind=0,controls=null){
    if(landed)return {landed:true,safe:deployed};
    elapsed+=dt;
    const ground=groundAt(group.position.x,group.position.z);
    if(!deployed&&elapsed>.8&&group.position.y-ground>38){
     deployed=true;canopy.visible=true;
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
 }
 root.PilotBailout={create};
 if(typeof module==='object'&&module.exports)module.exports=root.PilotBailout;
})(typeof window!=='undefined'?window:globalThis);
