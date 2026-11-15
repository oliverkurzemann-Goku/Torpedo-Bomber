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
    this.roofClock=0;
    this.roofTrim=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),
      new THREE.MeshLambertMaterial({color:0xffffff}),576);
    this.roofTrim.name='Rhine Ultra ridge caps and eaves';
    this.roofTrim.count=0;
    this.roofTrim.frustumCulled=false;
    this.roofTrim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.roofTrim);

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
    if((this.roofClock-=dt)<=0){
      this.roofClock=.58;
      this.updateRoofTrim(x,z);
    }
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
        if(!woods){
          // A grassy or worn headland follows the actual mapped field edge.
          ctx.save();ctx.globalCompositeOperation='lighter';
          ctx.strokeStyle='rgba(0,76,0,.47)';ctx.lineWidth=15;ctx.lineJoin='round';ctx.stroke();ctx.restore();
        }
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
    shader.vertexShader='varying float ultraGroundHeight;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nultraGroundHeight=(modelMatrix*vec4(transformed,1.0)).y;');
    shader.fragmentShader='uniform sampler2D ultraLandMask; uniform vec2 ultraFocus; uniform float ultraMaskBlend; varying float ultraGroundHeight;\n'+shader.fragmentShader;
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
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <output_fragment>', /* glsl */`
      outgoingLight *= rhineCloudShadow(rhineGround,ultraGroundHeight)*(1.0-ultraDaylight*.61*landMask.g*nearLand);
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
