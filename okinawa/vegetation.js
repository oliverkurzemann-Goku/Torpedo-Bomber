// Build 290: Okinawa vegetation at the Rhine's level of density and variety (islandDetail only).
// Before: ~8 800 trees on 16 x 16 km (34 per km2; the Rhine has ~190), three blob variants of four
// spheres each (224 triangles), trunks as a separate draw. Now seven period-typical kinds, each one
// geometry with its trunk and its own shading in vertex colours (one draw per kind and cell):
//   pine      Ryukyu pine (Pinus luchuensis): tall bare stem, flat umbrella crown in layers - hills, ridges
//   broadA    evergreen hill forest (itajii / Castanopsis): billowy domed crowns, lighter olive green
//   broadB    dense evergreen broadleaf (camphor, oak): darker, rounder, lower
//   fukugi    Garcinia windbreaks: dark columnar crowns planted in lines around the farm compounds
//   banyan    gajumaru: broad, low, spreading canopy on several stems - village squares and hamlets
//   coast     pandanus and cycad: short stems with fans of blades along the dunes behind the beaches
//   bamboo    clumps of leaning culms near villages and in damp valleys
//   shrub     understory and forest edges
// Kinds are period-inspired visual stand-ins, not a botanical survey. The forest pattern follows the
// mapped land cover, height and slope; villages get windbreaks and banyans from their own sites.
(function(scope){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
function smooth(a,b,v){const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);}
function hash(x,z){let n=Math.imul(x|0,374761393)+Math.imul(z|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;}
function noise(x,z){const a=Math.floor(x),b=Math.floor(z);let u=x-a,v=z-b;u=u*u*(3-2*u);v=v*v*(3-2*v);return mix(mix(hash(a,b),hash(a+1,b),u),mix(hash(a,b+1),hash(a+1,b+1),u),v);}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

// ---------------- geometry (unit tree: root at 0, height about 1) ----------------
// Parts are collected as triangle soups with a colour each; crowns get "puffy" normals that point away
// from their lump centre (soft, rounded foliage instead of hard facets), stems keep their own normals.
function soup(){return {p:[],n:[],c:[]};}
function addGeometry(out,geometry,colour,{puff=null,jitter=0,seed=1,up=0}={}){
 const g=geometry.index?geometry.toNonIndexed():geometry;g.computeVertexNormals();
 const pos=g.attributes.position,nor=g.attributes.normal,v=new THREE.Vector3(),n=new THREE.Vector3();
 for(let i=0;i<pos.count;i++){
  v.fromBufferAttribute(pos,i);n.fromBufferAttribute(nor,i);
  if(jitter&&puff){
   // displace by a hash of the rounded position so coincident corners move together (no cracks)
   const k=hash(Math.round(v.x*977)+seed*31,Math.round(v.y*613)+Math.round(v.z*389)*7);
   const d=v.clone().sub(puff);d.multiplyScalar(1+(k-.5)*jitter);v.copy(puff).add(d);
  }
  if(puff){n.copy(v).sub(puff).normalize();n.y+=up;n.normalize();}
  out.p.push(v.x,v.y,v.z);out.n.push(n.x,n.y,n.z);
  // a little light/dark across each lump: lower and inner parts darker (self shade)
  const shade=puff?clamp(.70+(v.y-puff.y)*1.6,.42,1.0):1;
  // Okinawa renders with sRGB output and ACES at 1.12: foliage hexes are read as linear and come
  // out pale and minty. TONE darkens and slightly desaturates them to the measured Rhine look.
  const k=puff?TONE:1,grey=(colour.r+colour.g+colour.b)/3,sat=puff?1.05:1;
  out.c.push((grey+(colour.r-grey)*sat)*shade*k,(grey+(colour.g-grey)*sat)*shade*k,(grey+(colour.b-grey)*sat)*shade*k);
 }
 if(g!==geometry)g.dispose();geometry.dispose();
}
function finish(out){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(out.p,3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(out.n,3));
 g.setAttribute('color',new THREE.Float32BufferAttribute(out.c,3));
 g.computeBoundingSphere();return g;
}
const C=hex=>new THREE.Color(hex),TONE=.56;
function stem(out,h,r0,r1,colour,lean=0,segments=5,x=0,z=0,turn=0){
 const g=new THREE.CylinderGeometry(r1,r0,h,segments,1,true).translate(0,h/2,0);
 if(lean)g.rotateZ(lean);if(turn)g.rotateY(turn);if(x||z)g.translate(x,0,z);addGeometry(out,g,colour);
}
function lump(out,x,y,z,sx,sy,sz,colour,seed,detail=0,up=.25){
 const g=new THREE.IcosahedronGeometry(1,detail).scale(sx,sy,sz).translate(x,y,z);
 addGeometry(out,g,colour,{puff:new THREE.Vector3(x,y,z),jitter:.42,seed,up});
}
const BARK=C(0x4a3b2c),PALE_BARK=C(0x6b6352);
const KINDS={
 pine(){const o=soup();
  stem(o,.78,.030,.018,BARK,.05);
  // Ryukyu pine: flat irregular layers high on the stem, the top one smallest
  lump(o,.03,.80,.0,.30,.075,.27,C(0x22351f),11);lump(o,-.12,.70,.08,.24,.065,.21,C(0x1d2f1b),12);
  lump(o,.14,.66,-.07,.21,.06,.19,C(0x26391f),13);lump(o,.0,.91,.02,.17,.06,.16,C(0x2a3f22),14);return finish(o);},
 broadA(){const o=soup();
  stem(o,.42,.045,.03,BARK);
  // Castanopsis: billowy cauliflower dome made of five lumps, olive-yellow sunlit top
  lump(o,0,.66,0,.36,.26,.34,C(0x3a5424),21,0);lump(o,.20,.60,.08,.22,.19,.21,C(0x46592a),22);
  lump(o,-.18,.58,-.06,.23,.18,.22,C(0x37441f),23);lump(o,.04,.82,-.05,.22,.16,.21,C(0x505a2c),24);
  lump(o,-.05,.57,.21,.2,.16,.19,C(0x354220),25);return finish(o);},
 broadB(){const o=soup();
  stem(o,.36,.05,.034,BARK);
  lump(o,0,.58,0,.40,.30,.38,C(0x1f3420),31,0,.15);lump(o,.22,.52,-.12,.24,.2,.24,C(0x1b2f1c),32);
  lump(o,-.2,.55,.12,.25,.21,.24,C(0x24391f),33);return finish(o);},
 fukugi(){const o=soup();
  stem(o,.30,.04,.03,PALE_BARK);
  // columnar, very dense, glossy dark green - planted as hedges of trees
  lump(o,0,.50,0,.19,.42,.18,C(0x173119),41,0,.1);lump(o,.05,.30,-.03,.17,.2,.16,C(0x142c17),43,0,.05);lump(o,.03,.86,.01,.12,.15,.12,C(0x1c381c),42,0,.1);return finish(o);},
 banyan(){const o=soup();
  for(const [x,z,l] of [[0,0,0],[.12,.07,.18],[-.1,-.09,-.2],[.05,-.13,.12]])
   stem(o,.5,.05,.035,C(0x5a5145),l,6,x,z,x*7);
  for(const [x,z] of [[.0,.0],[.32,.1],[-.3,-.08],[.08,.3],[-.06,-.32],[.26,-.24]])
   lump(o,x,.52+Math.abs(x*z),z,.30,.13,.28,C(x>0?0x2b4223:0x243b20),51+Math.round(x*10),0,.3);
  return finish(o);},
 coast(){const o=soup();
  // pandanus: a short leaning stem with three fans of stiff blades
  stem(o,.38,.04,.03,C(0x5b5140),.12);
  const blade=C(0x3f5a2c);
  for(let f=0;f<3;f++){const cx=Math.sin(.12)*.3+(f-1)*.08,cy=.38+f*.03;
   for(let i=0;i<9;i++){const a=i/9*Math.PI*2+f,dx=Math.cos(a),dz=Math.sin(a),droop=-.08-.06*(i%3);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([cx,cy,0, cx+dx*.34-dz*.03,cy+.14+droop,dz*.34+dx*.03, cx+dx*.34+dz*.03,cy+.14+droop,dz*.34-dx*.03],3));
    addGeometry(o,g,blade);
    const g2=new THREE.BufferGeometry();
    g2.setAttribute('position',new THREE.Float32BufferAttribute([cx,cy,0, cx+dx*.34+dz*.03,cy+.14+droop,dz*.34-dx*.03, cx+dx*.34-dz*.03,cy+.14+droop,dz*.34+dx*.03],3));
    addGeometry(o,g2,blade);}}
  return finish(o);},
 bamboo(){const o=soup();
  const culm=C(0x6f7a3c),leaf=C(0x45602b);
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2,lean=.10+.05*(i%3);
   const g=new THREE.CylinderGeometry(.008,.014,1,4,1,true).translate(0,.5,0).rotateZ(lean).rotateY(a);addGeometry(o,g,culm);}
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2+.4;lump(o,Math.cos(a)*.13,.78+(i%2)*.1,Math.sin(a)*.13,.12,.16,.12,leaf,71+i,0,.2);}
  lump(o,0,.95,0,.11,.12,.11,leaf,79,0,.2);return finish(o);},
 // Woodland clumps: one instance is a patch of 6-8 crowns (about 40-70 m across at the usual scale),
 // so the mapped forests read as closed canopy from the air, like the Rhine's woods, at a fraction of
 // the instance count. No trunks: inside a closed stand they are not visible.
 grove(){const o=soup();const r=rng(5101),cols=[0x2f5a2a,0x1f4a26,0x3a6430,0x284f24,0x46692f,0x1c4223,0x335a2a];
  for(let i=0;i<8;i++){const a=i/7*Math.PI*2+r()*.5,d=i?.36+r()*.36:0;
   lump(o,Math.cos(a)*d,.36+r()*.22,Math.sin(a)*d,.24+r()*.1,.17+r()*.08,.23+r()*.1,C(cols[i%cols.length]),101+i,0,.25);}
  return finish(o);},
 pineGrove(){const o=soup();const r=rng(6203);
  for(let i=0;i<7;i++){const a=i/6*Math.PI*2+r()*.6,d=i?.32+r()*.38:0,h=.62+r()*.3;
   stem(o,h*.9,.016,.01,BARK,0,3,Math.cos(a)*d,Math.sin(a)*d);
   lump(o,Math.cos(a)*d,h,Math.sin(a)*d,.2+r()*.07,.06,.18+r()*.06,C(i%2?0x22351f:0x1d2f1b),201+i,0,.3);
   }
  return finish(o);},
 shrub(){const o=soup();
  lump(o,0,.42,0,.55,.42,.5,C(0x2c4223),81,0,.3);lump(o,.3,.3,.15,.32,.26,.3,C(0x354a25),82);return finish(o);}
};
// Far crowns: one coloured octahedron/icosahedron per tree (8-20 triangles).
function farGeometry(kind){
 const o=soup(),cols={grove:0x2b5527,pineGrove:0x20331d,pine:0x22351f,broadA:0x414d25,broadB:0x1f3420,fukugi:0x183219,banyan:0x284022,coast:0x3f5a2c,bamboo:0x45602b,shrub:0x2e4423};
 const col=C(cols[kind]);
 if(kind==='pine'){stem(o,.7,.03,.02,BARK,0,3);lump(o,0,.78,0,.28,.10,.26,col,1);}
 else if(kind==='fukugi')lump(o,0,.58,0,.17,.42,.17,col,2);
 else if(kind==='banyan')lump(o,0,.55,0,.6,.18,.55,col,3);
 else if(kind==='grove'||kind==='pineGrove'){lump(o,0,kind==='grove'?.42:.62,0,.78,.2,.74,col,4,0,.25);}
 else if(kind==='coast'||kind==='shrub'){const g=new THREE.OctahedronGeometry(1,0).scale(kind==='coast'?.35:.55,.4,kind==='coast'?.35:.5).translate(0,.45,0);addGeometry(o,g,col,{puff:new THREE.Vector3(0,.45,0)});}
 else {const g=new THREE.IcosahedronGeometry(1,0).scale(.42,.34,.4).translate(0,.62,0);addGeometry(o,g,col,{puff:new THREE.Vector3(0,.62,0),up:.2});}
 return finish(o);
}
// Shape of each kind for collision (fraction of height): crown radius and trunk radius.
const SHAPE={grove:[.6,.06],pineGrove:[.6,.04],pine:[.30,.03],broadA:[.40,.05],broadB:[.42,.05],fukugi:[.17,.04],banyan:[.62,.12],coast:[.36,.05],bamboo:[.2,.06],shrub:[.6,.3]};
// Cell size per kind: woodland kinds in 2.5-3 km cells, the rest in 4 km cells: keeps the Pacific
// under its 800-draw budget (measured 780 low over a village, shadow pass included).
const CELL={grove:2500,pineGrove:3000,pine:3000,broadA:3000,broadB:3000,shrub:4000,fukugi:4000,banyan:4000,coast:4000,bamboo:4000};

