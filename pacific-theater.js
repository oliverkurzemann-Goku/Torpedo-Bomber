/* Fictional Pacific operations: single-role sorties, bounded scenery and ship tactics.
 * Existing aircraft/weapon/landing physics remain authoritative. Metres, +Z ship bow. */
(function(g){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
const KEY='pacific_theater_v1';let memory={};
function effects(){try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');if(v&&typeof v==='object')memory=v;}catch(_){}return {fuelDenied:memory.fuelDenied===true,reinforced:memory.reinforced===true};}
function save(v){memory=v;try{localStorage.setItem(KEY,JSON.stringify(v));}catch(_){}return effects();}
function resetEffects(){return save({});}
function record(m,targets,convoy){const v=effects();
 if(m.theater==='harbor'&&targets.filter(t=>t.def.kind==='fuel').length===2&&targets.filter(t=>t.def.kind==='fuel').every(t=>!t.alive))v.fuelDenied=true;
 if(m.theater==='escort'&&convoy.filter(s=>s.def.transport&&s.arrived&&s.alive).length>=2)v.reinforced=true;
 return save(v);
}
function effectText(m){const v=effects(),parts=[];
 if(m.theater==='escort'||m.theater==='fleet')parts.push(v.fuelDenied?'Fuel depot destroyed: one fewer aircraft in the second raid.':'Fuel depot intact: full second raid.');
 if(m.theater==='fleet')parts.push(v.reinforced?'Convoy delivered: a Fletcher adds defensive AA.':'No reinforcements: carrier batteries only.');
 return parts.length?'<br><b>CAMPAIGN</b> '+parts.join(' '):'';
}
const harborTargets=[
 {x:5115,z:-4510,kind:'fuel',label:'North fuel tanks',hp:30,radius:20,height:8},
 {x:5150,z:-4310,kind:'fuel',label:'South fuel tanks',hp:30,radius:20,height:8},
 {x:5060,z:-4025,kind:'warehouse',label:'Supply warehouse',hp:30,radius:24,height:7,optional:true}
];
const islets=[{x:-3100,z:3150,r:310,h:92},{x:-2650,z:4800,r:300,h:125},{x:-550,z:5100,r:360,h:76}];
function islandHeight(x,z){let y=0;for(const a of islets){const q=Math.hypot(x-a.x,z-a.z)/a.r;if(q<1)y=Math.max(y,a.h*Math.pow(1-q*q,2));}return y;}
const missions=[
 {title:'Sortie 17',sub:'Harbor · Supply Denial',theater:'harbor',sbd:true,loadout:'divebomb',tactics:true,weather:'broken',torps:6,fuel:100,zeros:1,
  body:'<b>SBD harbor attack.</b> Destroy the <b>two moored freighters and both fuel depots</b>. Six bombs; guns can finish the tanks. Cranes, warehouses and road traffic mark the working port. A departing merchant and its smoke-making escort are optional. Approach from the open bay, climb clear of the coastal bluff, then recover. Fictional harbor on the mapped coast.',
  targets:[{type:'freighter',pos:[4570,0,-4620],hp:1,speed:0,heading:0,moored:true},
   {type:'freighter',pos:[4480,0,-4390],hp:1,speed:0,heading:0,moored:true},
   {type:'freighter',pos:[4200,0,-4220],hp:2,speed:5,heading:-.2,optional:true},
   {type:'destroyer',pos:[3850,0,-4560],hp:1,flak:true,speed:6,heading:-.2}],
  operation:{weather:['broken'],deadline:720,notes:'Four primary targets; optional port facilities do not block completion. Destroy the fuel stores and recover to reduce later raids.'}},
 {title:'Sortie 18',sub:'Convoy · Safe Passage',theater:'escort',sbd:true,corsair:true,loadout:'divebomb',torps:0,fuel:100,zeros:0,targets:[],
  body:'<b>Corsair escort — guns only.</b> Keep <b>both blue transports</b> alive until they reach the marked anchorage through the island channel. Two small Japanese <b>A6M bomb-carrier raids</b> approach from opposite bearings. Their bombs can damage the convoy; destroy the attackers before release. No strike targets or wingman commands. Once both ships arrive and the raids end, return to the carrier. Fictional escort operation.',
  support:[{model:'liberty',pos:[-1700,0,2100],heading:0,speed:8,transport:true,destination:[-1700,4300]},
   {model:'landing',pos:[-2050,0,1850],heading:0,speed:8,transport:true,destination:[-2050,4050]},
   {model:'fletcher',pos:[-1150,0,2350],heading:0,speed:8,destination:[-1150,4550]}],
  operation:{weather:['clear','broken'],deadline:540,notes:'A roughly five-minute crossing. Both transports must arrive. Early recovery does not count as success.',events:[{at:18,raiders:2,required:true,message:'CONVOY CONTROL — TWO BOMB CARRIERS FROM THE EAST'},{at:135,raiders:2,required:true,message:'SECOND RAID FROM THE WEST — COVER THE TRANSPORTS'}]}},
 {title:'Sortie 19',sub:'Corsair · Fleet Alarm',theater:'fleet',sbd:true,corsair:true,loadout:'divebomb',torps:0,fuel:100,zeros:0,raiders:2,targets:[],
  body:'<b>Corsair alarm launch from the US carrier.</b> Intercept two small waves of Japanese <b>A6M bomb carriers</b>. Guns only; save the flight deck, then trap aboard. A damaged Corsair is returning from patrol: keeping the approach clear lets it recover for an optional bonus. The carrier can take three bomb hits, not a fourth. Earlier harbor and convoy successes affect this sortie. No formation-command workload.',
  operation:{weather:['broken'],notes:'Clear both raids and bombs still falling before recovery. The damaged patrol pilot is optional; follow the normal target/RTB control.',events:[{at:85,raiders:2,required:true,message:'SECOND RAID — TWO BOMB CARRIERS, OPPOSITE BEARING'}]}},
 {title:'Sortie 20',sub:'Dauntless · Fuel Reserve',theater:'reserve',sbd:true,solo:true,loadout:'divebomb',torps:2,fuel:42,zeros:0,tactics:true,returnWeather:'rain',
  body:'<b>One aircraft, one supply ship, a demanding return.</b> Sink the merchant with your two bombs. The destroyer is optional: avoid spending your reserve on another attack. Fuel starts at <b>42%</b>; rain reaches the carrier after the strike. Return promptly, keep the aircraft clean until the landing pattern, and recover at <b>78 kt with flaps, gear and hook down</b>. Damage taken during the attack remains for the return. No extra raid or wingman commands.',
  targets:[{type:'freighter',pos:[-1300,0,3400],hp:1,speed:4.5,heading:0},{type:'destroyer',pos:[-1800,0,3700],hp:1,flak:true,speed:5,heading:0,optional:true}],
  operation:{weather:['broken'],deadline:600,notes:'One required merchant. Aircraft fuel reserve and a rain-front return are the challenge; the escort is optional. The ship steams into wind for recovery.'}}
];
function plan(m){const v=effects(),p={...(m.operation||{}),events:(m.operation?.events||[]).map(e=>({...e}))};
 if(v.fuelDenied&&(m.theater==='escort'||m.theater==='fleet')){const wave=p.events.filter(e=>e.raiders).at(-1);if(wave){wave.raiders=Math.max(1,wave.raiders-1);wave.message='FUEL SHORTAGE — SECOND RAID REDUCED TO ONE BOMB CARRIER';}}
 if(m.theater==='escort')p.phases=[{id:'locate',label:'JOIN CONVOY',seconds:1,message:'JOIN THE BLUE TRANSPORTS'},{id:'strike',label:'ESCORT TO ANCHORAGE',message:'PROTECT BOTH TRANSPORTS UNTIL ARRIVAL'}];
 if(m.theater==='fleet')p.phases=[{id:'locate',label:'INTERCEPT',seconds:1,message:'INTERCEPT THE RAIDERS'},{id:'strike',label:'DEFEND US FLEET',message:'KEEP THE FLIGHT DECK CLEAR'}];
 return p;
}
function initializeConvoy(s){s.alive=true;s.hp=100;s.arrived=false;s.maxHp=100;return s;}
function moveConvoy(s,dt){
 if(!s.alive||s.arrived)return 0;const p=s.group.position,d=s.def.destination;if(!d)return s.def.speed??2.4;
 const dx=d[0]-p.x,dz=d[1]-p.z,range=Math.hypot(dx,dz),speed=(s.def.speed??8)*(s.hp<60?.65:1);
 if(range<=Math.max(3,speed*dt)){p.x=d[0];p.z=d[1];s.arrived=true;return 0;}
 s.group.rotation.y=Math.atan2(dx,dz);p.x+=dx/range*speed*dt;p.z+=dz/range*speed*dt;return speed;
}
function escortStatus(convoy,raiders,bombs,ready){const ts=convoy.filter(s=>s.def.transport);
 return {failed:ts.some(s=>!s.alive),clear:ts.length===2&&ts.every(s=>s.alive&&s.arrived)&&raiders.every(r=>!r.alive)&&bombs.length===0&&ready,
  arrived:ts.filter(s=>s.alive&&s.arrived).length,total:ts.length};
}
function shipTactics(s,dt,player,fish,all,emit,performance={steering:1}){
 const p=s.group.position;if(s.def.moored)return;
 if(s.baseHeading==null){s.baseHeading=s.group.rotation.y;s.cruiseSpeed=s.speed;}
 const dx=p.x-player.pos.x,dz=p.z-player.pos.z,d=Math.hypot(dx,dz),nose={x:Math.cos(player.heading),z:Math.sin(player.heading)};
 const spotted=d<1700&&player.pos.y<650&&(dx*nose.x+dz*nose.z)/Math.max(1,d)>.7;
 const torp=fish.some(t=>Math.hypot(t.mesh.position.x-p.x,t.mesh.position.z-p.z)<1200);
 s.tacticCool=Math.max(0,(s.tacticCool||0)-dt);s.alertT=Math.max(0,(s.alertT||0)-dt);
 if((spotted||torp)&&s.tacticCool<=0){s.alertT=16;s.tacticCool=30;s.tacticSide=(Math.sin(s.baseHeading)*dz-Math.cos(s.baseHeading)*dx)>0?1:-1;
  for(const e of all)if(e.alive&&e.flak&&e.group.position.distanceTo(p)<2200)e.smokeScreenT=Math.max(e.smokeScreenT||0,18);}
 // While the captain combs a seen torpedo (TorpedoAttack.captain) the helm belongs to that manoeuvre.
 const target=s.baseHeading+(s.alertT>0?s.tacticSide*.55:0),turn=clamp(angle(target-s.group.rotation.y),-.045*dt*performance.steering,.045*dt*performance.steering);
 if(s.comb?.heading==null)s.group.rotation.y+=turn;
 const wounded=s.hp<s.def.hp;const speed=s.cruiseSpeed*(wounded?.45:1);s.speed+=clamp(speed-s.speed,-.5*dt,.25*dt);
 s.smokeScreenT=Math.max(0,(s.smokeScreenT||0)-dt);s.screenCool=(s.screenCool||0)-dt;
 if(s.flak&&s.smokeScreenT>0&&s.screenCool<=0){s.screenCool=.8;emit(p.x,8,p.z,0xb6b8b2,2.6);}
 return {spotted,torp,wounded};
}
// Lightweight authored port. Shared materials/geometry; decorations never enter combat AI.
class Scenery{
 constructor(THREE,scene,m,heightAt){this.THREE=THREE;this.root=new THREE.Group();this.root.name='PacificOperationalScenery';this.root.userData.theater=m.theater;scene.add(this.root);this.geometries=[];this.materials=[];this.trucks=[];this.cranes=[];this.foundations=new Map();this.time=0;
  this.box=this.geo(new THREE.BoxGeometry(1,1,1));this.cylinder=this.geo(new THREE.CylinderGeometry(1,1,1,16));
  this.steel=this.mat(0x62686a);this.concrete=this.mat(0x837e70);this.wall=this.mat(0xada58c);this.roof=this.mat(0x504c44);this.rust=this.mat(0x6f5140);this.road=this.mat(0x635e50);this.green=this.mat(0x4e6341);this.charred=this.mat(0x252621);
  if(m.theater==='harbor'){this.harbor(heightAt);for(const t of this.trucks)this.batch(t.group);this.batch(this.root,new Set([...this.trucks.map(t=>t.group),...this.cranes]));}if(m.theater==='escort')this.islands();
 }
 geo(v){this.geometries.push(v);return v;}mat(color){const m=new this.THREE.MeshStandardMaterial({color,roughness:.94});m.color.convertSRGBToLinear();this.materials.push(m);return m;}
 mesh(parent,geo,mat,x,y,z,sx,sy,sz){const m=new this.THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
 beam(parent,a,b,w,mat){const T=this.THREE,mid=new T.Vector3(...a).add(new T.Vector3(...b)).multiplyScalar(.5),delta=new T.Vector3(...b).sub(new T.Vector3(...a));const m=this.mesh(parent,this.box,mat,...mid.toArray(),w,delta.length(),w);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;}
 batch(root,excluded=new Set()){
  const T=this.THREE,buckets=new Map();root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert();
  root.traverse(o=>{if(!o.isMesh)return;for(let a=o;a&&a!==root;a=a.parent)if(excluded.has(a))return;
   let b=buckets.get(o.material);if(!b){b={meshes:[],position:[],normal:[],uv:[]};buckets.set(o.material,b);}const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
   for(const key of ['position','normal','uv'])if(geo.attributes[key])for(const v of geo.attributes[key].array)b[key].push(v);b.meshes.push(o);geo.dispose();
  });
  for(const [mat,b]of buckets){const geo=this.geo(new T.BufferGeometry());for(const key of ['position','normal','uv'])if(b[key].length)geo.setAttribute(key,new T.Float32BufferAttribute(b[key],key==='uv'?2:3));geo.computeBoundingSphere();const mesh=new T.Mesh(geo,mat);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);for(const o of b.meshes)o.parent.remove(o);}
 }
 foundation(x,z,w,d,heightAt){const corners=[[-w/2,-d/2],[-w/2,d/2],[w/2,-d/2],[w/2,d/2]];const y=Math.max(...corners.map(p=>heightAt(x+p[0],z+p[1])));this.mesh(this.root,this.box,this.concrete,x,y/2,z,w,Math.max(1,y),d);this.foundations.set(x+','+z,y);return y;}
 warehouse(x,z,heightAt,w=58,d=34){const T=this.THREE,y=this.foundation(x,z,w,d,heightAt),group=new T.Group();group.position.set(x,y,z);this.root.add(group);
  this.mesh(group,this.box,this.wall,0,5,0,w,10,d);
  const roof=new T.BufferGeometry(),p=[];
  const v=[[-w/2-2,10,-d/2-2],[-w/2-2,10,d/2+2],[0,17,-d/2-2],[0,17,d/2+2],[w/2+2,10,-d/2-2],[w/2+2,10,d/2+2]];for(const f of [[0,3,2],[0,1,3],[2,5,4],[2,3,5],[0,2,4],[1,5,3]])for(const i of f)p.push(...v[i]);roof.setAttribute('position',new T.Float32BufferAttribute(p,3));roof.computeVertexNormals();this.geo(roof);group.add(new T.Mesh(roof,this.roof));
  for(let i=-1;i<=1;i++)this.mesh(group,this.box,this.steel,i*w*.25,3,-d/2-.1,10,6,.3);return group;
 }
 harbor(heightAt){const T=this.THREE;
  // A quay along the bluff, with two projecting piers. Foundations meet terrain.
  for(const [z,x]of [[-4620,4600],[-4390,4510]]){this.mesh(this.root,this.box,this.concrete,x+125,3,z,250,6,30);for(let p=x;p<x+250;p+=40)this.mesh(this.root,this.cylinder,this.steel,p,-1,z,2,10,2);this.beam(this.root,[x+250,6,z],[4960,heightAt(4960,z)+1,z],8,this.concrete);}
  this.mesh(this.root,this.box,this.concrete,4460,2,-4810,410,4,22);this.mesh(this.root,this.box,this.concrete,4290,2,-4730,22,4,180);
  for(let i=0;i<4;i++){const x=(i<2?4660:4570)+(i%2)*85,z=i<2?-4620:-4390,y=6,c=new T.Group();c.position.set(x,y,z);this.root.add(c);
   for(const a of [-1,1])for(const b of [-1,1])this.beam(c,[a*7,0,b*7],[a*4,30,b*4],1.6,this.steel);
   this.beam(c,[-7,0,-7],[4,30,-4],.7,this.rust);this.mesh(c,this.box,this.steel,0,30,0,12,4,12);
   const boom=new T.Group();boom.position.y=32;c.add(boom);this.beam(boom,[8,0,0],[-62,7,0],1.6,this.steel);this.beam(boom,[0,10,0],[-60,7,0],.5,this.steel);this.beam(boom,[-55,6,0],[-55,-14,0],.35,this.rust);this.cranes.push(boom);
  }
  for(let i=0;i<5;i++)this.warehouse(5070+(i%2)*125,-4750+i*125,heightAt);
  for(const def of harborTargets.filter(t=>t.kind==='fuel')){
   const y=this.foundation(def.x,def.z,85,70,heightAt);this.mesh(this.root,this.box,this.road,def.x,y+.2,def.z,83,.4,68);
   // Primary fuel meshes live in shoreTargets, not duplicated as scenery.
   for(const side of [-1,1])this.mesh(this.root,this.box,this.concrete,def.x+side*44,y+1.5,def.z,2,3,76);
  }
  for(let i=0;i<18;i++)this.mesh(this.root,this.box,i%3?this.rust:this.wall,4960+(i%3)*18,heightAt(4960+(i%3)*18,-4710+Math.floor(i/3)*85)+3,-4710+Math.floor(i/3)*85,12,6,9);
  for(let z=-4750;z<=-4070;z+=20)this.mesh(this.root,this.box,this.road,5250,heightAt(5250,z)+.12,z,24,.25,21);
  for(let i=0;i<4;i++){const truck=new T.Group();truck.position.set(5250,heightAt(5250,-4700+i*150),-4700+i*150);this.root.add(truck);this.mesh(truck,this.box,this.green,0,2.4,0,3.2,2.7,7);this.mesh(truck,this.box,this.wall,0,3,2.8,3.2,2.4,2);for(const x of [-1.7,1.7])for(const z of [-2.1,2.1]){const wheel=this.mesh(truck,this.cylinder,this.roof,x,1,z,.8,.55,.8);wheel.rotation.z=Math.PI/2;}this.trucks.push({group:truck,z:truck.position.z,heightAt});}
 }
 target(def,heightAt){const T=this.THREE,group=new T.Group();group.position.set(def.x,this.foundations.get(def.x+','+def.z)??heightAt(def.x,def.z),def.z);this.root.add(group);
  if(def.kind==='fuel'){for(const x of [-16,16]){this.mesh(group,this.cylinder,this.steel,x,7,0,13,14,13);this.mesh(group,this.cylinder,this.roof,x,14.15,0,13.4,.3,13.4);this.beam(group,[x+13,1,0],[x+13,14,0],.5,this.rust);}}
  else this.mesh(group,this.box,this.wall,0,7,0,58,14,34);return group;
 }
 islands(){const T=this.THREE;for(const a of islets){const geo=new T.PlaneGeometry(a.r*2,a.r*2,24,24);geo.rotateX(-Math.PI/2);const p=geo.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,islandHeight(p.getX(i)+a.x,p.getZ(i)+a.z)-.15);geo.computeVertexNormals();this.geo(geo);const m=new T.Mesh(geo,this.green);m.position.set(a.x,0,a.z);m.name='ChannelIslet';m.receiveShadow=true;this.root.add(m);}
  // Anchorage entrance markers, not attack targets.
  for(const x of [-2310,-1350]){this.mesh(this.root,this.cylinder,this.rust,x,2,4480,3,4,3);this.mesh(this.root,this.box,this.wall,x,6,4480,2,5,2);}
 }
 update(dt,pos){this.time+=dt;for(const t of this.trucks){t.group.position.z=-4750+((t.z+4750+this.time*5)%680);t.group.position.y=t.heightAt(t.group.position.x,t.group.position.z);}
  for(const [i,c]of this.cranes.entries())c.rotation.y=Math.sin(this.time*.025+i)*.1;
  // No hidden geometry below distant scenery; culling avoids port draw overhead offshore.
  this.root.visible=!pos||this.root.userData.theater!=='harbor'||Math.hypot(pos.x-5000,pos.z+4450)<11000;
 }
 dispose(){this.root.parent?.remove(this.root);for(const x of this.geometries)x.dispose();for(const x of this.materials)x.dispose();this.trucks=[];this.cranes=[];}
}
g.PacificTheater={missions,harborTargets,islets,islandHeight,effects,resetEffects,record,effectText,plan,initializeConvoy,moveConvoy,escortStatus,shipTactics,Scenery};
})(typeof window!=='undefined'?window:globalThis);
