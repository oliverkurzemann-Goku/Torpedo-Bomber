// Optional Rhine renderer: the existing terrain and object placements feed these
// visual layers. All extra textures and material hooks are owned by this preset.
const RHINE_ULTRA_ATMOSPHERE = /* glsl */`
  uniform sampler2D ultraNoise;
  uniform vec3 ultraHorizon, ultraZenith, ultraSun;
  uniform vec2 ultraWind;
  uniform float ultraDeck, ultraCover, ultraDaylight, ultraNight;

  vec2 rhineCloudUv(vec2 world) {
    return (world + ultraWind) * vec2(.000098,.000132);
  }
  float rhineCloudAmount(float noise) {
    float edge = .71 - .33 * ultraCover;
    return smoothstep(edge, edge+.18, noise);
  }
  float rhineCloudShadow(vec2 world, float height) {
    vec2 projected = world + ultraSun.xz * max(0.0,ultraDeck-height) / ultraSun.y;
    float cloud = rhineCloudAmount(texture2D(ultraNoise,rhineCloudUv(projected)).r);
    return 1.0 - .31 * cloud * ultraDaylight;
  }
  vec3 rhineDistanceLight(vec3 colour, vec3 world) {
    float distanceToEye=length(world-cameraPosition);
    float valleyAir=1.0-smoothstep(70.0,1450.0,world.y);
    float haze=smoothstep(400.0,10500.0,distanceToEye)*mix(.31,.61,valleyAir)*ultraDaylight;
    return mix(colour,ultraHorizon*vec3(.72,.81,.87),haze);
  }
  vec3 rhineSky(vec3 direction, vec3 origin) {
    float above = max(0.0,direction.y);
    float sunward = max(0.0,dot(direction,ultraSun));
    vec3 sky = mix(ultraHorizon,ultraZenith,smoothstep(.015,.76,sqrt(above)*.86));
    sky += vec3(.20,.13,.055) * pow(sunward,12.0) * ultraDaylight;
    float across = (ultraDeck-origin.y) / max(.075,above);
    vec2 uv = rhineCloudUv(origin.xz + direction.xz * across);
    float cloud = texture2D(ultraNoise,uv).r;
    float edgeLight = texture2D(ultraNoise,uv+ultraSun.xz*.010).r;
    float light = clamp(.63+(cloud-edgeLight)*4.5,0.0,1.0);
    vec3 cloudDark = mix(ultraHorizon*.83,vec3(.57,.61,.65),ultraDaylight);
    vec3 cloudLight = mix(ultraHorizon*1.30,vec3(.94,.94,.89),ultraDaylight);
    float opacity = rhineCloudAmount(cloud) * smoothstep(.028,.145,above)
      * smoothstep(30.0,250.0,ultraDeck-origin.y);
    return mix(sky,mix(cloudDark,cloudLight,light),opacity*.93);
  }
`;

