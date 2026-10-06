/* A bounded set of uploaded landmarks, with cheap distant silhouettes. */
class PeriodBuildings {
 constructor(scene,terrain,osm){this.scene=scene;this.terrain=terrain;this.osm=osm;this.templates=new Map();this.reserved=new Map();this.entries=[];this.exclusions=[];}
 async load(anchors){
  for(const kind of ['house','farm-ruin','town-ruin','hangar']){
   try{const model=await new Promise((yes,no)=>new THREE.GLTFLoader().load('assets/buildings/'+kind+'.glb?v=172',g=>yes(g.scene),undefined,no));
    model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});this.templates.set(kind,model);
   }catch(e){console.warn('Optional building:',kind,e.message);}
  }
  if(typeof FortificationAssets!=='undefined')await Promise.all(Object.keys(FortificationAssets.specs).map(async kind=>{
   try{this.templates.set(kind,await FortificationAssets.load(kind));}catch(e){console.warn('Optional fortification:',kind,e.message);}
  }));
  if(!this.templates.size)return;
  const candidates=[];
  for(const [key,data] of this.osm.sourceTiles){const [tx,tz]=key.split(',').map(Number);
   for(const b of data.buildings||[]){const x=tx*this.osm.tileSize+b.x,z=tz*this.osm.tileSize+b.z;
    if(!anchors.some(([ax,az])=>Math.hypot(x-ax,z-az)<2800))continue;
    if(b.w<7||b.d<6||b.w>38||b.d>35||this.osm.churchKeys.has(osmBuildingKey(x,z)))continue;
    if(this.osm._buildingTouchesWater(b,x,z,{water:this.osm.waterIndex}))continue;
    const ground=this.osm._buildingGroundRange(b,x,z,tx*this.osm.tileSize,tz*this.osm.tileSize);
    if(ground.maxY-ground.minY>2.5)continue;
    candidates.push({b,x,z,ground});
   }
  }
  const used=[];
  for(const [ax,az] of anchors)for(let n=0;n<4;n++){
   const sorted=candidates.filter(c=>used.every(p=>Math.hypot(c.x-p.x,c.z-p.z)>100))
    .sort((a,b)=>Math.hypot(a.x-ax,a.z-az)-Math.hypot(b.x-ax,b.z-az));
   const c=sorted[0];if(!c||Math.hypot(c.x-ax,c.z-az)>2800)break;
   const kind=n===0?'house':n===3?'town-ruin':'farm-ruin';if(!this.templates.has(kind))continue;
   used.push(c);this.reserved.set(osmBuildingKey(c.x,c.z),true);
   this.place(kind,c.x,c.z,c.b.w*.90,c.b.d*.90,c.b.rotY);
  }
 }
 has(x,z){return this.reserved.has(osmBuildingKey(x,z));}
 place(kind,x,z,w,d,yaw=0){
  const source=this.templates.get(kind);if(!source)return;
  const model=source.clone(true),dimensions=source.userData.fortification,b=dimensions?null:new THREE.Box3().setFromObject(model),s=dimensions?new THREE.Vector3(dimensions.width,dimensions.height,dimensions.depth):b.getSize(new THREE.Vector3()),c=dimensions?new THREE.Vector3():b.getCenter(new THREE.Vector3());
  const scale=Math.min(w/s.x,d/s.z),offset=new THREE.Group(),group=new THREE.Group();
  model.position.sub(new THREE.Vector3(c.x,b?b.min.y:0,c.z));offset.add(model);offset.scale.setScalar(scale);group.add(offset);group.rotation.y=yaw;group.position.set(x,0,z);
  const detailHeight=s.y*scale;
  const proxy=new THREE.Group(),wallMat=new THREE.MeshLambertMaterial({color:kind.includes('ruin')?0x807867:0xb3a78f});
  const wallHeight=detailHeight*(dimensions?1:.7),wall=new THREE.Mesh(new THREE.BoxGeometry(s.x*scale,wallHeight,s.z*scale),wallMat);wall.position.y=wallHeight/2;proxy.add(wall);
  if(kind==='house'){const roof=new THREE.Mesh(makeGableRoofGeometry(),new THREE.MeshLambertMaterial({color:0x625144}));roof.scale.set(s.x*scale,detailHeight*.3,s.z*scale);roof.position.y=detailHeight*.7;proxy.add(roof);}
  group.add(proxy);this.scene.add(group);
  const entry={group,model:offset,proxy,x,z,w:s.x*scale,d:s.z*scale,yaw,kind,revision:-1};this.entries.push(entry);this.refresh(entry);
  if(kind==='bunker'||kind==='observation-post')this.clearVegetation(entry);return entry;
 }
 clearVegetation(e){
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),radius=Math.hypot(e.w,e.d)/2+12;
  for(const [key,tile] of this.osm.tiles){const [tx,tz]=key.split(',').map(Number),ox=tx*this.osm.tileSize,oz=tz*this.osm.tileSize;
   if(!tile?.farGroup||e.x+radius+40<ox||e.x-radius-40>ox+this.osm.tileSize||e.z+radius+40<oz||e.z-radius-40>oz+this.osm.tileSize)continue;
   tile.farGroup.traverse(mesh=>{
   if(!mesh.isInstancedMesh||!mesh.name.startsWith('osmForest'))return;
   let changed=false;
   for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
    const canopy=mesh.userData.canopyRadii?.[i]||0;
    if(Math.hypot(position.x-e.x,position.z-e.z)>radius+canopy)continue;
    matrix.makeScale(0,0,0);matrix.setPosition(position);mesh.setMatrixAt(i,matrix);changed=true;
   }if(changed)mesh.instanceMatrix.needsUpdate=true;
   });
  }
 }
 refresh(e){
  const tile=this.terrain.tiles.get(Math.floor(e.x/this.osm.tileSize)+','+Math.floor(e.z/this.osm.tileSize));
  if(tile&&e.revision===tile.surfaceRevision)return;
  const c=Math.cos(e.yaw),s=Math.sin(e.yaw);let y=-Infinity;
  for(const [x,z] of [[0,0],[-e.w/2,-e.d/2],[e.w/2,-e.d/2],[-e.w/2,e.d/2],[e.w/2,e.d/2]])
   y=Math.max(y,this.terrain.getRenderedHeight(e.x+x*c+z*s,e.z-x*s+z*c));
  e.group.position.y=y+.03;e.revision=tile?.surfaceRevision;
 }
 clearLand(x,z,w,d){
  const corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([dx,dz])=>[x+dx,z+dz]);
  for(const b of [...this.exclusions,...(this.terrain.airfieldGroundRegions||[])])
   if(x+w/2+4>b.minX&&x-w/2-4<b.maxX&&z+d/2+4>b.minZ&&z-d/2-4<b.maxZ)return false;
  if(osmWaterOverlaps(corners,3,this.osm.waterIndex))return false;
  if(this.entries.some(e=>Math.hypot(e.x-x,e.z-z)<Math.hypot(w,d)/2+Math.hypot(e.w,e.d)/2+4))return false;
  const radius=Math.hypot(w,d)/2+7;
  for(const [key,data] of this.osm.sourceTiles){const [tx,tz]=key.split(',').map(Number),ox=tx*this.osm.tileSize,oz=tz*this.osm.tileSize;
   if(x+radius<ox||x-radius>ox+this.osm.tileSize||z+radius<oz||z-radius>oz+this.osm.tileSize)continue;
   for(const line of [...(data.roads||[]),...(data.rails||[])])for(let i=1;i<line.length;i++){
    const ax=ox+line[i-1][0],az=oz+line[i-1][1],dx=line[i][0]-line[i-1][0],dz=line[i][1]-line[i-1][1];
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
    if(Math.hypot(x-ax-t*dx,z-az-t*dz)<radius)return false;
   }
   for(const b of data.buildings||[])if(Math.hypot(x-ox-b.x,z-oz-b.z)<radius+Math.hypot(b.w,b.d)/2)return false;
  }
  const heights=corners.map(([px,pz])=>this.terrain.getRenderedHeight(px,pz));
  return Math.max(...heights)-Math.min(...heights)<2.5;
 }
 airfield(x,z,details){
  for(const p of details?.parts||[])this.exclusions.push({minX:p.bounds.min.x,maxX:p.bounds.max.x,minZ:p.bounds.min.z,maxZ:p.bounds.max.z});
  // Leave the service aircraft, carts and future large bomber wings free.
  this.exclusions.push({minX:x-420,maxX:x-180,minZ:z-190,maxZ:z-40});
  const spot=(dx,dz,w,d)=>{for(const step of [0,35,70,105,140])for(const [sx,sz] of [[step,0],[0,-step],[step,-step],[-step,0],[0,step]]){
   const px=x+dx+sx,pz=z+dz+sz;if(this.clearLand(px,pz,w,d))return [px,pz];
  }};
  const hangar=spot(335,-165,32,50),bunker=spot(285,90,14,14),post=spot(-430,-235,11,11);
  if(hangar)this.place('hangar',...hangar,32,50);
  if(bunker){if(this.templates.has('bunker'))this.place('bunker',...bunker,10,10);else this.bunker(...bunker);}
  if(post&&this.templates.has('observation-post'))this.place('observation-post',...post,7.5,7.5);
 }
 bunker(x,z){
  // The uploaded observation posts inspire thick walls and a real narrow opening.
  const g=new THREE.Group(),mat=new THREE.MeshLambertMaterial({color:0x8c8a78});
  const box=(w,h,d,px,py,pz)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(px,py,pz);g.add(m);};
  box(7,1.5,5,0,.75,0);box(7,.6,5,0,2.5,0);box(7,.4,5.4,0,2.95,0);
  box(.8,.9,5,-3.1,1.95,0);box(.8,.9,5,3.1,1.95,0);box(5.4,.9,.8,0,1.95,-2.1);
  const dark=new THREE.Mesh(new THREE.PlaneGeometry(5.4,.7),new THREE.MeshLambertMaterial({color:0x202623}));dark.position.set(0,1.95,1.9);g.add(dark);
  g.position.set(x,this.terrain.getRenderedHeight(x,z)+.02,z);this.scene.add(g);
  this.entries.push({group:g,x,z,w:7,d:5,yaw:0,revision:-1,kind:'bunker'});
 }
 defences(anchors){
  if(!this.templates.has('observation-post'))return;
  for(const [x,z] of anchors){let placed=false;
   for(const radius of [70,110,150,210,280]){
    for(let i=0;i<12;i++){const angle=i*Math.PI/6,px=x+Math.cos(angle)*radius,pz=z+Math.sin(angle)*radius;
     if(!this.clearLand(px,pz,11,11))continue;
     this.place('observation-post',px,pz,7.5,7.5,angle);placed=true;break;
    }if(placed)break;
   }
  }
 }
 update(x,z){
  const forts=this.entries.filter(e=>e.model&&['bunker','observation-post'].includes(e.kind));
  const byRange=(a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z);
  const closeForts=[...forts.filter(e=>e.kind==='bunker').sort(byRange).slice(0,1),...forts.filter(e=>e.kind==='observation-post').sort(byRange).slice(0,2)];
  const nearest=this.entries.filter(e=>e.model&&e.kind!=='hangar'&&!forts.includes(e)).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)).slice(0,3);
  for(const e of this.entries){const distance=Math.hypot(e.x-x,e.z-z);e.group.visible=distance<6500;
   if(!e.group.visible){if(e.model){e.model.visible=false;e.proxy.visible=true;}continue;}this.refresh(e);
   if(e.model){const detailed=e.kind==='hangar'||distance<1050&&(forts.includes(e)?closeForts:nearest).includes(e);e.model.visible=detailed;e.proxy.visible=!detailed;}
  }
 }
}
