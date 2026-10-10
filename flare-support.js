/* Three reusable parachute flares and fixed night lighting slots. No shadows. */
(function(root){
 'use strict';
 function create(THREE,scene,groundAt){
  const slots=[];let night=false,remaining=4,time=0;
  const cloth=new THREE.MeshLambertMaterial({color:0xccc5aa,side:THREE.DoubleSide}),ember=new THREE.MeshBasicMaterial({color:0xffdd8d}),canopyGeo=new THREE.SphereGeometry(.8,12,6,0,Math.PI*2,0,Math.PI/2),coreGeo=new THREE.SphereGeometry(.22,8,6);
  for(let i=0;i<3;i++){
   const g=new THREE.Group();g.name='parachuteFlare';const canopy=new THREE.Mesh(canopyGeo,cloth);canopy.position.y=3;g.add(canopy);
   const core=new THREE.Mesh(coreGeo,ember);g.add(core);
   const lineGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.8,3,0),new THREE.Vector3(),new THREE.Vector3(.8,3,0)]);g.add(new THREE.Line(lineGeo,new THREE.LineBasicMaterial({color:0x887f65})));
   const light=new THREE.PointLight(0xffd491,0,1000,1);light.castShadow=false;light.visible=false;scene.add(light);scene.add(g);g.visible=false;slots.push({g,light,core,live:false,velocity:new THREE.Vector3(),life:0});
  }
  return {
   setNight(enabled){night=!!enabled;for(const s of slots)s.light.visible=night;},
   drop(position,direction,speed){
    if(!night||remaining<=0||position.y-groundAt(position.x,position.z)<50)return false;
    let s=slots.find(s=>!s.live);if(!s)s=slots.reduce((a,b)=>a.life<b.life?a:b);
    s.g.position.copy(position);s.g.position.y-=3;s.velocity.copy(direction).multiplyScalar(Math.min(24,speed*.18));s.live=true;s.life=65;s.g.visible=true;s.light.intensity=1.2;remaining--;return true;
   },
   update(dt,wind=0){time+=dt;for(const s of slots){if(!s.live)continue;s.life-=dt;s.velocity.multiplyScalar(Math.exp(-dt*.65));s.g.position.addScaledVector(s.velocity,dt);if(typeof wind==='number')s.g.position.z+=wind*.5*dt;else s.g.position.addScaledVector(wind,dt*.5);s.g.position.y-=2.8*dt;s.g.rotation.z=Math.sin(time*1.3)*.06;s.light.position.copy(s.g.position);
    s.light.intensity=1.2*Math.min(1,s.life/5)*(.94+.06*Math.sin(time*21));s.core.scale.setScalar(1+.15*Math.sin(time*25));
    if(s.life<=0||s.g.position.y<=groundAt(s.g.position.x,s.g.position.z)+2){s.live=false;s.g.visible=false;s.light.intensity=0;}
   }},
   rearm(){remaining=4;},
   clear(){for(const s of slots){s.live=false;s.g.visible=false;s.light.intensity=0;}remaining=4;},
   get remaining(){return remaining;},get active(){return slots.filter(s=>s.live).length;},get night(){return night;},get slots(){return slots;},
   dispose(){this.clear();for(const s of slots){scene.remove(s.g);scene.remove(s.light);s.g.children[2].geometry.dispose();s.g.children[2].material.dispose();}cloth.dispose();ember.dispose();canopyGeo.dispose();coreGeo.dispose();}
  };
 }
 root.FlareSupport={create};if(typeof module==='object'&&module.exports)module.exports=root.FlareSupport;
})(typeof window==='undefined'?globalThis:window);
