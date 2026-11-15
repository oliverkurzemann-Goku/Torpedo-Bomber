// Decorative traffic and riparian vegetation for the Rhine Ultra profile.
class RhineRiverLife {
  constructor(scene,world){
    this.world=world;
    this.terrain=world.terrain;
    this.group=new THREE.Group();
    this.group.name='Rhine Ultra river life';
    scene.add(this.group);
    this.route=world.routes.water[0];
    this.wakes=world.landmarks.wakes;
    this.boatMaterial=new THREE.MeshLambertMaterial({vertexColors:true});
    this.boats=this.route?[0,1,2].map((type)=>{
      const mesh=new THREE.Mesh(RhineRiverLife.boatGeometry(type),this.boatMaterial);
      mesh.name=type===0?'Rhine steam tug':'Rhine cargo barge';
      mesh.visible=false;
      this.group.add(mesh);
      return {mesh,type,phase:this.route.length*[.43,1.22,1.71][type],length:type===0?19:32,
        beam:type===0?5.6:7.8,speed:type===0?4.6:3.5,bearing:null};
    }):[];
    this.reedSites=this.findReedSites();
    this.wind={value:0};
    this.bankLight={value:1};
    const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
    material.onBeforeCompile=shader=>{
      shader.uniforms.reedWind=this.wind;
      shader.vertexShader='uniform float reedWind;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
        #include <begin_vertex>
        float gust=sin(reedWind*2.1+instanceMatrix[3].x*.08+instanceMatrix[3].z*.05);
        transformed.x+=gust*position.y*position.y*.11;
        transformed.z+=gust*position.y*position.y*.06;`);
    };
    this.reeds=new THREE.InstancedMesh(RhineRiverLife.reedGeometry(),material,144);
    this.reeds.name='Rhine animated reeds';
    this.reeds.count=0;
    this.reeds.frustumCulled=false;
    this.reeds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.reeds);
    this.shore=this.makeShore();
    this.group.add(this.shore);
    this.shoreSites=[];
    this.matrix=new THREE.Matrix4();this.rotation=new THREE.Quaternion();
    this.position=new THREE.Vector3();this.scale=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);
    this.reedClock=0;
    this.steamClock=0;
  }

  findReedSites(){
    const cells=new Map(),osm=this.world.osm,size=osm.tileSize;
    for(const [key,data] of osm.sourceTiles){
      const [tx,tz]=key.split(',').map(Number);
      for(const ring of data.lakes||[]){
        const area=polygonArea2(ring);
        if(Math.abs(area)<2500)continue;
        const side=Math.sign(area);
        for(const [a,b] of RhineRiverLife.bankEdges(ring,size)){
          const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
          const ux=(b[0]-a[0])/length,uz=(b[1]-a[1])/length;
          const nx=uz*side,nz=-ux*side;
          const count=Math.max(1,Math.ceil(length/28));
          for(let j=0;j<count;j++){
            const x=tx*size+a[0]+ux*length*(j+.5)/count,z=tz*size+a[1]+uz*length*(j+.5)/count;
            const seed=osmHash(x,z,1844);
            if(seed<.35)continue;
            const cell=Math.floor(x/24)+','+Math.floor(z/24);
            if(!cells.has(cell))cells.set(cell,{x,z,ux,uz,nx,nz,seed,halfLength:length/count*.49});
          }
        }
      }
    }
    const tiles=new Map();
    for(const site of cells.values()){
      const key=Math.floor(site.x/size)+','+Math.floor(site.z/size);
      if(!tiles.has(key))tiles.set(key,[]);
      tiles.get(key).push(site);
    }
    return tiles;
  }

  static *bankEdges(ring,size){
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      // The inland tile's clipped edge is a seam through the water.
      if((a[0]<.08&&b[0]<.08)||(a[0]>size-.08&&b[0]>size-.08)||
        (a[1]<.08&&b[1]<.08)||(a[1]>size-.08&&b[1]>size-.08))continue;
      if(Math.hypot(b[0]-a[0],b[1]-a[1])>1)yield [a,b];
    }
  }

  makeShore(){
    const geometry=new THREE.BufferGeometry(),capacity=48*3*2*6;
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(capacity*2),2).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0,0);
    const uniforms=THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    uniforms.bankLight=this.bankLight;
    uniforms.bankTime=this.wind;
    const material=new THREE.ShaderMaterial({uniforms,fog:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,
      vertexShader:/* glsl */`
        varying vec2 bankUv, bankWorld;
        #include <fog_pars_vertex>
        void main(){
          bankUv=uv;bankWorld=position.xz;
          vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader:/* glsl */`
        varying vec2 bankUv, bankWorld;
        uniform float bankLight,bankTime;
        #include <fog_pars_fragment>
        void main(){
          float variation=.57+.19*sin(dot(bankWorld,vec2(.095,.049)))+.16*sin(dot(bankWorld,vec2(.127,-.195)));
          float taper=smoothstep(0.0,.16,bankUv.x)*(1.0-smoothstep(.82,1.0,bankUv.x));
          float opacity=taper*(1.0-smoothstep(.09,1.0,bankUv.y))*(.33+.5*variation);
          float ripple=max(0.0,sin(bankUv.y*35.0-bankTime*2.2+variation*8.0))*(1.0-bankUv.y);
          vec3 tint=mix(vec3(.105,.141,.089),vec3(.34,.31,.18),variation);
          tint+=vec3(.060,.064,.048)*ripple;
          gl_FragColor=vec4(tint*(.16+.84*bankLight),opacity);
          #include <fog_fragment>
          #include <encodings_fragment>
        }`});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name='Rhine animated shoals';
    mesh.frustumCulled=false;
    return mesh;
  }

