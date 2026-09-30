/* Brief automatic pickup, entirely local geometry; no assets or timers to retain. */
(function(root){
 'use strict';
 function create(THREE,scene,position,groundAt,options={}){
  const water=!!options.water,waterAt=options.waterAt||((x,z)=>groundAt(x,z)<=.6),group=new THREE.Group();group.name=water?'rescueBoat':'rescueParty';
  const marker=new THREE.Group();marker.name='rescueBeacon';scene.add(group,marker);
  const olive=new THREE.MeshStandardMaterial({color:0x53614b,roughness:.9});
  const grey=new THREE.MeshStandardMaterial({color:0x727f83,roughness:.8});
  const skin=new THREE.MeshStandardMaterial({color:0xba9679,roughness:1});
  const dark=new THREE.MeshStandardMaterial({color:0x282b28,roughness:1});
  const glow=new THREE.MeshBasicMaterial({color:0xf4a54b,transparent:true,opacity:.8,depthWrite:false});
  function box(parent,size,pos,material){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);parent.add(m);return m;}
  function crew(x,z){
   const g=new THREE.Group();g.position.set(x,water?1.1:0,z);group.add(g);
   box(g,[.42,.62,.26],[0,.92,0],olive);
   const head=new THREE.Mesh(new THREE.SphereGeometry(.19,8,6),skin);head.position.y=1.47;g.add(head);
   const helmet=new THREE.Mesh(new THREE.SphereGeometry(.21,8,6,0,Math.PI*2,0,Math.PI/2),olive);helmet.position.y=1.55;g.add(helmet);
   const legs=[],arms=[];
   for(const side of [-1,1]){
    const leg=box(g,[.15,.62,.17],[side*.12,.34,0],dark);legs.push(leg);
    const arm=box(g,[.12,.55,.13],[side*.29,.91,.02],olive);arms.push(arm);
   }
   return {g,legs,arms};
  }
  if(water){
   const shape=new THREE.Shape();shape.moveTo(-1.5,-3);shape.lineTo(0,-4.5);shape.lineTo(1.5,-3);
   shape.lineTo(1.5,3);shape.lineTo(0,4.5);shape.lineTo(-1.5,3);shape.closePath();
   const hull=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.9,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.12,bevelThickness:.12}),grey);
   hull.rotation.x=-Math.PI/2;hull.position.y=.1;group.add(hull);
   box(group,[2,1.35,2.3],[0,1.6,-.7],olive);
   box(group,[2.04,.45,.06],[0,1.95,.49],dark);
   box(group,[2.4,.14,2.6],[0,2.35,-.7],grey);
   box(group,[.07,2,.07],[0,3.2,-1],dark);
   box(group,[.65,.4,.03],[.3,3.6,-1],olive);
  }
  const people=water?[crew(-.75,1.4)]:[crew(-.8,0),crew(.8,-.6)];
  const flare=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),glow);flare.position.y=.2;marker.add(flare);
  const plume=new THREE.Mesh(new THREE.ConeGeometry(.7,3.5,8),glow);plume.position.y=2;marker.add(plume);
  marker.position.copy(position);marker.position.y=groundAt(position.x,position.z)+.12;
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
  group.rotation.y=direction+Math.PI;group.position.copy(start);
  let elapsed=0,disposed=false;
  return {group,marker,water,get elapsed(){return elapsed;},get pickup(){return elapsed>=6.2;},
   update(dt){
    if(disposed)return {done:true,pickup:true};
    elapsed=Math.min(8,elapsed+Math.max(0,dt));const t=Math.min(1,elapsed/6.2);
    group.position.lerpVectors(start,end,t);group.position.y=groundAt(group.position.x,group.position.z)+(water?Math.sin(elapsed*2)*.07:0);
    if(water)group.rotation.z=Math.sin(elapsed*1.4)*.018;
    else for(const p of people)for(let i=0;i<2;i++){
     p.legs[i].rotation.x=t<1?Math.sin(elapsed*7+i*Math.PI)*.25:0;
     p.arms[i].rotation.x=-p.legs[i].rotation.x;
    }
    glow.opacity=.45+Math.sin(elapsed*4)*.15;plume.rotation.y+=dt*.2;
    return {done:elapsed>=8,pickup:elapsed>=6.2};
   },
   dispose(){
    if(disposed)return;disposed=true;
    const geometries=new Set(),materials=new Set();
    for(const object of [group,marker]){scene.remove(object);object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material))materials.add(m);});}
    for(const g of geometries)g.dispose();for(const m of new Set([...materials,olive,grey,skin,dark,glow]))m.dispose();
   }
  };
 }
 root.PilotRescue={create};
 if(typeof module==='object'&&module.exports)module.exports=root.PilotRescue;
})(typeof window!=='undefined'?window:globalThis);
