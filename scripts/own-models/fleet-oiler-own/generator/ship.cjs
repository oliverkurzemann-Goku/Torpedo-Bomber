'use strict';
const {Mesh,X,Y,Z,TAU,block,beam,tube,loft,unit,sub,scale,cross,dot}=require('./mesh.cjs');
const {sectionY,prismatic,absorb}=require('./parts.cjs');
const {letters}=require('./atlas.cjs');
const decor={shipVisualOnly:true};
function navalPaint(c){
 const {ship,deck,line}=c.colors;
 function named(u,v,flip){
  if(!c.name)return;
  if(letters(c.name,flip?1.765-u:u,v,.83,.20,.105,.089))return 14;
 }
 const side=(flip,base,alt,mode)=>({a:base,b:alt,mode,reserve:true,inks:{12:line,13:c.oiler?'51585c':'676f75',14:'e6e5dc'},
  sample(u,v){
   if(v>.486&&v<.533)return 12;
   if(v>.533)return 13;
   return named(u,v,!flip);
  }});
 return {
  sideRight:side(false,ship,'5a6264','hull'),
  sideLeft:side(true,ship,'5a6264','hull'),
  bottom:{a:line,b:'493331',mode:'hull'},
  deck:{a:deck,b:c.oiler?'88765a':'2f3031',mode:'deck',sample:(u,v)=>{
   const p=(u*51)%1;
   if((p<.038||p>.964)&&v>.03&&v<.97)return 1;
   if(!c.oiler&&Math.sin(v*42+u*8)*Math.cos(u*19-v*26)>.47)return 6;
  }},
  steel:{a:c.oiler?'8b9296':ship,b:'5a6367',mode:'metal'},
  steelDark:{a:'565e64',b:'484d50',mode:'rust'},
  canvas:{a:'93978c',b:'655b50',mode:'wood'},
  black:{a:'31363a',b:'65534d',mode:'wreck'},
  funnel:{a:c.oiler?'45494b':ship,b:'464548',mode:'engine',reserve:true,inks:{12:'762e2b',13:'474747'},
   sample:(u)=>u>.90?13:c.oiler&&u>.67&&u<.76?12:undefined},
  window:{a:'777e82',b:'505557',mode:'metal',inks:{12:'363d40',14:'232d33'},sample(u,v){
   const w=(u*8)%1;
   if(v>.30&&v<.67&&w>.14&&w<.83)return v>.58?12:14;
  }},
  pipe:{a:'727676',b:'4f514c',mode:'rust'},
  gun:{a:'747b7f',b:'3e4040',mode:'metal',inks:{13:'414446'},sample:u=>u>.87?13:undefined},
  stern:{a:'7d7e76',b:'494b46',mode:'track'},
  brass:{a:'665d4a',b:'4a473e',mode:'metal'},
 };
}
function hullAssembly(c,scene,root,uv){
 const shell=new Mesh(),deck=new Mesh(),b=c.beam/2,half=c.length/2,D=c.draft;
 const stations=c.stations.map(([z,beam,top,keel,profile=0])=>[z*half,beam*b,top,keel,profile]);
 const shape=[[0,.026],[.055,.287],[.118,.54],[.201,.744],[.286,.929],[.405,1],
  [.524,.995],[.647,.974],[.768,.946],[.890,.936],[1,.924]];
 const rows=stations.map(([z,w,h,k,p])=>shape.map(([t,ff])=>{
  // The last stem stations can widen locally below the waterline to form the bulb.
  const swell=p*Math.exp(-Math.pow((t-.28)/.16,2));
  const f=ff*(1+swell);
  return [f*w,k+(h-k)*t,z];
 }));
 const beamUV=uv('deck'),u=[uv('sideLeft'),uv('sideRight')];
 const sideUv=(p,s)=>{
  const [,y,z]=p;
  // The atlas reserves equal space above and below the waterline.
  return u[s<0?0:1](z/c.length+.5,.49-y/(y>=0?c.maxTop/.49:D/.51));
 };
 const deckUv=([x,,z])=>beamUV(x/c.beam+.5,z/c.length+.5);
 for(const s of [-1,1]){
  const pt=(i,k)=>{const [x,y,z]=rows[i][k];return [s*x,y,z];};
  for(let i=0;i<rows.length-1;i++){
   for(let k=0;k<shape.length-1;k++){
    const a=[pt(i,k),pt(i+1,k),pt(i+1,k+1),pt(i,k+1)];
    shell.face(a,a.map(p=>sideUv(p,s)),[s,0,0]);
   }
   const a=pt(i,shape.length-1),b=pt(i+1,shape.length-1),p=[a,b,[0,b[1],b[2]],[0,a[1],a[2]]];
   deck.face(p,p.map(deckUv),Y);
  }
 }
 const under=uv('bottom');
 for(let i=0;i<rows.length-1;i++){
  const [a,y,z]=rows[i][0],[b,yy,zz]=rows[i+1][0];
  shell.face([[-a,y,z],[-b,yy,zz],[b,yy,zz],[a,y,z]],[under(0,0),under(0,1),under(1,1),under(1,0)],[0,-1,0]);
 }
 for(const i of [0,rows.length-1]){
  for(let k=0;k<shape.length-1;k++){
   const [a,y,z]=rows[i][k],[b,yy]=rows[i][k+1],p=[[-a,y,z],[a,y,z],[b,yy,z],[-b,yy,z]];
   shell.face(p,p.map(q=>sideUv(q,1)),[0,0,i===0?-1:1]);
  }
 }
 scene.node('Hull',root,{mesh:shell});
 scene.node('WeatherDeck',root,{mesh:deck});
 return stations;
}
function deckhouse(mesh,uv,{x=0,z,y,width,length,height,chamfer=.78,window=true}){
 const w=width/2,l=length/2,k=Math.min(chamfer,w*.42,l*.30);
 const outline=[[-w+k,-l],[w-k,-l],[w,-l+k],[w,l-k],[w-k,l],[-w+k,l],[-w,l-k],[-w,-l+k]];
 const u=uv(window?'window':'steel'),roof=uv('steel'),base=uv('steelDark'),h=y+height;
 for(let i=0;i<outline.length;i++){
  const [a,b]=outline[i],[c,d]=outline[(i+1)%outline.length];
  const p=(x0,y0,z0)=>[x+x0,y0,z+z0],n=unit([d-b,0,a-c]);
  const low=y+height*(window?.34:0);
  if(window)mesh.face([p(a,y,b),p(c,y,d),p(c,low,d),p(a,low,b)],[base(0,1),base(1,1),base(1,0),base(0,0)],n);
  mesh.face([p(a,low,b),p(c,low,d),p(c,h,d),p(a,h,b)],[u(0,1),u(1,1),u(1,0),u(0,0)],n);
 }
 const q=outline.map(([a,b])=>[x+a,h,z+b]);
 mesh.face(q,outline.map(([a,b])=>roof(a/width+.5,b/length+.5)),Y);
 return mesh;
}
function funnelAssembly(scene,root,uv,{z,y,top,rake,r,opening}){
 const funnel=new Mesh(),ex=[0,top,z-rake];
 
 const p=uv('funnel'),q=uv('black');
 const rows=[[y,r*1.06,r*1.25,-z],[y+1.35,r*1.02,r*1.21,-z+.18],[top-1,r*.92,r*1.07,-z+rake-.27],
  [top,r*.96,r*1.07,-z+rake]];
 sectionY(funnel,p,0,0,rows,32,{capB:false});
 // Inner opening and flat lip are a visible recessed aperture.
 tube(funnel,q,[0,top-.80,ex[2]],ex,opening,opening,32,{capB:false});
 for(let i=0;i<32;i++){
  const a=TAU*i/32,b=TAU*(i+1)/32;
  const ring=(rx,rz,t)=>[Math.cos(t)*rx,top,ex[2]+Math.sin(t)*rz];
  funnel.face([ring(r*.96,r*1.07,a),ring(r*.96,r*1.07,b),ring(opening,opening,b),ring(opening,opening,a)],
   [q(0,0),q(1,0),q(1,1),q(0,1)],Y);
 }
 scene.node('Funnel',root,{mesh:funnel});
 scene.node('funnel-exhaust-1',root,{translation:ex,extras:{shipExhaust:{radius:opening,direction:Y}}});
}
function rails(scene,root,uv,stations,width=.18){
 const mesh=new Mesh(),q=uv('steel');
 for(const s of [-1,1]){
  for(let i=1;i<stations.length-2;i++){
   const [z,w,y]=stations[i],[zz,ww,yy]=stations[i+1];
   for(const h of [.48,1.02])beam(mesh,q,[s*w*.894,y+h,z],[s*ww*.894,yy+h,zz],width);
   const n=Math.ceil((zz-z)/5.9);
   for(let j=0;j<n;j++){
    const t=j/n;
    block(mesh,q,[s*.894*(w+(ww-w)*t),y+.51+(yy-y)*t,z+(zz-z)*t],[width,1.08,width]);
   }
  }
 }
 scene.node('DeckEdgeRailings',root,{mesh,extras:decor});
}
function bollards(mesh,uv,{x,z,y,scale:k=1}){
 for(const s of [-1,1]){
  const xx=x+s*.39*k;
  tube(mesh,uv('steelDark'),[xx,y,z],[xx,y+.66*k,z],.29*k,.23*k,10);
  tube(mesh,uv('steel'),[xx,y+.60*k,z],[xx,y+.73*k,z],.32*k,.32*k,12);
 }
 block(mesh,uv('steelDark'),[x,y+.07*k,z],[1.52*k,.14*k,.76*k]);
}
function boats(scene,root,uv,positions){
 const fittings=new Mesh(),boats=new Mesh();
 for(const [x,y,z,l] of positions){
  const stations=[[-l/2,.071,.16,.07],[-l*.41,.52,.38,0],[-l*.26,.87,.47,0],[l*.26,.92,.45,0],
   [l*.414,.58,.36,.047],[l/2,.079,.17,.095]];
  absorb(boats,loft(new Mesh(),stations,16,uv('canvas')).shift([x,y,z]));
  block(boats,uv('deck'),[x,y+.37,z],[1.34,.19,l*.69]);
  for(const s of [-1,1]){
   const zz=z+s*l*.32,xx=x-Math.sign(x)*.80;
   beam(fittings,uv('steel'),[xx,y-.82,zz],[xx,y+1.08,zz],.21);
   beam(fittings,uv('steel'),[xx,y+1.08,zz],[x,y+1.32,zz],.19);
   beam(fittings,uv('black'),[x,y+1.28,zz],[x,y+.49,zz],.14);
  }
 }
 scene.node('BoatsAndDavits',root,{mesh:absorb(boats,fittings),extras:decor});
}
function aaMarker(scene,point,barrels,calibreMm){
 scene.json.asset.extras.markers.push({name:'gun-mount',point,properties:{barrels,calibreMm}});
}
function aa(scene,mesh,uv,p,{heavy=false,covered=false,side=1}={}){
 const [x,y,z]=p;
 const radius=heavy?2.13:1.01,r=heavy?.095:.047;
 tube(mesh,uv('steelDark'),[x,y-.04,z],[x,y+.34,z],radius,radius*.99,heavy?18:12);
 if(covered)deckhouse(mesh,uv,{x,z,y:y+.23,width:radius*1.63,length:radius*1.75,height:heavy?1.59:.92,chamfer:.35,window:false});
 else block(mesh,uv('steel'),[x,y+.72,z],[radius*.91,heavy?.95:.61,radius*1.03]);
 const offsets=heavy?[-.47,.47]:[-.29,0,.29];
 for(const dz of offsets){
  const height=y+(heavy?1.37:.88),ax=x+side*(heavy?.43:.25);
  const b=[x+side*(heavy?4.14:1.86),height+(heavy?.44:.20),z+dz];
  tube(mesh,uv('gun'),[ax,height,z+dz],b,r*1.40,r,heavy?10:8);
 }
 aaMarker(scene,[x,y,z],heavy?2:3,heavy?127:25);
}
function shipTurret(scene,root,uv,{label,y,z,dir=1,main=true}){
 const mesh=new Mesh(),r=main?6.50:3.18,h=main?4.75:2.46;
 const barbette=new Mesh();
 tube(barbette,uv('steelDark'),[0,y-1.25,z],[0,y+.055,z],r*.916,r*.916,main?36:24);
 const body=sectionY(mesh,uv('steel'),0,0,[[0,r,r*.94,-.12],[.48,r,r*.99,-.02],[h*.69,r*.96,r*.98,.02],
  [h,r*.81,r*.79,-.47]],main?14:12);
 block(body,uv('steelDark'),[0,h*.59,r*.86],[r*1.42,h*.48,r*.31]);
 block(body,uv('steel'),[0,h+.16,-r*.35],[r*.51,.32,r*.38]);
 const turret=scene.node('Turret'+label,root,{mesh:body,translation:[0,y,z],rotation:dir>0?undefined:[0,1,0,0],extras:{rig:{drive:'yaw',axis:Y}}});
 const gun=new Mesh(),cover=new Mesh(),pivot=[0,h*.61,r*.81],ends=main?21:8.45;
 const xs=main?[-2.40,0,2.40]:[-1.08,0,1.08];
 for(const x of xs){
  const rr=main?.47:.175;
  const portions=[[-.37,rr*1.42],[.70,rr*1.53],[ends*.19,rr*1.42],[ends*.42,rr*1.16],
   [ends*.72,rr*.94],[ends*.94,rr*.80],[ends,rr*.77]];
  loft(gun,portions.map(([z,r])=>[z,r,r,0]),main?24:14,uv('gun'),{x});
  loft(cover,[[-.50,rr*1.7,rr*1.76,0],[.09,rr*1.86,rr*1.88,0],[1.07,rr*1.24,rr*1.22,0]],16,uv('canvas'),{x});
 }
 const gn=scene.node('Guns'+label,turret,{mesh:gun,translation:pivot,extras:{rig:{drive:'pitch',axis:X}}});
 scene.node('CanvasBlastCovers'+label,gn,{mesh:cover,extras:decor});
 xs.forEach((x,i)=>scene.node('Muzzle'+label+(i+1),gn,{translation:[x,0,ends],extras:{direction:Z}}));
 return barbette;
}
function screws(scene,root,uv,positions){
 const m=new Mesh();
 for(const [x,y,z,r] of positions){
  tube(m,uv('steelDark'),[x,y,z+4.2],[x,y,z],r*.27,r*.27,16);
  tube(m,uv('brass'),[x,y,z-.42],[x,y,z+.42],r*.31,r*.35,18);
  for(let j=0;j<4;j++){
   const a=j*TAU/4+.24,c=Math.cos(a),s=Math.sin(a);
   const b=[[.22,-.13],[.78,-.22],[1,.04],[.83,.25],[.36,.18]];
   const p=b.map(([a,b])=>[x+(a*c-b*s)*r,y+(a*s+b*c)*r,z]);
   const u=uv('brass');
   for(const d of [-1,1])m.face(p.map(([x,y,z])=>[x,y,z+d*.089]),p.map((_,i)=>u(i/4,(i%2)*.9)),[0,0,d]);
  }
 }
 scene.node('ScrewsAndShafts',root,{mesh:m,extras:decor});
}
module.exports={decor,navalPaint,hullAssembly,deckhouse,funnelAssembly,rails,bollards,boats,aa,aaMarker,shipTurret,screws};
