/* Original Okinawa scenery. Placements are illustrative and use the rendered terrain in metres. */
(function(scope){
'use strict';

const LAND_LIMIT=29999;
const MAX_VISIBLE_ZONES=4;
const ZONE_RANGE=2900;
const DETAIL_RANGE=900;
const distant=new Set(['limestone-stack','reef-foam','ryukyu-pine','banyan','turtleback-tomb','utaki-grove','fishing-jetty']);
const TRIANGLES_PER_ZONE=9500;
const zones=[
 {name:'Zanpa cliffs',x:-5410,z:-6240,objects:{'limestone-stack':2,'reef-foam':4,driftwood:2,pandanus:5,'beach-creepers':5,'ryukyu-pine':2}},
 {name:'Reef and fishing cove',x:-5170,z:-4720,objects:{'reef-foam':3,'fishing-jetty':1,sabani:3,pandanus:3,cycad:3,'stone-well':1},wild:['tern','dolphin']},
 {name:'West coast groves',x:-5240,z:-2320,objects:{'limestone-stack':1,driftwood:2,'beach-creepers':3,'turtleback-tomb':2,'utaki-grove':1,banyan:3,'ryukyu-pine':4,'bamboo-clump':3},wild:['tern']},
 {name:'Hagushi lowland',x:-4410,z:-770,objects:{'rice-paddy':2,'sugarcane-patch':3,'sweet-potato-beds':3,cycad:2,'stone-well':1,'bamboo-clump':2},wild:['egret']},
 {name:'Southern landing',x:-3750,z:570,objects:{'fishing-jetty':1,sabani:2,'reef-foam':3,driftwood:2,'beach-creepers':3,pandanus:3,banyan:2},wild:['tern','dolphin']},
 {name:'South fields',x:-2930,z:2180,objects:{'rice-paddy':1,'sugarcane-patch':2,'sweet-potato-beds':2,'turtleback-tomb':1,'utaki-grove':1,'stone-well':1,'ryukyu-pine':2,cycad:2},wild:['egret']},
];

const water={
 'limestone-stack':[-110,-25,-2.1],
 'reef-foam':[-235,-65,.38],
 sabani:[-125,-28,0],
 'fishing-jetty':[-23,13,-.35],
};
const field=new Set(['rice-paddy','sugarcane-patch','sweet-potato-beds']);
const draped=new Set(['beach-creepers','sugarcane-patch','sweet-potato-beds']);
const shoreline=new Set(['pandanus','driftwood','beach-creepers']);
const structures=new Set(['stone-well','turtleback-tomb','utaki-grove']);
const animated={
 tern:{count:11,radius:48,alt:10,speed:.20,range:760},
 egret:{count:6,radius:56,alt:15,speed:.145,range:760},
 dolphin:{count:4,radius:16,alt:0,speed:.32,range:620},
};

function samples(x,z,r){
 return [[x,z],[x-r,z],[x+r,z],[x,z-r],[x,z+r],
  [x-r*.707,z-r*.707],[x+r*.707,z-r*.707],[x-r*.707,z+r*.707],[x+r*.707,z+r*.707]];
}
function dry(world,points,kind){
 const d=world.shoreDistance(...points[0]);
 if(d<(shoreline.has(kind)?10:55)||d>(shoreline.has(kind)?350:2300))return null;
 const flat=field.has(kind)||structures.has(kind);
 for(const p of points){
  if(world.shoreDistance(...p)<7||world.nearHouse(...p)||world.nearRoad(...p))return null;
  const [forest,,air]=world.biome(...p);
  if(air>.09||flat&&forest>.17)return null;
 }
 const y=points.map(p=>world.getSurfaceHeight(...p)),variation=Math.max(...y)-Math.min(...y);
 if(variation>(kind==='rice-paddy'?.48:structures.has(kind)?.95:field.has(kind)?1.65:3.4))return null;
 return (flat?Math.min(...y):y[0])-.025;
}
function coastYaw(world,x,z){
 return Math.atan2(world.shoreDistance(x-18,z)-world.shoreDistance(x+18,z),
                   world.shoreDistance(x,z-18)-world.shoreDistance(x,z+18));
}
function find(world,zone,kind,radius,used,serial){
 const waterRule=water[kind],start=serial*2.399963;
 // Prefer the centre and spiral out in roughly 35 m steps.
 for(let i=0;i<1460;i++){
  const r=24*Math.sqrt(i),a=start+i*2.399963;
  const x=zone.x+r*Math.cos(a),z=zone.z+r*Math.sin(a);
  if(Math.abs(x)>7600||Math.abs(z)>7600)continue;
  const d=world.shoreDistance(x,z);
  if(used.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+radius+7))continue;
  let y,yaw=start;
  if(waterRule){
   const [lo,hi,base]=waterRule;
   if(d<lo||d>hi)continue;
   yaw=coastYaw(world,x,z);
   if(kind==='fishing-jetty'){
    const near=world.shoreDistance(x-10*Math.sin(yaw),z-10*Math.cos(yaw));
    const far=world.shoreDistance(x+10*Math.sin(yaw),z+10*Math.cos(yaw));
    if(near<-.9||near>14||far>-3||world.nearHouse(x,z))continue;
   }else{
    if(samples(x,z,radius).some(p=>world.shoreDistance(...p)>-3))continue;
    if(kind==='sabani')yaw+=Math.PI*.5+(serial%4-.5)*.13;
    if(kind==='reef-foam')yaw+=.15;
   }
   y=base;
  }else{
   y=dry(world,samples(x,z,radius),kind);
   if(y===null)continue;
  }
  return {kind,x,y,z,r:radius,yaw};
 }
 return null;
}
function countTriangles(group){
 return group.children.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);
}
function makePlacementPlan(world,templates){
 const placed=[],byZone=[],sites={tern:[],egret:[],dolphin:[]};
 const radii=Object.fromEntries(Object.entries(templates).map(([name,model])=>{
  const b=new THREE.Box3().setFromObject(model);
  return [name,Math.max(.5,Math.hypot(b.max.x,b.max.z))];
 }));
 let serial=0;
 for(const zone of zones){
  const entries=[];let tris=0;
  for(let i=0;i<5;i++)for(const [kind,n] of Object.entries(zone.objects)){
   if(i>=n)continue;
   const added=countTriangles(templates[kind]);
   if(tris+added>TRIANGLES_PER_ZONE||world.objectCount+placed.length>=LAND_LIMIT)continue;
   const p=find(world,zone,kind,radii[kind],placed,++serial);
   if(p){entries.push(p);placed.push(p);tris+=added;}
  }
  if(!entries.length)continue;
  for(const kind of zone.wild??[]){
   const place=find(world,zone,'reef-foam',kind==='dolphin'?26:65,placed,++serial);
   if(place)sites[kind].push(place);
  }
  byZone.push({zone,entries,triangles:tris});
 }
 return {placed,byZone,sites};
}
function mergeZone(T,world,templates,entries){
 const n=entries.reduce((a,p)=>a+countTriangles(templates[p.kind])*3,0);
 const p=new Float32Array(n*3),normals=new Float32Array(n*3),uv=new Float32Array(n*2);
 const matrix=new T.Matrix4(),normalMatrix=new T.Matrix3(),v=new T.Vector3();
 let at=0;
 for(const item of entries){
  matrix.makeRotationY(item.yaw).setPosition(item.x,item.y,item.z);
  for(const mesh of templates[item.kind].children){
   const m=matrix.clone().multiply(mesh.matrix),g=mesh.geometry;
   normalMatrix.getNormalMatrix(m);
   const {position,normal,uv:tex}=g.attributes;
   for(let i=0;i<g.index.count;i++){
    const k=g.index.getX(i);
    v.fromBufferAttribute(position,k).applyMatrix4(m);
    if(draped.has(item.kind))v.y+=world.getSurfaceHeight(v.x,v.z)-item.y+.025;
    v.toArray(p,at*3);
    v.fromBufferAttribute(normal,k).applyMatrix3(normalMatrix).toArray(normals,at*3);
    uv[at*2]=tex.getX(k);uv[at*2+1]=tex.getY(k);at++;
   }
  }
 }
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.BufferAttribute(p,3));
 geo.setAttribute('normal',new T.BufferAttribute(normals,3));
 geo.setAttribute('uv',new T.BufferAttribute(uv,2));
 geo.computeBoundingSphere();
 return geo;
}

