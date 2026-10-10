/* Brief automatic pickup, entirely local geometry; no assets or timers to retain. */
(function(root){
 'use strict';
 function create(THREE,scene,position,groundAt,options={}){
  const water=!!options.water,waterAt=options.waterAt||((x,z)=>groundAt(x,z)<=.6),surfaceAt=options.surfaceAt||groundAt,group=new THREE.Group();group.name=water?'rescueBoat':'rescueParty';
  const marker=new THREE.Group();marker.name='rescueBeacon';scene.add(group,marker);
  const olive=new THREE.MeshStandardMaterial({color:0x53614b,roughness:.9});
  const grey=new THREE.MeshStandardMaterial({color:0x727f83,roughness:.8});
  const skin=new THREE.MeshStandardMaterial({color:0xba9679,roughness:1});
  const dark=new THREE.MeshStandardMaterial({color:0x282b28,roughness:1});
  const glow=new THREE.MeshBasicMaterial({color:0xec713e,transparent:true,opacity:.55,depthWrite:false});
  const smoke=new THREE.MeshBasicMaterial({color:0x99694f,transparent:true,opacity:.16,depthWrite:false});
  function box(parent,size,pos,material){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);parent.add(m);return m;}
  const visuals=root.CrewVisuals||(typeof require==='function'?require('./crew-visuals.js'):null);
  function crew(x,z){
   const g=visuals.create(THREE,{service:options.service||(water?'usnavy':'usaaf'),role:water?'sailor':'ground',srgbOutput:options.srgbOutput});
   g.position.set(x,water?.85:0,z);group.add(g);return {g,legs:g.userData.legs,arms:g.userData.arms};
  }
  if(water){
   // A small naval motor launch, with shaped hull, dark waterline and timber deck.
   const hullMat=new THREE.MeshStandardMaterial({color:0x586b73,roughness:.8});
   const waterline=new THREE.MeshStandardMaterial({color:0x283b42,roughness:.9});
   const timber=new THREE.MeshStandardMaterial({color:0x887151,roughness:1});
   const trim=new THREE.MeshStandardMaterial({color:0x88958d,roughness:.74});
   const glass=new THREE.MeshStandardMaterial({color:0x304b56,roughness:.28,metalness:.15});
   const canvas=new THREE.MeshStandardMaterial({color:0xa79b7b,roughness:1});
   const ringMat=new THREE.MeshStandardMaterial({color:0xb57840,roughness:.9});
   const contour=[[-1.15,-3.8],[-1.5,-2.6],[-1.45,2.45],[-.85,3.65],[0,4.5],[.85,3.65],[1.45,2.45],[1.5,-2.6],[1.15,-3.8]];
   function sides(bottom,top,material,inset=1){
    const vertices=[];
    for(let i=0;i<contour.length;i++){const a=contour[i],b=contour[(i+1)%contour.length],rise=(a[1]>2? .15:0),riseB=(b[1]>2?.15:0);
     vertices.push(a[0]*inset,bottom,a[1],b[0]*inset,bottom,b[1],b[0],top+riseB,b[1],a[0]*inset,bottom,a[1],b[0],top+riseB,b[1],a[0],top+rise,a[1]);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,material);mesh.material.side=THREE.DoubleSide;group.add(mesh);return mesh;
   }
   sides(-.45,.20,waterline,.62).name='launchWaterline';sides(.20,.90,hullMat).name='launchHull';
   const deck=new THREE.Shape();contour.forEach(([x,z],i)=>i?deck.lineTo(x,-z):deck.moveTo(x,-z));deck.closePath();
   const deckMesh=new THREE.Mesh(new THREE.ShapeGeometry(deck),timber);deckMesh.rotation.x=-Math.PI/2;deckMesh.position.y=.84;group.add(deckMesh);
   for(let i=0;i<9;i++)box(group,[.018,.012,5.9],[-1.15+i*.285,.85,-.45],waterline);
   box(group,[2.15,1.10,2.15],[0,1.43,-1.0],hullMat);
   for(const side of [-1,1]){box(group,[.83,.48,.035],[side*.5,1.61,.086],glass);box(group,[.035,.48,1.1],[side*1.085,1.62,-.8],glass);}
   box(group,[.09,.66,.07],[0,1.6,.12],trim);
   box(group,[2.40,.13,2.4],[0,2.02,-1],canvas);
   box(group,[1.85,.14,.48],[0,1.02,2.1],timber);
   box(group,[1.85,.14,.48],[0,1.02,-3],timber);
   function rod(a,b,r,material){const d=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),7),material);o.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());group.add(o);}
   for(const side of [-1,1]){for(const z of [-3.3,-2.3,1.4,2.6])rod([side*1.36,.85,z],[side*1.36,1.35,z],.026,trim);
    rod([side*1.36,1.35,-3.3],[side*1.36,1.35,2.6],.025,trim);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.28,.065,7,18),ringMat);ring.position.set(side*1.12,1.48,-1.3);ring.rotation.y=Math.PI/2;group.add(ring);
    for(const z of [-1.5,1.2]){const fender=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),dark);fender.scale.set(.8,1.5,.8);fender.position.set(side*1.48,.67,z);group.add(fender);}
   }
   rod([0,2.08,-1.5],[0,3.25,-1.5],.025,dark);
   const rope=new THREE.Mesh(new THREE.TorusGeometry(.32,.045,6,20),canvas);rope.rotation.x=Math.PI/2;rope.position.set(.65,.9,2.8);group.add(rope);
   box(group,[.65,.34,.42],[-.68,1.08,-2.65],canvas);
   const wheel=new THREE.Mesh(new THREE.TorusGeometry(.19,.025,6,16),dark);wheel.position.set(.48,1.34,.35);wheel.rotation.x=.5;group.add(wheel);
   const cleat=box(group,[.35,.075,.065],[0,.96,3.4],trim);cleat.name='bowCleat';
   if(options.srgbOutput)for(const material of [hullMat,waterline,timber,trim,glass,canvas,ringMat,dark])material.color.convertSRGBToLinear();
   visuals.batch(THREE,group);
  }
  const people=water?[crew(-.6,1.35),crew(.5,2.65)]:[crew(-.8,0),crew(.8,-.6)];
  const flare=new THREE.Mesh(new THREE.SphereGeometry(.1,8,6),glow);flare.position.set(.8,.2,.5);marker.add(flare);
  const puffs=[];
  for(let i=0;i<6;i++){
   const puff=new THREE.Mesh(new THREE.SphereGeometry(.22+i*.035,8,6),smoke);
   puff.position.set(.8+i*.08,.45+i*.45,.5);marker.add(puff);puffs.push(puff);
  }
  marker.position.copy(position);marker.position.y=(water?surfaceAt:groundAt)(position.x,position.z)+.12;
  const start=position.clone(),end=position.clone();let direction=0,found=false;
  // Never route a boat across an island, or the search party through water.
  for(const distance of [water?42:18,8,0]){
   for(let i=0;i<16&&!found;i++){
    const angle=Math.PI+i*Math.PI/8,x=position.x+Math.sin(angle)*distance,z=position.z+Math.cos(angle)*distance,b=options.bounds;
    if(b&&(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ))continue;
    let valid=true,last=groundAt(position.x,position.z);
    for(let j=1;j<=12;j++){
     const sx=position.x+(x-position.x)*j/12,sz=position.z+(z-position.z)*j/12,h=groundAt(sx,sz);
     if(water?!waterAt(sx,sz):waterAt(sx,sz)||Math.abs(h-last)>2){valid=false;break;}last=h;
    }
    if(valid){start.set(x,groundAt(x,z),z);direction=angle;found=true;}
   }
   if(found)break;
  }
  const stop=Math.min(3,Math.hypot(start.x-position.x,start.z-position.z));
  end.x+=Math.sin(direction)*stop;end.z+=Math.cos(direction)*stop;
  if(!found){start.copy(position);end.copy(position);}
  group.rotation.y=direction+Math.PI;group.position.copy(start);if(water)group.position.y=surfaceAt(start.x,start.z);
  const wakePosition=group.position.clone();
  let elapsed=0,disposed=false,travelTime=6.2,route=[start.clone(),end.clone()],lengths=[start.distanceTo(end)],passengers=0;
  const validPoint=p=>waterAt(p.x,p.z)&&(!options.bounds||p.x>=options.bounds.minX&&p.x<=options.bounds.maxX&&p.z>=options.bounds.minZ&&p.z<=options.bounds.maxZ);
  function validLeg(a,b){const steps=Math.max(12,Math.ceil(a.distanceTo(b)/4)),sample=new THREE.Vector3();for(let i=0;i<=steps;i++)if(!validPoint(sample.lerpVectors(a,b,i/steps)))return false;return true;}
  function waterRoute(a,b){
   if(validLeg(a,b))return [a,b];
   // Try coastal detours, checking every segment against the actual shoreline.
   // A disconnected lake cannot be reached by this launch; never teleport it.
   const middle=a.clone().lerp(b,.5),heading=Math.atan2(b.x-a.x,b.z-a.z);
   for(const distance of [24,64,160,400,1000])for(let i=0;i<16;i++){
    const angle=heading+i*Math.PI/8,offset=new THREE.Vector3(Math.sin(angle)*distance,0,Math.cos(angle)*distance),mid=middle.clone().add(offset);
    if(validLeg(a,mid)&&validLeg(mid,b))return [a,mid,b];
    const left=a.clone().add(offset),right=b.clone().add(offset);
    if(validLeg(a,left)&&validLeg(left,right)&&validLeg(right,b))return [a,left,right,b];
   }
   return null;
  }
  return {group,marker,water,get elapsed(){return elapsed;},get pickup(){return elapsed>=travelTime;},
   retarget(position){
    if(disposed||!water)return false;
    const next=waterRoute(group.position.clone().setY(0),position.clone().setY(0));if(!next)return false;
    const last=next[next.length-1],previous=next[next.length-2],distance=last.distanceTo(previous);
    if(distance>0)last.lerp(previous,Math.min(3,distance)/distance);
    route=next;lengths=next.slice(1).map((p,i)=>p.distanceTo(next[i]));travelTime=Math.max(1,lengths.reduce((a,b)=>a+b,0)/7);elapsed=0;
    marker.position.copy(position);marker.position.y=surfaceAt(position.x,position.z)+.12;return true;
   },
   boardPassenger(){
    if(!water||passengers>=3)return;
    const p=visuals.create(THREE,{service:options.service||'usnavy',role:'pilot',variant:passengers,srgbOutput:options.srgbOutput});p.name='rescuedCrew';
    p.position.set(passengers===2?0:passengers===0?-.55:.55,.28,passengers===2?-3:2.1);p.rotation.y=passengers===2?0:Math.PI;
    for(const leg of p.userData.legs)leg.rotation.x=-1.1;for(const arm of p.userData.arms)arm.rotation.x=-.45;group.add(p);passengers++;
   },
   update(dt){
    if(disposed)return {done:true,pickup:true};
    elapsed=Math.min(travelTime+1.8,elapsed+Math.max(0,dt));const t=Math.min(1,elapsed/travelTime);
    let remaining=lengths.reduce((a,b)=>a+b,0)*t,index=0;while(index<lengths.length-1&&remaining>lengths[index])remaining-=lengths[index++];
    group.position.lerpVectors(route[index],route[index+1],lengths[index]?Math.min(1,remaining/lengths[index]):1);
    if(water&&lengths[index]>0)group.rotation.y=Math.atan2(route[index+1].x-route[index].x,route[index+1].z-route[index].z);
    group.position.y=(water?surfaceAt:groundAt)(group.position.x,group.position.z)+(water?Math.sin(elapsed*2)*.07:0);
    if(water){
     const distance=Math.hypot(group.position.x-wakePosition.x,group.position.z-wakePosition.z);
     options.wakes?.track(group,group.position,{x:Math.sin(group.rotation.y),z:Math.cos(group.rotation.y)},8.3,3,dt>0?distance/dt:0,dt);wakePosition.copy(group.position);
     marker.position.y=surfaceAt(marker.position.x,marker.position.z)+.12;
    }
    if(water)group.rotation.z=Math.sin(elapsed*1.4)*.018;
    else for(const p of people)for(let i=0;i<2;i++){
     p.legs[i].rotation.x=t<1?Math.sin(elapsed*7+i*Math.PI)*.25:0;
     p.arms[i].rotation.x=-p.legs[i].rotation.x;
    }
    glow.opacity=.42+Math.sin(elapsed*4)*.12;
    for(let i=0;i<puffs.length;i++){
     const t=(elapsed*.22+i/6)%1,puff=puffs[i];
     puff.position.set(.8+t*.5,.35+t*3,.5+Math.sin(i+t*3)*.15);puff.scale.setScalar(.65+t*.9);
    }
    return {done:elapsed>=travelTime+1.8,pickup:elapsed>=travelTime};
   },
   dispose(){
    if(disposed)return;disposed=true;options.wakes?.forget(group);
    const geometries=new Set(),materials=new Set();
    for(const object of [group,marker]){scene.remove(object);object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material))materials.add(m);});}
    for(const g of geometries)g.dispose();for(const m of new Set([...materials,olive,grey,skin,dark,glow,smoke]))m.dispose();
   }
  };
 }
 // One motor launch per aircraft. Tickets expose individual pickup state, while
 // only this coordinator advances the boat once per simulation frame.
 function createCrew(THREE,scene,groundAt,options={}){
  let boat=null,active=null,disposed=false;const pending=[];
  function begin(ticket){
   if(boat&&!boat.retarget(ticket.position)){ticket.status={done:true,pickup:false};return false;}
   if(!boat)boat=create(THREE,scene,ticket.position,groundAt,{...options,water:true});boat.marker.visible=true;active=ticket;return true;
  }
  return {
   add(position){
    const ticket={position:position.clone(),status:{done:false,pickup:false},time:0,boarded:false};
    if(!boat&&!active)begin(ticket);else pending.push(ticket);
    return {water:true,get group(){return boat.group;},get marker(){return boat.marker;},get elapsed(){return ticket.time;},get pickup(){return ticket.status.pickup;},update(){return ticket.status;},dispose(){}};
   },
   update(dt){
    if(disposed)return;
    if(active){active.status=boat.update(dt);active.time=boat.elapsed;if(active.status.pickup&&!active.boarded){boat.boardPassenger();boat.marker.visible=false;active.boarded=true;}if(active.status.done)active=null;}
    while(!active&&pending.length){pending.sort((a,b)=>a.position.distanceToSquared(boat.group.position)-b.position.distanceToSquared(boat.group.position));begin(pending.shift());}
   },
   get group(){return boat?.group;},
   dispose(){if(disposed)return;disposed=true;boat?.dispose();pending.length=0;active=null;}
  };
 }
 root.PilotRescue={create,createCrew};
 if(typeof module==='object'&&module.exports)module.exports=root.PilotRescue;
})(typeof window!=='undefined'?window:globalThis);
