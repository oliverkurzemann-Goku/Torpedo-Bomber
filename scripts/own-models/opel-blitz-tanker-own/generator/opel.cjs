'use strict';
const {make,reference}=require('./config.cjs');
const {Mesh,X,Y,Z,TAU,block,beam,tube,loft}=require('./mesh.cjs');
const {prismatic,wheels,absorb,wreckNode,panelNumber,crossMark}=require('./parts.cjs');
function opel(tanker){
 const id='opel-blitz-'+(tanker?'tanker':'cargo')+'-own';
 const info={id,kind:tanker?'opel-blitz-tanker':'opel-blitz-cargo',class:'ground-vehicle',
  title:'Opel Blitz 3 t — '+(tanker?'Tankwagen':'Pritsche mit Plane'),texture:1024,seed:3601944,
  references:[reference('Opel Blitz, DISG Fahrzeugmuseum','https://www.disg-ev.de/fahrzeugsammlung/opel-blitz','Museum text and photos; no open reuse license displayed','6.00 m overall length, 2.20 m width and comparison of the cab silhouette.')]};
 const {scene,root,uv,write}=make(info,{
  paint:{a:'b79f5b',b:'4f5c3a',mode:'stripe'},
  door:{a:'b79f5b',b:'4f5c3a',mode:'stripe',sample:(u,v)=>{const n=crossMark(u,v,.5,.5,.42,.56);return n<0?undefined:n;}},
  number:{a:'b79f5b',b:'4f5c3a',mode:'stripe',sample:(u,v)=>panelNumber('47',u,v,.18,.20,.64,.63)},
  steel:{a:'4a4e50',b:'6b5b48',mode:'metal'},
  rubber:{a:'4a4e50',b:'66594b',mode:'tyre'},
  dark:{a:'363635',b:'574d42',mode:'metal'},
  glass:{a:'66777b',b:'95a19e',mode:'hull'},
  headlight:{a:'d1bc86',b:'aba581',mode:'lens'},
  bed:{a:'8f7845',b:'746646',mode:'wood'},
  canvas:{a:'8d875e',b:'5c6349',mode:'stripe'},
  wreck:{a:'3d3933',b:'8b583d',mode:'wreck'},
 },{length:6,width:2.20,height:tanker?2.50:2.90,cabHeight:2.20});
 const intact=scene.node('Intact',root);
 const chassis=new Mesh(),rolling=new Mesh(),cab=new Mesh(),glazing=new Mesh(),trim=new Mesh(),bed=new Mesh();
 for(const x of [-.35,.35]){
  block(chassis,uv('steel'),[x,.68,0],[.20,.21,5.67]);
  block(chassis,uv('steel'),[x,.68,-2.32],[.26,.24,.76]);
 }
 for(const z of [-2.92,2.92])block(chassis,uv('steel'),[0,.68,z],[1.98,.17,.16]);
 block(chassis,uv('dark'),[0,.74,.48],[1.08,.24,1.43]);
 for(const z of [-1.8,1.8]){
  tube(rolling,uv('steel'),[-.96,.465,z],[.96,.465,z],.063,.063,12);
  for(const x of [-.92,.92])wheels(rolling,uv,x,.465,z,.465,.243,{count:24,paint:'paint'});
 }
 for(const x of [-.71,.71])wheels(rolling,uv,x,.465,-1.8,.455,.17,{count:20,hub:false});
 wheels(rolling,uv,.89,1.30,.10,.41,.18,{count:20,paint:'steel'});
 prismatic(cab,uv('paint'),[[.89,.20],[.89,1.53],[1.55,1.56],[2.12,1.40],[2.20,1.19],[2.20,.39],[2.12,.22]],-.84,.84);
 prismatic(cab,uv('paint'),[[.89,1.48],[.87,2.69],[1.52,2.71],[1.65,2.47],[1.68,1.53]],-.48,.48);
 block(cab,uv('steel'),[0,1.23,2.735],[.79,.55,.075]);
 for(let i=-4;i<=4;i++)block(trim,uv('dark'),[i*.080,1.23,2.779],[.031,.48,.026]);
 for(const s of [-1,1]){
  const x=s*.87;
  prismatic(trim,uv('paint'),[[.80,1.10],[.80,2.60],[1.03,2.56],[1.14,2.27],[1.17,1.56],[1.02,1.15]],x-.229,x+.229);
  block(trim,uv('steel'),[x,.77,.76],[.46,.11,.81]);
  tube(trim,uv('paint'),[s*.738,1.25,2.30],[s*.738,1.25,2.49],.128,.117,16);
  tube(trim,uv('headlight'),[s*.738,1.25,2.49],[s*.738,1.25,2.502],.097,.097,16,{capA:false});
  block(trim,uv('dark'),[s*.851,1.38,.52],[.029,.053,.13]);
  const q=[[s*.841,1.58,.41],[s*.841,1.58,1.40],[s*.78,2.045,1.27],[s*.78,2.045,.44]];
  // Glass is a painted, opaque insert with a small reveal from the cab face.
  const glass=q.map(([x,y,z])=>[s*.849,y,z]);
  glazing.face(glass,[[0,1],[1,1],[1,0],[0,0]].map(a=>uv('glass')(...a)),[s,0,0]);
  const mark=[[s*1.102,.90,1.26],[s*1.102,.90,1.62],[s*1.102,1.06,1.58],[s*1.102,1.05,1.28]];
  // Number is printed onto the outer fender skin.
  for(const p of mark)p[0]=s*1.100;
  trim.face(mark,[[0,1],[1,1],[1,0],[0,0]].map(a=>uv('number')(...a)),[s,0,0]);
 }
 const mark=[[-.841,1.24,.72],[-.841,1.24,1.02],[-.841,1.49,1.02],[-.841,1.49,.72]];
 trim.face(mark,[[0,1],[1,1],[1,0],[0,0]].map(a=>uv('door')(...a)),[-1,0,0]);
 for(const s of [-1,1]){
  const p=[[s*.038,1.58,1.554],[s*.72,1.58,1.554],[s*.72,2.066,1.426],[s*.038,2.066,1.426]];
  glazing.face(p,[[0,1],[1,1],[1,0],[0,0]].map(a=>uv('glass')(...a)),[0,.26,.9656]);
 }
 scene.node('Chassis',intact,{mesh:chassis});
 scene.node('RoadWheelsAndSpare',intact,{mesh:rolling});
 scene.node('CabShell',intact,{mesh:cab});
 scene.node('CabGlazing',intact,{mesh:glazing});
 scene.node('CabFendersAndLights',intact,{mesh:trim});
 if(tanker){
  block(bed,uv('steel'),[0,.885,-1.33],[1.94,.12,3.22]);
  for(const z of [-2.34,-.35])block(bed,uv('steel'),[0,1.09,z],[1.34,.38,.31]);
  const tank=new Mesh();
  loft(tank,[[-2.94,.565,.565,1.66],[-2.86,.694,.694,1.66],[-2.73,.75,.75,1.66],
   [-1.35,.75,.75,1.66],[.02,.75,.75,1.66],[.15,.694,.694,1.66],[.26,.565,.565,1.66]],32,uv('paint'));
  for(const z of [-2.27,-.46])tube(tank,uv('steel'),[0,1.66,z-.046],[0,1.66,z+.046],.756,.756,24,{capA:false,capB:false});
  tube(tank,uv('paint'),[0,2.38,-1.23],[0,2.5,-1.23],.23,.22,18);
  block(tank,uv('steel'),[.91,1.26,-2.15],[.36,.45,.51]);
  beam(tank,uv('dark'),[.835,1.55,-2.44],[.835,1.55,-.37],.072);
  beam(tank,uv('steel'),[.88,1.44,-2.42],[.88,1.44,-.34],.10);
  scene.node('TankAndServiceBox',intact,{mesh:tank});
 }else{
  block(bed,uv('bed'),[0,1.05,-1.36],[2.14,.15,3.15]);
  for(const x of [-1.035,1.035]){
   block(bed,uv('paint'),[x,1.40,-1.36],[.105,.59,3.15]);
   for(let i=0;i<4;i++)block(bed,uv('steel'),[x,1.39,-2.71+i*.9],[.13,.58,.063]);
  }
  block(bed,uv('bed'),[0,1.40,-2.896],[2.13,.59,.085]);
  const cover=new Mesh(),profile=[[-1.059,1.70],[-1.052,2.36],[-.88,2.65],[-.54,2.83],[0,2.90],
   [.54,2.83],[.88,2.65],[1.052,2.36],[1.059,1.70]];
  for(let i=0;i<8;i++){
   const a=i/8,b=(i+1)/8;
   const f=(j,t)=>[profile[j][0]*(Math.round(t*8)%2?.989:1),profile[j][1]-(Math.round(t*8)%2?.024:0),.19-t*3.07];
   for(let j=0;j<profile.length-1;j++)cover.face([f(j,a),f(j+1,a),f(j+1,b),f(j,b)],
    [[j/8,a],[(j+1)/8,a],[(j+1)/8,b],[j/8,b]].map(a=>uv('canvas')(...a)),
    j<2?[-1,.30,0]:j>5?[1,.30,0]:Y);
  }
  for(const z of [-2.879,.185]){
   const edge=profile.map(([x,y])=>[x,y,z]);
   cover.face(edge,edge.map(([x,y])=>uv('canvas')(.5+x/2.2,1-(y-1.7)/1.2)),[0,0,Math.sign(z)]);
  }
  scene.node('StretchedCanvasCover',intact,{mesh:cover});
 }
 scene.node('LoadBed',intact,{mesh:bed});
 const wreck=new Mesh();
 for(const x of [-.40,.40]){
  beam(wreck,uv('wreck'),[x,.46,-3],[x+.14,.72,-.18],.14);
  beam(wreck,uv('wreck'),[x+.14,.72,-.18],[x,.51,3],.14);
 }
 prismatic(wreck,uv('wreck'),[[.65,.18],[.62,1.50],[1.57,1.43],[1.78,.47],[1.51,.19]],-.83,.83);
 if(tanker){
  tube(wreck,uv('wreck'),[0,1.22,-2.76],[.12,1.08,.22],.64,.54,14);
 }else{
  block(wreck,uv('wreck'),[0,.84,-1.42],[2.2,.22,2.97]);
  beam(wreck,uv('wreck'),[-1.01,.91,-2.9],[-.63,1.30,.15],.115);
  beam(wreck,uv('wreck'),[1.01,.91,-2.9],[.81,1.10,.15],.115);
 }
 for(const x of [-.91,.91])for(const z of [-1.8,1.8]){
  const tyre=new Mesh();
  wheels(tyre,uv,x,.43,z,.43,.235,{count:12,hub:false,tyre:'wreck'});
  absorb(wreck,tyre,([x,y,z])=>[x,y*.55,z]);
 }
 wreckNode(scene,root,wreck);
 write();
}
module.exports=opel;
