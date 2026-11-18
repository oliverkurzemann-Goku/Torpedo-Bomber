/* Original period-inspired scenery for the playable Okinawa map, in local metres. */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,f)=>a+(b-a)*f;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const tint=(n,s)=>{const v=Math.sin(n*91.7+s*31.6)*43758.545;return v-Math.floor(v);};
const point=(a,b,t)=>[mix(a[0],b[0],t),mix(a[1],b[1],t)];
const CASTLE=[-2495,-2548],LIGHT=[-5100,-6100];
const STONE=[0x8a8270,0x777560,0xa29b7e,0x8f9075];

function connect(world,routes,airfield){
 const nodes=[];
 for(const r of routes)if(r.kind==='road'&&!r.paintOnly)for(let i=1;i<r.path.length;i++){
  const a=r.path[i-1],b=r.path[i],steps=Math.ceil(distance(a,b)/28);
  for(let j=0;j<steps;j++)nodes.push(point(a,b,j/steps));
 }
 const clear=(a,b)=>{
  const steps=Math.ceil(distance(a,b)/11);let previous=world.getSurfaceHeight(...a);
  for(let k=1;k<=steps;k++){
   const p=point(a,b,k/steps),h=world.getSurfaceHeight(...p);
   if(world.shoreDistance(...p)<17||world.nearHouse(...p)||Math.abs(h-previous)>3.2)return false;
   previous=h;
  }
  return true;
 };
 const attach=(a,kind,label)=>{
  const closest=nodes.map(p=>[distance(a,p),p]).filter(([d])=>d>30&&d<1800).sort((a,b)=>a[0]-b[0]);
  for(const [d,b] of closest.slice(0,95)){
   const dx=(b[0]-a[0])/d,dz=(b[1]-a[1])/d;
   for(const bend of [22,-34,0,64,-70,130,-130]){
    const m=point(a,b,.42);m[0]-=dz*bend;m[1]+=dx*bend;
    if(!clear(a,m)||!clear(m,b))continue;
    routes.push({path:[a,m,b],width:kind==='road'?5.8:3.7,kind,label});return true;
   }
  }
  return false;
 };
 for(const p of [[-370,-84],[-320,-128],[236,-85],[265,-125]]){
  if(attach([airfield.x+p[0],airfield.z+p[1]],'road','Airfield service connection'))break;
 }
 for(const [x,z] of [[-4350,-720],[-3760,221],[-3580,606],[-4970,-4660]]){
  if(world.shoreDistance(x,z)>18)attach([x,z],'track','Coastal access');
 }
}

