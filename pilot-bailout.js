/* Small shared parachute sequence for both campaigns. Coordinates are metres, Y up. */
(function(root){
 'use strict';
 function create(THREE,scene,start,heading,speed,groundAt){
  const group=new THREE.Group();group.name='pilotParachute';
  const cloth=new THREE.MeshStandardMaterial({color:0xc8b792,roughness:1,side:THREE.DoubleSide});
  const suit=new THREE.MeshStandardMaterial({color:0x464b3b,roughness:1});
  const boots=new THREE.MeshStandardMaterial({color:0x242821,roughness:1});
  const skin=new THREE.MeshStandardMaterial({color:0xb49473,roughness:1});
  const harness=new THREE.MeshStandardMaterial({color:0xb8a78a,roughness:1});
  const goggles=new THREE.MeshStandardMaterial({color:0x354952,metalness:.12,roughness:.24});
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
  // Recognisable aircrew silhouette at chase-camera distance: jacket, harness,
  // arms with gloves, two separated legs and boots, bare face and leather helmet.
  const pilot=new THREE.Group();pilot.name='pilot';group.add(pilot);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.23,.19,.66,10),suit);
  body.name='flightJacket';body.position.y=.17;pilot.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),skin);
  head.position.y=.68;head.name='face';pilot.add(head);
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.205,12,8,0,Math.PI*2,0,Math.PI*.57),boots);
  helmet.position.y=.74;helmet.name='helmet';pilot.add(helmet);
  const visor=new THREE.Mesh(new THREE.BoxGeometry(.32,.105,.09),goggles);
  visor.position.set(0,.72,.145);visor.name='goggles';pilot.add(visor);
  const pack=new THREE.Mesh(new THREE.BoxGeometry(.43,.46,.20),cloth);
  pack.position.set(0,.20,-.23);pack.name='parachutePack';pilot.add(pack);
  const limb=(name,a,b,r,material)=>{
   const v=new THREE.Vector3().subVectors(b,a);
   const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r*.85,r,v.length(),8),material);
   mesh.name=name;mesh.position.copy(a).add(b).multiplyScalar(.5);
   mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());pilot.add(mesh);
  };
  for(const side of [-1,1]){
   limb(side<0?'leftArm':'rightArm',new THREE.Vector3(side*.23,.41,0),
     new THREE.Vector3(side*.38,-.12,.12),.085,suit);
   const glove=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),boots);
   glove.position.set(side*.38,-.15,.12);pilot.add(glove);
   limb(side<0?'leftLeg':'rightLeg',new THREE.Vector3(side*.11,-.14,0),
     new THREE.Vector3(side*.15,-.68,.04),.11,suit);
   const boot=new THREE.Mesh(new THREE.BoxGeometry(.18,.25,.30),boots);
   boot.name=side<0?'leftBoot':'rightBoot';boot.position.set(side*.15,-.76,.12);pilot.add(boot);
   const strap=new THREE.Mesh(new THREE.BoxGeometry(.045,.65,.045),harness);
   strap.position.set(side*.115,.18,.195);strap.rotation.z=side*.22;pilot.add(strap);
  }
  group.rotation.y=heading;
  group.position.copy(start);scene.add(group);
  const velocity=new THREE.Vector3(Math.sin(heading)*Math.min(speed,190)*.18,0,
    Math.cos(heading)*Math.min(speed,190)*.18);
  let elapsed=0,fall=0,deployed=false,landed=false,yaw=heading,yawRate=0;
  return {
   group, get position(){return group.position;},get deployed(){return deployed;},get heading(){return yaw;},
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
   dispose(){scene.remove(group);group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});}
  };
 }
 root.PilotBailout={create};
 if(typeof module==='object'&&module.exports)module.exports=root.PilotBailout;
})(typeof window!=='undefined'?window:globalThis);
