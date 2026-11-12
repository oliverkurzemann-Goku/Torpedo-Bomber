'use strict';
const path = require('node:path');
const {Scene} = require('./glb.cjs');
const atlas = require('./atlas.cjs');
const {measure, meshes} = require('./geometry.cjs');

const title = 'Fieseler Fi 156 C-2 Storch';
const author = 'Torpedo-Bomber project';
const license = 'project-own (original mesh and paint)';
const source = 'https://drive.google.com/file/d/1W0K-B4_2USPFG5wsZDeOR4NMF924dtz4/view';
const references = [
  {title:'Fi 156 Flugzeughandbuch L.Dv.T. 2601/1, 30 June 1940',url:source,
    license:'Historical reference; rights not asserted',role:'C-2 type drawing, level dimensions, tail skid, and control deflections'},
  {title:"Museum Alkmaar ’40–’45 — technical manual catalogue",
    url:'https://sites.google.com/museumalkmaar40-45.nl/museumalkmaar40-45/voorschriften-manuals/l-dv-l-dv-g-l-dv-t/l-dv-t-2150-l-dv-t-9000',
    license:'Museum reference; rights retained',role:'Manual identification and issue date'},
  {title:'Fieseler Fi 156 Storch, Ladislav Rejthar, HyperScale',
    url:'https://www.hyperscale.com/features/2000/fi156storchlr_1.htm',
    license:'Copyright retained',role:'Secondary reference for the RLM 70/71 splinter camouflage family; no source imagery used'},
  {title:'Fieseler Storch, Aero 2/1992',
    url:'https://bc.pollub.pl/Content/14136/Aero%202%201992.pdf',
    license:'Copyright retained',role:'Secondary reference for RLM 65 undersides and green upper surfaces'},
];
const dimensions={span:14.25,length:9.67,height:3.81,track:3.4,propellerDiameter:2.6,tailplaneSpan:4.75};
const scene = new Scene({title,author,license,source,changes:'Original mesh derived from dimensioned stations; fictional markings and baked paint.',
  units:'metres',dimensions,sources:references.map(r=>r.url)},atlas);
const airframe=scene.material('Painted steel and fabric');
const detail=scene.material('Rubber, wood and fittings',{roughness:.88,metallic:0});
const glass=scene.material('Glazing',{roughness:.75,metallic:0,doubleSided:true,alphaMode:'BLEND',factor:[1,1,1,.33]});
const root=scene.node('Storch',null,{extras:{rigContract:1,class:'tailwheel-light',nativeAircraft:'fi156c-own',kind:'fi156',
  title,author,license,source,provenance:'Original node-generated mesh and atlas. Reference scans used to measure only.',references,dimensions}});
const gear=scene.node('gear',root);
const flaps=scene.node('flightFlaps',root);

