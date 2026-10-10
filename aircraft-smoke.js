/* Continuous, bounded aircraft trails. One instanced draw, soft turbulent density
 * and shaded grey/oil smoke; never hard black spheres or per-frame materials. */
(function(root){
 'use strict';
 function create(THREE,scene){
  const limit=256,n=96,pixels=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const u=(x+.5)/n*2-1,v=(y+.5)/n*2-1;
   const noise=.53+.18*Math.sin(u*11+Math.sin(v*7))+.12*Math.sin(v*19+u*13)+.08*Math.cos(u*31-v*23);
   const r=Math.hypot(u*(1+.09*Math.sin(v*10)),v*(1+.11*Math.cos(u*9)));
   const a=Math.pow(Math.max(0,1-r*r),1.6)*Math.max(0,noise);
   const i=(y*n+x)*4,shade=Math.max(.35,Math.min(1,.73-v*.19+noise*.14));
   pixels[i]=pixels[i+1]=pixels[i+2]=Math.round(shade*255);pixels[i+3]=Math.round(a*225);
  }
  const texture=new THREE.DataTexture(pixels,n,n,THREE.RGBAFormat);texture.needsUpdate=true;
  texture.magFilter=texture.minFilter=THREE.LinearFilter;
  const geometry=new THREE.PlaneGeometry(1,1),opacity=new Float32Array(limit),sizes=new Float32Array(limit),angles=new Float32Array(limit),colors=new Float32Array(limit*3);
  const attribute=(name,array,size)=>{const a=new THREE.InstancedBufferAttribute(array,size);a.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(name,a);return a;};
  const attributes=[attribute('trailOpacity',opacity,1),attribute('trailSize',sizes,1),attribute('trailAngle',angles,1),attribute('trailColor',colors,3)];
  const uniforms=THREE.UniformsUtils.clone(THREE.UniformsLib.fog);uniforms.cloudMap={value:texture};
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,fog:true,
   vertexShader:'attribute float trailOpacity; attribute float trailSize; attribute float trailAngle; attribute vec3 trailColor; varying vec2 cloudUV; varying float cloudAlpha; varying vec3 cloudColor;\n#include <fog_pars_vertex>\nvoid main(){cloudUV=uv;cloudAlpha=trailOpacity;cloudColor=trailColor;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);float c=cos(trailAngle),s=sin(trailAngle);mvPosition.xy+=mat2(c,-s,s,c)*position.xy*trailSize;gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
   fragmentShader:'uniform sampler2D cloudMap; varying vec2 cloudUV; varying float cloudAlpha; varying vec3 cloudColor;\n#include <fog_pars_fragment>\nvoid main(){vec4 cloud=texture2D(cloudMap,cloudUV);float a=cloud.a*cloudAlpha;if(a<.008)discard;gl_FragColor=vec4(cloudColor*cloud.rgb,a);\n#include <fog_fragment>\n}'});
  const mesh=new THREE.InstancedMesh(geometry,material,limit);mesh.name='aircraftDamageTrail';mesh.frustumCulled=false;mesh.visible=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);
  const particles=[],free=[],emitters=new Map(),matrix=new THREE.Matrix4(),colour=new THREE.Color(),aged=new THREE.Color();let allocated=0,time=0;
  function emit(at,direction,speed,severity,wind,oil){
   if(particles.length>=limit)return;
   let p=free.pop();if(!p){p={pos:new THREE.Vector3(),velocity:new THREE.Vector3()};allocated++;}
   p.pos.copy(at);p.velocity.copy(direction).multiplyScalar(-Math.min(12,speed*.045));if(typeof wind==='number')p.velocity.z+=wind*.65;else p.velocity.addScaledVector(wind,.65);p.velocity.y+=.9+severity*1.6;
   p.age=0;p.life=2.7+severity*.8;p.size=2.2+severity*1.5;p.angle=Math.random()*6.28;p.spin=(Math.random()-.5)*.5;p.seed=Math.random()*6.28;p.severity=severity;p.oil=oil;particles.push(p);
  }
  return {
   damage(key,aircraft,direction,dt,wind=0){
    const engine=aircraft.systemDamage?.engine??1,leak=aircraft.systemDamage?.fuelLeak||0;
    const severity=Math.max(aircraft.hull<50?(50-aircraft.hull)/50+.25:0,1-engine,leak>0?.25:0);
    this.trail(key,aircraft.pos,direction,aircraft.spd,severity,dt,wind,engine>=1&&leak>0);
   },
   trail(key,position,direction,speed,severity,dt,wind=0,oil=false){
    severity=Math.max(0,Math.min(1,severity));
    if(severity<=0){emitters.delete(key);return;}
    let e=emitters.get(key);
    if(!e){if(emitters.size>=24)return;e={pos:position.clone(),seen:time,carry:0};emitters.set(key,e);}
    const distance=e.pos.distanceTo(position);
    // Teleports/restarts cannot draw a plume across the map.
    if(distance>Math.max(100,speed*Math.max(.1,dt)*4)){e.pos.copy(position);e.carry=0;}
    const spacing=2.5,effective=Math.max(e.pos.distanceTo(position),dt*12),count=Math.min(12,Math.floor((e.carry+effective)/spacing));
    for(let i=0;i<count;i++){const at=e.pos.clone().lerp(position,(i+1)/(count||1)).addScaledVector(direction,-2.8);at.y-=.5;emit(at,direction,speed,severity,wind,oil);}
    e.carry=(e.carry+effective)%spacing;e.pos.copy(position);e.seen=time;
   },
   update(dt){
    dt=Math.max(0,Math.min(.1,dt));time+=dt;
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.age+=dt;if(p.age>=p.life){free.push(p);particles.splice(i,1);continue;}
     p.pos.addScaledVector(p.velocity,dt);p.pos.x+=Math.sin(p.seed+p.age*2.4)*dt*.7;p.pos.z+=Math.cos(p.seed+p.age*1.9)*dt*.8;
    }
    for(const [key,e] of emitters)if(time-e.seen>1)emitters.delete(key);
    particles.forEach((p,i)=>{const k=p.age/p.life;matrix.makeTranslation(p.pos.x,p.pos.y,p.pos.z);mesh.setMatrixAt(i,matrix);
     sizes[i]=p.size*(1+k*2.5);angles[i]=p.angle+p.age*p.spin;opacity[i]=Math.min(1,p.age/.08)*Math.pow(1-k,1.25)*(p.oil?.48:.78);
     colour.setHex(p.oil?0x8c9290:0x44423f);aged.setHex(p.oil?0xa4aaa7:0x77766e);colour.lerp(aged,k*.8);colour.toArray(colors,i*3);
    });
    mesh.count=particles.length;mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;for(const a of attributes)a.needsUpdate=true;
   },
   clear(){for(const p of particles)free.push(p);particles.length=0;emitters.clear();mesh.count=0;mesh.visible=false;},
   get count(){return particles.length;},get stats(){return {allocated,live:particles.length,emitters:emitters.size,draws:mesh.visible?1:0};},mesh,
   dispose(){scene.remove(mesh);geometry.dispose();material.dispose();texture.dispose();}
  };
 }
 root.AircraftSmoke={create};if(typeof module==='object'&&module.exports)module.exports=root.AircraftSmoke;
})(typeof window==='undefined'?globalThis:window);
