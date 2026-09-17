// Scenic period vehicles from existing repository GLBs. No combat/mission hooks.
// Real r128 GLTFLoader validation is in tests/remagen-vehicles.js; credits below.
class WorldVehicles {
  constructor(scene,terrain,osm){this.scene=scene;this.terrain=terrain;this.osm=osm;this.entries=[];this.failures=[];}
  static prepare(source,kind){
    source.updateMatrixWorld(true);
    const root=new THREE.Group();
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
      if(o.isSkinnedMesh)throw new Error('Unexpected skinned vehicle part');
      const convert=m=>{
        if(materials.has(m))return materials.get(m);
        // Same simple Lambert path as the confirmed field. No deprecated SG
        // shader extension, per-instance colour or material changes to aircraft.
        const plain=new THREE.MeshLambertMaterial({map:m.map||null,color:m.color?m.color.clone():0xffffff,
          side:m.side,alphaTest:m.alphaTest||0,transparent:!!m.transparent,opacity:m.opacity==null?1:m.opacity});
        plain.name=m.name;materials.set(m,plain);return plain;
      };
      o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);
    });
    root.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(root),size=b.getSize(new THREE.Vector3());
    if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid vehicle bounds');
    // Both validated source models are in metres, nose/turret along local Z.
    const scale=(kind==='m16'?6.62:8.45)/Math.max(size.x,size.z);
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
    const L=new THREE.GLTFLoader();
    // Sequential downloads after the menu opens; a vehicle failure cannot hide
    // the player's aircraft or block starting a sortie. Models share resources.
    const specs=[
      {kind:'m16',url:'m16_mgmc.glb',x:1047,z:17987.6,yaw:Math.PI/2},
      {kind:'tiger',url:'tiger.glb',x:14350,z:15870,yaw:-Math.PI/2}
    ];
    for(const spec of specs)try{
      const gl=await new Promise((resolve,reject)=>L.load(spec.url,resolve,undefined,reject));
      const model=WorldVehicles.prepare(gl.scene,spec.kind),size=model.userData.size;
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