function build(world,templates,{seaHeight=()=>.1,carrierDeparture=false}={}){
 const T=scope.THREE,root=new T.Group();root.name='Okinawa coastal details';
 const material=templates.tern.children[0].material;
 const plan=makePlacementPlan(world,templates);
 if(carrierDeparture)plan.sites.dolphin.push({x:-9600,z:-370},{x:-8360,z:320});
 const patches=plan.byZone.map(({zone,entries,triangles})=>{
  const mesh=new T.Mesh(mergeZone(T,world,templates,entries),material);
  const silhouette=entries.filter(p=>distant.has(p.kind));
  const far=silhouette.length?new T.Mesh(mergeZone(T,world,templates,silhouette),material):null;
  mesh.name=zone.name;mesh.visible=false;root.add(mesh);
  if(far){far.name=zone.name+' silhouette';far.visible=false;root.add(far);}
  const {center,radius}=mesh.geometry.boundingSphere;
  return {mesh,far,x:center.x,z:center.z,radius,triangles,distance:0};
 });
 const active=[];
 for(const [kind,config] of Object.entries(animated)){
  const pieces=templates[kind].children.map(mesh=>{
   const batch=new T.InstancedMesh(mesh.geometry,material,config.count);
   batch.frustumCulled=false;batch.visible=false;batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
   batch.name=kind+' '+mesh.name;root.add(batch);
   return {batch,rest:mesh.matrix.clone(),side:mesh.name==='WingLeft'?-1:mesh.name==='WingRight'?1:0};
  });
  active.push({kind,config,pieces,sites:plan.sites[kind],site:null});
 }
 const retained=new Set(active.flatMap(e=>e.pieces.map(p=>p.batch.geometry)));
 for(const group of Object.values(templates))for(const m of group.children)if(!retained.has(m.geometry))m.geometry.dispose();
 const animalObject=new T.Object3D(),wing=new T.Matrix4(),local=new T.Matrix4();
 let elapsed=0,checkIn=0;
 function update(dt,x,z,y){
  elapsed+=dt;checkIn-=dt;
  if(checkIn<=0){
   checkIn=.24;
   for(const p of patches)p.distance=Math.hypot(p.x-x,p.z-z);
   patches.sort((a,b)=>a.distance-b.distance);
   patches.forEach((p,i)=>{
    const visible=i<MAX_VISIBLE_ZONES&&p.distance<ZONE_RANGE;
    const nearby=Math.hypot(Math.max(0,p.distance-p.radius*.65),Math.max(0,y-90))<DETAIL_RANGE;
    p.mesh.visible=visible&&nearby;
    if(p.far)p.far.visible=visible&&!nearby;
   });
   for(const e of active){
    let distance=e.config.range;e.site=null;
    if(y<360)for(const p of e.sites){
     const d=Math.hypot(p.x-x,p.z-z);if(d<distance){distance=d;e.site=p;}
    }
    for(const {batch} of e.pieces)batch.visible=Boolean(e.site);
   }
  }
  for(const e of active){
   if(!e.site)continue;
   const {kind,config,pieces,site}=e;
   for(let i=0;i<config.count;i++){
    const phase=i*2.399963,a=elapsed*config.speed+phase*.26;
    const radius=config.radius*(.53+.47*(i%5)/4);
    const xx=site.x+Math.cos(a)*radius,zz=site.z+Math.sin(a)*radius*.84;
    const dolphin=kind==='dolphin',leap=Math.sin(elapsed*1.7+i*.54);
    animalObject.position.set(xx,dolphin?seaHeight(xx,zz)-.6+Math.max(0,leap)*1.27:config.alt+1.6*(i%4)+2*Math.sin(a+phase),zz);
    animalObject.rotation.set(dolphin?-.31*Math.cos(elapsed*1.7+i*.54):.06*Math.sin(a+phase),
     Math.atan2(-Math.sin(a),.84*Math.cos(a)),dolphin?0:.13*Math.cos(a+phase));
    animalObject.updateMatrix();
    for(const {batch,rest,side} of pieces){
     local.copy(animalObject.matrix).multiply(rest);
     if(side)local.multiply(wing.makeRotationZ(side*.69*Math.sin(elapsed*(kind==='tern'?12:8.4)+phase)));
     batch.setMatrixAt(i,local);
    }
   }
   for(const {batch} of pieces)batch.instanceMatrix.needsUpdate=true;
  }
 }
 world.objectCount+=plan.placed.length;
 function dispose(){
  for(const e of active)for(const {batch} of e.pieces)batch.dispose();
 }
 return {root,update,dispose,placements:plan.placed,patches,active,
  preview:plan.placed.find(p=>p.kind==='fishing-jetty')||plan.placed[0]};
}
function load(world,options){
 const T=scope.THREE,templates=scope.OkinawaSceneryTemplates;
 if(!templates)return null;
 const map=new T.TextureLoader().load(templates.png);
 map.encoding=T.sRGBEncoding;map.flipY=false;
 return build(world,templates.create(T,map),options);
}
scope.OkinawaCoastalScenery={build,load,limits:{instances:LAND_LIMIT,zones:MAX_VISIBLE_ZONES,trianglesPerZone:TRIANGLES_PER_ZONE}};
if(typeof module==='object'&&module.exports)module.exports=scope.OkinawaCoastalScenery;
})(typeof window==='undefined'?globalThis:window);