  updateBanks(x,z){
    const size=this.world.osm.tileSize,tx=Math.floor(x/size),tz=Math.floor(z/size);
    const candidates=[];
    for(let nz=tz-1;nz<=tz+1;nz++)for(let nx=tx-1;nx<=tx+1;nx++){
      for(const site of this.reedSites.get(nx+','+nz)||[]){
        const distance=(site.x-x)**2+(site.z-z)**2;
        if(distance<1950**2)candidates.push({site,distance});
      }
    }
    const nearby=candidates.sort((a,b)=>a.distance-b.distance).slice(0,48);
    const geometry=this.shore.geometry,positions=geometry.attributes.position,uv=geometry.attributes.uv;
    let vertices=0,count=0;
    this.shoreSites.length=0;
    for(const {site} of nearby){
      const width=13+site.seed*14,rows=[];
      for(const depth of [.75,5,width*.63,width]){
        const row=[];
        for(const s of [-1,0,1]){
          const px=site.x+site.ux*s*site.halfLength-site.nx*depth;
          const pz=site.z+site.uz*s*site.halfLength-site.nz*depth;
          if(!this.world._pointOnWater(px,pz))break;
          row.push([px,this.terrain.getRenderedHeight(px,pz)+.99,pz,(s+1)/2,depth/width]);
        }
        if(row.length!==3)break;
        rows.push(row);
      }
      if(rows.length<3)continue;
      this.shoreSites.push(site);
      for(let r=1;r<rows.length;r++)for(let s=1;s<3;s++){
        const a=rows[r-1][s-1],b=rows[r-1][s],c=rows[r][s-1],d=rows[r][s];
        for(const [px,py,pz,u,v] of [a,b,c,b,d,c]){
          positions.setXYZ(vertices,px,py,pz);uv.setXY(vertices,u,v);vertices++;
        }
      }
    }
    geometry.setDrawRange(0,vertices);
    positions.needsUpdate=true;uv.needsUpdate=true;
    for(const {site} of nearby)for(let i=0;i<3;i++){
      const along=(i-1)*(4+site.seed*6),inland=2.4+osmHash(site.x+i,site.z,1845)*4.4;
      const px=site.x+site.ux*along+site.nx*inland,pz=site.z+site.uz*along+site.nz*inland;
      if(!this.terrain.tiles.has(Math.floor(px/size)+','+Math.floor(pz/size))||this.world._pointOnWater(px,pz))continue;
      const y=this.terrain.getRenderedHeight(px,pz);
      const waterside=this.terrain.getRenderedHeight(px-site.nx*inland,pz-site.nz*inland);
      if(Math.abs(y-waterside)>3.2)continue;
      this.position.set(px,y-.07,pz);
      this.rotation.setFromAxisAngle(this.up,Math.atan2(site.uz,site.ux)+site.seed);
      this.scale.set(2.3+site.seed*1.8,1.0+site.seed*.65,1.4+site.seed);
      this.reeds.setMatrixAt(count++,this.matrix.compose(this.position,this.rotation,this.scale));
    }
    this.reeds.count=count;
    this.reeds.instanceMatrix.needsUpdate=true;
  }

