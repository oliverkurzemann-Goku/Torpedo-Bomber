// Optional Rhine renderer: the existing terrain and object placements feed these
// visual layers. All extra textures and material hooks are owned by this preset.
const RHINE_ULTRA_ATMOSPHERE = /* glsl */`
  uniform sampler2D ultraNoise;
  uniform vec3 ultraHorizon, ultraZenith, ultraSun;
  uniform vec2 ultraWind;
  uniform float ultraDeck, ultraCover, ultraDaylight;

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

class RhineUltra {
  constructor(scene, terrain, osm, sun, world) {
    this.scene=scene;
    this.terrain=terrain;
    this.osm=osm;
    this.maps=new Map();
    this.hooks=new Map();
    this.wait=0;
    this.emptyMask=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
    this.emptyMask.needsUpdate=true;
    this.noise=RhineUltra.makeNoise();
    this.uniforms={
      ultraNoise:{value:this.noise}, ultraHorizon:{value:new THREE.Color()}, ultraZenith:{value:new THREE.Color()},
      ultraSun:{value:sun.position.clone().normalize()}, ultraWind:{value:new THREE.Vector2()},
      ultraFocus:{value:new THREE.Vector2()},
      ultraDeck:{value:1800}, ultraCover:{value:.4}, ultraDaylight:{value:1}
    };
    this.sky=this.makeSky();
    scene.add(this.sky);
    this.riverLife=world&&new RhineRiverLife(scene,world);

    for(const tile of terrain.tiles.values())if(tile.materialOverride){
      const mask={value:this.emptyMask};
      const blend={value:0};
      this.maps.set(tile,{mask,blend,texture:null});
      this.extend(tile.materialOverride,'terrain',shader=>this.styleTerrain(shader,mask,blend));
    }
    for(const material of [osm.riverMat,osm.lakeMat])this.extend(material,'water',shader=>this.styleWater(shader));
    for(const material of [osm.coniferMat,osm.deciduousMat,osm.poplarMat,osm.willowMat]){
      this.extend(material,'canopy',shader=>this.styleScenery(shader,'canopy'));
    }
    for(const material of [osm.roofMat,osm.roofSlateMat,osm.roofBrownMat]){
      this.extend(material,'roof',shader=>this.styleScenery(shader,'roof'));
    }
    for(const material of [osm.roadMat,osm.railMat,osm.forestFloorMat,
      osm.shrubMat,osm.trunkMat,osm.buildingWarmMat,osm.buildingCoolMat,
      osm.buildingOchreMat,osm.buildingBrickMat,
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

  setWeather(w, night) {
    const u=this.uniforms;
    const light=night?0:Math.max(0,Math.min(1,(w.sun-.22)*1.35));
    u.ultraHorizon.value.copy(this.scene.background);
    if(!night)u.ultraHorizon.value.lerp(new THREE.Color(0xdacbb1),.14*light);
    u.ultraZenith.value.copy(u.ultraHorizon.value).lerp(new THREE.Color(night?0x030910:0x3975a1),night?.75:.70*light);
    u.ultraDeck.value=w.base+w.depth*.30;
    u.ultraCover.value=w.cover;
    u.ultraDaylight.value=light;
    if(this.riverLife)this.riverLife.bankLight.value=light;
  }

  update(dt,x,z,altitude,emitSteam) {
    this.riverLife?.update(dt,x,z,altitude,emitSteam);
    this.uniforms.ultraWind.value.x-=dt*9;
    this.uniforms.ultraWind.value.y+=dt*4;
    this.uniforms.ultraFocus.value.set(x,z);
    // One distant mask per interval. Keep just the tiles whose fields and
    // shadows can be read from the aircraft, with hysteresis for eviction.
    this.wait-=dt;
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
    if(next&&this.wait<=0){
      this.wait=.14;
      const record=this.maps.get(next);
      record.mask.value=record.texture=this.makeLandMask(next.tileX,next.tileZ);
    }
  }

  makeLandMask(tx,tz) {
    // R encodes each parcel's row orientation, G carries projected shadows,
    // and B carries the crop mix, with the top of its range reserved for woods.
    const size=this.terrain.tileSize,n=512;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=n;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#000';ctx.fillRect(0,0,n,n);
    ctx.scale(n/size,n/size);
    const data=this.osm.sourceTiles.get(tx+','+tz);
    for(const [rings,woods] of [[data?.farmland,false],[data?.forests,true]]){
      for(const ring of rings||[]){
        if(ring.length<3)continue;
        let bearing=0,longest=0;
        ctx.beginPath();
        ctx.moveTo(...ring[0]);
        for(let i=0;i<ring.length;i++){
          const [x,z]=ring[i],[nx,nz]=ring[(i+1)%ring.length];
          const dx=nx-x,dz=nz-z,length=dx*dx+dz*dz;
          if(length>longest){longest=length;bearing=Math.atan2(dz,dx);}
          ctx.lineTo(nx,nz);
        }
        const heading=((bearing/Math.PI)%1+1)%1;
        const red=Math.round(57+186*heading);
        const blue=Math.round(18+124*osmHash(tx*size+ring[0][0],tz*size+ring[0][1],1668));
        ctx.fillStyle=woods?'#0000f4':'rgb('+red+',0,'+blue+')';
        ctx.closePath();ctx.fill();
      }
    }

    ctx.globalCompositeOperation='lighter';
    const sun=this.uniforms.ultraSun.value,ox=tx*size,oz=tz*size;
    const angle=Math.atan2(-sun.z,-sun.x),shadowStretch=Math.hypot(sun.x,sun.z)/sun.y;
    // Include nearby casters in neighbouring tiles so their shadows cross seams.
    for(let nz=tz-1;nz<=tz+1;nz++)for(let nx=tx-1;nx<=tx+1;nx++){
      const group=this.osm.tiles.get(nx+','+nz)?.farGroup;
      for(const mesh of group?.children||[]){
        const tree=mesh.name.startsWith('osmForest')&&!mesh.name.includes('Trunk');
        const wall=mesh.name.startsWith('osmBuildingWalls');
        if(!mesh.isInstancedMesh||(!tree&&!wall))continue;
        const m=mesh.instanceMatrix.array;
        ctx.fillStyle=tree?'#003600':'#009000';
        for(let i=0;i<mesh.count*16;i+=16){
          const x=m[i+12]-ox,z=m[i+14]-oz;
          if(m[i+5]<=0||x< -75||z< -75||x>size+75||z>size+75)continue;
          const height=tree?Math.min(26,m[i+5]*17):Math.min(26,m[i+5]*.75);
          const dx=-sun.x/sun.y*height,dz=-sun.z/sun.y*height;
          const radius=Math.hypot(m[i],m[i+2]);
          if(tree){
            ctx.beginPath();ctx.ellipse(x+dx*.75,z+dz*.75,Math.max(3,radius*.90+height*shadowStretch*.45),
              Math.max(2,radius*.63),angle,0,Math.PI*2);ctx.fill();
          }else{
            // Use the same rotated wall footprint; offset along the sun ray.
            ctx.beginPath();
            ctx.moveTo(x-m[i]*.5-m[i+8]*.5+dx*.25,z-m[i+2]*.5-m[i+10]*.5+dz*.25);
            ctx.lineTo(x+m[i]*.5-m[i+8]*.5+dx*.74,z+m[i+2]*.5-m[i+10]*.5+dz*.74);
            ctx.lineTo(x+m[i]*.5+m[i+8]*.5+dx,z+m[i+2]*.5+m[i+10]*.5+dz);
            ctx.lineTo(x-m[i]*.5+m[i+8]*.5+dx*.63,z-m[i+2]*.5+m[i+10]*.5+dz*.63);
            ctx.closePath();ctx.fill();
          }
        }
      }
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.anisotropy=4;
    return texture;
  }

  styleTerrain(shader,mask,blend) {
    shader.uniforms.ultraLandMask=mask;
    shader.uniforms.ultraMaskBlend=blend;
    shader.fragmentShader='uniform sampler2D ultraLandMask; uniform vec2 ultraFocus; uniform float ultraMaskBlend;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', /* glsl */`
      #include <roughnessmap_fragment>
      float maskFade=1.0-smoothstep(3000.0,4250.0,length(rhineGround-ultraFocus));
      float nearLand=maskFade*ultraMaskBlend;
      vec3 landMask=texture2D(ultraLandMask,landCoverUv).rgb;
      vec2 broad=texture2D(ultraNoise,rhineGround*.00113).rg;
      float textureGrain=texture2D(ultraNoise,rhineGround*.014).g;
      float woods=smoothstep(.61,.90,landMask.b);
      float field=smoothstep(.055,.20,landMask.r)*(1.0-woods)*nearLand;
      float bearing=clamp((landMask.r-.224)*1.37,0.0,1.0)*3.141593;
      vec2 acrossRows=vec2(-sin(bearing),cos(bearing));
      float cropMix=clamp((landMask.b-.07)*2.05,0.0,1.0);
      float rowAxis=dot(rhineGround,acrossRows);
      float phase=rowAxis*mix(.33,.71,cropMix)+1.10*broad.y;
      // Sample the spatial derivatives against the same bearing. At field
      // borders the bearing itself changes, so there the lines fade instead.
      float footprint=length(fwidth(rhineGround));
      float rowContrast=.15*(1.0-smoothstep(1.8,8.0,footprint));
      rowContrast*=1.0-smoothstep(.008,.067,fwidth(landMask.r));
      float swaths=sin(phase)*rowContrast+(sin(phase*.21)-.4)*rowContrast*.30;
      vec3 pasture=mix(vec3(.83,.94,.80),vec3(1.03,1.04,.87),broad.r);
      vec3 crop=mix(vec3(1.19,.88,.59),vec3(.79,1.03,.65),smoothstep(.02,.65,cropMix));
      crop=mix(crop,vec3(.74,.90,.79),smoothstep(.68,1.0,cropMix))*(1.0+swaths);
      crop*=mix(.84,1.13,broad.r);
      vec3 forest=mix(vec3(.53,.66,.59),vec3(.81,.87,.73),broad.y);
      vec3 groundTint=mix(mix(pasture,crop,field),forest,woods*nearLand*.94);
      diffuseColor.rgb *= groundTint * (.91+textureGrain*.18);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <output_fragment>', /* glsl */`
      outgoingLight *= rhineCloudShadow(rhineGround,0.0)*(1.0-ultraDaylight*.61*landMask.g*nearLand);
      #include <output_fragment>
    `);
  }

  styleWater(shader) {
    shader.fragmentShader=shader.fragmentShader.replace('#include <output_fragment>', /* glsl */`
      vec2 rippleUV=waterWorld.xz*.023;
      vec2 rippleA=texture2D(ultraNoise,rippleUV+vec2(.027,-.018)*waterTime).gb-.5;
      vec2 rippleB=texture2D(ultraNoise,rippleUV.yx*1.93+vec2(-.018,.009)*waterTime).bg-.5;
      vec3 rippleNormal=normalize(surfaceNormal+vec3(.27*(rippleA.x+rippleB.x*.44),0.0,.27*(rippleA.y+rippleB.y*.44)));
      vec3 mirror=reflect(-eye,rippleNormal);
      float waterFresnel=.27+.68*pow(1.0-max(0.0,dot(eye,rippleNormal)),3.0);
      vec3 reflectedSky=rhineSky(mirror,waterWorld);
      float glint=pow(max(0.0,dot(mirror,ultraSun)),185.0);
      vec3 riverColour=vec3(.071,.159,.153)*(.94+rippleA.y*.22);
      if(ultraDaylight<.1)riverColour*=mix(.32,1.0,ultraDaylight/.1);
      outgoingLight=mix(riverColour,reflectedSky*.70,waterFresnel);
      outgoingLight+=vec3(.92,.77,.50)*glint*.56*ultraDaylight;
      outgoingLight*=rhineCloudShadow(waterWorld.xz,waterWorld.y);
      #include <output_fragment>
    `);
  }

  styleScenery(shader,kind='landscape') {
    const canopy=kind==='canopy',roof=kind==='roof';
    const roofVaryings=roof?'varying vec4 ultraRoof;\n':'';
    shader.vertexShader='varying vec3 ultraPosition;\n'+shader.vertexShader;
    shader.vertexShader=roofVaryings+shader.vertexShader;
    const crownShape=canopy?/* glsl */`
      #ifdef USE_INSTANCING
        float lobe=forestRoot.z-.5;
        transformed.xz += (transformed.xz-forestRoot.xy)*lobe*.28*(1.0-forestStem);
        transformed.y += lobe*5.6*(1.0-forestStem);
      #endif`:'';
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>', /* glsl */`
      ${crownShape}
      #include <project_vertex>
      vec4 ultraVertex=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        ultraVertex=instanceMatrix*ultraVertex;
        ${roof?'ultraRoof=vec4(position.xz,length(instanceMatrix[0].xyz)>6.5?instanceMatrix[3].xz:vec2(-10000.0));':''}
      #endif
      ${roof?'#ifndef USE_INSTANCING\nultraRoof=vec4(position.xz,modelMatrix[3].xz);\n#endif':''}
      ultraPosition=(modelMatrix*ultraVertex).xyz;
    `);
    shader.fragmentShader='varying vec3 ultraPosition;\n'+roofVaryings+shader.fragmentShader;
    const foliage=canopy?/* glsl */`
      vec2 leafUv=ultraPosition.xz*.063+ultraPosition.y*vec2(.037,-.023);
      vec2 spray=texture2D(ultraNoise,leafUv).gb;
      float leafDetail=1.0-smoothstep(.32,2.9,length(fwidth(ultraPosition)));
      float edge=1.0-abs(dot(normal,normalize(vViewPosition)));
      if(forestStem<.5 && edge*leafDetail>.64 && spray.x<.42) discard;
      vec3 leafTone=mix(vec3(.64,.77,.63),vec3(1.30,1.30,.95),smoothstep(.30,.69,spray.x));
      outgoingLight*=mix(vec3(1.0),leafTone,(1.0-forestStem)*leafDetail);
    `:'';
    // Keep these visual roof breaks within the bridge and railway districts.
    // Small roof meshes sharing this material (dormers/spires) stay intact.
    const roofWear=roof?/* glsl */`
      float roofSeed=fract(sin(dot(floor(ultraRoof.zw*2.0),vec2(.0623,.1141)))*43758.54);
      bool bridgeDistrict=length((ultraRoof.zw-vec2(13800.0,15150.0))*vec2(1.3,.85))<1200.0;
      vec2 tear=ultraRoof.xy-vec2((roofSeed-.9)*2.0,.21);
      float fracture=length(tear*vec2(1.03,1.6))+patina.y*.16;
      if(bridgeDistrict && roofSeed>.87){
        if(fracture<.16) discard;
        outgoingLight*=mix(.45,1.0,smoothstep(.16,.35,fracture));
      }
    `:'';
    shader.fragmentShader=shader.fragmentShader.replace('#include <output_fragment>', /* glsl */`
      vec2 patina=texture2D(ultraNoise,ultraPosition.xz*.019+ultraPosition.y*vec2(.011,-.008)).gb;
      outgoingLight *= (.82+.28*patina.x+.12*patina.y)*rhineCloudShadow(ultraPosition.xz,ultraPosition.y);
      ${foliage}
      ${roofWear}
      #include <output_fragment>
    `);
  }

  dispose() {
    this.riverLife?.dispose();
    this.scene.remove(this.sky);
    this.sky.geometry.dispose();this.sky.material.dispose();
    for(const [material,{before,cacheKey}] of this.hooks){
      material.onBeforeCompile=before;material.customProgramCacheKey=cacheKey;material.needsUpdate=true;
    }
    for(const {texture} of this.maps.values())texture?.dispose();
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