const X=[1,0,0],Y=[0,1,0],Z=[0,0,1];
const origin=[0,3.1,1.79];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const toGame=([x,foreAft,z])=>[x,z,-foreAft];
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=([x,y,z],[a,b,c])=>[y*c-z*b,z*a-x*c,x*b-y*a];
const norm=v=>v.map(x=>x/Math.hypot(...v));
const rad=x=>x*Math.PI/180;
const bundles=new Map();
function bucket(name,parent,pivot,material,extras) {
  if(!bundles.has(name)) bundles.set(name,{name,parent,pivot,material,extras,positions:[],normals:[],uv:[],indices:[]});
  return bundles.get(name);
}
function joint(name,parent,pivot,extras) {
  const node=scene.node(name,parent,{translation:toGame(sub(pivot,origin)),extras});
  return {node,pivot};
}
const b=(name,material=airframe)=>bucket(name,root,origin,material);
const under=(group,name,material=airframe,extras)=>bucket(name,group.node,group.pivot,material,extras);
const rig=(drive,axis,range)=>({rig:{drive,axis,range}});
const gain=(drive,axis,value)=>({rig:{drive,axis,gain:value}});
const control = (name,parent,pivot,extras)=>bucket(name,parent,pivot,airframe,extras);
const prop=bucket('Propeller',root,[0,.066,1.79],detail,{rig:{drive:'prop',axis:Z,blades:2}});
const canopy=joint('Canopy',root,[-.53,2.27,1.98],rig('canopy',Y,[0,1.1]));
const tailGear=joint('TailGear',gear,[0,8.45,2.07],rig('gear',X,[0,0]));
const skid=under(tailGear,'TailSkid',detail,{groundWheel:true,contactKind:'skid'});
const rudder=control('Rudder',root,[0,8.803,2.27],gain('yaw',Y,rad(42)));
const sides=new Map();
for(const s of [-1,1]) {
  const suffix=s<0?'Left':'Right';
  const leg=joint('Gear'+suffix,gear,[s*.631,2.50,2.706],rig('gear',X,[0,0]));
  sides.set(s,{
    leg:under(leg,'MainStruts'+suffix),
    wheel:under(leg,'Wheel'+suffix,detail,{groundWheel:true}),
    flap:control('Flap'+suffix,flaps,[s*.63,3.667,2.693],rig('flap'+suffix,X,[0,-rad(40)])),
    aileron:control('Aileron'+suffix,root,[s*3.96,3.665,2.725],gain('roll',X,s<0?rad(21.5):-rad(21.5))),
    elevator:control('Elevator'+suffix,root,[s*.22,8.565,2.31],gain('pitch',X,rad(30))),
  });
}
const sideOf=m=>m.vertices.reduce((sum,p)=>sum+p[0],0)<0?-1:1;
function choose(m) {
  const {name,material}=m,s=sides.get(sideOf(m));
  if(m.door) return under(canopy,material==='glass'?'DoorGlazing':'DoorFrame',material==='glass'?glass:airframe);
  if(material==='glass') return b('CabinGlazing',glass);
  if(material==='prop'||name.startsWith('Propeller')) return prop;
  if(name==='Main tyre'||name==='Wheel hub') return s.wheel;
  if(['Main oleo piston','Shock-absorber cylinder','Forward axle link','Rear axle link'].includes(name)) return s.leg;
  if(name==='Spring-loaded tail skid') return skid;
  if(name.startsWith('Tail skid')) return under(tailGear,'SkidLinkage');
  if(name==='Inboard slotted flap') return s.flap;
  if(name==='Outboard slotted aileron') return s.aileron;
  if(name==='Rounded elevator') return s.elevator;
  if(name==='Rudder') return rudder;
  if(['inlet','exhaust','seat','hub'].includes(material)) return b('Fittings',detail);
  if(['Main wing','Fixed slat','Slat bracket'].includes(name)) return b('Wings');
  if(name==='Fixed horizontal stabilizer'||name==='Fin') return b('FixedTail');
  if(['metal','fabric'].includes(material)&&!name.includes('strut')) return b('Airframe');
  return b('FramesAndBraces');
}
function paintUv(m,p,faceNormal) {
  const {material,name}=m,[x,y,z]=p;
  const suffix=x<0?'Left':'Right';
  if(['Main wing','Fixed slat','Inboard slotted flap','Outboard slotted aileron'].includes(name)){
    return atlas.uv((faceNormal[1]<-.1?'lower':'upper')+suffix,Math.abs(x)/7.125,(y-2.08)/1.99);
  }
  if(['Steel tube and fabric fuselage','Argus cowling','Air inlet surround','Cabin sill skin'].includes(name)){
    const low=y<4.1?1.22:1.22+.153*(y-4.1);
    const high=y<4.1?2.28:2.40;
    return atlas.uv('body'+suffix,y/9.67,1-(z-low)/(high-low));
  }
  if(material==='rubber') {
    return atlas.uv('rubber',(Math.atan2(z-.25,y-2.14)+Math.PI)/(2*Math.PI),(.09+x-Math.sign(x)*1.7)/.18);
  }
  if(['glass','seat','exhaust','hub','inlet','prop'].includes(material)) {
    return atlas.uv(material,(y%1+1)%1,(z%1+1)%1);
  }
  if(material==='frame')return atlas.uv('trim',(y%2)/2,z/3);
  return atlas.uv(faceNormal[1]<-.35?'plainLight':'plainGreen',(y%3)/3,Math.min(.99,Math.abs(x)/2.5));
}
function append(m,out) {
  const points=m.vertices.map(p=>toGame(sub(p,out.pivot)));
  const triangles=[];
  const sums=points.map(()=>[0,0,0]);
  for(const face of m.faces) {
    for(let i=1;i+1<face.length;i++){
      const [a,b,c]=[face[0],face[i],face[i+1]];
      const n=cross(sub(points[b],points[a]),sub(points[c],points[a]));
      if(dot(n,n)<1e-17) continue;
      triangles.push({a,b,c,n,cap:face.length>4});
    }
  }
  let flip=false;
  if(m.faces.length>1){
    const volume=triangles.reduce((sum,t)=>sum+dot(points[t.a],t.n),0);
    flip=volume<0;
  }else if(m.material!=='glass'){
    const n=triangles[0].n;
    flip=n[0]*m.vertices[0][0]<0;
  }
  for(const t of triangles){
    if(flip) [t.b,t.c,t.n]=[t.c,t.b,t.n.map(v=>-v)];
    if(t.cap)continue;
    for(const index of [t.a,t.b,t.c]){
      for(let i=0;i<3;i++)sums[index][i]+=t.n[i];
    }
  }
  const remap=new Map();
  for(const t of triangles){
    const normal=norm(t.n);
    for(const i of [t.a,t.b,t.c]){
      const tex=paintUv(m,m.vertices[i],normal);
      const soft=sums[i];
      const n=m.faces.length===1||t.cap||dot(soft,t.n)<=0?normal:norm(soft);
      const key=[i,...tex,...n].join(',');
      let index=remap.get(key);
      if(index===undefined){
        index=out.positions.length/3;
        out.positions.push(...points[i]);out.normals.push(...n);out.uv.push(...tex);
        remap.set(key,index);
      }
      out.indices.push(index);
    }
  }
}
for(const m of meshes) append(m,choose(m));
for(const m of bundles.values()){
  scene.node(m.name,m.parent,{mesh:m,material:m.material,extras:m.extras,
    ...(m.parent===root||m.parent===flaps?{translation:toGame(sub(m.pivot,origin))}:{})});
}
const output=path.resolve(process.argv[2]||path.join(__dirname,'..','fi156c-own.glb'));
scene.write(output);