function place(world,options={}){
 const rand=rng(options.seed||917331),trees={grove:[],pineGrove:[],pine:[],broadA:[],broadB:[],fukugi:[],banyan:[],coast:[],bamboo:[],shrub:[]};
 const density=options.density??1;
 const houses=world.houseSites||[];
 const towns=world.coastalTowns||[];
 const clear=(x,z,margin=0)=>{
  const [,field,air]=world.biome(x,z);
  return field<=.25&&air<=.12&&!world.nearHouse(x,z)&&!world.nearRoad(x,z)&&towns.every(t=>Math.hypot(t.x-x,t.z-z)>=70+margin);
 };
 const add=(kind,x,z,s,y)=>{
  const ground=y??world.getSurfaceHeight(x,z);
  const p={x,z,y:ground-.35*Math.min(1,s/10),s,r:rand()*Math.PI*2,sx:s*(.86+rand()*.28),sy:s,sz:s*(.86+rand()*.28)};
  trees[kind].push(p);
  const [cr,tr]=SHAPE[kind];world.treeIndex?.add(x,z,p.y,s,s*cr,Math.max(.15,s*tr));
  return p;
 };
 // 1) Forest and scattered trees from stands across the island.
 const stands=Math.round(78000*density);
 for(let i=0;i<stands;i++){
  const x=rand()*15500-7750,z=rand()*15500-7750,d=world.shoreDistance(x,z);
  if(d<12)continue;
  const h=world.getHeight(x,z),[forest,field]=world.biome(x,z);
  const slope=Math.hypot(world.getHeight(x+12,z)-h,world.getHeight(x,z+12)-h)/12;
  if(slope>1.1)continue;
  // stand density: mapped forest and the uplands are wooded; plains keep copses along a warped noise
  const warp=noise(x*.0031,z*.0031),grove=.65*noise(x*.0052+warp*1.7,z*.0052-warp)+.35*noise(x*.014+7,z*.014-3);
  const upland=smooth(45,140,h)*smooth(90,380,d);
  const wooded=Math.max(forest*.95,upland*.9);
  // open country: copses and lone trees along a warped noise, never fully bare (the Rhine reads as
  // cultivated land with woods; an empty Okinawa plain read as a golf course)
  let p=mix(.07+clamp((grove-.5)*3.4,0,.6),clamp(.55+(grove-.4)*1.4,0,1),wooded);
  if(field>.25)p*=.08;            // hedgerow trees only
  if(d<120&&h<30)p=Math.max(p,.45); // the coastal strip has its own low cover
  if(rand()>p)continue;
  if(!clear(x,z))continue;
  let kind;
  const r=rand();
  if(d<110&&h<28)kind=r<.62?'coast':r<.85?'shrub':'broadA';
  else if(h>120||slope>.5)kind=r<.55?'pine':r<.78?'broadB':r<.9?'broadA':'shrub';
  else if(wooded>.45)kind=r<.38?'broadA':r<.66?'broadB':r<.84?'pine':r<.93?'shrub':'bamboo';
  else kind=r<.30?'shrub':r<.55?'broadA':r<.75?'pine':r<.88?'broadB':'bamboo';
  if(wooded>.45&&slope<.45&&(kind==='broadA'||kind==='broadB'||kind==='pine')&&rand()<.82){
   // closed woodland: a canopy clump plus a lone tree or shrub at its edge
   const g=kind==='pine'?'pineGrove':'grove',sz=g==='grove'?22+rand()*16:20+rand()*12;
   add(g,x,z,sz,world.getSurfaceHeight(x,z)-slope*sz*.5); // sink on slopes so the downhill crowns touch ground
   const a=rand()*Math.PI*2,rr=sz*.75,px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr;
   if(world.shoreDistance(px,pz)>10&&clear(px,pz))add(rand()<.5?'shrub':kind,px,pz,rand()<.5?2.4+rand()*2.4:10+rand()*6);
   continue;
  }
  const count=kind==='coast'||kind==='bamboo'?1+(rand()<.5):wooded>.45?2+Math.floor(rand()*3):1+(rand()<.35);
  for(let j=0;j<count;j++){
   const a=rand()*Math.PI*2,rr=j?5+rand()*10:0,px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr;
   if(j&&(world.shoreDistance(px,pz)<10||!clear(px,pz)))continue;
   const k=j&&kind!=='coast'&&rand()<.25?(rand()<.5?'shrub':'broadB'):kind;
   const s={pine:16+rand()*9,broadA:11+rand()*7,broadB:9+rand()*6,shrub:2.2+rand()*2.8,coast:3.6+rand()*2.6,bamboo:9+rand()*5}[k];
   add(k,px,pz,s*(k==='coast'&&rand()<.35?.55:1));
  }
 }
 // 2) Farm compounds: fukugi windbreaks planted along the compound edge, a gap at the front gate.
 for(const home of houses){
  if(home.damaged||hash(Math.round(home.x*3),Math.round(home.z*3))<.45)continue;
  const lot=Math.hypot(home.w,home.depth)*.5+5.5,cs=Math.cos(home.rot),sn=Math.sin(home.rot);
  const hw=home.w*.5+5.5,hd=home.depth*.5+5.5;
  const pick=hash(Math.round(home.x),Math.round(home.z)),sides=pick<.25?[0,1,2,3]:pick<.6?[1,2,3]:pick<.8?[2,3]:[1,2];
  for(const side of sides){
   const len=side%2?hd*2:hw*2,n=Math.max(2,Math.floor(len/(6+hash(Math.round(home.x),side)*3)));
   for(let i=0;i<=n;i++){
    const t=i/n-.5;
    let u,v;if(side===0){u=t*hw*2;v=hd;}else if(side===2){u=t*hw*2;v=-hd;}else{u=side===1?hw:-hw;v=t*hd*2;}
    if(side===0&&Math.abs(u)<3.2)continue; // the gate
    const x=home.x+u*cs+v*sn,z=home.z-u*sn+v*cs;
    if(world.shoreDistance(x,z)<12||world.nearRoad(x,z))continue;
    if(Math.hypot(x-home.x,z-home.z)<lot-4)continue;
    if(rand()<.12)continue;
    add('fukugi',x+(rand()-.5)*2.4,z+(rand()-.5)*2.4,7+rand()*7);
   }
  }
 }
 // 3) Banyans: one on each village square and a few at the hamlets.
 for(const t of towns){const a=rand()*6.28,x=t.x+Math.cos(a)*14,z=t.z+Math.sin(a)*14;if(world.shoreDistance(x,z)>20&&!world.nearHouse(x,z))add('banyan',x,z,13+rand()*5);}
 for(const c of world.hamletCenters||[]){if(rand()<.55)continue;const x=c[0]+(rand()-.5)*60,z=c[1]+(rand()-.5)*60;
  if(world.shoreDistance(x,z)>40&&!world.nearHouse(x,z)&&!world.nearRoad(x,z))add('banyan',x,z,12+rand()*6);}
 // 4) Bamboo clumps at village edges.
 for(let i=0;i<houses.length;i++){const home=houses[i];if(rand()>.22)continue;
  const a=rand()*6.28,r=Math.hypot(home.w,home.depth)+10+rand()*14,x=home.x+Math.cos(a)*r,z=home.z+Math.sin(a)*r;
  if(world.shoreDistance(x,z)>25&&clear(x,z,-40))add('bamboo',x,z,9+rand()*5);}
 return trees;
}

