/* Enemy and wingman crews survive high-altitude losses independently of scoring.
 * Distant crews use a small silhouette; detailed figures appear within 220m. */
(function(root){
 'use strict';
 function create(THREE,scene,groundAt,{waterAt=()=>false,srgbOutput=false,bounds=null}={}){
  const crews=[],seen=new WeakSet(),limit=80;
  function spawn(aircraft,kind,service){
   if(seen.has(aircraft))return 0;seen.add(aircraft);
   if(aircraft.pos.y-groundAt(aircraft.pos.x,aircraft.pos.z)<85)return 0;
   const number=kind==='b17'||kind==='b24'?10:kind==='avenger'?3:kind==='sbd'?2:1;
   let created=0;
   for(let i=0;i<number&&crews.length<limit;i++){
    const start=aircraft.pos.clone().add(new THREE.Vector3((i%3-1)*2.7,-Math.floor(i/3)*2.2,Math.floor(i/3)*-3));
    const chute=root.PilotBailout.create(THREE,scene,start,aircraft.heading||0,aircraft.spd||90,groundAt,{service,variant:i,srgbOutput});
    const silhouette=new THREE.Mesh(new THREE.BoxGeometry(.45,1.5,.28),new THREE.MeshLambertMaterial({color:service==='luftwaffe'?0x56616c:0x7a7257}));
    silhouette.name='distantPilot';silhouette.position.y=-.12;silhouette.visible=false;chute.group.add(silhouette);
    crews.push({chute,silhouette,source:aircraft.mesh||aircraft.group,offset:new THREE.Vector3((i%3-1)*1.4,-1,(i%2)*1.2),delay:i*.28,waiting:i>0,settled:false,age:0});created++;
   }
   return created;
  }
  return {spawn,
   update(dt,camera=null,wind=0){
    for(let i=crews.length-1;i>=0;i--){const c=crews[i];
     if(c.delay>0){c.delay-=dt;c.chute.group.visible=false;continue;}
     if(c.waiting){if(c.source?.parent)c.chute.position.copy(c.source.position).add(c.offset);c.waiting=false;}c.chute.group.visible=true;
     if(!c.settled){const result=c.chute.update(dt,wind,bounds?{bounds}:null);if(result.landed){c.settled=true;c.safe=result.safe;if(c.safe)c.chute.settle(waterAt(c.chute.position.x,c.chute.position.z));}}
     else c.age+=dt;
     const d=camera?camera.position.distanceToSquared(c.chute.position):0;
     const pilot=c.chute.group.getObjectByName('pilot');if(pilot)pilot.visible=d<220*220;
     c.silhouette.visible=d>=220*220;
     for(const child of c.chute.group.children)if(child.geometry?.type==='CylinderGeometry')child.visible=c.chute.deployed&&!c.settled&&d<600*600;
     if(c.settled&&c.age>18){c.chute.dispose();crews.splice(i,1);}
    }
   },
   clear(){for(const c of crews)c.chute.dispose();crews.length=0;},
   get count(){return crews.length;},get deployed(){return crews.filter(c=>c.chute.deployed).length;},get entries(){return crews;}
  };
 }
 root.EnemyBailouts={create};if(typeof module==='object'&&module.exports)module.exports=root.EnemyBailouts;
})(typeof window==='undefined'?globalThis:window);
