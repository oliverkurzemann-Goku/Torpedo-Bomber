/* Small shared parachute sequence for both campaigns. Coordinates are metres, Y up. */
(function(root){
 'use strict';
 function create(THREE,scene,start,heading,speed,groundAt){
  const group=new THREE.Group();group.name='pilotParachute';
  const cloth=new THREE.MeshStandardMaterial({color:0xc8b792,roughness:1,side:THREE.DoubleSide});
  const suit=new THREE.MeshStandardMaterial({color:0x464b3b,roughness:1});
  const line=new THREE.MeshBasicMaterial({color:0xddd3b3});
  const canopy=new THREE.Mesh(new THREE.SphereGeometry(3.1,16,8,0,Math.PI*2,0,Math.PI/2),cloth);
  canopy.position.y=4.4;canopy.visible=false;group.add(canopy);
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4,p=new THREE.Vector3(Math.cos(a)*3.05,4.4,Math.sin(a)*3.05);
   const dir=p.clone().sub(new THREE.Vector3(0,.5,0));
   const cord=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,dir.length(),3),line);
   cord.position.copy(p).add(new THREE.Vector3(0,.5,0)).multiplyScalar(.5);
   cord.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
   cord.visible=false;group.add(cord);
  }
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.23,.27,.8,8),suit);
  body.position.y=0;group.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),suit);
  head.position.y=.72;group.add(head);
  group.position.copy(start);scene.add(group);
  const velocity=new THREE.Vector3(Math.sin(heading)*Math.min(speed,190)*.18,0,
    Math.cos(heading)*Math.min(speed,190)*.18);
  let elapsed=0,fall=0,deployed=false,landed=false;
  return {
   group, get position(){return group.position;},get deployed(){return deployed;},
   update(dt,wind=0){
    if(landed)return {landed:true,safe:deployed};
    elapsed+=dt;
    const ground=groundAt(group.position.x,group.position.z);
    if(!deployed&&elapsed>.8&&group.position.y-ground>38){
     deployed=true;canopy.visible=true;
     for(const child of group.children)if(child.material===line)child.visible=true;
    }
    if(deployed)fall+=(5.5-fall)*Math.min(1,dt*1.8);
    else fall=Math.min(55,fall+9.81*dt);
    velocity.x+=(wind*.65-velocity.x)*Math.min(1,dt*(deployed?.9:.12));
    velocity.z+=(0-velocity.z)*Math.min(1,dt*(deployed?.9:.12));
    group.position.addScaledVector(velocity,dt);group.position.y-=fall*dt;
    const floor=groundAt(group.position.x,group.position.z);
    if(group.position.y<=floor+.9){group.position.y=floor+.9;landed=true;}
    return {landed,safe:landed&&deployed};
   },
   dispose(){scene.remove(group);group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});}
  };
 }
 root.PilotBailout={create};
 if(typeof module==='object'&&module.exports)module.exports=root.PilotBailout;
})(typeof window!=='undefined'?window:globalThis);