function batch(world,kind,items,material){
 if(!items.length)return [];
 const near=KINDS[kind](),far=farGeometry(kind);
 const meshes=world.batchCells(near,material,items,'Okinawa '+kind,p=>p.s*(SHAPE[kind][0]+.1),p=>p.s*1.1,CELL[kind],far);
 // world.batchCells assumes p.r rotations and sx/sy/sz scales: the generated geometry is already per-kind.
 return meshes;
}

function build(world,options={}){
 const t0=performance.now?performance.now():Date.now();
 const trees=place(world,options);
 const material=new THREE.MeshStandardMaterial({vertexColors:true,color:0xffffff,roughness:.92,metalness:0});
 material.name='Okinawa vegetation';world.materials?.push(material);
 const meshes=[];
 for(const kind of Object.keys(trees))meshes.push(...batch(world,kind,trees[kind],material));
 const counts=Object.fromEntries(Object.entries(trees).map(([k,v])=>[k,v.length]));
 const ms=Math.round((performance.now?performance.now():Date.now())-t0);
 world.vegetationStats={counts,total:Object.values(counts).reduce((a,b)=>a+b,0),meshes:meshes.length,ms};
 return world.vegetationStats;
}
scope.OkinawaVegetation={build,place,KINDS,farGeometry,SHAPE,CELL};
})(typeof window!=='undefined'?window:globalThis);
