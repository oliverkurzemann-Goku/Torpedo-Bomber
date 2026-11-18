/* Additional Pacific scenery. All distances and particles here are visual. */
(function(root){
 'use strict';
 function seaGrid(THREE,material){
  const group=new THREE.Group();
  group.name='Pacific Ultra sea cells';
  // Exactly the old 320-by-320 lattice, in separate frustum-tested draws.
  const cells=4,width=3500,segments=80;
  const geometry=new THREE.PlaneGeometry(width,width,segments,segments).rotateX(-Math.PI/2);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius=Math.hypot(geometry.boundingSphere.radius,32);
  for(let z=0;z<cells;z++)for(let x=0;x<cells;x++){
   const cell=new THREE.Mesh(geometry,material);
   cell.position.set((x-1.5)*width,0,(z-1.5)*width);
   group.add(cell);
  }
  return group;
 }

 function deckLighting(THREE,scene){
  const geometry=new THREE.PlaneGeometry(10,4).rotateX(-Math.PI/2);
  const strength={value:0},halfBeam={value:13};
  const material=new THREE.ShaderMaterial({
   uniforms:{strength,halfBeam},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
   vertexShader:`
    uniform float halfBeam;
    varying vec2 lamp;
    void main(){
     lamp=uv*2.0-1.0;
     vec4 p=instanceMatrix*vec4(position,1.0);
     p.z+=sign(p.z)*(halfBeam-13.0);
     gl_Position=projectionMatrix*modelViewMatrix*p;
    }`,
   fragmentShader:`
    uniform float strength;
    varying vec2 lamp;
    void main(){
     float spill=pow(max(0.0,1.0-length(lamp)),2.3);
     float core=1.0-smoothstep(.8,1.2,length(lamp*vec2(9.0,6.5)));
     gl_FragColor=vec4(vec3(.94,.52,.17)*(spill*.75+core*1.8),strength);
     #include <tonemapping_fragment>
     #include <encodings_fragment>
    }`
  });
  const lights=new THREE.InstancedMesh(geometry,material,20);
  lights.name='Shielded flight deck lamps';
  lights.frustumCulled=false;
  lights.visible=false;
  lights.renderOrder=2;
  const matrix=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3();
  let i=0;
  for(const side of [-1,1])for(let x=-80;x<=82;x+=18){
   lights.setMatrixAt(i++,matrix.makeTranslation(x,0,side*10.6));
  }
  scene.add(lights);
  return {
   lights,
   update(plane,beam,amount){
    lights.visible=amount>0&&!!plane;
    if(!lights.visible)return;
    strength.value=amount;
    halfBeam.value=beam;
    lights.position.set(plane.x,plane.y+.075,plane.z);
    normal.set(-plane.sx,1,-plane.sz).normalize();
    lights.quaternion.setFromUnitVectors(up,normal);
   }
  };
 }

 function spray(THREE,scene,heightAt){
  const capacity=256;
  const data=new Float32Array(capacity*3),ages=new Float32Array(capacity),sizes=new Float32Array(capacity);
  const particles=Array.from({length:capacity},()=>({age:0,life:0}));
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(data,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('opacity',new THREE.BufferAttribute(ages,1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size',new THREE.BufferAttribute(sizes,1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0,0);
  const uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{density:{value:1},tint:{value:new THREE.Color(0xe2f4f4)}}]);
  const mat=new THREE.ShaderMaterial({uniforms,fog:true,transparent:true,depthWrite:false,
   vertexShader:`
    attribute float opacity,size;
    uniform float density;
    varying float fade;
    #include <fog_pars_vertex>
    void main(){
     fade=opacity;
     vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
     gl_Position=projectionMatrix*mvPosition;
     gl_PointSize=clamp(size*density/max(1.0,-mvPosition.z),1.0,34.0*density);
     #include <fog_vertex>
    }`,
   fragmentShader:`
    uniform vec3 tint;
    varying float fade;
    #include <fog_pars_fragment>
    void main(){
     vec2 p=gl_PointCoord*2.0-1.0;
     float a=1.0-smoothstep(.06,1.0,dot(p,p));
     gl_FragColor=vec4(tint,fade*a*a);
     #include <tonemapping_fragment>
     #include <encodings_fragment>
     #include <fog_fragment>
    }`
  });
  const mesh=new THREE.Points(geo,mat);
  mesh.name='Pacific bow spray and spray columns';
  mesh.frustumCulled=false;
  mesh.renderOrder=2;
  scene.add(mesh);
  let seed=287001,cursor=0;
  let wakes=new WeakMap();
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function emit(x,z,vx,vy,vz,life,size,lift=0){
   const p=particles[cursor];
   cursor=(cursor+1)%capacity;
   p.x=x;p.y=heightAt(x,z)+.45+lift;p.z=z;
   p.vx=vx;p.vy=vy;p.vz=vz;p.age=0;p.life=life;p.size=size;
  }
  function splash(x,z,big){
   const count=big?28:12,scale=big?1.8:1;
   for(let i=0;i<count;i++){
    const a=random()*Math.PI*2,r=(1.5+random()*4)*scale,v=(2+random()*4)*scale;
    emit(x+Math.cos(a)*r,z+Math.sin(a)*r,Math.cos(a)*v,(4+random()*7)*scale,Math.sin(a)*v,.65+random()*.75,140+random()*270);
   }
  }
  function bow(key,pos,forward,length,beam,speed,dt,seaState,camera){
   if(speed<1||Math.hypot(camera.x-pos.x,camera.z-pos.z)>1200)return;
   const timer=(wakes.get(key)||0)+dt;
   if(timer<.12){wakes.set(key,timer);return;}
   wakes.set(key,0);
   const force=Math.min(2.5,(speed/5+.45)*(seaState*.65+.35));
   for(const side of [-1,1]){
    const spread=beam*(.12+random()*.12)*side;
    const x=pos.x+forward.x*length*.43+forward.z*spread;
    const z=pos.z+forward.z*length*.43-forward.x*spread;
    emit(x,z,force*(-forward.x*1.2+forward.z*side*2),2.7+2.7*force*random(),
     force*(-forward.z*1.2-forward.x*side*2),.7+random()*.55,160+180*force,.15*force);
   }
  }
  function update(dt,pixelRatio,windX,windZ,light){
   uniforms.density.value=pixelRatio;
   uniforms.tint.value.setRGB(.73*light,.85*light,.87*light);
   let count=0;
   for(const p of particles){
    if(p.age>=p.life)continue;
    p.age+=dt;
    if(p.age>=p.life)continue;
    p.x+=(p.vx+windX)*dt;p.z+=(p.vz+windZ)*dt;
    p.vy-=10.7*dt;p.y+=p.vy*dt;
    if(p.vy<0&&p.y<heightAt(p.x,p.z)){p.age=p.life;continue;}
    const k=count*3,fade=p.age/p.life;
    data[k]=p.x;data[k+1]=p.y;data[k+2]=p.z;
    ages[count]=.52*(1-fade)*Math.min(1,p.age*20);
    sizes[count++]=p.size*(1+fade*.55);
   }
   geo.setDrawRange(0,count);
   mesh.visible=count>0;
   if(count)for(const attr of Object.values(geo.attributes)){
    attr.updateRange.offset=0;
    attr.updateRange.count=count*attr.itemSize;
    attr.needsUpdate=true;
   }
  }
  function clear(){
   for(const p of particles)p.life=0;
   wakes=new WeakMap();
   geo.setDrawRange(0,0);
   mesh.visible=false;
  }
  return {mesh,bow,splash,update,clear};
 }
 root.PacificUltraFinish={seaGrid,deckLighting,spray};
})(typeof window==='undefined'?globalThis:window);
