/* F4U-1C Corsair (late clear-view canopy), original procedural WebGL airframe.
 * +Z nose, +Y up, metres. 12.50 m span; 10.2 m length. No third-party 3D geometry.
 * Independent gear, flaps, flying surfaces, four 20mm cannon, HVAR and bomb pylons.
 */
(function(global){
'use strict';
const T=global.THREE;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const mat=(c,r=.74,m=.04,opts={})=>new T.MeshStandardMaterial({color:c,roughness:r,metalness:m,side:T.DoubleSide,...opts});
const NAVY=mat(0x254866),DARK=mat(0x163550),HL=mat(0x385f7a),SHADOW=mat(0x182a36),
  METAL=mat(0x939d9f,.4,.65),RUBBER=mat(0x191e21,.95,.01),RED=mat(0xa63b2e),
  WHITE=mat(0xe2e4dd),YELLOW=mat(0xe5b847),INSIGNIA=mat(0x173955),
  GLASS=mat(0x92bbc5,.08,.02,{transparent:true,opacity:.28,depthWrite:false});
function group(parent,name,p){const o=new T.Group();o.name=name;if(p)o.position.set(...p);parent.add(o);return o;}
function mesh(parent,name,g,m,p){const o=new T.Mesh(g,m);o.name=name;if(p)o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function box(parent,n,s,p,m=NAVY){return mesh(parent,n,new T.BoxGeometry(...s),m,p);}
function cyl(parent,n,r,l,p,m=METAL,seg=12){return mesh(parent,n,new T.CylinderGeometry(r,r,l,seg),m,p);}
function rod(parent,n,a,b,r,m=METAL){const v=new T.Vector3(...a),w=new T.Vector3(...b),d=w.clone().sub(v);
 const o=cyl(parent,n,r,d.length(),v.clone().add(w).multiplyScalar(.5).toArray(),m);
 o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}
function loft(parent,n,stations,m=NAVY,N=22){
 const pts=[],ind=[];for(const [z,y,xw,yh] of stations)for(let k=0;k<N;k++){
  const a=k*2*Math.PI/N;pts.push(xw*Math.cos(a),y+yh*Math.sin(a),z);}
 for(let j=0;j<stations.length-1;j++)for(let k=0;k<N;k++){const a=j*N+k,b=j*N+(k+1)%N,c=(j+1)*N+k,d=(j+1)*N+(k+1)%N;ind.push(a,b,d,a,d,c);}
 for(let k=1;k<N-1;k++){ind.push(0,k,k+1);const end=(stations.length-1)*N;ind.push(end,end+k+1,end+k);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));g.setIndex(ind);g.computeVertexNormals();return mesh(parent,n,g,m);
}
function tyre(parent,r,w,p){
 const t=cyl(parent,'RubberTyre',r,w,p,RUBBER,22);t.rotation.z=Math.PI/2;t.userData.groundWheel=true;
 for(const dx of [-w*.53,w*.53]){const cap=cyl(parent,'WheelHub',r*.46,.023,[p[0]+dx,p[1],p[2]],HL,20);cap.rotation.z=Math.PI/2;}return t;
}
const W=[
 [.61,-.18,2.12,-1.27,.18],[1.35,-.75,1.99,-1.30,.19],[2.47,-1.48,1.63,-1.22,.17],
 [3.15,-.98,1.50,-1.15,.14],[4.25,-.59,1.28,-1.04,.12],[5.40,-.44,.88,-.96,.10],
 [6.10,-.43,.36,-.82,.07],[6.25,-.43,-.31,-.61,.03]
];
function section(x){x=clamp(x,.61,6.25);let j=0;while(j<W.length-2&&W[j+1][0]<x)j++;
 const a=W[j],b=W[j+1],t=(x-a[0])/(b[0]-a[0]);return a.map((v,i)=>i? v+(b[i]-v)*t:x);
}
function wing(root,n,side,x0,x1,c0,c1,m=NAVY,pivot){
 const xx=[x0,...W.filter(v=>v[0]>x0&&v[0]<x1).map(v=>v[0]),x1],xs=[];
 for(let j=0;j<xx.length-1;j++){const steps=Math.max(2,Math.ceil((xx[j+1]-xx[j])/.18));for(let k=0;k<steps;k++)xs.push(xx[j]+(xx[j+1]-xx[j])*k/steps);}xs.push(x1);
 const vertices=[],indices=[],K=12,R=2*(K+1);
 for(const x of xs){const [sx,y,le,te,t]=section(x);
  for(const upper of [1,-1])for(let k=0;k<=K;k++){const q=upper>0?k/K:1-k/K,c=c0+(c1-c0)*q;
   const z=le+(te-le)*c,camber=Math.sin(Math.PI*c)*.025;
   const thick=.5*t*(le-te)*Math.pow(Math.max(0,Math.sin(Math.PI*c)),.8);
   vertices.push(side*x-(pivot?.[0]||0),y+camber+upper*thick-(pivot?.[1]||0),z-(pivot?.[2]||0));}
 }
 for(let i=0;i<xs.length-1;i++)for(let k=0;k<R;k++){const a=i*R+k,b=i*R+(k+1)%R,c=(i+1)*R+k,d=(i+1)*R+(k+1)%R;indices.push(a,b,d,a,d,c);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
 return mesh(root,n,g,m);
}
function mainAirframe(root){
 loft(root,'Fuselage',[
 [-5.18,-.13,.025,.035],[-4.66,-.05,.18,.21],[-4.15,.01,.31,.31],
 [-3.35,.10,.50,.43],[-2.45,.08,.65,.61],[-1.50,-.05,.68,.68],[-.50,-.09,.76,.75],
 [.62,-.02,.86,.85],[1.50,-.03,.79,.78],[2.45,.03,.71,.69],
 [3.02,.08,.62,.64],[3.48,.08,.70,.69],[3.88,.09,.83,.78],[4.29,.10,.83,.79],
 [4.60,.11,.69,.68],[4.90,.11,.47,.48],[5.05,.10,.07,.12]
 ],NAVY);
 loft(root,'EngineCowling',[[3.58,.11,.77,.77],[3.82,.11,.84,.81],[4.12,.11,.86,.84],[4.59,.11,.85,.82],[4.83,.11,.76,.72],[4.98,.11,.63,.62]],HL);
 mesh(root,'CoolingRing',new T.TorusGeometry(.72,.054,10,36),SHADOW,[0,.11,4.97]);
 const spinner=mesh(root,'PropellerSpinner',new T.ConeGeometry(.31,.69,24),HL,[0,.10,5.14]);spinner.rotation.x=Math.PI/2;
 for(const side of [-1,1]){
  wing(root,'Inner gull wing',side,.61,3.11,0,.76);
  wing(root,'Outer gull wing',side,3.11,6.25,0,.75);
  const f=[.90,1.43,2.57,3.06]; // separated split flap segments with independent hinge
  for(let k=0;k<2;k++){const a=f[k*2],b=f[k*2+1],w=section((a+b)/2),p=[side*(a+b)/2,w[1],w[2]+(w[3]-w[2])*.76];
   const hinge=group(root,'Flap'+(side<0?'Left':'Right')+k,p);
   hinge.userData.control='flap';hinge.userData.driveSide=side;
   wing(hinge,'Split landing flap',side,a,b,.76,1,HL,p);
  }
  {const a=3.16,b=4.56,w=section((a+b)/2),p=[side*(a+b)/2,w[1],w[2]+(w[3]-w[2])*.76];
   const hinge=group(root,'Flap'+(side<0?'Left':'Right')+'Outer',p);hinge.userData.control='flap';
   wing(hinge,'Outer landing flap',side,a,b,.76,1,HL,p);}
  {const a=4.59,b=6.18,w=section((a+b)/2),p=[side*(a+b)/2,w[1],w[2]+(w[3]-w[2])*.74];
   const hinge=group(root,side<0?'AileronLeft':'AileronRight',p);hinge.userData.control='aileron';hinge.userData.side=side;
   wing(hinge,'Aileron skin',side,a,b,.74,1,NAVY,p);}
  for(let j=0;j<2;j++){const x=side*(2.58+j*.32),y=section(Math.abs(x))[1]+.05,z=1.70-j*.20;
   rod(root,'20mm M2 cannon barrel',[x,y,z],[x,y,z+.56],.040,SHADOW);
   box(root,'Cannon Fairing',[.135,.115,.36],[x,y,z+.1],NAVY);}
  for(const s of [4.10,5.12]){const y=section(s)[1]+.11;
   const decal=group(root,'US Navy wing insignia',[side*s,y,0]);decal.rotation.x=-Math.PI/2;
   const circ=mesh(decal,'BlueRoundel',new T.CircleGeometry(.34,28),INSIGNIA,[0,0,.01]);circ.material.side=T.DoubleSide;
   const pts=[];for(let j=0;j<10;j++){const a=Math.PI*2*j/10-Math.PI/2,r=j%2?.115:.28;pts.push(new T.Vector2(Math.cos(a)*r,Math.sin(a)*r));}
   const shp=new T.Shape(pts);mesh(decal,'USStar',new T.ShapeGeometry(shp),WHITE,[0,0,.025]);
   break;}
  // gull fold seams
  rod(root,'Wing fold hinge',[side*3.10,section(3.1)[1]-.02,-1.09],[side*3.10,section(3.1)[1]+.02,1.52],.017,SHADOW);
  rod(root,'Pitot', [side*5.86,-.39,.37],[side*5.86,-.39,1.09],.018,METAL);
  // horizontal tail
  const x1=side*.36,x2=side*2.19;
  const tail=box(root,'Horizontal tailplane',[x2-x1,.11,1.70],[side*(x1+x2)/2,.51,-4.23],NAVY);
  const e=group(root,side<0?'ElevatorLeft':'ElevatorRight',[side*1.28,.52,-4.78]);e.userData.control='elevator';
  box(e,'Elevator skin',[1.85,.067,.49],[0,0,-.23],HL);
 }
 box(root,'Vertical fin',[.16,1.63,1.43],[0,1.13,-4.34],NAVY);
 const rudder=group(root,'Rudder',[0,1.2,-4.93]);rudder.userData.control='rudder';
 box(rudder,'Rudder skin',[.13,1.44,.42],[0,0,-.19],HL);
 for(const side of [-1,1]){
  const decal=group(root,'US NAVY star and bars',[side*.693,.30,-2.07]);
  decal.rotation.y=side*Math.PI/2;
  mesh(decal,'Roundel',new T.CircleGeometry(.36,24),INSIGNIA,[0,0,0]);
  const pts=[];for(let j=0;j<10;j++){const a=j*Math.PI/5-Math.PI/2,r=j%2?.14:.27;pts.push(new T.Vector2(Math.cos(a)*r,Math.sin(a)*r));}
  mesh(decal,'Star',new T.ShapeGeometry(new T.Shape(pts)),WHITE,[0,0,.003]);
  for(const d of [-1,1])box(decal,'White bar',[.32,.19,.008],[d*.48,0,.007],WHITE);
 }
 // 18-cylinder R-2800 represented by cylinder heads behind the cowling mouth
 for(let row=0;row<2;row++)for(let k=0;k<9;k++){
  const a=k*2*Math.PI/9+(row?Math.PI/9:0),r=.51;
  cyl(root,'R2800 cylinder',.115,.30,[Math.cos(a)*r,.11+Math.sin(a)*r,4.82-row*.22],SHADOW,9).rotation.x=Math.PI/2;
 }
 // Bubble canopy: streamlined clear-view enclosure over elevated cockpit.
 const glass=group(root,'Late bubble canopy');
 const bubble=mesh(glass,'Clear bubble',new T.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI),GLASS,[0,.83,.60]);
 bubble.scale.set(.49,.54,1.12);bubble.rotation.x=-.045;
 rod(glass,'Windshield bow',[-.47,.85,1.64],[.47,.85,1.64],.031,DARK);
 rod(glass,'Canopy aft hoop',[-.46,.77,-.33],[.46,.77,-.33],.030,DARK);
 for(const side of [-1,1]){rod(glass,'Canopy sill',[side*.49,.65,-.36],[side*.47,.69,1.47],.025,DARK);
  rod(glass,'Windshield frame',[side*.46,.73,1.47],[side*.24,1.23,1.55],.031,DARK);}
 box(root,'Seat',[.49,.68,.28],[0,.44,.05],SHADOW);
 box(root,'Armour plate',[.48,.65,.10],[0,.68,-.37],SHADOW);
 box(root,'Instrument panel',[.77,.32,.13],[0,.47,1.42],SHADOW);
 box(root,'Cockpit combing',[1.03,.07,1.65],[0,.68,.65],DARK);
 rod(root,'Aerial mast',[0,1.18,-.47],[0,2.15,-.51],.024,METAL);
 const prop=group(root,'sbdRotorBlade',[0,.11,5.12]);
 for(let i=0;i<3;i++){
  const b=box(prop,'Hamilton Standard 3-blade prop',[.29,1.74,.075],[0,.89,0],SHADOW);
  b.rotation.z=i*2*Math.PI/3;b.rotation.y=.14;
  const tip=box(prop,'Yellow blade tip',[.29,.17,.078],[0,1.65,0],YELLOW);
  tip.rotation.z=i*2*Math.PI/3;
 }
 cyl(prop,'Propeller hub',.22,.27,[0,0,0],HL).rotation.x=Math.PI/2;
 return prop;
}
function gearRig(root){
 const g=group(root,'sbdGear');for(const side of [-1,1]){
  const hinge=group(g,side<0?'GearLeft':'GearRight',[side*1.74,-.98,1.29]);hinge.userData.control='gear';hinge.userData.side=side;
  rod(hinge,'Oleo cylinder',[0,0,0],[side*.1,-.68,-.11],.095,HL);
  rod(hinge,'Chrome oleo',[side*.1,-.68,-.11],[side*.17,-1.15,-.15],.072,METAL);
  rod(hinge,'Drag brace',[side*.26,-.1,-.30],[side*.17,-.98,-.14],.043,METAL);
  tyre(hinge,.38,.22,[side*.17,-1.19,-.14]);
  box(hinge,'Main gear door',[.20,.87,.052],[side*.33,-.51,-.10],NAVY);
 }
 const tail=group(g,'TailGear',[0,-.44,-4.39]);tail.userData.control='gear';
 rod(tail,'Tail strut',[0,0,0],[0,-1.83,-.2],.048,METAL);
 tyre(tail,.17,.13,[0,-1.92,-.18]);
 const hook=group(root,'sbdHook',[0,-.40,-4.48]);hook.userData.hookAxis='x';
 hook.userData.hookUpAngle=0;hook.userData.hookDownAngle=-.86;
 rod(hook,'Tailhook shank',[0,0,0],[0,-.10,-.93],.042,METAL);
 rod(hook,'Tailhook claw',[0,-.10,-.93],[0,-.19,-1.09],.047,METAL);
 return g;
}
function rocketMesh(p,name='HVAR'){
 const g=group(p,name);
 const body=cyl(g,'5in rocket body',.060,1.27,[0,0,0],HL);body.rotation.x=Math.PI/2;
 const nose=mesh(g,'Rocket warhead',new T.ConeGeometry(.078,.27,12),SHADOW,[0,0,.72]);nose.rotation.x=Math.PI/2;
 for(let k=0;k<4;k++){const fin=box(g,'HVAR fin',[.014,.24,.28],[0,0,-.48],HL);fin.rotation.z=k*Math.PI/2;}
 return g;
}
function bombMesh(p,name,size){
 const g=group(p,name),body=cyl(g,'General purpose bomb',size*.23,size,[0,0,0],SHADOW);body.rotation.x=Math.PI/2;
 const nose=mesh(g,'Bomb nose',new T.ConeGeometry(size*.23,size*.40,15),SHADOW,[0,0,size*.67]);nose.rotation.x=Math.PI/2;
 for(let k=0;k<4;k++){const fin=box(g,'Bomb tail fin',[.023,size*.30,size*.28],[0,0,-size*.47],HL);fin.rotation.z=k*Math.PI/2;}
 return g;
}
function stores(root){
 const supports=group(root,'Corsair stores');const bombs=[],rockets=[];
 for(const side of [-1,1]){
  const x=side*.95;box(supports,'Heavy bomb pylon',[.19,.32,.53],[x,-.82,.13],HL);
  const bomb=bombMesh(supports,'1000lb center-section bomb',1.38);bomb.position.set(x,-1.31,-.12);bombs.push(bomb);
  for(let i=0;i<4;i++){
   const span=3.49+i*.57,y=section(span)[1]-.25;
   rod(supports,'HVAR zero-length launcher',[side*span,y,0],[side*span,y,.76],.030,METAL);
   const rocket=rocketMesh(supports);rocket.position.set(side*span,y-.10,.34);rockets.push(rocket);
  }
 }
 return {bombs,rockets};
}
function create(){
 const root=group(new T.Group(),'Corsair_Original');root.position.y=-1.45;root.userData.nativeAircraft='f4u1c-bubble-original-v1';
 root.userData.kind='corsair';root.userData.dimensions={span:12.5,length:10.2};
 mainAirframe(root);gearRig(root);
 const load=stores(root);root.userData.stores='bombs';root.userData.bombCount=2;root.userData.rocketCount=0;
 // Do not store Object3D references in userData: Three.js clone(true) JSON-copies it.
 root.traverse(o=>{if(o.isMesh){o.frustumCulled=false;}});
 configure(root,'bombs');pose(root,1,{left:0,right:0},0,0,0);
 return root;
}
function frame(obj){return obj?.getObjectByName('Corsair_Original');}
function isNative(obj){return !!frame(obj);}
function configure(obj,load='bombs'){
 const r=frame(obj);if(!r)return;
 r.userData.stores=load;r.userData.bombCount=load==='bombs'||load==='mixed'?2:0;
 r.userData.rocketCount=load==='rockets'||load==='mixed'?8:0;
 renderStores(r);
}
function renderStores(r){
 const bombCount=r.userData.bombCount,rocketCount=r.userData.rocketCount;
 // SceneGraph clones do not preserve references stored in userData; always locate named groups.
 const stores=r.getObjectByName('Corsair stores');
 const bombs=stores.children.filter(n=>n.name==='1000lb center-section bomb');
 const rockets=stores.children.filter(n=>n.name==='HVAR');
 bombs.forEach((n,i)=>{n.visible=i<bombCount;n.scale.setScalar(r.userData.stores==='mixed'?.76:1);});
 // Removing rockets alternately from port/starboard preserves symmetric salvos.
 const order=[0,4,1,5,2,6,3,7],fired=8-rocketCount;
 rockets.forEach((n,i)=>n.visible=order.indexOf(i)>=fired);
 stores.children.filter(n=>n.name==='Heavy bomb pylon').forEach(n=>n.visible=bombCount>0);
 stores.children.filter(n=>n.name==='HVAR zero-length launcher').forEach(n=>n.visible=rocketCount>0);
}
function consume(obj,type,count){
 const r=frame(obj);if(!r)return;
 if(type==='rocket')r.userData.rocketCount=Math.max(0,count);
 else r.userData.bombCount=Math.max(0,count);
 renderStores(r);
}
function pose(obj,geardown,flaps={},roll=0,pitch=0,hook=0){
 const r=frame(obj);if(!r)return;
 const g=clamp(geardown),l=clamp(flaps.left),rr=clamp(flaps.right);
 for(const name of ['GearLeft','GearRight']){
  const h=r.getObjectByName(name),side=h.userData.side;
  h.rotation.z=(1-g)*side*1.44;h.rotation.x=(1-g)*-.18;
 }
 r.getObjectByName('TailGear').rotation.x=(1-g)*1.44;
 // No group scaling; fully articulated individual legs. Hidden only at full retract.
 r.getObjectByName('sbdGear').visible=g>.01;
 r.traverse(n=>{
  if(n.userData.control==='flap')n.rotation.x=-.66*(/Left/.test(n.name)?l:rr);
  if(n.userData.control==='aileron')n.rotation.x=n.userData.side*.28*clamp(roll,-1,1);
  if(n.userData.control==='elevator')n.rotation.x=-.25*clamp(pitch,-1,1);
  if(n.userData.control==='rudder')n.rotation.y=-.19*clamp(roll,-1,1);
 });
 const h=r.getObjectByName('sbdHook');h.rotation.x=-.86*clamp(hook);h.visible=clamp(hook)>.02;
}
function frontMuzzles(obj,space){
 const r=frame(obj);if(!r)return null;
 // Measured directly from authored cannon barrel stations; +Z forward.
 r.updateWorldMatrix(true,true);
 const out=[];for(const side of [-1,1])for(let i=0;i<2;i++){
  const v=r.localToWorld(new T.Vector3(side*(2.58+i*.32),section(2.58+i*.32)[1]+.05,2.26-i*.20));
  out.push(space.worldToLocal(v));
 }return out;
}
global.CorsairNative={create,isNative,configure,consume,pose,frontMuzzles};
if(typeof module==='object'&&module.exports)module.exports=global.CorsairNative;
})(typeof window==='undefined'?globalThis:window);
