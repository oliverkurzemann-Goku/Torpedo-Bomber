'use strict';
const {make,reference,rig}=require('./config.cjs');
const {Mesh,TAU,X,Y,Z,block,beam,tube,unit,scale,qx,rx}=require('./mesh.cjs');
const info={id:'wuerzburg-riese-own',kind:'wuerzburg-riese',class:'ground-structure',title:'Würzburg-Riese FuMG 65',texture:1024,seed:651942,
 references:[
  reference('Station Radar 44, Musée Franco-Allemand, Douvres-la-Délivrande','https://www.caenlamer-tourisme.fr/affaires-patrimoine-culturel/station-radar-44-musee-franco-allemand/','Museum tourism page; no reuse license displayed','Douvres exhibit exterior and 7.5 m aperture.'),
  reference('Telefunken FuMG 65 Würzburg Riese, Gatow exhibit','https://www.flugzeug-lexikon.de/Luftwaffenmuseum/Waffensysteme/Telefunken_FuMG_65/telefunken_fumg_65.html','No open reuse license displayed','Different installation with a separate set of dimensions.'),
 ]};
const dim={length:6,width:7.5,height:9,reflectorDiameter:7.5,foundation:[6,6]};
const {scene,root,uv,write}=make(info,{
 sand:{a:'b79f5b',b:'4f5c3a',mode:'metal'},
 number:{a:'a68d4c',b:'5e6647',mode:'metal',label:'R47'},
 dish:{a:'a9ada5',b:'9b9e91',mode:'grid'},
 back:{a:'85897b',b:'6c715f',mode:'metal'},
 brace:{a:'716d4b',b:'536046',mode:'rust'},
 dark:{a:'393d35',b:'555646',mode:'metal'},
 base:{a:'8e8e81',b:'8a7e67',mode:'concrete'},
 wreck:{a:'3a3b34',b:'856046',mode:'wreck'},
},dim);
const intact=scene.node('Intact',root),f=new Mesh();
block(f,uv('base'),[0,.18,0],[6,.36,6]);
tube(f,uv('base'),[0,.36,0],[0,1.17,0],2.05,1.72,8);
tube(f,uv('base'),[0,1.17,0],[0,1.62,0],1.72,1.72,8);
tube(f,uv('back'),[0,1.62,0],[0,1.79,0],1.46,1.46,40);
tube(f,uv('brace'),[0,1.76,0],[0,1.96,0],1.27,1.25,36);
scene.node('FoundationAndRace',intact,{mesh:f});
const hut=new Mesh();
block(hut,uv('number'),[1.18,1.61,-1.68],[3,2.50,2.50]);
block(hut,uv('brace'),[1.18,2.887,-1.68],[3.10,.08,2.59]);
block(hut,uv('sand'),[1.89,1.34,-.40],[.72,1.82,.07]);
block(hut,uv('dark'),[.64,1.96,-.393],[.62,.38,.065]);
block(hut,uv('sand'),[-1.62,.72,-2.38],[.53,.70,.65]);
for(const x of [-1.75,-1.31])beam(hut,uv('back'),[x,.40,1.15],[x,2.53,.95],.069);
for(let i=0;i<7;i++){
 const y=.53+i*.295;
 beam(hut,uv('back'),[-1.75,y,1.13-i*.027],[-1.31,y,1.13-i*.027],.057);
}
scene.node('ControlHutAndLadder',intact,{mesh:hut});

const dish=scene.node('Dish',intact,{translation:[0,1.86,0],extras:rig('yaw',Y)});
const yoke=new Mesh(),pivotZ=-.88,dishStandOff=.95,pivotY=5.455-dishStandOff*Math.sin(35*Math.PI/180);
tube(yoke,uv('brace'),[0,0,0],[0,.27,0],1.18,1.18,32);
for(const side of [-1,1]){
 const x=side*1.43,top=pivotY-1.86;
 beam(yoke,uv('sand'),[side*1.06,.14,-.57],[x,top,pivotZ],.36,.46);
 beam(yoke,uv('brace'),[side*1.06,.14,.57],[x,top-.18,pivotZ],.28,.31);
 tube(yoke,uv('back'),[x-side*.24,top,pivotZ],[x+side*.22,top,pivotZ],.31,.25,20);
 block(yoke,uv('sand'),[side*1.04,.48,0],[.66,.63,1.01]);
}
scene.node('SlewYoke',dish,{mesh:yoke});
const elevation=scene.node('Elevation',dish,{translation:[0,pivotY-1.86,pivotZ],
 rotation:qx(-35*Math.PI/180),extras:rig('pitch',X)});
