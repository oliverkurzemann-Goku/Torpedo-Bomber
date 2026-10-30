/* Internal Avenger store. Split the measured belly skin at exact bay boundaries;
 * keep the original paint/UVs on the two animated doors. Local nose is -Z. */
(function(root){
 'use strict';
 const T=root.THREE,cache=new WeakMap(),clamp=n=>Math.max(0,Math.min(1,n||0));
 const bounds={halfWidth:.48,front:-3.00,rear:1.45,top:-.70};
 function split(poly,distance){
  const inside=[],outside=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],da=distance(a.p),db=distance(b.p),ina=da>=-1e-7,inb=db>=-1e-7;
   (ina?inside:outside).push(a);
   if(ina!==inb){const t=da/(da-db),v={p:a.p.clone().lerp(b.p,t),values:a.values.map((v,j)=>v+(b.values[j]-v)*t)};inside.push(v);outside.push(v);}
  }return {inside,outside};
 }
 function install(model,reference){
  if(model.getObjectByName('avengerBombBay'))return;
  const frame=new T.Group();frame.name='avengerBombBay';frame.userData.articulationPart=true;reference.add(frame);reference.updateMatrixWorld(true);model.attach(frame);
  const hinges=[-1,1].map(side=>{const h=new T.Group();h.name=side<0?'avengerBayLeft':'avengerBayRight';h.position.set(side*bounds.halfWidth,-.84,0);h.userData.side=side;frame.add(h);return h;});
  const planes=[p=>p.x+bounds.halfWidth,p=>bounds.halfWidth-p.x,p=>p.z-bounds.front,p=>bounds.rear-p.z,p=>bounds.top-p.y];
  const meshes=[];model.traverse(o=>{if(o.isMesh&&['DefaultWhite_texture.png','DefaultWhite_interior.png'].includes(o.material?.name))meshes.push(o);});
  let removed=0,doorTriangles=0;
  for(const mesh of meshes){
   const g=mesh.geometry,ix=g.index;if(!ix)continue;
   const names=Object.keys(g.attributes),attrs=names.map(n=>g.attributes[n]),sizes=attrs.map(a=>a.itemSize),offsets=[];let stride=0;
   for(const size of sizes){offsets.push(stride);stride+=size;}
   const pi=names.indexOf('position'),ni=names.indexOf('normal'),ui=names.indexOf('uv');
   const toReference=new T.Matrix4().multiplyMatrices(reference.matrixWorld.clone().invert(),mesh.matrixWorld),normalToReference=new T.Matrix3().getNormalMatrix(toReference);
   const read=i=>{const values=attrs.flatMap(a=>Array.from({length:a.itemSize},(_,k)=>a.array[i*a.itemSize+k]));return {values,p:new T.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(toReference)};};
   const originalValues=attrs.map(a=>Array.from(a.array)),keep=[],doors=[[],[]];
   const emit=(poly,list)=>{for(let k=1;k+1<poly.length;k++)list.push(poly[0],poly[k],poly[k+1]);};
   const addVertex=v=>{const i=originalValues[pi].length/3;for(let k=0;k<attrs.length;k++)originalValues[k].push(...v.values.slice(offsets[k],offsets[k]+sizes[k]));return i;};
   for(let i=0;i<ix.count;i+=3){
    const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)],tri=ids.map(read);
    if(planes.some(f=>tri.every(v=>f(v.p)<-1e-7))){keep.push(...ids);continue;}
    let polygon=tri;const retained=[];
    for(const distance of planes){const cut=split(polygon,distance);emit(cut.outside,retained);polygon=cut.inside;if(polygon.length<3)break;}
    if(polygon.length<3){keep.push(...ids);continue;}
    removed++;for(const v of retained)keep.push(addVertex(v));
    if(mesh.material.name==='DefaultWhite_texture.png')for(let s=0;s<2;s++)emit(split(polygon,p=>(s?1:-1)*p.x).inside,doors[s]);
   }
   const copy=g.clone();for(let k=0;k<names.length;k++)copy.setAttribute(names[k],new T.Float32BufferAttribute(originalValues[k],sizes[k]));copy.setIndex(keep);copy.computeBoundingBox();copy.computeBoundingSphere();mesh.geometry=copy;
   for(let s=0;s<2;s++)if(doors[s].length){
    const p=[],n=[],uv=[];for(const v of doors[s]){
     p.push(v.p.x-hinges[s].position.x,v.p.y-hinges[s].position.y,v.p.z);
     const normal=new T.Vector3().fromArray(v.values,offsets[ni]).applyMatrix3(normalToReference).normalize();n.push(...normal.toArray());
     uv.push(...(ui<0?[0,0]:v.values.slice(offsets[ui],offsets[ui]+2)));
    }
    const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(p,3));geom.setAttribute('normal',new T.Float32BufferAttribute(n,3));geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    const material=mesh.material.clone();material.side=T.DoubleSide;
    const door=new T.Mesh(geom,material);door.name='avengerBayDoorSkin';door.castShadow=true;hinges[s].add(door);doorTriangles+=p.length/9;
   }
  }
  if(!removed||!doorTriangles)throw Error('Avenger belly skin not found');
  const interior=new T.MeshStandardMaterial({color:0x283026,roughness:.9,side:T.DoubleSide});interior.color.convertSRGBToLinear();
  const box=(name,size,p)=>{const m=new T.Mesh(new T.BoxGeometry(...size),interior);m.name=name;m.position.set(...p);frame.add(m);};
  box('avengerBayCeiling',[.96,.035,4.45],[0,-.32,-.775]);
  for(const side of [-1,1])box('avengerBayWall',[.028,.50,4.45],[side*.48,-.58,-.775]);
  for(const z of [bounds.front,bounds.rear])box('avengerBayBulkhead',[.96,.50,.025],[0,-.58,z]);
  const torpedo=root.Ordnance.create('torpedo');torpedo.name='avengerInternalTorpedo';torpedo.rotation.y=Math.PI;
  torpedo.scale.setScalar(.94);torpedo.position.set(0,-.65,-.775);frame.add(torpedo);
  frame.userData.avengerBay={removedTriangles:removed,doorTriangles,open:0};pose(model,0,1);
 }
 function data(model){const f=model?.getObjectByName('avengerBombBay');if(!f)return null;if(cache.has(f))return cache.get(f);
  const d={frame:f,left:f.getObjectByName('avengerBayLeft'),right:f.getObjectByName('avengerBayRight'),torpedo:f.getObjectByName('avengerInternalTorpedo')};cache.set(f,d);return d;}
 function pose(model,open,stores){const d=data(model);if(!d)return;const a=clamp(open);d.left.rotation.z=-1.48*a;d.right.rotation.z=1.48*a;d.torpedo.visible=stores>0;d.frame.userData.avengerBay.open=a;}
 function update(model,dt,{open=false,stores=0}={}){const d=data(model);if(!d)return 1;const old=d.frame.userData.avengerBay.open,target=open?1:0,step=Math.max(0,dt)*3;
  const a=old<target?Math.min(target,old+step):Math.max(target,old-step);pose(model,a,stores);return a;}
 function isOpen(model){return (data(model)?.frame.userData.avengerBay.open??1)>.98;}
 function releasePoint(model,reference){const d=data(model);if(!d)return null;d.torpedo.updateWorldMatrix(true,false);const p=d.torpedo.getWorldPosition(new T.Vector3());return reference?reference.worldToLocal(p):p;}
 root.AvengerBay={install,pose,update,isOpen,releasePoint,bounds};if(typeof module==='object'&&module.exports)module.exports=root.AvengerBay;
})(typeof window==='undefined'?globalThis:window);
