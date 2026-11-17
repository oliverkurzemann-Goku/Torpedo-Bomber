// Build 284: Pacific Ultra, step 2 - the land and everything on the water get the sea's weather.
//  * Cloud shadows: the same drifting cloud pattern that darkens the Ultra sea (same noise, same wind, same strength
//    uniform) now takes the direct sunlight off Okinawa, its trees and houses, the ships, the carriers and the aircraft,
//    so a shadow runs from the water up the beach without a seam.
//  * Okinawa relief: a baked 1024 x 1024 map (15.6 m per texel over the 16 x 16 km island) carries per-pixel terrain
//    normals (R/G), the sun's visibility over the hills (B: ridges shade the valleys behind them, re-baked when the sun
//    of the sortie changes) and a valley/hollow occlusion (A) that dims the sky light in gullies.
//  * Near the camera the ground gets a soft mottled detail so low passes do not look like a stretched map.
// Everything is injected with onBeforeCompile into existing lit materials only while Ultra is on; switching Ultra
// off restores each material's own hook, so the standard path compiles exactly the shaders it had before.
(function(root){
 'use strict';
 const SIZE=1024,EXTENT=16000,HALF=8000;
 const NOISE=`
float pacHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float pacNoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(pacHash(i),pacHash(i+vec2(1.0,0.0)),f.x),mix(pacHash(i+vec2(0.0,1.0)),pacHash(i+vec2(1.0,1.0)),f.x),f.y);}
float pacCloudLight(vec3 w){
 if(uPacCloud<=0.0)return 1.0;
 float c=pacNoise(w.xz/720.0+uPacWind*uPacTime*0.0045)*0.65+pacNoise(w.xz/260.0-uPacWind.yx*uPacTime*0.006)*0.35;
 return 1.0-min(0.85,uPacCloud*1.25)*smoothstep(0.47,0.63,c);
}`;
 function inject(shader,uniforms,relief){
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying vec3 vPacWorld;'+(relief?'\nvarying vec2 vPacLocal;':''))
   .replace('#include <project_vertex>','#include <project_vertex>\n{vec4 pacW=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\npacW=instanceMatrix*pacW;\n#endif\nvPacWorld=(modelMatrix*pacW).xyz;'+(relief?'vPacLocal=transformed.xz;':'')+'}');
  let frag=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vPacWorld;\nuniform float uPacTime,uPacCloud;\nuniform vec2 uPacWind;'
   +(relief?'\nvarying vec2 vPacLocal;\nuniform sampler2D uPacRelief;\nuniform float uPacReliefOn;':'')+NOISE);
  if(relief){
   frag=frag.replace('#include <map_fragment>','#include <map_fragment>\n{float pacD=1.0-smoothstep(150.0,900.0,distance(cameraPosition,vPacWorld));\n'
    +' float pacM=pacNoise(vPacWorld.xz*0.31)*0.6+pacNoise(vPacWorld.xz*0.083)*0.4;\n diffuseColor.rgb*=1.0+(pacM-0.5)*0.22*pacD;}')
    .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nvec4 pacR=texture2D(uPacRelief,(vPacLocal+'+HALF.toFixed(1)+')/'+EXTENT.toFixed(1)+');\n'
    +'if(uPacReliefOn>0.5){vec2 pacXZ=pacR.rg*2.0-1.0;vec3 pacN=vec3(pacXZ.x,sqrt(max(0.0,1.0-dot(pacXZ,pacXZ))),pacXZ.y);normal=normalize((viewMatrix*vec4(pacN,0.0)).xyz);}');
  }
  frag=frag.replace('#include <aomap_fragment>','{float pacC=pacCloudLight(vPacWorld);'
   +(relief?'if(uPacReliefOn>0.5){pacC*=mix(0.18,1.0,pacR.b);reflectedLight.indirectDiffuse*=mix(1.0,pacR.a,0.85);}':'')
   +'reflectedLight.directDiffuse*=pacC;reflectedLight.directSpecular*=pacC;}\n#include <aomap_fragment>');
  shader.fragmentShader=frag;
 }
 function create(THREE,{time,wind,cloud}){
  const uniforms={uPacTime:time,uPacWind:wind,uPacCloud:cloud,uPacRelief:{value:null},uPacReliefOn:{value:0}};
  const patched=new Set();let reliefMaterials=new Set(),bakeJob=null,bakedSun=null,enabled=false;
  const baseKey=THREE.Material.prototype.customProgramCacheKey;
  function lit(m){return m&&!m.isShaderMaterial&&!m.isRawShaderMaterial&&(m.isMeshStandardMaterial||m.isMeshPhongMaterial||m.isMeshLambertMaterial);}
  function patch(m,relief=false){
   if(!lit(m)||m.userData.pacUltra)return false;
   const prev=m.onBeforeCompile,prevKey=m.customProgramCacheKey,own=Object.prototype.hasOwnProperty;
   const keyOf=prevKey===baseKey?()=>String(prev):()=>prevKey.call(m);
   m.userData.pacUltra={prev,prevKey,hadHook:own.call(m,'onBeforeCompile'),hadKey:own.call(m,'customProgramCacheKey'),relief};
   m.onBeforeCompile=function(s,r){if(prev)prev.call(this,s,r);inject(s,uniforms,relief);};
   m.customProgramCacheKey=function(){return keyOf()+'|pacUltra284'+(relief?'R':'');};
   m.needsUpdate=true;patched.add(m);if(relief)reliefMaterials.add(m);return true;
  }
  function unpatch(m){
   const u=m.userData.pacUltra;if(!u)return;
   if(u.hadHook)m.onBeforeCompile=u.prev;else delete m.onBeforeCompile;
   if(u.hadKey)m.customProgramCacheKey=u.prevKey;else delete m.customProgramCacheKey;
   delete m.userData.pacUltra;m.needsUpdate=true;
  }
  // Patch every lit material under a root (cheap when nothing is new: a flag per material).
  function sweep(rootObject){
   if(!enabled||!rootObject)return 0;let n=0;
   rootObject.traverse(o=>{const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)if(m&&!m.userData.pacUltra&&patch(m,!!o.userData.pacRelief))n++;});
   return n;
  }
  function setEnabled(on,scene){
   on=!!on;if(on===enabled)return;enabled=on;
   if(!on){for(const m of patched)unpatch(m);patched.clear();reliefMaterials.clear();uniforms.uPacReliefOn.value=0;}
   else if(scene)sweep(scene);
  }
  // Mark the terrain meshes so the sweep gives them the relief variant.
  function markTerrain(world){world?.terrain?.traverse(o=>{if(o.isMesh)o.userData.pacRelief=true;});}
  const pause=()=>new Promise(r=>setTimeout(r,0));
  async function bake(world,sun){
   const t0=performance.now(),N=SIZE,step=EXTENT/N,H=new Float32Array(N*N);
   let slice=performance.now();
   const breathe=async()=>{if(performance.now()-slice>12){await pause();slice=performance.now();}};
   for(let j=0;j<N;j++){const z=-HALF+(j+.5)*step;for(let i=0;i<N;i++)H[j*N+i]=world.getHeight(-HALF+(i+.5)*step,z);await breathe();}
   // Summed-area table for the hollow occlusion (mean height in a 9 x 9 texel window, ~140 m).
   const S=new Float64Array((N+1)*(N+1));
   for(let j=0;j<N;j++){let row=0;for(let i=0;i<N;i++){row+=H[j*N+i];S[(j+1)*(N+1)+i+1]=S[j*(N+1)+i+1]+row;}}
   const data=new Uint8Array(N*N*4),sx=sun.x,sz=sun.z,flat=Math.hypot(sx,sz),tanSun=sun.y/Math.max(1e-4,flat),dx=flat>1e-4?sx/flat:0,dz=flat>1e-4?sz/flat:0;
   const at=(i,j)=>H[Math.min(N-1,Math.max(0,j))*N+Math.min(N-1,Math.max(0,i))];
   let lit=0,land=0;
   for(let j=0;j<N;j++){
    for(let i=0;i<N;i++){
     const k=j*N+i,h=H[k];
     let nx=(at(i-1,j)-at(i+1,j))/(2*step),nz=(at(i,j-1)-at(i,j+1))/(2*step);const len=Math.hypot(nx,1,nz);nx/=len;nz/=len;
     let vis=1;
     if(h>0&&sun.y>0.02&&flat>1e-4){
      let maxSlope=-1e9;
      for(let s=1,d=1;d<200;s++,d+=s<12?1:s<40?2:4){const hh=at(Math.round(i+dx*d),Math.round(j+dz*d));const sl=(hh-h)/(d*step);if(sl>maxSlope)maxSlope=sl;}
      vis=Math.min(1,Math.max(0,(tanSun-maxSlope)/0.05+0.5));
     }
     let ao=1;
     if(h>0){const r=4,i0=Math.max(0,i-r),i1=Math.min(N,i+r+1),j0=Math.max(0,j-r),j1=Math.min(N,j+r+1);
      const mean=(S[j1*(N+1)+i1]-S[j0*(N+1)+i1]-S[j1*(N+1)+i0]+S[j0*(N+1)+i0])/((i1-i0)*(j1-j0));
      ao=Math.min(1,Math.max(.5,1-(mean-h)/22));land++;if(vis<.5)lit++;}
     data[k*4]=Math.round((nx*.5+.5)*255);data[k*4+1]=Math.round((nz*.5+.5)*255);data[k*4+2]=Math.round(vis*255);data[k*4+3]=Math.round(ao*255);
    }
    await breathe();
   }
   const tex=new THREE.DataTexture(data,N,N,THREE.RGBAFormat);
   tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
   return {tex,ms:performance.now()-t0,shadedLand:land?lit/land:0};
  }
  // Start a (time-sliced) bake when Ultra is on and the sun of the sortie differs from the baked one.
  function update(world,sun){
   if(!enabled||!world)return null;if(bakeJob)return bakeJob;
   if(bakedSun&&bakedSun.world===world&&Math.abs(bakedSun.x-sun.x)+Math.abs(bakedSun.y-sun.y)+Math.abs(bakedSun.z-sun.z)<.02)return null;
   const target={world,x:sun.x,y:sun.y,z:sun.z};markTerrain(world);
   bakeJob=bake(world,sun).then(r=>{
    const old=uniforms.uPacRelief.value;uniforms.uPacRelief.value=r.tex;uniforms.uPacReliefOn.value=1;old?.dispose();
    bakedSun=target;stats.lastBake=r;return r;
   }).finally(()=>{bakeJob=null;});
   return bakeJob;
  }
  function forget(world){
   if(bakedSun?.world===world){bakedSun=null;uniforms.uPacReliefOn.value=0;}
   world?.root?.traverse(o=>{const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms)if(m){patched.delete(m);reliefMaterials.delete(m);}});
  }
  const stats={lastBake:null};
  return {uniforms,patch,unpatch,sweep,setEnabled,update,forget,markTerrain,stats,
   get enabled(){return enabled;},get patchedCount(){return patched.size;},get baking(){return !!bakeJob;}};
 }
 root.PacificUltraLand={create,SIZE,EXTENT};
})(typeof window!=='undefined'?window:globalThis);