// Draws one Ultra land mask (also inside a Worker, so it must stay
// self-contained). RGB holds field orientation, shadows and land cover;
// alpha holds the ground immediately around mapped roads and buildings.
function rhineMaskDraw(ctx,job){
  const n=job.n,size=job.size,tx=job.tx,tz=job.tz,sx=job.sun[0],sy=job.sun[1],sz=job.sun[2];
  const hash=(x,z,salt)=>{const s=Math.sin(x*0.0913+z*0.1277+salt*7.13)*43758.5453;return s-Math.floor(s);};
  ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='#000';ctx.fillRect(0,0,n,n);
  ctx.scale(n/size,n/size);
  for(const field of job.fields){
    const ring=field.ring,woods=field.woods;
    let bearing=0,longest=0;
    ctx.beginPath();
    ctx.moveTo(ring[0][0],ring[0][1]);
    for(let i=0;i<ring.length;i++){
      const x=ring[i][0],z=ring[i][1],next=ring[(i+1)%ring.length];
      const dx=next[0]-x,dz=next[1]-z,length=dx*dx+dz*dz;
      if(length>longest){longest=length;bearing=Math.atan2(dz,dx);}
      ctx.lineTo(next[0],next[1]);
    }
    const heading=((bearing/Math.PI)%1+1)%1;
    const red=Math.round(57+186*heading);
    const blue=Math.round(18+124*hash(tx*size+ring[0][0],tz*size+ring[0][1],1668));
    ctx.fillStyle=woods?'#0000f4':'rgb('+red+',0,'+blue+')';
    ctx.closePath();ctx.fill();
    if(!woods){
      // A grassy or worn headland follows the actual mapped field edge.
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle='rgba(0,76,0,.47)';ctx.lineWidth=15;ctx.lineJoin='round';ctx.stroke();ctx.restore();
    }
  }
  ctx.globalCompositeOperation='lighter';
  const angle=Math.atan2(-sz,-sx),shadowStretch=Math.hypot(sx,sz)/sy;
  const trees=job.trees,walls=job.walls;
  ctx.fillStyle='#003600';
  for(let i=0;i<trees.length;i+=4){
    const x=trees[i],z=trees[i+1],height=trees[i+2],radius=trees[i+3];
    const dx=-sx/sy*height,dz=-sz/sy*height;
    ctx.beginPath();ctx.ellipse(x+dx*.75,z+dz*.75,Math.max(3,radius*.90+height*shadowStretch*.45),
      Math.max(2,radius*.63),angle,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle='#009000';
  for(let i=0;i<walls.length;i+=7){
    const a=walls[i],b=walls[i+1],c=walls[i+2],d=walls[i+3],x=walls[i+4],z=walls[i+5],height=walls[i+6];
    const dx=-sx/sy*height,dz=-sz/sy*height;
    // Use the same rotated wall footprint; offset along the sun ray.
    ctx.beginPath();
    ctx.moveTo(x-a*.5-c*.5+dx*.25,z-b*.5-d*.5+dz*.25);
    ctx.lineTo(x+a*.5-c*.5+dx*.74,z+b*.5-d*.5+dz*.74);
    ctx.lineTo(x+a*.5+c*.5+dx,z+b*.5+d*.5+dz);
    ctx.lineTo(x-a*.5+c*.5+dx*.63,z-b*.5+d*.5+dz*.63);
    ctx.closePath();ctx.fill();
  }
  const land=ctx.getImageData(0,0,n,n).data;
  // Alpha: verges along roads and a soft pad around each house.
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='#000';
  ctx.fillRect(0,0,size,size);
  ctx.lineWidth=18;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='#440000';
  ctx.beginPath();
  for(const line of job.roads){
    ctx.moveTo(line[0],line[1]);
    for(let i=2;i<line.length;i+=2)ctx.lineTo(line[i],line[i+1]);
  }
  ctx.stroke();
  for(let i=0;i<walls.length;i+=7){
    const a=walls[i],b=walls[i+1],c=walls[i+2],d=walls[i+3],x=walls[i+4],z=walls[i+5];
    const seed=hash(x+tx*size,z+tz*size,1737);
    const offset=(seed-.5)*.37;
    ctx.save();ctx.transform(a,b,c,d,x,z);
    const halo=ctx.createRadialGradient(offset,.08,.35,offset,.08,1.06+seed*.17);
    halo.addColorStop(0,'rgba(244,0,0,.96)');
    halo.addColorStop(.56,'rgba(221,0,0,.81)');
    halo.addColorStop(1,'rgba(156,0,0,0)');
    ctx.fillStyle=halo;ctx.fillRect(-1.46,-1.25,2.92,2.66);ctx.restore();
  }
  const ground=ctx.getImageData(0,0,n,n).data;
  // Preserve the former CanvasTexture orientation with explicit row order.
  const pixels=new Uint8Array(land.length);
  for(let row=0;row<n;row++){
    const source=row*n*4,dest=(n-1-row)*n*4;
    pixels.set(land.subarray(source,source+n*4),dest);
    for(let i=0;i<n*4;i+=4)pixels[dest+i+3]=ground[source+i];
  }
  return pixels;
}

class RhineUltra {
  constructor(scene, terrain, osm, sun, world) {
    this.scene=scene;
    this.terrain=terrain;
    this.osm=osm;
    this.maps=new Map();
    this.hooks=new Map();
    this.emptyMask=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
    this.emptyMask.needsUpdate=true;
    this.noise=RhineUltra.makeNoise();
    this.uniforms={
      ultraNoise:{value:this.noise}, ultraHorizon:{value:new THREE.Color()}, ultraZenith:{value:new THREE.Color()},
      ultraSun:{value:(sun.userData.direction||sun.position).clone().normalize()}, ultraWind:{value:new THREE.Vector2()},
      ultraFocus:{value:new THREE.Vector2()},
      ultraDeck:{value:1800}, ultraCover:{value:.4}, ultraDaylight:{value:1}
    };
    this.sky=this.makeSky();
    scene.add(this.sky);
    this.riverLife=world&&new RhineRiverLife(scene,world);
    this.roofClock=0;
    this.roofTrim=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),
      new THREE.MeshLambertMaterial({color:0xffffff}),576);
    this.roofTrim.name='Rhine Ultra ridge caps and eaves';
    this.roofTrim.count=0;
    this.roofTrim.frustumCulled=false;
    this.roofTrim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.roofTrim);

    // Build 277 (phase 2): relief maps baked from the elevation model, one per
    // tile, a few milliseconds per frame: per-pixel ground normals (coarse far
    // tiles keep their relief, LOD changes are no longer visible in the light)
    // and the sun's visibility over the hills (valley-side terrain shadow).
    this.flatRelief=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);
    this.flatRelief.needsUpdate=true;
    this.relief=new Map();this.reliefJob=null;this.maskJob=null;this.maskSeq=0;this.maskWorkerState=null;
    this.uniforms.ultraReliefOn={value:1};
    this.uniforms.ultraGroundDetail={value:1};
    this.uniforms.ultraNight={value:0};
    for(const tile of terrain.tiles.values())if(tile.materialOverride){
      const mask={value:this.emptyMask};
      const blend={value:0};
      const relief={value:this.flatRelief};
      this.maps.set(tile,{mask,blend,texture:null});
      this.relief.set(tile,{uniform:relief,texture:null});
      this.extend(tile.materialOverride,'terrain',shader=>this.styleTerrain(shader,mask,blend,relief));
    }
    for(const material of [osm.riverMat,osm.lakeMat])this.extend(material,'water',shader=>this.styleWater(shader));
    for(const material of [osm.coniferMat,osm.deciduousMat,osm.poplarMat,osm.willowMat]){
      this.extend(material,'canopy',shader=>this.styleScenery(shader,'canopy'));
    }
    for(const material of [osm.roofMat,osm.roofSlateMat,osm.roofBrownMat]){
      this.extend(material,'roof',shader=>this.styleScenery(shader,'roof'));
    }
    for(const material of [osm.roadMat,osm.railMat])this.extend(material,'road',shader=>this.styleRoad(shader));
    for(const material of [osm.buildingWarmMat,osm.buildingCoolMat,osm.buildingOchreMat,osm.buildingBrickMat]){
      this.extend(material,'wall',shader=>this.styleScenery(shader,'wall'));
    }
    for(const material of [osm.forestFloorMat,osm.shrubMat,osm.trunkMat,
      osm.flatRoofMat,osm.chimneyMat])this.extend(material,'landscape',shader=>this.styleScenery(shader));
  }

  extend(material, key, style) {
    const before=material.onBeforeCompile, cacheKey=material.customProgramCacheKey;
    const originalKey=cacheKey.call(material);
    this.hooks.set(material,{before,cacheKey});
    material.onBeforeCompile=(shader,renderer)=>{
      before.call(material,shader,renderer);
      Object.assign(shader.uniforms,this.uniforms);
      shader.fragmentShader=RHINE_ULTRA_ATMOSPHERE+shader.fragmentShader;
      style(shader);
    };
    material.customProgramCacheKey=()=>originalKey+'-rhine-ultra-'+key;
    material.needsUpdate=true;
  }

  makeSky() {
    const material=new THREE.ShaderMaterial({
      uniforms:this.uniforms, side:THREE.BackSide, depthWrite:false, fog:false,
      vertexShader:/* glsl */`
        varying vec3 ultraView;
        void main() {
          ultraView=position;
          vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.0);
          gl_Position=clip.xyww;
        }`,
      fragmentShader:RHINE_ULTRA_ATMOSPHERE+/* glsl */`
        varying vec3 ultraView;
        void main() {
          vec3 direction=normalize(ultraView);
          vec3 colour=rhineSky(direction,cameraPosition);
          float angle=1.0-max(0.0,dot(direction,ultraSun));
          float solarDisc=(1.0-smoothstep(.00009,.00020,angle))*ultraDaylight;
          gl_FragColor=vec4(mix(colour,vec3(.99,.91,.71),solarDisc),1.0);
          #include <encodings_fragment>
        }`
    });
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),material);
    mesh.name='Rhine Ultra sky';
    mesh.frustumCulled=false;
    mesh.renderOrder=-1000;
    return mesh;
  }

  // Build 287: image-based ambient light from this sky. The sky (without the sun disc) and a ground-coloured
  // lower hemisphere are captured into a pre-filtered environment map once per weather/sky change; standard
  // materials then take their ambient light and their faint reflections from it (blue from above, warmer
  // towards the sun, darker under cloud) instead of from a two-colour hemisphere light alone.
  bakeEnvironment(renderer, {scale=.75, ground=0x55603f}={}) {
    if(!this.envScene){
      const skyMaterial=this.sky.material.clone();
      skyMaterial.uniforms=Object.assign({},this.uniforms,{ultraEnvScale:{value:scale}});
      skyMaterial.fragmentShader='uniform float ultraEnvScale;\n'+skyMaterial.fragmentShader
        .replace('gl_FragColor=vec4(mix(colour,vec3(.99,.91,.71),solarDisc),1.0);','gl_FragColor=vec4(colour*ultraEnvScale,1.0);');
      const sky=new THREE.Mesh(this.sky.geometry,skyMaterial);sky.frustumCulled=false;
      const groundMaterial=new THREE.MeshBasicMaterial({color:ground,side:THREE.BackSide,fog:false});
      const floor=new THREE.Mesh(new THREE.SphereGeometry(10,24,8,0,Math.PI*2,Math.PI*.515,Math.PI*.485),groundMaterial);
      this.envScene=new THREE.Scene();this.envScene.add(sky,floor);
      this.envParts={skyMaterial,groundMaterial,floor,ground:new THREE.Color(ground)};
      this.pmrem=new THREE.PMREMGenerator(renderer);
    }
    const parts=this.envParts,u=this.uniforms;
    parts.skyMaterial.uniforms.ultraEnvScale.value=scale;
    // The ground bounces sunlight: dim under heavy cloud and at night.
    parts.groundMaterial.color.copy(parts.ground).multiplyScalar(scale*(.35+.65*u.ultraDaylight.value));
    const previous=this.envTarget;
    this.envTarget=this.pmrem.fromScene(this.envScene,0,.1,100);
    previous?.dispose();
    return this.envTarget.texture;
  }

  setWeather(w, night) {
    const u=this.uniforms;
    const light=night?0:Math.max(0,Math.min(1,(w.sun-.22)*1.35));
    u.ultraHorizon.value.copy(this.scene.background);
    if(!night)u.ultraHorizon.value.lerp(new THREE.Color(0xdacbb1),.14*light);
    u.ultraZenith.value.copy(u.ultraHorizon.value).lerp(new THREE.Color(night?0x030910:0x3975a1),night?.75:.70*light);
    u.ultraDeck.value=w.base+w.depth*.30;
    u.ultraCover.value=w.cover;
    u.ultraDaylight.value=light;
    u.ultraNight.value=night?1:Math.max(0,1-light*2.2)*.6;
    if(this.riverLife)this.riverLife.bankLight.value=light;
  }

  update(dt,x,z,altitude,emitSteam) {
    this.riverLife?.update(dt,x,z,altitude,emitSteam);
    if((this.roofClock-=dt)<=0){
      this.roofClock=.58;
      this.updateRoofTrim(x,z);
    }
    this.uniforms.ultraWind.value.x-=dt*9;
    this.uniforms.ultraWind.value.y+=dt*4;
    this.uniforms.ultraFocus.value.set(x,z);
    // One distant mask per interval. Keep just the tiles whose fields and
    // shadows can be read from the aircraft, with hysteresis for eviction.
    const size=this.terrain.tileSize;
    let next=null,best=4550;
    for(const [tile,record] of this.maps){
      const dx=(tile.tileX+.5)*size-x,dz=(tile.tileZ+.5)*size-z;
      const distance=Math.hypot(Math.max(0,Math.abs(dx)-size*.5),Math.max(0,Math.abs(dz)-size*.5));
      if(record.texture){
        if(distance>5000){
          record.texture.dispose();record.texture=null;record.mask.value=this.emptyMask;record.blend.value=0;
        }else record.blend.value=Math.min(1,record.blend.value+dt*3);
      }
      const priority=distance+Math.hypot(dx,dz)*.02;
      if(!record.texture&&priority<best){next=tile;best=priority;}
    }
    // Build 277: the masks are drawn in slices. A whole mask (fields, the tree
    // and house shadows of nine tiles, two read-backs) used to land in one frame
    // every .14 s while flying - the short hitches in Ultra. Now a frame spends at
    // most ~2.4 ms on masks and relief together; masks (visible fields) go first.
    const start=performance.now(),budget=2.4;
    if(!this.maskJob&&next){
      const record=this.maps.get(next),worker=this.maskWorker();
      if(worker){
        const job=this.landMaskJob(next.tileX,next.tileZ);job.id=++this.maskSeq;
        this.maskJob={tile:next,record,id:job.id,n:job.n};
        worker.postMessage(job);
      }else this.maskJob={tile:next,record,steps:this.landMaskSteps(next.tileX,next.tileZ)};
    }
    if(this.maskJob?.steps){
      const job=this.maskJob;let result;
      while(performance.now()-start<budget){
        result=job.steps.next();
        if(result.done){
          this.maskJob=null;
          if(this.maps.get(job.tile)===job.record&&!job.record.texture){job.record.mask.value=job.record.texture=result.value;}
          else result.value?.dispose();
          break;
        }
      }
    }
    const left=budget-(performance.now()-start);
    if(!this.maskJob?.steps&&left>.3)this.bakeRelief(x,z,left);
  }

  // Relief bake, sliced so no frame spends more than `budget` milliseconds.
  bakeRelief(x,z,budget){
    const start=performance.now();
    if(!this.reliefJob){
      let best=null,bestD=Infinity;const size=this.terrain.tileSize;
      for(const [tile,record] of this.relief){
        if(record.texture)continue;
        const d=Math.hypot((tile.tileX+.5)*size-x,(tile.tileZ+.5)*size-z);
        if(d<bestD){bestD=d;best=tile;}
      }
      if(!best)return;
      this.reliefJob=this.reliefSteps(best);
    }
    while(performance.now()-start<budget){
      if(this.reliefJob.next().done){this.reliefJob=null;return;}
    }
  }

  *reliefSteps(tile){
    const N=128,M=24,G=N+2*M,size=this.terrain.tileSize,step=size/N;
    const ox=tile.tileX*size,oz=tile.tileZ*size,heights=new Float32Array(G*G);
    const maxX=this.terrain.worldWidth||Infinity,maxZ=this.terrain.worldDepth||Infinity;
    const height=(x,z)=>{
      try{return this.terrain.getHeight(Math.max(1,Math.min(maxX-1,x)),Math.max(1,Math.min(maxZ-1,z)));}
      catch(e){return NaN;}
    };
    for(let j=0;j<G;j++){
      for(let i=0;i<G;i++)heights[j*G+i]=height(ox+(i-M+.5)*step,oz+(j-M+.5)*step);
      yield;
    }
    // Missing samples (map edge) take the nearest valid row/column value.
    for(let k=0;k<heights.length;k++)if(!Number.isFinite(heights[k]))heights[k]=heights[(M+Math.min(N-1,Math.max(0,Math.floor(k/G)-M)))*G+M+Math.min(N-1,Math.max(0,k%G-M))];
    const sun=this.uniforms.ultraSun.value,flat=Math.hypot(sun.x,sun.z)||1;
    const sx=sun.x/flat,sz=sun.z/flat,rise=sun.y/flat;
    const pixels=new Uint8Array(N*N*4);
    for(let j=0;j<N;j++){
      for(let i=0;i<N;i++){
        const gi=i+M,gj=j+M,h=heights[gj*G+gi];
        const dx=(heights[gj*G+gi+1]-heights[gj*G+gi-1])/(2*step);
        const dz=(heights[(gj+1)*G+gi]-heights[(gj-1)*G+gi])/(2*step);
        const len=Math.hypot(dx,1,dz),nx=-dx/len,ny=1/len,nz=-dz/len;
        // March towards the sun; the deepest the ray passes below the ground
        // sets a soft shadow (a few metres of penumbra, no hard pixel edge).
        let lit=1;
        for(let k=1;k<=M;k++){
          const px=gi+sx*k,pz=gj+sz*k,ix=Math.floor(px),iz=Math.floor(pz);
          if(ix<0||iz<0||ix>=G-1||iz>=G-1)break;
          const fx=px-ix,fz=pz-iz,a=heights[iz*G+ix],b=heights[iz*G+ix+1],c=heights[(iz+1)*G+ix],d=heights[(iz+1)*G+ix+1];
          const ground=(a*(1-fx)+b*fx)*(1-fz)+(c*(1-fx)+d*fx)*fz;
          const ray=h+2+rise*k*step;
          lit=Math.min(lit,Math.max(0,Math.min(1,(ray-ground)/9+.5)));
          if(lit<=0)break;
        }
        // Row order matches the land-cover UVs: v=0 is the tile's far (max z) edge.
        const o=((N-1-j)*N+i)*4;
        pixels[o]=Math.round((nx*.5+.5)*255);pixels[o+1]=Math.round((nz*.5+.5)*255);
        pixels[o+2]=Math.round(ny*255);pixels[o+3]=Math.round(lit*255);
      }
      if(j%8===7)yield;
    }
    const texture=new THREE.DataTexture(pixels,N,N,THREE.RGBAFormat);
    texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps=true;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.needsUpdate=true;
    const record=this.relief.get(tile);
    if(record){record.texture=texture;record.uniform.value=texture;}else texture.dispose();
  }

  updateRoofTrim(x,z){
    const size=this.osm.tileSize,tx=Math.floor(x/size),tz=Math.floor(z/size),candidates=[];
    for(let oz=tz-1;oz<=tz+1;oz++)for(let ox=tx-1;ox<=tx+1;ox++){
      const group=this.osm.tiles.get(ox+','+oz)?.farGroup;
      for(const mesh of group?.children||[]){
        if(!mesh.name.startsWith('osmBuildingRoofs')||mesh.name.endsWith('Flat'))continue;
        const data=mesh.instanceMatrix.array;
        for(let i=0;i<mesh.count;i++){
          const d=(data[i*16+12]-x)**2+(data[i*16+14]-z)**2;
          if(d<1550**2)candidates.push({mesh,i,d});
        }
      }
    }
    candidates.sort((a,b)=>a.d-b.d);
    const source=new THREE.Matrix4(),matrix=new THREE.Matrix4();
    const base=new THREE.Vector3(),position=new THREE.Vector3(),size3=new THREE.Vector3(),trimSize=new THREE.Vector3();
    const rotation=new THREE.Quaternion(),colour=new THREE.Color();
    let count=0;
    for(const {mesh,i} of candidates.slice(0,192)){
      mesh.getMatrixAt(i,source);source.decompose(base,rotation,size3);
      if(size3.x<4||size3.y<1)continue;
      const hip=mesh.geometry===this.osm.hipRoofGeo;
      // The ridge cap follows the existing gable/hip template in roof space.
      position.copy(base);position.y+=size3.y+.018;
      matrix.compose(position,rotation,trimSize.set(size3.x*(hip?.54:.996),.15,.31));
      this.roofTrim.setMatrixAt(count,matrix);
      colour.copy(mesh.material.color).multiplyScalar(1.15);
      this.roofTrim.setColorAt(count++,colour);
      for(const side of [-1,1]){
        position.set(0,-.036,size3.z*.496*side).applyQuaternion(rotation).add(base);
        matrix.compose(position,rotation,trimSize.set(size3.x*.99,.145,.19));
        this.roofTrim.setMatrixAt(count,matrix);
        colour.setHex(0x4f4d47);this.roofTrim.setColorAt(count++,colour);
      }
    }
    this.roofTrim.count=count;
    this.roofTrim.instanceMatrix.needsUpdate=true;
    if(this.roofTrim.instanceColor)this.roofTrim.instanceColor.needsUpdate=true;
  }

  makeLandMask(tx,tz) {
    const steps=this.landMaskSteps(tx,tz);let r;
    do r=steps.next();while(!r.done);
    return r.value;
  }

  // Main-thread fallback (no Worker/OffscreenCanvas): the same drawing, in
  // three steps. The drawing itself cannot be split: a 2D canvas queues its
  // commands and does all the work at the read-back.
  *landMaskSteps(tx,tz) {
    const job=this.landMaskJob(tx,tz);
    yield;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=job.n;
    const pixels=rhineMaskDraw(canvas.getContext('2d'),job);
    yield;
    return this.maskTexture(pixels,job.n);
  }

  // Everything the mask needs, as plain numbers: field rings, the tree and
  // house shadow casters of the nine surrounding tiles, the roads.
  landMaskJob(tx,tz) {
    const size=this.terrain.tileSize,n=512,ox=tx*size,oz=tz*size;
    const sun=this.uniforms.ultraSun.value,data=this.osm.sourceTiles.get(tx+','+tz);
    const fields=[],trees=[],walls=[],roads=[];
    for(const [rings,woods] of [[data?.farmland,false],[data?.forests,true]])
      for(const ring of rings||[])if(ring.length>=3)fields.push({ring,woods});
    // Include nearby casters in neighbouring tiles so their shadows cross seams.
    for(let nz=tz-1;nz<=tz+1;nz++)for(let nx=tx-1;nx<=tx+1;nx++){
      const group=this.osm.tiles.get(nx+','+nz)?.farGroup;
      for(const mesh of group?.children||[]){
        const tree=mesh.name.startsWith('osmForest')&&!mesh.name.includes('Trunk');
        const wall=mesh.name.startsWith('osmBuildingWalls');
        if(!mesh.isInstancedMesh||(!tree&&!wall))continue;
        const m=mesh.instanceMatrix.array;
        for(let i=0;i<mesh.count*16;i+=16){
          const x=m[i+12]-ox,z=m[i+14]-oz;
          if(m[i+5]<=0||x< -75||z< -75||x>size+75||z>size+75)continue;
          if(tree)trees.push(x,z,Math.min(26,m[i+5]*17),Math.hypot(m[i],m[i+2]));
          else walls.push(m[i],m[i+2],m[i+8],m[i+10],x,z,Math.min(26,m[i+5]*.75));
        }
      }
    }
    // Draw neighbouring lines too so a verge continues across tile seams.
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const lines=this.osm.sourceTiles.get((tx+dx)+','+(tz+dz))?.roads;
      for(const line of lines||[]){
        if(line.length<2)continue;
        const flat=new Float32Array(line.length*2);
        for(let i=0;i<line.length;i++){flat[i*2]=line[i][0]+dx*size;flat[i*2+1]=line[i][1]+dz*size;}
        roads.push(flat);
      }
    }
    return {n,size,tx,tz,sun:[sun.x,sun.y,sun.z],fields,trees:new Float32Array(trees),walls:new Float32Array(walls),roads};
  }

  maskTexture(pixels,n) {
    // RGBA bytes keep the ground mask independent of colour and avoid a second
    // GPU texture for each streamed tile.
    const texture=new THREE.DataTexture(pixels,n,n,THREE.RGBAFormat);
    texture.generateMipmaps=true;
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.anisotropy=4;
    texture.needsUpdate=true;
    return texture;
  }

  // Build 277: masks are drawn off the main thread when the browser can
  // (Worker + OffscreenCanvas: Safari 16.4+, so every iPad this app runs on).
  maskWorker() {
    if(this.maskWorkerState===false)return null;
    if(this.maskWorkerState)return this.maskWorkerState;
    try{
      if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof Blob==='undefined')throw Error('unsupported');
      const source='const draw='+rhineMaskDraw.toString()+';'+
        'onmessage=e=>{const job=e.data;try{const canvas=new OffscreenCanvas(job.n,job.n);'+
        'const pixels=draw(canvas.getContext("2d"),job);postMessage({id:job.id,pixels},[pixels.buffer]);}'+
        'catch(err){postMessage({id:job.id,error:String(err)});}};';
      const url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
      const worker=new Worker(url);URL.revokeObjectURL(url);
      worker.onmessage=e=>this.maskDone(e.data);
      worker.onerror=e=>{e.preventDefault?.();this.maskDone({id:this.maskJob?.id,error:'worker error'});};
      return this.maskWorkerState=worker;
    }catch(err){this.maskWorkerState=false;return null;}
  }

  maskDone(message) {
    const job=this.maskJob;
    if(!job||job.id!==message.id)return;
    this.maskJob=null;
    if(message.error){
      // Fall back to the main thread for good; the next frame restarts the tile.
      console.warn('Rhine Ultra mask worker:',message.error);
      this.maskWorkerState?.terminate?.();this.maskWorkerState=false;return;
    }
    if(this.disposed)return;
    if(this.maps.get(job.tile)===job.record&&!job.record.texture)job.record.mask.value=job.record.texture=this.maskTexture(message.pixels,job.n);
  }

  styleTerrain(shader,mask,blend,relief) {
    shader.uniforms.ultraLandMask=mask;
    shader.uniforms.ultraMaskBlend=blend;
    shader.uniforms.ultraRelief=relief;
    shader.vertexShader='varying float ultraGroundHeight;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nultraGroundHeight=(modelMatrix*vec4(transformed,1.0)).y;');
    shader.fragmentShader='uniform sampler2D ultraLandMask,ultraRelief; uniform vec2 ultraFocus; uniform float ultraMaskBlend,ultraReliefOn,ultraGroundDetail; varying float ultraGroundHeight;\n'+shader.fragmentShader;
    // Per-pixel ground normal from the baked relief (replaces the coarse mesh normal).
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      vec4 ultraReliefSample=texture2D(ultraRelief,landCoverUv);
      if(ultraReliefOn>.5){
        vec3 reliefNormal=normalize(vec3(ultraReliefSample.r*2.0-1.0,ultraReliefSample.b,ultraReliefSample.g*2.0-1.0));
        normal=normalize((viewMatrix*vec4(reliefNormal,0.0)).xyz);
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', /* glsl */`
      #include <roughnessmap_fragment>
      float maskFade=1.0-smoothstep(3000.0,4250.0,length(rhineGround-ultraFocus));
      float nearLand=maskFade*ultraMaskBlend;
      vec4 landMask=texture2D(ultraLandMask,landCoverUv);
      vec2 broad=texture2D(ultraNoise,rhineGround*.00113).rg;
      float textureGrain=texture2D(ultraNoise,rhineGround*.014).g;
      float woods=smoothstep(.61,.90,landMask.b);
      float field=smoothstep(.055,.20,landMask.r)*(1.0-woods)*nearLand;
      float bearing=clamp((landMask.r-.224)*1.37,0.0,1.0)*3.141593;
      vec2 acrossRows=vec2(-sin(bearing),cos(bearing));
      float cropMix=clamp((landMask.b-.07)*2.05,0.0,1.0);
      float rowAxis=dot(rhineGround,acrossRows);
      float phase=rowAxis*mix(.58,1.02,cropMix)+2.3*broad.y;
      // Sample the spatial derivatives against the same bearing. At field
      // borders the bearing itself changes, so there the lines fade instead.
      float footprint=length(fwidth(rhineGround));
      float rowContrast=.115*(1.0-smoothstep(1.5,7.0,footprint));
      rowContrast*=1.0-smoothstep(.008,.067,fwidth(landMask.r));
      float swaths=sin(phase)*rowContrast+(sin(phase*.21)-.4)*rowContrast*.30;
      vec3 pasture=mix(vec3(.79,.88,.81),vec3(1.01,1.01,.91),broad.r);
      vec3 crop=mix(vec3(1.10,.94,.77),vec3(.83,.99,.81),smoothstep(.02,.65,cropMix));
      crop=mix(crop,vec3(.78,.89,.83),smoothstep(.68,1.0,cropMix))*(1.0+swaths);
      crop*=mix(.83,1.11,broad.r);
      vec3 forest=mix(vec3(.53,.66,.59),vec3(.81,.87,.73),broad.y);
      vec3 groundTint=mix(mix(pasture,crop,field),forest,woods*nearLand*.94);
      diffuseColor.rgb *= groundTint * (.91+textureGrain*.18);
      float village=smoothstep(.36,.83,landMask.a)*nearLand;
      float verge=smoothstep(.075,.29,landMask.a)*(1.0-village)*nearLand;
      vec3 packedGround=mix(vec3(.226,.206,.148),vec3(.37,.32,.238),.36*broad.y+.64*textureGrain);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.80,.78,.67),verge*.45);
      diffuseColor.rgb=mix(diffuseColor.rgb,packedGround,village*.62);
      // Build 277 (phase 3): close-range ground detail - grass tufts, soil and
      // furrow grain at metre scale, faded out with the pixel footprint so it
      // never shimmers at distance.
      if(ultraGroundDetail>.5){
        float closeUp=1.0-smoothstep(.35,2.4,footprint);
        float tufts=texture2D(ultraNoise,rhineGround*.47).b;
        float fine=texture2D(ultraNoise,rhineGround*1.9+vec2(.31,.17)).g;
        float clumps=texture2D(ultraNoise,rhineGround*.12).r;
        vec3 detail=mix(vec3(.82,.86,.74),vec3(1.12,1.10,.95),tufts*.65+fine*.35);
        detail*=mix(.90,1.06,clumps);
        detail=mix(detail,vec3(1.0)+(fine-.5)*.22,woods*.6);
        diffuseColor.rgb*=mix(vec3(1.0),detail,closeUp*.85);
      }
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <output_fragment>', /* glsl */`
      outgoingLight *= rhineCloudShadow(rhineGround,ultraGroundHeight)*(1.0-ultraDaylight*.61*landMask.g*nearLand);
      outgoingLight *= mix(1.0,mix(.52,1.0,ultraReliefSample.a),ultraReliefOn*ultraDaylight);
      outgoingLight=rhineDistanceLight(outgoingLight,vec3(rhineGround.x,ultraGroundHeight,rhineGround.y));
      #include <output_fragment>
    `);
  }

  styleWater(shader) {
    shader.fragmentShader=shader.fragmentShader.replace('#include <output_fragment>', /* glsl */`
      vec2 rippleUV=mat2(.81,-.59,.59,.81)*waterWorld.xz*.021;
      vec2 rippleA=texture2D(ultraNoise,rippleUV+vec2(.027,-.018)*waterTime).gb-.5;
      vec2 rippleB=texture2D(ultraNoise,rippleUV.yx*1.93+vec2(-.018,.009)*waterTime).bg-.5;
      vec3 rippleNormal=normalize(surfaceNormal+vec3(.27*(rippleA.x+rippleB.x*.44),0.0,.27*(rippleA.y+rippleB.y*.44)));
      vec3 mirror=reflect(-eye,rippleNormal);
      float waterFresnel=.15+.78*pow(1.0-max(0.0,dot(eye,rippleNormal)),4.0);
      vec3 reflectedSky=rhineSky(mirror,waterWorld);
      float glint=pow(max(0.0,dot(mirror,ultraSun)),185.0);
      vec3 riverColour=vec3(.077,.14,.136)*(.94+rippleA.y*.27);
      if(ultraDaylight<.1)riverColour*=mix(.32,1.0,ultraDaylight/.1);
      outgoingLight=mix(riverColour,reflectedSky*.70,waterFresnel);
      outgoingLight+=vec3(.92,.77,.50)*glint*.56*ultraDaylight;
      outgoingLight*=rhineCloudShadow(waterWorld.xz,waterWorld.y);
      outgoingLight=rhineDistanceLight(outgoingLight,waterWorld);
      #include <output_fragment>
    `);
  }

  styleRoad(shader){
    this.styleScenery(shader);
    shader.vertexShader='attribute vec2 roadProfile; varying vec2 ultraRoad;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nultraRoad=roadProfile;');
    shader.fragmentShader='varying vec2 ultraRoad;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',/* glsl */`
      #include <color_fragment>
      if(ultraRoad.y>.1){
        float across=abs(ultraRoad.x*2.0-1.0);
        vec2 world=ultraPosition.xz;
        vec2 grain=texture2D(ultraNoise,world*.071).gb;
        float patches=texture2D(ultraNoise,world*.009).g;
        float nearDetail=1.0-smoothstep(.12,1.40,length(fwidth(world)));
        vec3 dust=mix(vec3(.23,.19,.126),vec3(.37,.31,.209),grain.x);
        vec3 verge=mix(vec3(.13,.17,.088),dust,.48+patches*.39);
        vec3 finish;
        if(ultraRoad.y<.38){
          float tracks=1.0-smoothstep(.13,.30,abs(across-.52));
          finish=mix(verge,dust*(.81+grain.y*.37),tracks*.85);
        }else if(ultraRoad.y<.63){
          float aggregate=texture2D(ultraNoise,world*.57).b;
          finish=mix(vec3(.174,.158,.129),vec3(.286,.252,.197),patches);
          finish*=.92+.33*(aggregate-.5)*nearDetail;
          vec2 stones=mat2(.94,-.342,.342,.94)*world*2.6;
          stones.x+=mod(floor(stones.y),2.0)*.5;
          vec2 joint=abs(fract(stones)-.5);
          float grout=smoothstep(.38,.49,max(joint.x,joint.y));
          finish*=1.0-.26*grout*nearDetail*smoothstep(.40,.76,patches);
        }else if(ultraRoad.y<.88){
          finish=mix(vec3(.118,.119,.109),vec3(.207,.197,.168),patches)*(.93+.14*grain.x);
        }else{
          float rail=1.0-smoothstep(.022,.09,abs(across-.46));
          finish=mix(dust*.72,vec3(.36,.34,.29),rail);
        }
        float shoulder=smoothstep(.67+patches*.14,.98,across);
        diffuseColor.rgb=mix(finish,verge,shoulder);
      }
    `);
  }

  styleScenery(shader,kind='landscape') {
    const canopy=kind==='canopy',roof=kind==='roof',wall=kind==='wall';
    const buildingVaryings=(roof?'varying vec4 ultraRoof;\n':'')+
      (roof||wall?'varying vec4 ultraBuilding;\n':'');
    shader.vertexShader='varying vec3 ultraPosition;\n'+shader.vertexShader;
    shader.vertexShader=buildingVaryings+shader.vertexShader;
    const crownShape=canopy?/* glsl */`
      #ifdef USE_INSTANCING
        float crown=1.0-forestStem;
        vec2 relative=transformed.xz-forestRoot.xy;
        float specimen=fract(forestTint*5.73);
        vec2 shape=mix(vec2(.74,.98),vec2(.98,.78),specimen);
        transformed.xz-=relative*(1.0-shape)*crown;
        float lobe=forestRoot.z-.5;
        transformed.y+=crown*(lobe*4.1+(specimen-.5)*position.y*.25);
        float wind=sin(dot(instanceMatrix[3].xz,vec2(.021,.028))+ultraWind.x*.19);
        transformed.xz+=vec2(wind*.054,wind*.023)*crown*smoothstep(3.0,23.0,position.y);
      #endif`:'';
    if(canopy)shader.vertexShader='uniform vec2 ultraWind;\n'+shader.vertexShader;
    const buildingCoordinates=roof||wall?/* glsl */`
      vec2 buildingOrigin=modelMatrix[3].xz;
      #ifdef USE_INSTANCING
        buildingOrigin=instanceMatrix[3].xz;
      #endif
      ultraBuilding=vec4(position,fract(sin(dot(floor(buildingOrigin*2.0),vec2(.0491,.1373)))*43758.54));
    `:'';
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>', /* glsl */`
      ${crownShape}
      #include <project_vertex>
      vec4 ultraVertex=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        ultraVertex=instanceMatrix*ultraVertex;
        ${roof?'ultraRoof=vec4(position.xz,length(instanceMatrix[0].xyz)>6.5?instanceMatrix[3].xz:vec2(-10000.0));':''}
      #endif
      ${roof?'#ifndef USE_INSTANCING\nultraRoof=vec4(position.xz,modelMatrix[3].xz);\n#endif':''}
      ${buildingCoordinates}
      ultraPosition=(modelMatrix*ultraVertex).xyz;
    `);
    shader.fragmentShader='varying vec3 ultraPosition;\n'+buildingVaryings+shader.fragmentShader;
    const foliage=canopy?/* glsl */`
      vec2 leafUv=ultraPosition.xz*.089+ultraPosition.y*vec2(.033,-.052);
      vec2 spray=texture2D(ultraNoise,leafUv).gb;
      float leafDetail=1.0-smoothstep(.45,2.8,length(fwidth(ultraPosition)));
      float edge=1.0-abs(dot(normal,normalize(vViewPosition)));
      if(forestStem<.5 && edge*leafDetail>.48 && spray.x<.37+.13*edge) discard;
      vec3 leafTone=mix(vec3(.53,.68,.57),vec3(1.42,1.38,1.03),smoothstep(.30,.69,spray.x));
      vec3 leafSpecies=mix(vec3(.79,1.06,1.0),vec3(1.14,1.03,.76),forestTint);
      outgoingLight*=mix(vec3(1.0),leafSpecies*mix(vec3(1.0),leafTone,leafDetail),(1.0-forestStem));
    `:'';
    // Keep these visual roof breaks within the bridge and railway districts.
    // Small roof meshes sharing this material (dormers/spires) stay intact.
    const roofWear=roof?/* glsl */`
      float roofing=ultraBuilding.w;
      float eaves=smoothstep(.012,.11,ultraBuilding.y);
      vec3 roofTone=mix(vec3(.83,.92,1.04),vec3(1.21,1.10,.88),roofing);
      outgoingLight*=roofTone*mix(.72,1.12,eaves);
      float roofSeed=fract(sin(dot(floor(ultraRoof.zw*2.0),vec2(.0623,.1141)))*43758.54);
      bool bridgeDistrict=length((ultraRoof.zw-vec2(13800.0,15150.0))*vec2(1.3,.85))<1200.0;
      vec2 tear=ultraRoof.xy-vec2((roofSeed-.9)*2.0,.21);
      float fracture=length(tear*vec2(1.03,1.6))+patina.y*.16;
      if(bridgeDistrict && roofSeed>.87){
        if(fracture<.16) discard;
        outgoingLight*=mix(.45,1.0,smoothstep(.16,.35,fracture));
      }
    `:'';
    const masonry=wall?/* glsl */`
      float baseStone=1.0-smoothstep(-.44,-.27,ultraBuilding.y+patina.x*.045);
      float corner=smoothstep(.435,.492,min(abs(ultraBuilding.x),abs(ultraBuilding.z)));
      float mortar=1.0-smoothstep(.028,.10,abs(fract(ultraPosition.y*2.34)-.5));
      vec3 plaster=mix(vec3(.88,.98,1.10),vec3(1.27,1.12,.88),ultraBuilding.w);
      outgoingLight*=plaster;
      outgoingLight=mix(outgoingLight,outgoingLight*vec3(.75,.77,.73),baseStone*.83);
      outgoingLight+=outgoingLight*vec3(.17,.14,.095)*corner*(1.0-.72*mortar);
      // Build 277 (phase 3): lit windows at dusk and night. A window grid in
      // the wall's own box coordinates; roughly a third of the rooms are lit.
      if(ultraNight>.01){
        vec2 facade=vec2(abs(ultraBuilding.x)>abs(ultraBuilding.z)?ultraBuilding.z:ultraBuilding.x,ultraBuilding.y);
        vec2 cellPos=vec2(facade.x*5.0,facade.y*3.2+.15);
        vec2 cellId=floor(cellPos),inCell=fract(cellPos);
        float pane=step(.28,inCell.x)*step(inCell.x,.72)*step(.30,inCell.y)*step(inCell.y,.78);
        float room=fract(sin(dot(cellId+ultraBuilding.w*37.0,vec2(12.9898,78.233)))*43758.5453);
        float flicker=.85+.15*sin(ultraWind.x*.7+room*30.0);
        float upper=step(-.38,ultraBuilding.y);
        outgoingLight+=vec3(1.0,.70,.34)*pane*step(.66,room)*upper*ultraNight*.85*flicker;
      }
    `:'';
    shader.fragmentShader=shader.fragmentShader.replace('#include <output_fragment>', /* glsl */`
      vec2 patina=texture2D(ultraNoise,ultraPosition.xz*.019+ultraPosition.y*vec2(.011,-.008)).gb;
      outgoingLight *= (.82+.28*patina.x+.12*patina.y)*rhineCloudShadow(ultraPosition.xz,ultraPosition.y);
      ${foliage}
      ${roofWear}
      ${masonry}
      outgoingLight=rhineDistanceLight(outgoingLight,ultraPosition);
      #include <output_fragment>
    `);
  }

  dispose() {
    this.riverLife?.dispose();
    this.scene.remove(this.roofTrim);
    this.roofTrim.dispose();
    this.roofTrim.geometry.dispose();
    this.roofTrim.material.dispose();
    this.scene.remove(this.sky);
    if(this.envScene){this.envParts.skyMaterial.dispose();this.envParts.groundMaterial.dispose();this.envParts.floor.geometry.dispose();
      this.envTarget?.dispose();this.pmrem.dispose();this.envScene=null;this.envTarget=null;}
    this.sky.geometry.dispose();this.sky.material.dispose();
    for(const [material,{before,cacheKey}] of this.hooks){
      material.onBeforeCompile=before;material.customProgramCacheKey=cacheKey;material.needsUpdate=true;
    }
    for(const {texture} of this.maps.values())texture?.dispose();
    for(const {texture} of this.relief.values())texture?.dispose();
    this.flatRelief.dispose();this.relief.clear();this.reliefJob=null;this.maskJob=null;
    this.disposed=true;this.maskWorkerState?.terminate?.();this.maskWorkerState=false;
    this.emptyMask.dispose();this.noise.dispose();
    this.hooks.clear();this.maps.clear();
  }

  static makeNoise() {
    const size=256,pixels=new Uint8Array(size*size*4);
    // Periodic, deterministic value noise in three scales for cloud cover,
    // finer land grain and animation on the water. No external image files.
    const layer=(cells,salt)=>{
      let seed=salt;
      const lattice=Float32Array.from({length:cells*cells},()=>{
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;
      });
      const grid=(x,y)=>lattice[(y&(cells-1))*cells+(x&(cells-1))];
      return (u,v)=>{
        const a=u*cells,b=v*cells,x=Math.floor(a),y=Math.floor(b);
        const p=a-x,q=b-y,s=p*p*(3-2*p),t=q*q*(3-2*q);
        return (grid(x,y)*(1-s)+grid(x+1,y)*s)*(1-t)+(grid(x,y+1)*(1-s)+grid(x+1,y+1)*s)*t;
      };
    };
    const large=layer(4,87),medium=layer(8,123),small=layer(16,23),fine=layer(32,65),grain=layer(64,54);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=x/size,v=y/size,i=(y*size+x)*4;
      const shift=(medium(u+.40,v+.18)-.5)*.12;
      pixels[i]=Math.round(255*(.51*large(u+shift,v-shift)+.26*medium(u,v)+.14*small(u,v)+.06*fine(u,v)+.03*grain(u,v)));
      pixels[i+1]=Math.round(255*(.47*small(u+.22,v+.61)+.37*fine(u,v)+.16*grain(u,v)));
      pixels[i+2]=Math.round(255*(.34*medium(u+.5,v)+.42*small(u,v)+.24*fine(u+.2,v-.2)));
      pixels[i+3]=255;
    }
    const texture=new THREE.DataTexture(pixels,size,size);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.generateMipmaps=true;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.needsUpdate=true;
    return texture;
  }
}

// Browser frame intervals include time waiting for the GPU and compositor.
// Use the full interval, independent of the game's clamped simulation step.
class RhineFrameRate {
  constructor() {
    this.samples=new Float32Array(300);
    this.reset();
  }

  reset() {
    this.length=0;
    this.elapsed=0;
  }

  sample(dt) {
    if(!Number.isFinite(dt)||dt<=0)return null;
    this.samples[this.length++]=dt*1000;
    this.elapsed+=dt;
    if(this.elapsed<1.5&&this.length<this.samples.length)return null;
    const sorted=this.samples.subarray(0,this.length).sort();
    const report={fps:this.length/this.elapsed,p95:sorted[Math.ceil(this.length*.95)-1]};
    this.reset();
    return report;
  }
}