function build(world,airfield){
 const THREE=root.THREE,group=new THREE.Group();group.name='Okinawa countryside and coast';world.root.add(group);
 const paint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide});
 const box=new THREE.BoxGeometry(1,1,1),roof=new THREE.CylinderGeometry(0,1,1,4,1).rotateY(Math.PI/4);
 const rock=new THREE.DodecahedronGeometry(1,0),post=new THREE.CylinderGeometry(.66,1,1,8);
 const truckWheel=new THREE.CylinderGeometry(1,1,1,10).rotateZ(Math.PI/2);
 const ring=new THREE.TorusGeometry(1,.18,4,10);
 const v=new THREE.Vector3(),color=new THREE.Color(),boxMatrix=new THREE.Matrix4(),dummy=new THREE.Object3D();
 const g=(x,z)=>world.getSurfaceHeight(x,z),shore=(x,z)=>world.shoreDistance(x,z);
 const dry=(x,z)=>shore(x,z)>18&&world.biome(x,z)[2]<.2;
 const cells=new Map(),sceneryMeshes=[],traffic=[],boats=[],valleys=[];
 const stats={walls:0,courtyards:0,ruins:0,roadScars:0,roadside:0,bridges:0,fieldEdges:0,streams:0,cliffs:0,landmarks:0,harbors:0,airfieldPads:0,traffic:0,boats:0,drawCells:0};

 function stored(x,z,near){
  const key=[Math.floor(x/650),Math.floor(z/650),near?1:0].join(',');
  if(!cells.has(key))cells.set(key,{p:[],c:[],near});
  return cells.get(key);
 }
 function addPoints(bucket,points,value){
  color.setHex(value).convertSRGBToLinear();
  for(const p of points){bucket.p.push(...p);bucket.c.push(color.r,color.g,color.b);}
 }
 function face(a,b,c,d,value,near=false){
  const bucket=stored((a[0]+c[0])/2,(a[2]+c[2])/2,near);
  addPoints(bucket,[a,b,c,a,c,d],value);
 }
 function piece(shape,value,x,y,z,w,h,d,yaw=0,near=false,local=null){
  const bucket=local||stored(x,z,near),at=shape.attributes.position,index=shape.index;
  dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);dummy.scale.set(w,h,d);dummy.updateMatrix();boxMatrix.copy(dummy.matrix);
  color.setHex(value).convertSRGBToLinear();
  for(let i=0;i<(index?.count??at.count);i++){
   v.fromBufferAttribute(at,index?index.getX(i):i).applyMatrix4(boxMatrix);
   bucket.p.push(v.x,v.y,v.z);bucket.c.push(color.r,color.g,color.b);
  }
 }
 function beam(a,b,w,h,value,yOffset=0,near=false){
  const p=point(a,b,.5),yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);
  piece(box,value,p[0],g(...p)+yOffset,p[1],w,h,distance(a,b)+.06,yaw,near);
 }
 function strip(a,b,width,value,lift=.09,near=false){
  const len=distance(a,b);
  if(len<.05)return;
  const dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
  const ends=(p,sign)=>{const x=p[0]+sign*dz*width/2,z=p[1]-sign*dx*width/2;return [x,g(x,z)+lift,z];};
  face(ends(a,-1),ends(b,-1),ends(b,1),ends(a,1),value,near);
 }
 function wall(a,b,height,width,seed){
  const len=distance(a,b),steps=Math.ceil(len/3.3);
  for(let j=0;j<steps;j++){
   const p=point(a,b,j/steps),q=point(a,b,(j+1)/steps),m=point(p,q,.5),n=tint(seed,j);
   if(!dry(...m)||world.nearRoad(...m)||Math.abs(g(...p)-g(...q))>1.5)continue;
   const high=Math.max(g(...p),g(...q)),bottom=Math.min(g(...p),g(...q))-.10;
   const yaw=Math.atan2(q[0]-p[0],q[1]-p[1]),h=high-bottom+height*(.84+n*.27);
   piece(box,STONE[Math.floor(n*4)],m[0],bottom+h/2,m[1],width,h,distance(p,q)-.06,yaw,true);
   piece(box,0xa09a81,m[0],bottom+h+.075,m[1],width+.11,.15,distance(p,q)-.04,yaw,true);
   stats.walls++;
  }
 }
 function mesh(bucket,material=paint){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(bucket.p,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(bucket.c,3));
  geo.computeVertexNormals();geo.computeBoundingSphere();
  const m=new THREE.Mesh(geo,material);m.receiveShadow=true;return m;
 }

 function inHouse(x,z){
  return world.houseSites.some(h=>{
   const dx=x-h.x,dz=z-h.z;
   if(dx*dx+dz*dz>407)return false;
   const c=Math.cos(h.rot),s=Math.sin(h.rot);
   return Math.abs(dx*c-dz*s)<h.w*.56+.42&&Math.abs(dx*s+dz*c)<h.depth*.57+.48;
  });
 }
 // Compact house compounds on both sides of the village streets.
 for(const town of world.coastalTowns)for(const [i,home] of town.houses.entries()){
  if(home.damaged||tint(i,town.x)<.18)continue;
  const {x,z,rot,w,depth}=home,cs=Math.cos(rot),sn=Math.sin(rot);
  const pos=(u,v)=>[x+cs*u+sn*v,z-sn*u+cs*v];
  const atSide=depth*.51+2.8,far=w*.50+2.9;
  const free=p=>dry(...p)&&!world.nearRoad(...p)&&!inHouse(...p);
  const plots=[...[-1,1].map(side=>[pos(-w*.43,side*atSide),pos(w*.43,side*atSide),pos(0,side*(atSide+1.0))]),
   ...[-1,1].map(side=>[pos(side*far,-depth*.43),pos(side*far,depth*.43),pos(side*(far+1.0),0)])];
  const selected=plots.find(([a,b,c])=>free(a)&&free(b)&&free(c)&&free(point(a,b,.5))&&Math.abs(g(...a)-g(...b))<1.30);
  if(!selected)continue;
  const [a,b,yard]=selected;
  wall(a,b,.78,.46,i+11);
  strip(point(a,b,.18),point(a,b,.82),2.0,0xa99570,.10,true);
  if(i%3===1)piece(post,0x6f5242,yard[0],g(...yard)+.43,yard[1],.45,.88,.45,0,true);
  if(i%3===2){
   const [hx,hz]=yard,h=g(hx,hz);
   piece(box,0x655c4a,hx,h+.72,hz,1.55,1.45,1.61,rot,true);
   piece(roof,0x834833,hx,h+1.64,hz,1.25,.52,1.35,rot,true);
  }
  stats.courtyards++;
 }

 for(const [i,p] of world.houseSites.filter(p=>p.damaged).entries()){
  const {x,z,w,depth,rot,y}=p;
  piece(box,0x645649,x,y+.13,z,w,.27,depth,rot);
  const cs=Math.cos(rot),sn=Math.sin(rot);
  for(const side of [-1,1]){
   const dx=side*w*.46;
   piece(box,0x8c7e65,x+dx*cs,y+1.1,z-dx*sn,.53,2.26,depth*.85,rot);
   piece(box,0x71614e,x+sn*side*depth*.43,y+.50,z+cs*side*depth*.43,w*.91,1.04,.55,rot);
  }
  for(let j=0;j<14;j++){
   const ax=x+(tint(i,j)-.5)*w,az=z+(tint(i+20,j)-.5)*depth;
   piece(rock,[0x797167,0x724c38,0x9b8c6b][j%3],ax,g(ax,az)+.17,az,.19+(j%4)*.20,.26,.62,j,true);
  }
  stats.ruins++;
 }

 // Real agricultural polygons outline the uneven fields and produce fallow, terraced and planted edges.
 world.polygons('fields',(outline)=>{
  if(outline.length<4||stats.fieldEdges>=118)return;
  const center=outline.reduce((p,q)=>[p[0]+q[0]/outline.length,p[1]+q[1]/outline.length],[0,0]);
  if(center[0]>-1700||center[1]<-5700||center[1]>3000||!dry(...center))return;
  for(let i=1;i<outline.length&&stats.fieldEdges<118;i++){
   const a=outline[i-1],b=outline[i],length=distance(a,b),m=point(a,b,.5);
   if(length<13||length>119||!dry(...m)||world.nearRoad(...m)||world.nearHouse(...m)||Math.abs(g(...a)-g(...b))>length*.29)continue;
   const n=Math.ceil(length/9);
   for(let j=0;j<n;j++)strip(point(a,b,j/n),point(a,b,(j+1)/n),2.3,(i%3)?0x7c7750:0x736149,.13);
   if(i%3===0)wall(a,b,.50,.52,i+stats.fieldEdges);
   else{
    const inside=point(m,center,.10);
    if(dry(...inside)&&!world.nearHouse(...inside)&&!world.nearRoad(...inside))
     piece(rock,0x354525,inside[0],g(...inside)+1.05,inside[1],2.7,1.9,2.1,i,true);
   }
   stats.fieldEdges++;
  }
 });

 for(const [ri,r] of world.roadRoutes.entries()){
  if(r.path.length<2)continue;
  if(r.kind==='road'&&!r.paintOnly&&ri%3===0&&traffic.length<22){
   let path=r.path.map(p=>p.slice()),lengths=[0];
   for(let i=1;i<path.length;i++)lengths.push(lengths[i-1]+distance(path[i-1],path[i]));
   if(lengths.at(-1)>110)traffic.push({path,lengths,phase:tint(ri,11),speed:4+tint(ri,7)*3,type:traffic.length%3===0?'cycle':'truck'});
  }
  if(r.kind==='track'&&ri%2)continue;
  for(let i=1;i<r.path.length;i++){
   const a=r.path[i-1],b=r.path[i],length=distance(a,b),steps=Math.ceil(length/17);
   const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
   if(!steps)continue;
   for(let j=0;j<steps;j++){
    const u=point(a,b,j/steps),v=point(a,b,(j+1)/steps),m=point(u,v,.5);
    if(!dry(...m)||world.nearHouse(...m)||m[0]>-1300||m[1]<-5700||m[1]>3500)continue;
    if(r.paintOnly)strip(u,v,r.width*.90,0x9c855e,.17);
    for(const side of [-1,1]){
     const shifted=(p,w)=>[p[0]+dz*w*side,p[1]-dx*w*side];
     if(r.kind==='track'||r.paintOnly)strip(shifted(u,.89),shifted(v,.89),.36,0x766147,.21,true);
     const h=r.width*.6+1.65,s=shifted(m,h);
     if((j+ri)%3||!dry(...s)||world.nearHouse(...s))continue;
     const p=shifted(u,h),q=shifted(v,h);
     if(dry(...p)&&dry(...q)){
      strip(p,q,.84,0x655e41,.095,true);
      if(Math.abs(g(...s)-g(...m))>1.10&&Math.abs(g(...p)-g(...q))<1.95)
       beam(p,q,.63,.55,0x90866b,.20,true);
      stats.roadside++;
     }
    }
    const incident=Math.min(Math.hypot((m[0]+4015),m[1]+750),Math.hypot(m[0]+3270,m[1]-345));
    if(incident<140&&stats.roadScars<11&&(j+ri)%4===0){
     const p=[m[0]+dz*r.width*.21,m[1]-dx*r.width*.21];
     strip([p[0]-dx*2.5,p[1]-dz*2.5],[p[0]+dx*6.2,p[1]+dz*6.2],r.width*.51,0x655147,.23);
     for(const off of [-.30,.55,1.20])piece(rock,0x726956,p[0]+dz*off,g(...p)+.125,p[1]-dx*off,.33,.30,.48,off,true);
     stats.roadScars++;
    }
    if(r.kind==='road'&&!r.paintOnly&&stats.bridges<9&&j>1){
     const h=g(...m),left=[m[0]+dz*13,m[1]-dx*13],right=[m[0]-dz*13,m[1]+dx*13];
     if(h<g(...u)-.45&&h<g(...v)-.45&&dry(...left)&&dry(...right)){
      const yaw=Math.atan2(dx,dz);
      piece(box,0xa29376,m[0],(g(...u)+g(...v))/2+.03,m[1],r.width+.65,.34,11,yaw);
      for(const side of [-1,1])piece(box,0x807967,m[0]+dz*side*r.width*.56,h+.65,m[1]-dx*side*r.width*.56,.26,.86,11.1,yaw);
      stats.bridges++;
     }
    }
   }
  }
 }

 // Stream beds use the surrounding DEM instead of a level water plane sunk into hills.
 for(const [cx,cz,angle] of [[-3950,-420,.24],[-3370,870,.30],[-4590,-3650,.35],[-2950,1800,1.0]]){
  let a=null,segments=0;
  for(let i=-13;i<=13;i++){
   const ax=cx+i*16*Math.sin(angle),az=cz+i*16*Math.cos(angle);
   const options=[];
   for(let j=-3;j<=3;j++){
    const p=[ax+Math.cos(angle)*j*8,az-Math.sin(angle)*j*8];
    if(dry(...p)&&!world.nearRoad(...p)&&!world.nearHouse(...p)&&(!a||distance(a,p)<37))options.push(p);
   }
   options.sort((p,q)=>g(...p)-g(...q));const b=options[0];
   if(a&&b&&Math.abs(g(...a)-g(...b))<2.6){strip(a,b,4.1,0x767057,.12);strip(a,b,1.85,0x475c51,.16);segments++;}
   a=b;
  }
  if(segments>4){stats.streams++;valleys.push([cx,cz,g(cx,cz)]);}
 }

 // High-contrast shoreline rock helps separate cliff, beach and reef profiles.
 for(let z=-6400;z<=2450;z+=29)for(let x=-5750;x<=-2900;x+=36){
  const d=shore(x,z);if(d<11||d>55||!dry(x,z)||world.nearRoad(x,z)||world.nearHouse(x,z))continue;
  const h=g(x,z),grade=Math.max(Math.abs(h-g(x+26,z)),Math.abs(h-g(x,z+26)));
  if(h<6||grade<4.7||tint(x,z)<.38)continue;
  const s=3+grade*.64;
  piece(rock,STONE[Math.floor(tint(z,x)*4)],x,h-s*.25,z,s*1.4,s*.64,s*.87,tint(x+1,z)*6.2);
  if(tint(x-4,z)>.5)piece(rock,0xb1a996,x+5,h-.7,z+5,s*.71,s*.41,s*.66,1.4);
  stats.cliffs++;
 }

 // The fortress silhouette and lighthouse are illustrative, placed on the local geographic terrain.
 const [cx,cz]=CASTLE;
 for(const [radius,offset] of [[68,.08],[43,1.63]]){
  const poly=Array.from({length:13},(_,i)=>{const a=i/13*Math.PI*2+offset,r=radius*(.80+.25*tint(i,radius));return [cx+r*Math.cos(a),cz+r*.72*Math.sin(a)];});
  for(let i=0;i<poly.length;i++){
   if(i===3||i===4)continue;
   const a=poly[i],b=poly[(i+1)%poly.length],length=distance(a,b),n=Math.ceil(length/4.7);
   for(let j=0;j<n;j++){
    const p=point(a,b,j/n),q=point(a,b,(j+1)/n);
    beam(p,q,2.3,3.4,STONE[(i+j)%4],1.42);
    beam(p,q,2.54,.30,0xaaa58e,3.06);
   }
  }
 }
 stats.landmarks++;
 const [lx,lz]=LIGHT,base=g(lx,lz);
 piece(post,0xc4bfa3,lx,base+7.3,lz,3.6,15,3.6);piece(post,0x6f6a5c,lx,base+14.6,lz,3.1,.5,3.1);
 piece(post,0x52616a,lx,base+16.0,lz,2.24,2.4,2.24);piece(roof,0x665544,lx,base+17.55,lz,2.32,1.2,2.32);
 piece(box,0x807762,lx+6,g(lx+6,lz)+1.6,lz,5.1,3.3,4.4,.16);piece(roof,0x754b3c,lx+6,g(lx+6,lz)+3.8,lz,3.7,1.2,3.2,.16);
 stats.landmarks++;

 if(world.serviceArea){
  const {x,z}=airfield;
  for(const [cx,cz,width,length] of [[-244,-106,19,48],[176,-104,19,42],[85,-84,16,34],[-165,-81,12,32],[232,-80,19,26]]){
   const a=[x+cx-length*.5,z+cz],b=[x+cx+length*.5,z+cz],segments=Math.ceil(length/6);
   for(let i=0;i<segments;i++)strip(point(a,b,i/segments),point(a,b,(i+1)/segments),width,0xb0a68b,.076);
   const entry=cz+width/2;
   for(let side=entry;side< -53;side+=5)strip([x+cx,z+side],[x+cx,z+Math.min(-53,side+5)],6.2,0xa59f86,.085);
   for(const side of [-1,1])for(let i=-2;i<=2;i++){
    const px=x+cx+i*length/5,pz=z+cz+side*(width/2+.8);
    piece(box,0x6d7255,px,g(px,pz)+.17,pz,.85,.34,.31,0,true);
   }
   stats.airfieldPads++;
  }
 }

 for(const p of world.coastalScenery?.placements.filter(p=>p.kind==='fishing-jetty')||[]){
  const fx=Math.sin(p.yaw),fz=Math.cos(p.yaw),at=(a,b)=>[p.x+fx*a+fz*b,p.z+fz*a-fx*b];
  const land=at(-23,0),low=at(-3,0),height=g(...land),endY=Math.max(.50,g(...low)+.07);
  if(shore(...land)>5){
   const a=at(-23,-3.25),b=at(-23,3.25),c=at(-3,3.25),d=at(-3,-3.25);
   face([a[0],height+.15,a[1]],[b[0],g(...b)+.15,b[1]],[c[0],endY,c[1]],[d[0],endY,d[1]],0x8f8266);
   for(const [i,offset] of [-5,-7,6,9].entries()){
    const q=at(-24-i*2,offset);if(shore(...q)<7||world.nearHouse(...q))continue;
    piece(box,i%2?0x6f7957:0x8d7753,q[0],g(...q)+.52,q[1],1.72,1.04,1.32,p.yaw+i*.14,true);
    if(i%2===0)piece(box,0x5c6550,q[0],g(...q)+1.03,q[1],2.4,.16,2.1,p.yaw+.35,true);
   }
  }
  const pick=world.coastalScenery.placements.find(o=>o.kind==='sabani'&&Math.hypot(o.x-p.x,o.z-p.z)<480);
  if(pick){
   const heading=p.yaw+Math.PI/2,dx=Math.sin(heading),dz=Math.cos(heading);
   const a=[pick.x+fx*23-dx*34,pick.z+fz*23-dz*34],b=[pick.x+fx*23+dx*34,pick.z+fz*23+dz*34];
   if(Array.from({length:11},(_,i)=>point(a,b,i/10)).every(q=>shore(...q)<-19))boats.push({a,b,heading});
  }
  stats.harbors++;
 }

 for(const bucket of cells.values()){
  if(!bucket.p.length)continue;
  const m=mesh(bucket);m.name=bucket.near?'Okinawa close roadside and courtyard detail':'Okinawa scenery cell';group.add(m);
  sceneryMeshes.push({m,range:bucket.near?850:3200,altitude:bucket.near?1.08:.72});
 }
 stats.drawCells=group.children.length;
 function model(type){
  const b={p:[],c:[]},add=(shape,t,x,y,z,w,h,d,r=0)=>piece(shape,t,x,y,z,w,h,d,r,false,b);
  if(type==='truck'){
   add(box,0x515b40,0,1.10,-.43,1.90,.92,2.6);add(box,0x73735a,0,2.03,-.59,1.98,1.13,2.52);
   add(box,0x424f3b,0,1.61,1.18,1.67,1.34,1.04);add(box,0x434a45,0,1.96,1.72,1.39,.44,.045);
   add(box,0x5b6448,0,1.09,2.00,1.44,.52,1.0);
   for(const x of [-.96,.96])for(const z of [-1.10,1.38])add(truckWheel,0x303128,x,.47,z,.25,.44,.44);
  }else if(type==='cycle'){
   for(const z of [-.64,.64]){const wheel=ring.clone().rotateY(Math.PI/2);add(wheel,0x303128,0,.30,z,.28,.28,.28);wheel.dispose();}
   add(box,0x696455,0,.56,0,.09,.14,1.13);add(box,0x717763,0,.99,-.10,.26,.55,.26);
   add(rock,0x796049,0,1.38,.03,.12,.15,.12);add(box,0x4a4a3c,0,.96,.24,.47,.09,.10);
  }else{
   const faces=[[[0,.39,3.55],[-.62,.41,.65],[-.57,.36,-3.0],[0,.31,-3.38]],[[0,.31,-3.38],[.56,.37,-3.0],[.61,.41,.65],[0,.39,3.55]],[[0,-.36,3.14],[0,.39,3.55],[-.62,.41,.65],[-.37,-.52,.43]],[[-.37,-.52,.43],[-.62,.41,.65],[-.57,.36,-3.0],[-.26,-.47,-2.71]],[[.37,-.52,.43],[.61,.41,.65],[0,.39,3.55],[0,-.36,3.14]],[[.26,-.47,-2.71],[.56,.37,-3.0],[.61,.41,.65],[.37,-.52,.43]]];
   for(const p of faces)addPoints(b,[p[0],p[1],p[2],p[0],p[2],p[3]],0x7a5b3f);
   for(const z of [-1.3,.45,1.5])add(box,0xb08f63,0,.45,z,1.15,.09,.40);
  }
  return mesh(b);
 }
 const models=Object.fromEntries(['truck','cycle','skiff'].map(type=>[type,model(type)]));
 for(const e of traffic){e.mesh=models[e.type].clone();e.mesh.visible=false;group.add(e.mesh);}
 for(const e of boats){
  e.mesh=models.skiff.clone();e.mesh.visible=false;group.add(e.mesh);
  const wake=new THREE.BufferGeometry();wake.setAttribute('position',new THREE.Float32BufferAttribute([-1.17,.01,-9,-.16,.04,-2.5,-.65,.01,-9,.65,.01,-9,.16,.04,-2.5,1.17,.01,-9],3));
  e.wake=new THREE.Mesh(wake,new THREE.MeshBasicMaterial({color:0xb7ddd0,transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide}));e.mesh.add(e.wake);
 }
 stats.traffic=traffic.length;stats.boats=boats.length;

 const weatherMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{amount:{value:0},time:{value:0},rain:{value:0},shade:{value:new THREE.Color(0xb4c2b9)}},
  vertexShader:'varying vec2 vUV;void main(){vUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`varying vec2 vUV;uniform float amount,time,rain;uniform vec3 shade;
    void main(){vec2 p=vUV-.5;float mask=max(0.,1.-dot(p*vec2(2.02,2.07),p*vec2(2.02,2.07)));
    float streak=.53+.47*sin(vUV.x*219.+vUV.y*17.+sin(vUV.x*73.)*1.6);
    float ripple=.75+.25*sin(vUV.x*35.+sin(vUV.y*18.)+time*.24);
    gl_FragColor=vec4(shade,amount*mask*mask*mix(ripple,streak,rain));}`});
 const weatherGeo=new THREE.PlaneGeometry(1,1),weatherVeils=Array.from({length:3},(_,i)=>{
  const m=new THREE.Mesh(weatherGeo,weatherMat.clone());m.name=i?'Low valley mist':'Local rain shaft';m.visible=false;group.add(m);return m;
 });
 let time=0,refresh=0;
 function update(dt,x,z,y,weather={}){
  time+=dt;refresh-=dt;
  if(refresh<=0){
   refresh=.24;
   for(const {m,range,altitude} of sceneryMeshes){
    const s=m.geometry.boundingSphere;
    m.visible=Math.hypot(s.center.x-x,s.center.z-z,(s.center.y-y)*altitude)-s.radius<range;
   }
  }
  for(const e of traffic){
   const total=e.lengths.at(-1),lap=(time*e.speed+e.phase*total)%(2*total),back=lap>total,d=back?2*total-lap:lap;
   let i=1;while(i<e.path.length-1&&e.lengths[i]<d)i++;
   const a=e.path[i-1],b=e.path[i],p=point(a,b,clamp((d-e.lengths[i-1])/Math.max(1,e.lengths[i]-e.lengths[i-1]),0,1));
   e.mesh.visible=Math.hypot(p[0]-x,p[1]-z,y*.8)<950;
   if(!e.mesh.visible)continue;
   e.mesh.position.set(p[0],g(...p)+.18,p[1]);e.mesh.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1])+(back?Math.PI:0);
  }
  for(const [i,e] of boats.entries()){
   const phase=time*.037+i*1.4,p=point(e.a,e.b,.5+.45*Math.sin(phase));
   e.mesh.visible=Math.hypot(p[0]-x,p[1]-z,y)<1300;
   if(!e.mesh.visible)continue;
   const water=world.coastalOptions?.seaHeight?.(...p)??.1;
   e.mesh.position.set(p[0],water+.10,p[1]);e.mesh.rotation.set(.035*Math.sin(time*2+i),e.heading+(Math.cos(phase)<0?Math.PI:0),.048*Math.sin(time*1.3+i));
   e.wake.material.opacity=.49*Math.abs(Math.cos(phase));
  }
  for(const [i,m] of weatherVeils.entries()){
   const q=valleys[(i+Math.floor(time/220))%valleys.length];
   const strength=i?weather.mist??0:weather.rain??0;
   m.visible=!!q&&strength>.055&&Math.hypot(q[0]-x,q[1]-z)<4200;
   if(!m.visible)continue;
   m.position.set(q[0]+Math.sin(time*.013+i)*(i?42:220),q[2]+(i?16:155),q[1]);
   m.rotation.y=Math.atan2(x-m.position.x,z-m.position.z);m.scale.set(i?660:380,i?58:345,1);
   m.material.uniforms.amount.value=clamp(strength*(i?.36:.74),0,.48);m.material.uniforms.time.value=time;m.material.uniforms.rain.value=i?0:1;
  }
 }
 // The dynamic visuals share templates, and all retained resources are attached to the world.
 for(const shape of [box,roof,rock,post,truckWheel,ring])shape.dispose();
 for(const [type,m] of Object.entries(models))if(type==='skiff'?!boats.length:!traffic.some(e=>e.type===type))m.geometry.dispose();
 if(!traffic.length&&!boats.length&&!sceneryMeshes.length)paint.dispose();
 weatherMat.dispose();
 update(0,-4400,-750,100);
 return {group,stats,update,traffic,boats,weatherVeils};
}
root.OkinawaIslandDetail={build,connect};
if(typeof module==='object'&&module.exports)module.exports=root.OkinawaIslandDetail;
})(typeof window==='undefined'?globalThis:window);
