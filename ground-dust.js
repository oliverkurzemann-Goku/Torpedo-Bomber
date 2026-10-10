/* Ground-only propwash, twin jet blast and tyre dust. One bounded instanced draw. */
(function(root){
 'use strict';
 function create(THREE,scene,heightAt){
  const limit=192,n=64,pixels=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const u=(x+.5)/n*2-1,v=(y+.5)/n*2-1;
   const density=.62+.18*Math.sin(u*13+Math.sin(v*9))+.12*Math.cos(v*21-u*7);
   const edge=Math.max(0,1-u*u-v*v);
   const i=(y*n+x)*4,shade=.78-v*.13+density*.1;
   pixels[i]=pixels[i+1]=pixels[i+2]=Math.min(255,Math.round(shade*255));
   pixels[i+3]=Math.round(Math.pow(edge,1.7)*density*205);
  }
  const texture=new THREE.DataTexture(pixels,n,n,THREE.RGBAFormat);texture.needsUpdate=true;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
  const geometry=new THREE.PlaneGeometry(1,1),alpha=new Float32Array(limit),size=new Float32Array(limit*2),color=new Float32Array(limit*3);
  const attr=(name,array,itemSize)=>{const a=new THREE.InstancedBufferAttribute(array,itemSize);a.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(name,a);return a;};
  const attrs=[attr('dustAlpha',alpha,1),attr('dustSize',size,2),attr('dustColor',color,3)];
  const uniforms=THREE.UniformsUtils.clone(THREE.UniformsLib.fog);uniforms.densityMap={value:texture};
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,fog:true,
   vertexShader:'attribute float dustAlpha; attribute vec2 dustSize; attribute vec3 dustColor; varying vec2 dustUV; varying float opacity; varying vec3 tint;\n#include <fog_pars_vertex>\nvoid main(){dustUV=uv;opacity=dustAlpha;tint=dustColor;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);mvPosition.xy+=position.xy*dustSize;gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
   fragmentShader:'uniform sampler2D densityMap; varying vec2 dustUV; varying float opacity; varying vec3 tint;\n#include <fog_pars_fragment>\nvoid main(){vec4 d=texture2D(densityMap,dustUV);float a=d.a*opacity;if(a<.005)discard;gl_FragColor=vec4(d.rgb*tint,a);\n#include <fog_fragment>\n}'});
  const mesh=new THREE.InstancedMesh(geometry,material,limit);mesh.name='runwayDust';mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.visible=false;scene.add(mesh);
  const particles=[],free=[],matrix=new THREE.Matrix4(),tint=new THREE.Color();
  let carry=0,allocated=0,lastMode='',emitted=0;const last=new THREE.Vector3();let haveLast=false;
  function emit(p,side,aft,jet,wheel,light,wet){
   if(particles.length>=limit)return;
   let d=free.pop();if(!d){d={pos:new THREE.Vector3(),velocity:new THREE.Vector3()};allocated++;}
   const fX=Math.sin(p.heading),fZ=Math.cos(p.heading),rX=fZ,rZ=-fX,power=p.groundPower||0;
   const spread=wheel?.3:jet?.65:2.6,fan=(Math.random()-.5)*spread;
   d.pos.set(p.pos.x+rX*(side+fan)-fX*aft,0,p.pos.z+rZ*(side+fan)-fZ*aft);
   d.pos.y=heightAt(d.pos.x,d.pos.z)+.75;
   const blast=wheel?2:jet?10+power*15:4+power*7,lateral=(Math.random()-.5)*(jet?2:5);
   d.velocity.set(-fX*blast+rX*lateral,-.05,-fZ*blast+rZ*lateral);
   d.age=0;d.life=wheel?1.6:jet?2.4:3.0;d.width=wheel?1.4:jet?2.8:4.8;
   d.rise=wheel?.45:jet?.55:1.1;d.jet=jet;d.wheel=wheel;d.seed=Math.random()*6.28;
   d.opacity=(wheel?.52:jet?.78:.68)*Math.max(.15,power)*(1-wet*.92);d.light=light;
   particles.push(d);emitted++;
  }
  return {
   trail(p,dt,options={}){
    dt=Math.max(0,Math.min(.05,dt));
    const power=p.groundPower||0,wet=Math.max(0,Math.min(1,options.wetness||0));
    if(!p.alive||!p.onGround||(p.throttle??1)<.12||power<.12||wet>=.95){carry=0;haveLast=false;return;}
    if(haveLast&&last.distanceTo(p.pos)>Math.max(30,(p.spd||0)*dt*4)){carry=0;}
    last.copy(p.pos);haveLast=true;
    const jet=p.ac==='me262'||p.ac==='me163';lastMode=jet?'jet':'prop';
    const rate=(jet?20:15)*power*(1-wet*.8),count=Math.min(3,Math.floor(carry+dt*rate));
    carry=(carry+dt*rate)%1;
    for(let i=0;i<count;i++){
     const light=options.light??1;
     if(jet){for(const side of p.ac==='me163'?[0]:[-2.3,2.3])emit(p,side,4.2,true,false,light,wet);}
     else emit(p,0,5.3,false,false,light,wet);
     if(p.spd>12)for(const side of [-1.7,1.7])emit(p,side,0,jet,true,light,wet);
    }
   },
   update(dt,wind=0){
    dt=Math.max(0,Math.min(.05,dt));
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.age+=dt;
     if(p.age>=p.life){free.push(p);particles.splice(i,1);continue;}
     p.velocity.multiplyScalar(Math.exp(-dt*(p.jet?1.0:1.35)));
     p.pos.addScaledVector(p.velocity,dt);p.pos.x+=wind*.65*dt;
     p.pos.x+=Math.sin(p.seed+p.age*2)*dt*.35;p.pos.z+=Math.cos(p.seed+p.age*2.4)*dt*.35;
     // Follow rising ground; the feathered cloud remains close to the strip.
     p.pos.y=Math.max(p.pos.y+p.rise*dt,heightAt(p.pos.x,p.pos.z)+.4);
    }
    particles.forEach((p,i)=>{const k=p.age/p.life;matrix.makeTranslation(p.pos.x,p.pos.y,p.pos.z);mesh.setMatrixAt(i,matrix);
     size[i*2]=p.width*(1+k*(p.jet?2.1:2.8));size[i*2+1]=p.width*(p.jet?.48:.7)*(1+k*1.6);
     alpha[i]=p.opacity*Math.min(1,p.age/.12)*Math.pow(1-k,1.6);
     tint.setHex(p.wheel?0xc4ad80:0xd7be91).multiplyScalar(p.light).toArray(color,i*3);
    });
    mesh.count=particles.length;mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;attrs.forEach(a=>a.needsUpdate=true);
   },
   clear(){free.push(...particles);particles.length=0;carry=0;haveLast=false;mesh.count=0;mesh.visible=false;emitted=0;},
   get stats(){return {live:particles.length,allocated,limit,mode:lastMode,emitted,draws:mesh.visible?1:0};},
   mesh,particles,
   dispose(){this.clear();scene.remove(mesh);geometry.dispose();material.dispose();texture.dispose();}
  };
 }
 root.GroundDust={create};if(typeof module==='object'&&module.exports)module.exports=root.GroundDust;
})(typeof window==='undefined'?globalThis:window);
