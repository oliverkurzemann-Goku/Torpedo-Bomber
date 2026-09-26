// Shared, licensed period-vehicle templates plus two static scenic vehicles.
// Real r128 GLTF/FBX loader validation is in tests/remagen-vehicles.js; credits below.
class WorldVehicles {
  static get BUILD(){ return 22; }
  constructor(scene,terrain,osm){
    this.scene=scene;this.terrain=terrain;this.osm=osm;this.entries=[];this.failures=[];
    this.templates=new Map();this.onTemplate=null;
  }
  static mergeStaticByMaterial(source){
    source.updateMatrixWorld(true);
    const buckets=new Map();
    source.traverse(o=>{
      if(!o.isMesh||o.isSkinnedMesh)return;
      const material=o.material;
      if(Array.isArray(material))throw new Error('Unexpected multi-material car mesh');
      let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if(!g.attributes.normal)g.computeVertexNormals();
      if(!buckets.has(material))buckets.set(material,[]);
      buckets.get(material).push(g);
    });
    const merged=new THREE.Group();merged.name='civilCarMerged';
    const join=(parts,itemSize)=>{
      let count=0;for(const a of parts)count+=a.length;
      const out=new Float32Array(count);let at=0;for(const a of parts){out.set(a,at);at+=a.length;}
      return new THREE.BufferAttribute(out,itemSize);
    };
    for(const [material,geometries] of buckets){
      const positions=[],normals=[],uvs=[];
      for(const g of geometries){
        const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;
        positions.push(p.array);normals.push(n.array);
        uvs.push(u?u.array:new Float32Array(p.count*2));
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',join(positions,3));g.setAttribute('normal',join(normals,3));g.setAttribute('uv',join(uvs,2));
      g.computeBoundingBox();g.computeBoundingSphere();merged.add(new THREE.Mesh(g,material));
      for(const old of geometries)old.dispose();
    }
    return merged;
  }
  static prepare(source,kind){
    source.updateMatrixWorld(true);
    let root=new THREE.Group();
    if(kind==='tiger'){
      // The export is a kit: spare heads, weapons and a posed crewman lie beside
      // the tank. Keep only TIGER_H1, preserving all ancestor transforms.
      const tank=source.getObjectByName('TIGER_H1');
      if(!tank)throw new Error('Tiger vehicle node missing');
      const copy=tank.clone(true);tank.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);root.add(copy);
    }else root.add(source);
    const materials=new Map();
    root.traverse(o=>{
      if(!o.isMesh)return;
      if(o.isSkinnedMesh&&kind!=='horse')throw new Error('Unexpected skinned vehicle part');
      const convert=m=>{
        if(materials.has(m))return materials.get(m);
        // Same simple Lambert path as the confirmed field. No deprecated SG
        // shader extension, per-instance colour or material changes to aircraft.
        const plain=new THREE.MeshLambertMaterial({map:m.map||null,color:m.color?m.color.clone():0xffffff,
          side:m.side,alphaTest:m.alphaTest||0,transparent:!!m.transparent,opacity:m.opacity==null?1:m.opacity});
        plain.skinning=kind==='horse';
        plain.name=m.name;materials.set(m,plain);return plain;
      };
      o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);
    });
    if(kind==='civilCar')root=WorldVehicles.mergeStaticByMaterial(root);
    root.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(root),size=b.getSize(new THREE.Vector3());
    if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid vehicle bounds');
    // Real-world target lengths keep imports from three different authoring
    // unit systems consistent. The merchant remains a compact Rhine workboat
    // silhouette, not a claim about the exact 1945 ferry type.
    const targetLength={m16:6.62,tiger:8.45,jagdpanther:9.8,merchant:30,flak88:8.808,
      civilCar:4.75,horse:2.5,train:24.1}[kind]||8;
    const scale=targetLength/Math.max(size.x,size.z);
    const model=new THREE.Group();model.add(root);root.scale.setScalar(scale);
    root.position.set(-(b.min.x+b.max.x)*scale/2,-b.min.y*scale,-(b.min.z+b.max.z)*scale/2);
    model.userData.size=new THREE.Vector3(size.x*scale,size.y*scale,size.z*scale);
    return model;
  }
  safeSpot(x,z,yaw,size){
    const c=Math.cos(yaw),s=Math.sin(yaw),points=[];
    for(const [dx,dz] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]])
      points.push([x+dx*size.x*c+dz*size.z*s,z-dx*size.x*s+dz*size.z*c]);
    if(osmWaterOverlaps(points,3,this.osm.waterIndex))return null;
    const matrix=new THREE.Matrix4(),radius=Math.hypot(size.x,size.z)/2+4;
    for(const [key,tile] of this.osm.tiles){
      const [tx,tz]=key.split(',').map(Number);
      if(!tile||x+radius<tx*4000||x-radius>(tx+1)*4000||z+radius<tz*4000||z-radius>(tz+1)*4000)continue;
      for(const mesh of tile.farGroup.children){
        if(mesh.name!=='osmForestTrunks')continue;
        for(let i=0;i<mesh.count;i++){
          mesh.getMatrixAt(i,matrix);
          if(Math.abs(matrix.elements[0])+Math.abs(matrix.elements[2])<1e-5)continue;
          if(Math.hypot(x-matrix.elements[12],z-matrix.elements[14])<radius)return null;
        }
      }
    }
    const h=points.map(([px,pz])=>this.terrain.getRenderedHeight(px,pz));
    if(Math.max(...h)-Math.min(...h)>.7)return null;
    return {x,z,y:Math.min(...h),points};
  }
  async load(){
    const gltf=new THREE.GLTFLoader();
    const loadSource=async spec=>{
      if(spec.loader==='fbx'){
        const scene=await new Promise((resolve,reject)=>new THREE.FBXLoader().load(spec.url,resolve,undefined,reject));
        return {scene,animations:scene.animations||[]};
      }
      const data=await new Promise((resolve,reject)=>gltf.load(spec.url,resolve,undefined,reject));
      return {scene:data.scene,animations:data.animations||[]};
    };
    const publish=(kind,model,animations=[])=>{
      if(animations.length)model.animations=animations;
      this.templates.set(kind,model);
      if(this.onTemplate)this.onTemplate(kind,model);
    };
    // Sequential downloads after the menu opens; a vehicle failure cannot hide
    // the player's aircraft or block starting a sortie. Models share resources.
    const specs=[
      // Load the light 910-triangle Tiger subtree first so LivingWorld can
      // replace its temporary convoy silhouettes almost immediately.
      {kind:'tiger',url:'tiger.glb',x:14350,z:15870,yaw:-Math.PI/2},
      {kind:'m16',url:'m16_mgmc.glb',x:1047,z:17987.6,yaw:Math.PI/2}
    ];
    for(const spec of specs)try{
      const asset=await loadSource(spec);
      const model=WorldVehicles.prepare(asset.scene,spec.kind),size=model.userData.size;
      publish(spec.kind,model.clone(true),asset.animations);
      // Search a small local area, rejecting water, steep slopes and mapped
      // building footprints. Never scatter tanks blindly across the map.
      let spot=null;
      for(const dz of [0,12,-12,24,-24])for(const dx of [0,12,-12,24,-24]){
        if(spot)break;
        const x=spec.x+dx,z=spec.z+dz;
        const tx=Math.floor(x/4000),tz=Math.floor(z/4000),data=this.osm.sourceTiles.get(tx+','+tz);
        if(!data)continue;
        const excluded=(data.buildings||[]).some(b=>Math.hypot(x-(tx*4000+b.x),z-(tz*4000+b.z))<Math.hypot(b.w,b.d)/2+size.z/2+3);
        if(!excluded)spot=this.safeSpot(x,z,spec.yaw,size);
      }
      if(!spot)throw new Error('No dry, clear, level placement');
      model.rotation.y=spec.yaw;model.position.set(spot.x,spot.y,spot.z);
      model.name='scenicVehicle-'+spec.kind;model.visible=false;
      this.scene.add(model);this.entries.push({model,spec,spot,size});
      console.info('Scenic vehicle ready:',spec.kind,spot.x,spot.z);
    }catch(e){this.failures.push({kind:spec.kind,message:e.message});console.warn('Scenic vehicle unavailable:',spec.kind,e);}
    // Templates load one at a time to avoid simultaneous decode peaks on iPad.
    // Real imported traffic replaces the temporary silhouettes as each asset
    // becomes ready; a failed optional model leaves its procedural fallback.
    const templateSpecs=[
      {kind:'flak88',url:'flak88_sfl.glb'},
      // One existing, low-polygon vehicle replaces a Tiger silhouette in the
      // moving road column. Loaded after the menu appears, with fallback intact.
      {kind:'jagdpanther',url:'jagdpanther.glb'},
      {kind:'civilCar',url:'assets/remagen/ford1940/1940_ford_v8.fbx',loader:'fbx'},
      {kind:'horse',url:'assets/remagen/horse/quaternius_horse.glb'},
      {kind:'train',url:'assets/remagen/drb0110/drb0110.glb'},
      {kind:'merchant',url:'merchant_ship.glb'}
    ];
    for(const spec of templateSpecs)try{
      const asset=await loadSource(spec),model=WorldVehicles.prepare(asset.scene,spec.kind);
      publish(spec.kind,model,asset.animations);
    }catch(e){this.failures.push({kind:spec.kind,message:e.message});console.warn(spec.kind+' template unavailable:',e);}
  }
  update(x,z){
    for(const e of this.entries){
      e.model.visible=Math.hypot(x-e.spot.x,z-e.spot.z)<1800;
      if(e.model.visible){
        const h=e.spot.points.map(([px,pz])=>this.terrain.getRenderedHeight(px,pz));
        e.model.position.y=Math.min(...h);
      }
    }
  }
}