const front=(r,a)=>[r*Math.cos(a),r*Math.sin(a),-.99+1.82*(r/3.75)**2];
const normal=(r,a)=>unit([-3.64/(3.75**2)*r*Math.cos(a),-3.64/(3.75**2)*r*Math.sin(a),1]);
const diskUV=(u,p)=>u(.5+p[0]/7.5,.5-p[1]/7.5);
function reflector(m,segments,rings,start,arc,u,v){
 for(const surface of [0,1]){
  const faceUV=surface===0?u:v,offset=surface===0?0:-.07,sign=surface===0?1:-1;
  const at=(r,a)=>{const p=front(r,a);p[2]+=offset;return p;};
  for(let i=0;i<segments;i++){
   const a=start+arc*i/segments,b=start+arc*(i+1)/segments;
   for(let j=0;j<rings;j++){
    const r=3.75*j/rings,s=3.75*(j+1)/rings;
    const coords=j===0?[[0,a],[s,a],[s,b]]:[[r,a],[s,a],[s,b],[r,b]];
    const points=coords.map(([r,a])=>at(r,a));
    m.face(points,points.map(p=>diskUV(faceUV,p)),coords.map(([r,a])=>scale(normal(r,a),sign)));
   }
  }
 }
 for(let i=0;i<segments;i++){
  const a=start+arc*i/segments,b=start+arc*(i+1)/segments;
  const p=front(3.75,a),q=front(3.75,b);
  const r=[q[0],q[1],q[2]-.07],s=[p[0],p[1],p[2]-.07];
  m.face([p,q,r,s],[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>v(x,y)),[Math.cos((a+b)/2),Math.sin((a+b)/2),0]);
 }
 return m;
}
scene.node('ReflectorShell',elevation,{mesh:reflector(new Mesh(),48,9,0,TAU,uv('dish'),uv('back')).shift([0,0,dishStandOff])});
const cage=new Mesh();
for(let i=0;i<12;i++){
 const a=i*TAU/12;
 const p=[.25*Math.cos(a),.25*Math.sin(a),-1.32];
 const rim=front(3.66,a);rim[2]-=.15;
 const knee=front(1.93,a);knee[2]-=.52;
 beam(cage,uv('brace'),p,knee,.09);
 beam(cage,uv('brace'),knee,rim,.078);
 if(i%3===0)beam(cage,uv('back'),front(3.57,a),[0,0,1.73],.078);
}
block(cage,uv('sand'),[0,0,-1.34],[.71,.67,.47]);
scene.node('ReflectorBracing',elevation,{mesh:cage.shift([0,0,dishStandOff])});
const feed=new Mesh();
tube(feed,uv('back'),[0,0,1.59],[0,0,1.87],.109,.075,14);
beam(feed,uv('dark'),[-.29,0,1.88],[.29,0,1.88],.06);
scene.node('FeedDipole',elevation,{mesh:feed.shift([0,0,dishStandOff])});

const wreck=new Mesh(),broken=reflector(new Mesh(),17,3,.24,Math.PI*1.05,uv('wreck'),uv('wreck'));
block(wreck,uv('base'),[0,.16,0],[6,.32,6]);
block(wreck,uv('wreck'),[.75,.69,-1.55],[3.0,.74,2.50]);
for(let i=0;i<broken.positions.length;i+=3){
 const p=rx(broken.positions.slice(i,i+3),-1.31),n=rx(broken.normals.slice(i,i+3),-1.31);
 broken.positions.splice(i,3,p[0]*.71,p[1]*.71+1.13,p[2]*.71-.10);
 broken.normals.splice(i,3,...n);
}
const k=wreck.positions.length/3;
wreck.positions.push(...broken.positions);wreck.normals.push(...broken.normals);
wreck.uv.push(...broken.uv);wreck.indices.push(...broken.indices.map(i=>i+k));
beam(wreck,uv('wreck'),[-1.82,.45,.99],[1.76,1.26,1.65],.21,.26);
scene.node('Wreck',root,{mesh:wreck,scale:[0,0,0],extras:{visible:false}});
write();
