/* A bounded set of uploaded landmarks, with cheap distant silhouettes. */
class PeriodBuildings {
 constructor(scene,terrain,osm){this.scene=scene;this.terrain=terrain;this.osm=osm;this.templates=new Map();this.reserved=new Map();this.entries=[];}
 async load(anchors){
  for(const kind of ['house','farm-ruin','town-ruin','hangar']){
   try{const model=await new Promise((yes,no)=>new THREE.GLTFLoader().load('assets/buildings/'+kind+'.glb?v=172',g=>yes(g.scene),undefined,no));
    model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});this.templates.set(kind,model);
   }catch(e){console.warn('Optional building:',kind,e.message);}
  }
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
  const model=source.clone(true),b=new THREE.Box3().setFromObject(model),s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
  const scale=Math.min(w/s.x,d/s.z),offset=new THREE.Group(),group=new THREE.Group();
  model.position.sub(new THREE.Vector3(c.x,b.min.y,c.z));offset.add(model);offset.scale.setScalar(scale);group.add(offset);group.rotation.y=yaw;group.position.set(x,0,z);
  const detailHeight=s.y*scale;
  const proxy=new THREE.Group(),wallMat=new THREE.MeshLambertMaterial({color:kind.includes('ruin')?0x807867:0xb3a78f});
  const wall=new THREE.Mesh(new THREE.BoxGeometry(s.x*scale,detailHeight*.7,s.z*scale),wallMat);wall.position.y=detailHeight*.35;proxy.add(wall);
  if(kind==='house'){const roof=new THREE.Mesh(makeGableRoofGeometry(),new THREE.MeshLambertMaterial({color:0x625144}));roof.scale.set(s.x*scale,detailHeight*.3,s.z*scale);roof.position.y=detailHeight*.7;proxy.add(roof);}
  group.add(proxy);this.scene.add(group);
  const entry={group,model:offset,proxy,x,z,w:s.x*scale,d:s.z*scale,yaw,kind,revision:-1};this.entries.push(entry);this.refresh(entry);return entry;
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
  if(osmWaterOverlaps(corners,3,this.osm.waterIndex))return false;
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
 airfield(x,z){
  const spot=(dx,dz,w,d)=>{for(const step of [0,35,70,105,140])for(const [sx,sz] of [[step,0],[0,-step],[step,-step],[-step,0],[0,step]]){
   const px=x+dx+sx,pz=z+dz+sz;if(this.clearLand(px,pz,w,d))return [px,pz];
  }};
  const hangar=spot(335,-165,32,50),bunker=spot(285,65,7,5);
  if(hangar)this.place('hangar',...hangar,32,50);if(bunker)this.bunker(...bunker);
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
 update(x,z){
  const nearest=this.entries.filter(e=>e.model&&e.kind!=='hangar').sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)).slice(0,3);
  for(const e of this.entries){const distance=Math.hypot(e.x-x,e.z-z);e.group.visible=distance<6500;
   if(!e.group.visible)continue;this.refresh(e);
   if(e.model){const detailed=e.kind==='hangar'||distance<1050&&nearest.includes(e);e.model.visible=detailed;e.proxy.visible=!detailed;}
  }
 }
}