  update(dt,x,z,altitude,emitSteam){
    this.wind.value+=dt;
    if((this.reedClock-=dt)<=0){
      this.reedClock=.36;
      this.updateBanks(x,z);
    }
    const steam=(this.steamClock-=dt)<=0;
    if(steam)this.steamClock=.7;
    for(const boat of this.boats){
      boat.phase+=dt*boat.speed;
      const centre=this.world._sample(this.route,boat.phase);
      const before=this.world._sample(this.route,boat.phase-9);
      const after=this.world._sample(this.route,boat.phase+9);
      const yaw=Math.hypot(after.x-before.x,after.z-before.z)>2
        ?Math.atan2(after.x-before.x,after.z-before.z):centre.yaw;
      const turn=boat.bearing===null?0:Math.atan2(Math.sin(yaw-boat.bearing),Math.cos(yaw-boat.bearing));
      boat.bearing=boat.bearing===null?yaw:boat.bearing+turn*Math.min(1,dt*2.1);
      const fx=Math.sin(boat.bearing),fz=Math.cos(boat.bearing);
      const px=centre.x+fz*17,pz=centre.z-fx*17;
      const distance=Math.hypot(x-px,z-pz),half=boat.length*.48,radius=boat.beam*.55;
      boat.mesh.visible=distance<2800&&[-half,0,half].every(offset=>
        this.world._waterClear(px+fx*offset,pz+fz*offset,radius));
      if(!boat.mesh.visible)continue;
      const y=this.terrain.getRenderedHeight(px,pz)+.94;
      boat.mesh.position.set(px,y,pz);
      boat.mesh.rotation.y=boat.bearing;
      this.wakes?.track(boat,{x:px,z:pz},{x:fx,z:fz},boat.length,boat.beam,boat.speed,dt,1);
      if(emitSteam&&steam&&boat.type===0&&distance<1300&&altitude-y<650)
        emitSteam(px-fx*3.2,y+5.15,pz-fz*3.2,0x79776d,.75);
    }
    if(emitSteam&&steam){
      const train=this.world.entities.find(entity=>entity.kind==='train'&&entity.alive&&entity.model.visible);
      if(train&&Math.hypot(train.last.x-x,train.last.z-z)<1550){
        const y=train.model.position.y,yaw=train.model.rotation.y;
        emitSteam(train.last.x+Math.sin(yaw)*5.4,y+5.4,train.last.z+Math.cos(yaw)*5.4,0xd0ccc0,1.45);
      }
    }
  }

  dispose(){
    this.group.parent?.remove(this.group);
    for(const boat of this.boats){
      boat.mesh.geometry.dispose();
      this.wakes?.forget(boat);
    }
    this.boatMaterial.dispose();
    this.reeds.geometry.dispose();
    this.reeds.material.dispose();
    this.shore.geometry.dispose();
    this.shore.material.dispose();
  }

