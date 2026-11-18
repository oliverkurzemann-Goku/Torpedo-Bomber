// Build 277: scene-side graphics for both games (GRAPHICS-PLAN phases 2, 4, 5).
//  * Shadow map that follows the aircraft (sun direction fixed, texel-snapped so
//    it does not shimmer); casters are aircraft and nearby buildings/trees/huts.
//  * Contrails at altitude for the player and other aircraft.
//  * Grass tufts around airfields (close-range ground cover, High/Medium).
//  * Lit cloud puffs: sunward side bright, far side in shade.
// Everything here is created on demand and fully removed when switched off.
(function(global){
  'use strict';
  function create(THREE,scene,renderer,options={}){
    const sun=options.sun,direction=(options.direction||new THREE.Vector3(.5,.8,.3)).clone().normalize();
    const state={shadows:false,shadowSize:0,shadowRange:0,contrails:false,cloudLight:false,grass:false};
    const castSeen=new WeakSet();let sweepT=0,castT=0,trails=null,grass=null,grassT=0,lastFocus=null;
    const get=v=>typeof v==='function'?v():v,osm=()=>get(options.osm),terrain=()=>get(options.terrain);

    // ---------------- shadows ----------------
    const right=new THREE.Vector3(),up=new THREE.Vector3(),snapped=new THREE.Vector3(),shadowFocus=new THREE.Vector3(),look=new THREE.Vector3();
    // Build 279: shadows fade out towards the edge of the shadow map instead of
    // stopping at a hard line (they used to pop in just in front of the aircraft).
    // Only this game loads the module; patched before the shadow map is first on,
    // so every program that samples shadows is built with it.
    const chunk=THREE.ShaderChunk.shadowmap_pars_fragment;
    if(chunk&&!chunk.includes('shadowEdgeFade')){
      const fade='float shadowEdgeFade(vec2 uv){vec2 e=min(uv,1.0-uv);return smoothstep(0.0,0.16,min(e.x,e.y));}\n';
      const patched=chunk.replace('float getShadow(',fade+'\tfloat getShadow(')
        .replace(/(#endif\s*\}\s*)return shadow;/,'$1return mix(1.0,shadow,shadowEdgeFade(shadowCoord.xy));');
      if(patched.includes('shadowEdgeFade(shadowCoord.xy)'))THREE.ShaderChunk.shadowmap_pars_fragment=patched;
    }
    right.crossVectors(new THREE.Vector3(0,1,0),direction).normalize();up.crossVectors(direction,right).normalize();
    function recompileAll(){scene.traverse(o=>{const m=o.material;if(!m)return;(Array.isArray(m)?m:[m]).forEach(x=>{x.needsUpdate=true;});});}
    function setShadows(on,size,range){
      if(!sun||!renderer.shadowMap)return;   // GPU-free test renderers have no shadow map
      const toggled=on!==state.shadows;
      state.shadows=on;
      renderer.shadowMap.enabled=on;
      renderer.shadowMap.type=THREE.PCFShadowMap;
      renderer.shadowMap.autoUpdate=true;
      sun.castShadow=on;
      if(on){
        if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}
        const cam=sun.shadow.camera;cam.left=-range;cam.right=range;cam.top=range;cam.bottom=-range;
        cam.near=10;cam.far=5200;cam.updateProjectionMatrix();
        sun.shadow.bias=-.00035;sun.shadow.normalBias=.4;
        state.shadowSize=size;state.shadowRange=range;
        markReceivers();
      }else{
        sun.shadow.map?.dispose();sun.shadow.map=null;
        // Flags on objects are harmless with the shadow map off; nothing else to undo.
      }
      if(toggled)recompileAll();
    }
    // Large ground surfaces receive; trees and particles do not (cost per pixel).
    function markReceivers(){
      const t=terrain();
      if(t?.tiles)for(const tile of t.tiles.values())if(tile.mesh)tile.mesh.receiveShadow=true;
      const o=osm();
      if(o?.tiles)for(const tile of o.tiles.values()){
        if(!tile?.group)continue;
        for(const m of tile.group.children)if(m.isMesh&&!m.isInstancedMesh)m.receiveShadow=true;
        for(const m of tile.farGroup?.children||[])if(m.name.startsWith('osmBuilding')||m.name.startsWith('osmChurch'))m.receiveShadow=true;
      }
    }
    // Small static objects and every aircraft cast; checked every two seconds so
    // aircraft spawned later are included. Transparent effects never cast.
    function sweepCasters(aircraft){
      for(const g of aircraft||[])if(g&&!castSeen.has(g)){
        castSeen.add(g);g.traverse(o=>{if(o.isMesh&&!(o.material?.transparent)){o.castShadow=true;o.receiveShadow=true;}});
      }
      scene.traverse(o=>{
        if(!o.isMesh||o.isInstancedMesh||castSeen.has(o))return;
        castSeen.add(o);
        const m=Array.isArray(o.material)?o.material[0]:o.material;
        if(!m||m.transparent||m.isShaderMaterial||m.isSpriteMaterial||m.isPointsMaterial||!m.isMeshStandardMaterial&&!m.isMeshLambertMaterial&&!m.isMeshPhongMaterial)return;
        const g=o.geometry;if(!g)return;if(!g.boundingSphere)g.computeBoundingSphere();
        if(g.boundingSphere&&g.boundingSphere.radius<70&&o.name!=='skyDome'){o.castShadow=true;o.receiveShadow=true;}
      });
    }
    // Instanced buildings and tree cells near the shadow focus cast; the rest stay out.
    function nearCasters(focus,range){
      const o=osm();if(!o?.tiles)return;
      // The box is square in light space; its ground footprint reaches about the
      // diagonal, a little longer along the sun's azimuth.
      range*=1.6;
      const size=o.tileSize||4000,reach=range+400;
      for(const [key,tile] of o.tiles){
        if(!tile?.farGroup)continue;
        const [tx,tz]=key.split(',').map(Number);
        const dx=Math.max(0,Math.abs((tx+.5)*size-focus.x)-size/2),dz=Math.max(0,Math.abs((tz+.5)*size-focus.z)-size/2);
        const near=Math.hypot(dx,dz)<reach;
        for(const m of tile.farGroup.children)if(m.name.startsWith('osmBuilding')||m.name.startsWith('osmChurch'))m.castShadow=near;
      }
      for(const cell of o.treeCells||[]){
        const c=cell.sphere.center;cell.mesh.castShadow=Math.hypot(c.x-focus.x,c.z-focus.z)-cell.sphere.radius<range;
      }
    }
    function shadowGround(focus,camera){
      shadowFocus.copy(focus);
      try{const g=terrain()?.getRenderedHeight?.(focus.x,focus.z);if(Number.isFinite(g))shadowFocus.y=Math.min(focus.y,g);}catch(e){}
      if(camera){
        camera.getWorldDirection(look);look.y=0;const l=look.length();
        if(l>.2)shadowFocus.addScaledVector(look,state.shadowRange*.55/l);
      }
    }
    function placeShadow(focus){
      const range=state.shadowRange,texel=2*range/state.shadowSize;
      // Snap the focus to whole shadow texels in light space: no crawling edges.
      const a=Math.round(focus.dot(right)/texel)*texel,b=Math.round(focus.dot(up)/texel)*texel,c=focus.dot(direction);
      snapped.copy(right).multiplyScalar(a).addScaledVector(up,b).addScaledVector(direction,c);
      sun.target.position.copy(snapped);sun.position.copy(snapped).addScaledVector(direction,2600);
      sun.target.updateMatrixWorld();sun.updateMatrixWorld();
    }

    // ---------------- contrails ----------------
    function makeTrails(){
      const max=3600,positions=new Float32Array(max*3),ages=new Float32Array(max);ages.fill(99);
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('age',new THREE.BufferAttribute(ages,1).setUsage(THREE.DynamicDrawUsage));
      const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,
        uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{scale:{value:600}}]),
        vertexShader:`attribute float age;uniform float scale;varying float vAlpha;
          #include <fog_pars_vertex>
          void main(){vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
          float life=clamp(age/28.,0.,1.);vAlpha=(1.-life)*smoothstep(0.,.35,age)*.55;
          gl_PointSize=clamp(scale*(5.+life*22.)/max(1.,-mvPosition.z),1.,90.);
          #include <fog_vertex>
          }`,
        fragmentShader:`varying float vAlpha;
          #include <fog_pars_fragment>
          void main(){vec2 p=gl_PointCoord-.5;float d=dot(p,p)*4.;if(d>1.)discard;gl_FragColor=vec4(vec3(.96,.97,1.),vAlpha*(1.-d));
          #include <fog_fragment>
          }`});
      const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.name='Contrails';points.renderOrder=2;
      scene.add(points);
      return {points,positions,ages,next:0,max,emit:new Map(),scale:material.uniforms.scale};
    }
    function updateTrails(dt,camera,aircraft){
      const t=trails;
      t.scale.value=renderer.domElement.height*.5;
      for(let i=0;i<t.max;i++)if(t.ages[i]<99)t.ages[i]+=dt;
      for(const g of aircraft||[]){
        if(!g||!g.visible)continue;
        const p=g.getWorldPosition?g.getWorldPosition(new THREE.Vector3()):g.position;
        // Condensation: none below 3.4 km, full above 4.6 km (gameplay estimate).
        const strength=Math.max(0,Math.min(1,(p.y-3400)/1200));
        if(strength<=0){t.emit.delete(g);continue;}
        const last=t.emit.get(g);
        if(last&&last.distanceToSquared(p)<64)continue;
        if(Math.random()>strength)continue;
        const i=t.next;t.next=(t.next+1)%t.max;
        t.positions[i*3]=p.x;t.positions[i*3+1]=p.y;t.positions[i*3+2]=p.z;t.ages[i]=0;
        t.emit.set(g,p.clone());
      }
      t.points.geometry.attributes.position.needsUpdate=true;t.points.geometry.attributes.age.needsUpdate=true;
    }

    // ---------------- grass tufts ----------------
    function grassTexture(){
      const n=64,data=new Uint8Array(n*n*4);
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const i=(y*n+x)*4,v=y/n;let a=0;
        for(let b=0;b<7;b++){const cx=(b+.5)/7+Math.sin(b*12.3)*.05,lean=(b-3)*.04;
          const along=cx+lean*v,w=.035*(1-v*.9);if(Math.abs(x/n-along)<w&&v<.55+.4*Math.abs(Math.sin(b*7.1)))a=255;}
        const shade=90+v*80;data[i]=shade*.62;data[i+1]=shade;data[i+2]=shade*.42;data[i+3]=a;
      }
      const t=new THREE.DataTexture(data,n,n);t.needsUpdate=true;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;return t;
    }
    function makeGrass(spots){
      if(!spots?.length)return null;
      const plane=new THREE.PlaneGeometry(1,1);plane.translate(0,.5,0);
      const cross=plane.clone();cross.rotateY(Math.PI/2);
      const geometry=new THREE.BufferGeometry();
      const merge=(a,b)=>{const pa=a.attributes.position.array,pb=b.attributes.position.array,ua=a.attributes.uv.array,ub=b.attributes.uv.array;
        geometry.setAttribute('position',new THREE.Float32BufferAttribute([...pa,...pb],3));
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute([...ua,...ub],2));
        const ia=[...a.index.array],ib=[...b.index.array].map(v=>v+pa.length/3);geometry.setIndex([...ia,...ib]);
        geometry.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array((pa.length+pb.length)).map((_,k)=>k%3===1?1:0),3));};
      merge(plane,cross);plane.dispose();cross.dispose();
      const texture=grassTexture();
      const material=new THREE.MeshLambertMaterial({map:texture,alphaTest:.5,side:THREE.DoubleSide});
      // One group per 1.5-km cell, each with its own bounding sphere, so the frustum
      // test and the distance limit in update() skip the far airfield entirely.
      const cells=new Map();
      for(const spot of spots){const key=Math.floor(spot.x/1500)+','+Math.floor(spot.z/1500);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(spot);}
      const m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3(),yAxis=new THREE.Vector3(0,1,0);
      const meshes=[];
      for(const items of cells.values()){
        const cellGeometry=geometry.clone();
        const mesh=new THREE.InstancedMesh(cellGeometry,material,items.length);mesh.name='Grass tufts';
        let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity,y0=Infinity,y1=-Infinity;
        items.forEach((spot,i)=>{
          q.setFromAxisAngle(yAxis,spot.rot);const size=spot.size;s.set(size*1.4,size,size*1.4);p.set(spot.x,spot.y-.05,spot.z);
          m.compose(p,q,s);mesh.setMatrixAt(i,m);
          x0=Math.min(x0,spot.x);x1=Math.max(x1,spot.x);z0=Math.min(z0,spot.z);z1=Math.max(z1,spot.z);y0=Math.min(y0,spot.y);y1=Math.max(y1,spot.y);
        });
        const centre=new THREE.Vector3((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
        cellGeometry.boundingSphere=new THREE.Sphere(centre,Math.hypot(x1-x0,z1-z0,y1-y0)/2+3);
        mesh.frustumCulled=true;mesh.userData.grassCentre=centre;scene.add(mesh);meshes.push(mesh);
      }
      geometry.dispose();
      return {meshes,material,texture};
    }
    // Tufts are a few metres tall: beyond 1.8 km they are below a pixel.
    function grassVisibility(focus){
      if(!grass)return;
      for(const mesh of grass.meshes){
        const c=mesh.userData.grassCentre;
        mesh.visible=state.grass&&(!focus||Math.hypot(c.x-focus.x,c.z-focus.z)<1800+mesh.geometry.boundingSphere.radius);
      }
    }

    const api={
      get state(){return {...state};},
      configure(next){
        if(next.shadows!==undefined&&(next.shadows!==state.shadows||next.shadowSize!==state.shadowSize||next.shadowRange!==state.shadowRange))
          setShadows(!!next.shadows,next.shadowSize||2048,next.shadowRange||200);
        // Build 290: softer shadow edges on High. r128's PCF kernel spreads its nine taps over shadow.radius texels:
        // 2.4 texels (0.84 m at the High range) instead of 1 blur the edge like a real penumbra; same nine taps, same cost.
        if(next.softShadows!==undefined&&sun?.shadow){sun.shadow.radius=next.softShadows?2.4:1;state.softShadows=!!next.softShadows;}
        if(next.contrails!==undefined&&next.contrails!==state.contrails){
          state.contrails=next.contrails;
          if(next.contrails&&!trails)trails=makeTrails();
          if(!next.contrails&&trails){scene.remove(trails.points);trails.points.geometry.dispose();trails.points.material.dispose();trails=null;}
        }
        if(next.grass!==undefined&&next.grass!==state.grass){
          state.grass=next.grass;
          if(next.grass&&!grass&&options.grassSpots)grass=makeGrass(options.grassSpots());
          grassVisibility(lastFocus);
        }
        if(next.cloudLight!==undefined)state.cloudLight=next.cloudLight;
        return api;
      },
      update(dt,camera,focus,info={}){
        if(state.shadows&&focus){
          // Build 279: the shadow box sits on the ground ahead of the camera (it was
          // centred on the aircraft, so ~200 m ahead nothing had a shadow yet), and
          // the tree/building casters are re-picked four times a second (every 2 s
          // at 150 m/s left the trees just ahead without a shadow for up to 1.5 s).
          shadowGround(focus,camera);
          placeShadow(shadowFocus);
          sweepT-=dt;castT-=dt;
          if(sweepT<=0){sweepT=2;sweepCasters(info.aircraft);}
          if(castT<=0){castT=.25;nearCasters(shadowFocus,state.shadowRange);}
        }
        if(trails)updateTrails(dt,camera,info.aircraft);
        if(grass&&focus){grassT-=dt;if(grassT<=0){grassT=.5;lastFocus=focus.clone?focus.clone():focus;grassVisibility(lastFocus);}}
      },
      // Cloud puffs: sunward and upper puffs lit, the far and lower side in shade.
      lightClouds(clouds){
        if(!state.cloudLight)return;
        const offset=new THREE.Vector3();
        for(const cloud of clouds||[])for(const puff of cloud.children){
          if(!puff.material?.color)continue;
          offset.copy(puff.position).normalize();
          const f=.80+.30*Math.max(-1,Math.min(1,offset.dot(direction)*.8+offset.y*.5));
          puff.material.color.multiplyScalar(Math.max(.6,Math.min(1.1,f)));
        }
      },
      dispose(){
        api.configure({shadows:false,contrails:false,grass:false});
        if(grass){for(const mesh of grass.meshes){scene.remove(mesh);mesh.geometry.dispose();}grass.material.dispose();grass.texture.dispose();grass=null;}
      }
    };
    return api;
  }
  global.GraphicsExtras={create};
})(typeof window!=='undefined'?window:globalThis);
