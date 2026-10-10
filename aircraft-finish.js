/* Baked sky reflections, shared by German skins. No live scene capture or extra lights. */
(function(root){
 'use strict';
 function create(THREE,renderer){
  let target=null;const materials=new Set();
  function environment(){
   if(target)return target.texture;
   const faces=[];
   for(let i=0;i<6;i++){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d');
    const sky=c.createLinearGradient(0,0,0,64);sky.addColorStop(0,'#b4c7dc');sky.addColorStop(.47,'#819bb1');sky.addColorStop(.56,'#6b7561');sky.addColorStop(1,'#303c30');c.fillStyle=sky;c.fillRect(0,0,64,64);
    if(i===2){c.fillStyle='#aabfd3';c.fillRect(0,0,64,64);}
    if(i===3){c.fillStyle='#394835';c.fillRect(0,0,64,64);}
    if(i===0||i===2){const glow=c.createRadialGradient(17,15,0,17,15,17);glow.addColorStop(0,'rgba(255,244,217,.95)');glow.addColorStop(.25,'rgba(238,239,221,.45)');glow.addColorStop(1,'rgba(238,239,221,0)');c.fillStyle=glow;c.fillRect(0,0,64,64);}
    faces.push(canvas);
   }
   const cube=new THREE.CubeTexture(faces);cube.encoding=THREE.sRGBEncoding;cube.needsUpdate=true;
   const generator=new THREE.PMREMGenerator(renderer);target=generator.fromCubemap(cube);generator.dispose();cube.dispose();return target.texture;
  }
  function decorate(src,kind){
   if(!['bf109','me262'].includes(kind))return;
   const env=environment(),clones=new Map();
   src.traverse(o=>{if(!o.isMesh)return;const array=Array.isArray(o.material),mats=(array?o.material:[o.material]).map(m=>{
    if(!m||!m.color)return m;if(clones.has(m))return clones.get(m);
    const glass=m.transparent&&m.opacity<.9;
    const n=m.clone();n.envMap=env;n.envMapIntensity=glass?.72:.75;
    if(glass){n.color.setHex(0xa6bdcb);n.roughness=.12;n.metalness=.12;}
    else{
     n.color.multiplyScalar(kind==='me262'?1.32:1.24);
     n.roughness=kind==='me262'?.34:.39;n.metalness=kind==='me262'?.28:.18;
     // A tiny textured bounce preserves camouflage, panel lines and night shadows.
     n.emissive.copy(n.color);n.emissiveMap=n.map;n.emissiveIntensity=.035;
     n.aoMapIntensity=.46;
    }
    n.userData.aircraftFinish=kind;n.needsUpdate=true;materials.add(n);clones.set(m,n);return n;
   });o.material=array?mats:mats[0];});
  }
  return {decorate,setNight(night){for(const m of materials)m.envMapIntensity=night?.075:(m.transparent?.72:.75);},get materials(){return materials;},dispose(){target?.dispose();materials.clear();}};
 }
 root.AircraftFinish={create};if(typeof module==='object'&&module.exports)module.exports=root.AircraftFinish;
})(typeof window==='undefined'?globalThis:window);