  static boatGeometry(type){
    const tug=type===0,beam=tug?5.6:7.8,length=tug?19:32;
    const positions=[],colors=[],color=new THREE.Color();
    const append=(geometry,tint,x=0,y=0,z=0)=>{
      const geo=geometry.index?geometry.toNonIndexed():geometry;
      color.setHex(tint);
      const attr=geo.attributes.position;
      for(let i=0;i<attr.count;i++){
        positions.push(attr.getX(i)+x,attr.getY(i)+y,attr.getZ(i)+z);
        colors.push(color.r,color.g,color.b);
      }
      geo.dispose();
      if(geo!==geometry)geometry.dispose();
    };
    const box=(w,h,l,x,y,z,tint)=>append(new THREE.BoxGeometry(w,h,l),tint,x,y,z);
    const cylinder=(top,base,h,x,y,z,tint)=>append(new THREE.CylinderGeometry(top,base,h,8),tint,x,y,z);
    const profile=new THREE.Shape();
    const b=beam/2,l=length/2;
    for(const [i,[x,z]] of [[0,l],[-b*.75,l*.78],[-b,l*.55],[-b,-l*.80],[-b*.72,-l],
      [b*.72,-l],[b,-l*.80],[b,l*.55],[b*.75,l*.78]].entries()){
      if(i===0)profile.moveTo(x,z);
      else profile.lineTo(x,z);
    }
    profile.closePath();
    append(new THREE.ExtrudeGeometry(profile,{depth:1.65,bevelEnabled:false,steps:1}).rotateX(Math.PI/2),
      tug?0x343c3c:0x484139,0,tug?1.06:.92);
    box(beam*.86,.13,length*.72,0,1.05,0,0xa29470);
    for(const side of [-1,1]){
      box(.16,.17,length*.68,side*b*.94,1.23,0,0x3e3d34);
      for(const z of [-l*.70,l*.57])box(.27,.32,.22,side*b*.73,1.28,z,0x373b38);
    }
    if(tug){
      box(3.5,1.9,4.4,0,2.1,.55,0xc4b69c);
      box(3.8,.22,4.7,0,3.14,.55,0x5d5042);
      for(const x of [-1.08,0,1.08])box(.70,.66,.05,x,2.44,2.77,0x354751);
      cylinder(.35,.48,3.63,0,3.1,-3.2,0x3e3c39);
      cylinder(.36,.37,.23,0,4.83,-3.2,0xaa7251);
      cylinder(.055,.09,4.2,0,3.17,5.4,0x716348);
    }else{
      box(2.8,1.65,3.0,0,1.92,-l*.72,0xc3b59a);
      box(3.02,.16,3.2,0,2.8,-l*.72,0x625b4b);
      box(2.1,.45,.07,0,2.25,-l*.72+1.52,0x40545a);
      for(const z of [-3.4,5]){
        box(5.5,.85,7.4,0,1.5,z,0x62503d);
        box(5.58,.22,7.48,0,2.0,z,type===1?0x8a8761:0xa39270);
        for(const dx of [-2.18,2.18])box(.11,.05,7.35,dx,2.12,z,0x5e553f);
      }
      cylinder(.06,.10,3.6,0,2.8,l*.71,0x72654a);
    }
    return RhineRiverLife.colouredGeometry(positions,colors);
  }

  static reedGeometry(){
    const positions=[],colors=[],tint=new THREE.Color();
    for(let i=0;i<21;i++){
      const x=osmHash(i,1,1870)*2-1,z=osmHash(i,2,1870)*1.35-.675;
      const height=.53+.86*osmHash(i,3,1870),lean=(osmHash(i,4,1870)-.5)*.46;
      const blade=.035+.051*osmHash(i,5,1870);
      tint.setHex([0x6c7650,0x839164,0x979163,0x596a43][i%4]);
      positions.push(x-blade,0,z,x+blade,height*.62,z+lean*.38,x+lean,height,z+lean);
      positions.push(x,height*.27,z-blade,x+lean*.44,height*.48,z+blade,x+lean*.73,height*.80,z+.23);
      for(let j=0;j<6;j++)colors.push(tint.r,tint.g,tint.b);
    }
    return RhineRiverLife.colouredGeometry(positions,colors);
  }

  static colouredGeometry(positions,colors){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
