'use strict';
const {Mesh,Scene,X,Y,Z,TAU,block,beam,tube,loft,unit,sub,add,scale}=require('./mesh.cjs');
const {absorb,sectionY,prismatic,dome}=require('./parts.cjs');
const {Atlas}=require('./atlas.cjs');
const seed=19450401;
const palette={
 stone:{a:'c0b499',b:'706d5b',mode:'concrete'},
 chalk:{a:'d3c7ab',b:'aaa58a',mode:'metal'},
 bark:{a:'72624b',b:'463d30',mode:'wood'},
 deadwood:{a:'b0a38a',b:'655744',mode:'wood'},
 leaf:{a:'5a7838',b:'344d30',mode:'air'},
 newLeaf:{a:'9f9e49',b:'607d3b',mode:'air'},
 needle:{a:'526f49',b:'294837',mode:'air'},
 soil:{a:'8e6b46',b:'9d814c',mode:'concrete'},
 greenSoil:{a:'77823f',b:'52623c',mode:'deck'},
 lagoon:{a:'5d8b75',b:'667962',mode:'hull'},
 timber:{a:'967957',b:'4e4739',mode:'wood'},
 dark:{a:'3a3931',b:'595044',mode:'wreck'},
 white:{a:'efeade',b:'b1bbaf',mode:'hull'},
 foam:{a:'d9e7df',b:'9fc8c4',mode:'hull'},
 dolphin:{a:'566d7a',b:'83909a',mode:'hull'},
 petal:{a:'bb709b',b:'825576',mode:'metal'},
};
function random(key){
 let a=seed;for(const c of key)a=Math.imul(a^c.charCodeAt(0),16777619);
 return ()=>{a=(Math.imul(a,1664525)+1013904223)>>>0;return a/4294967296;};
}
const randAngle=i=>i*2.399963229728653;
function rock(m,u,[x,y,z],[w,h,d],r,sides=9){
 const rows=Array.from({length:4},(_,i)=>Array.from({length:sides},(_,j)=>{
  const a=TAU*j/sides,rx=[.73,1,.87,.48][i]*(.84+r()*.30),dy=(r()-.5)*h*.13;
  return [x+Math.cos(a)*w*rx,y+[0,.28,.71,1][i]*h+(i?dy:0),z+Math.sin(a)*d*rx];
 }));
 for(let i=0;i<3;i++)for(let j=0;j<sides;j++){
  const k=(j+1)%sides,a=TAU*(j+.5)/sides,n=[Math.cos(a),.15,Math.sin(a)];
  m.face([rows[i][j],rows[i][k],rows[i+1][k],rows[i+1][j]],[u(j/sides,1-i/3),u(k/sides,1-i/3),u(k/sides,1-(i+1)/3),u(j/sides,1-(i+1)/3)],n);
 }
 for(let j=0;j<sides;j++){
  const q=rows[3],a=q[j],b=q[(j+1)%sides];
  m.face([[x,y+h*.98,z],a,b],[u(.5,.5),u(a[0]/w*.3+.5,a[2]/d*.3+.5),u(b[0]/w*.3+.5,b[2]/d*.3+.5)],Y);
 }
}
function frond(m,u,[x,y,z],a,L,W,rise,fall,N=5){
 const d=[Math.cos(a),0,Math.sin(a)],n=[-d[2],0,d[0]];
 const pt=(t,side,lower=false)=>{
  const width=Math.max(.013,Math.sin(Math.PI*t))*W;
  return [x+d[0]*L*t+n[0]*side*width,y+rise*Math.sin(t*Math.PI*.92)-fall*t*t-(side?.12*W:0)-(lower?.018:0),z+d[2]*L*t+n[2]*side*width];
 };
 for(let j=0;j<N;j++)for(const s of [-1,1])for(const lower of [false,true]){
  const a=j/N,b=(j+1)/N;
  const p=[pt(a,0,lower),pt(b,0,lower),pt(b,s,lower),pt(a,s,lower)];
  m.face(p,[u(.5,a),u(.5,b),u(s>0?1:0,b),u(s>0?1:0,a)],lower?[0,-1,0]:Y);
 }
}
function oval(m,u,center,rx,ry,rz,rings=4,sides=12){
 dome(m,u,center,[rx,ry,rz],{rings,sides,lower:-Math.PI/2+.09,angle:Math.PI/2});
}
function patch(m,u,x,y,z,w,d){
 m.face([[x-w/2,y,z-d/2],[x-w/2,y,z+d/2],[x+w/2,y,z+d/2],[x+w/2,y,z-d/2]],
  [u(0,0),u(0,1),u(1,1),u(1,0)],Y);
}
function boulderRow(m,u,r,x,z,count,step,y=0){
 for(let i=0;i<count;i++)rock(m,u,[x+i*step,y,z+(r()-.5)*.28],[step*.59,.53+r()*.46,.49],r,6);
}
const shapes={
 'limestone-stack'(m,u,r){
  rock(m,u('stone'),[0,0,0],[5.3,12.9,4.1],r,11);
  rock(m,u('chalk'),[-5.4,0,2.8],[2.7,5.6,2.4],r,8);
  rock(m,u('stone'),[4.3,0,-3.2],[3.6,3.0,2.1],r,8);
  rock(m,u('greenSoil'),[-.7,11.35,.12],[2.2,1.55,1.8],r,7);
 },
 'reef-foam'(m,u,r){
  const p=u('foam');
  for(let arc=0;arc<4;arc++){
   const z0=(arc-1.5)*2.7,shift=(r()-.5)*13;
   for(let i=0;i<14;i++){
    if(r()<.13)continue;
    const point=(j,s)=>{const x=(j-7)*4.4+shift;
     return [x,.05+.07*Math.sin(j*.65+arc),z0+Math.cos(j*.21)*2+Math.sin(j*.93+arc)*.63+s*(.27+.18*Math.sin(j*.45+arc))];};
    const q=[point(i,-1),point(i+1,-1),point(i+1,1),point(i,1)];
    m.face(q,[p(0,0),p(1,0),p(1,1),p(0,1)],Y);
   }
  }
 },
 driftwood(m,u,r){
  const a=[0,.49,-3.48],b=[.17,.55,3.38];
  tube(m,u('deadwood'),a,b,.48,.24,9);
  for(const [x,y,z,xx,yy,zz] of [[.11,.65,-2.1,1.33,.97,-1.1],[-.05,.64,-.4,-1.26,1.26,.47],[.06,.61,.93,1.23,.91,1.55],
   [.12,.64,1.64,-.71,.87,2.35]]){
   tube(m,u('bark'),[x,y,z],[xx,yy,zz],.24,.093,7);
  }
  for(let i=0;i<5;i++){
   const a=TAU*i/5;
   tube(m,u('bark'),[Math.cos(a)*.19,.56+Math.sin(a)*.19,-2.91],[Math.cos(a)*.79,.53+Math.sin(a)*.48,-3.73],.18,.05,6);
  }
 },
 pandanus(m,u,r){
  const tips=[[-1.12,3.22,-.73],[.82,3.68,.68],[.53,3.34,-1.08]];
  tube(m,u('bark'),[0,0,0],[0,2.65,.1],.36,.25,9);
  for(let i=0;i<6;i++){
   const a=i*TAU/6;
   tube(m,u('bark'),[Math.cos(a)*1.25,0,Math.sin(a)*1.25],[.08,1.56,.12],.14,.10,6);
  }
  for(const tip of tips){
   tube(m,u('bark'),[0,2.45,.10],tip,.22,.12,7);
   for(let j=0;j<9;j++)frond(m,u(j%3?'leaf':'newLeaf'),tip,randAngle(j),1.38+r()*.8,.14+r()*.09,.63,.97,4);
  }
 },
 cycad(m,u,r){
  tube(m,u('bark'),[0,0,0],[.07,1.55,0],.29,.24,9);
  for(let j=0;j<18;j++){
   const a=randAngle(j);
   frond(m,u(j%5?'needle':'newLeaf'),[.07,1.55,0],a,1.08+r()*.57,.17,.63,.35,5);
  }
 },
 'beach-creepers'(m,u,r){
  for(let i=0;i<20;i++){
   const x=(r()-.5)*7,z=(r()-.5)*5,a=randAngle(i);
   frond(m,u('leaf'),[x,.09,z],a,.80,.31,.15,.12,3);
   if(i%3===0)oval(m,u('petal'),[x,.19,z],.17,.13,.17,2,6);
  }
 },
 'ryukyu-pine'(m,u,r){
  const rows=[[0,.57,.60,0],[2.7,.43,.46,.16],[5.5,.34,.36,.79],[8.8,.24,.25,1.6],[10.8,.14,.15,2.08]];
  sectionY(m,u('bark'),0,0,rows,10);
  for(let i=0;i<9;i++){
   const a=randAngle(i),y=5.3+i*.72,l=4.5-i*.28+r()*.7,x=Math.cos(a)*l,z=Math.sin(a)*l-y*.17;
   tube(m,u('bark'),[0,y-1,-y*.15],[x,y,z],.24,.065,7);
   oval(m,u(i%3?'needle':'leaf'),[x,y+.38,z],1.44+r(),.84+r()*.44,1.6+r()*.49,3,9);
  }
 },
 'bamboo-clump'(m,u,r){
  for(let j=0;j<13;j++){
   const a=randAngle(j),d=.29*Math.sqrt(j),x=d*Math.cos(a),z=d*Math.sin(a),h=5+r()*3.8;
   const mid=[x*1.65,h*.52,z*1.54],tip=[x*2.25,h,z*2.1];
   tube(m,u('newLeaf'),[x,0,z],mid,.078,.071,6,{capB:false});
   tube(m,u('leaf'),mid,tip,.071,.032,6,{capA:false});
   for(let k=0;k<2;k++){
    const t=.57+.22*k,p=[x*(1+t),h*t,z*(1+t)];
    frond(m,u(k?'newLeaf':'leaf'),p,a+k*1.3,1.20+r()*.38,.14,.25,.47,3);
   }
  }
 },
 banyan(m,u,r){
  sectionY(m,u('bark'),0,0,[[0,.87,.77,0],[1.7,.67,.65,.02],[4.2,.58,.59,0],[7.2,.46,.42,0]],12);
  for(let i=0;i<9;i++){
   const a=randAngle(i),l=2.8+r()*3.2,x=Math.cos(a)*l,z=Math.sin(a)*l,y=6.2+r()*2.1;
   tube(m,u('bark'),[0,3.8+i*.16,0],[x,y,z],.38,.13,7);
   if(i%2===0)tube(m,u('bark'),[x*.93,0,z*.90],[x,y-.36,z],.11,.07,6);
   oval(m,u(i%4?'leaf':'newLeaf'),[x,y+.30,z],2.25+r()*.74,1.48+r()*.92,2.12+r()*.84,4,10);
  }
  oval(m,u('leaf'),[0,8.91,0],3.44,2.4,3.02,4,12);
 },
 'sugarcane-patch'(m,u,r){
  for(let j=0;j<5;j++)for(let k=0;k<7;k++){
   const x=(j-2)*1.74+(r()-.5)*.29,z=(k-3)*2.56,h=1.9+r()*.65;
   tube(m,u('newLeaf'),[x,0,z],[x+.13,h,z-.18],.055,.037,4,{capA:false});
   for(const s of [-1,1])frond(m,u(s===1?'leaf':'newLeaf'),[x+.13,h*.9,z-.18],s*Math.PI*.42+r()*.6,.71,.105,.29,.42,2);
  }
 },
 'sweet-potato-beds'(m,u,r){
  for(let i=0;i<8;i++){
   const x=(i-3.5)*2.8;
   const p=[[0,-13],[.19,-12],[.37,-10],[.37,10],[.20,12],[0,13]];
   prismatic(m,u(i%3?'soil':'greenSoil'),p,x-.93,x+.93);
   for(let k=0;k<7;k++){
    const z=(k-3)*3.3+(r()-.5)*.6;
    oval(m,u('leaf'),[x,.44,z],.78+r()*.18,.29+r()*.18,1.21,2,8);
   }
  }
 },
 'rice-paddy'(m,u,r){
  patch(m,u('lagoon'),0,.09,0,22,30);
  for(const x of [-11.3,11.3])block(m,u('soil'),[x,.18,0],[.70,.36,31.3]);
  for(const z of [-15.35,15.35])block(m,u('greenSoil'),[0,.16,z],[22.4,.32,.64]);
  for(let i=0;i<8;i++)for(let j=0;j<8;j++){
   const x=(i-3.5)*2.64,z=(j-3.5)*3.57,h=.25+r()*.30;
   frond(m,u('newLeaf'),[x,.10,z],i*.54,.45,.14,h,0,1);
  }
 },
 'turtleback-tomb'(m,u,r){
  block(m,u('stone'),[0,.21,0],[10.2,.42,7.6]);
  block(m,u('stone'),[0,1.24,-.49],[6.5,2.4,5.1]);
  dome(m,u('chalk'),[0,2.25,-.56],[3.43,1.78,2.92],{rings:8,sides:24});
  block(m,u('chalk'),[0,2.22,2.03],[5.32,.53,.34]);
  block(m,u('dark'),[0,1.09,2.13],[1.17,1.47,.10]);
  for(const s of [-1,1])for(let j=0;j<5;j++)rock(m,u('stone'),[s*(3.15+j*.36),.35,2.12+j*.31],[.48,.91-j*.10,.61],r,6);
 },
 'utaki-grove'(m,u,r){
  boulderRow(m,u('stone'),r,-4.3,-2.74,9,1.02);
  for(const s of [-1,1])for(let i=0;i<4;i++)rock(m,u('chalk'),[s*4.2,0,-1.8+i*1.16],[.69,.87+r()*.35,.79],r,6);
  rock(m,u('stone'),[0,0,-.93],[1.40,1.28,.89],r,9);
  for(const s of [-1,1]){
   const x=s*3.08,z=-2.6;
   tube(m,u('bark'),[x,0,z],[x+s*.16,3.7,z],.27,.16,7);
   oval(m,u('leaf'),[x,3.64,z],2.01,1.76,1.79,3,10);
  }
 },
 'stone-well'(m,u,r){
  for(let i=0;i<16;i++){
   const a=TAU*i/16;
   rock(m,u(i%3?'stone':'chalk'),[1.33*Math.cos(a),0,1.33*Math.sin(a)],[.39,.71+r()*.18,.39],r,6);
  }
  tube(m,u('dark'),[0,.04,0],[0,.07,0],1.10,1.10,18,{capA:false});
  for(const x of [-1.67,1.67])block(m,u('timber'),[x,1.24,0],[.20,2.48,.24]);
  beam(m,u('timber'),[-1.84,2.42,0],[1.84,2.42,0],.19);
  tube(m,u('bark'),[0,1.99,0],[0,.76,.03],.046,.043,7);
 },
 'fishing-jetty'(m,u,r){
  for(let i=0;i<13;i++){
   const z=(i-6)*1.56;
   block(m,u('timber'),[0,1.44+(r()-.5)*.10,z],[3.31,.18,1.44]);
   if(i%3===0)for(const x of [-1.24,1.24])tube(m,u('bark'),[x,0,z],[x,1.72,z],.16,.135,8);
  }
  for(const x of [-.83,.83])beam(m,u('deadwood'),[x,1.29,-10.10],[x,1.29,10.10],.19);
  for(const x of [-1.5,1.5])tube(m,u('timber'),[x,1.50,9.4],[x,2.06,9.4],.17,.145,8);
 },
 sabani(m,u,r){
  const rs=[[-3.45,.038,.18,.19],[-2.80,.39,.27,.16],[-1.7,.62,.28,.12],[.2,.69,.29,.10],
   [1.72,.57,.31,.14],[2.86,.29,.34,.23],[3.45,.039,.24,.37]];
  loft(m,rs,16,u('timber'),{cut:(_,j)=>j>=8});
  // Longitudinal rails, open thwarts and wooden interior floor.
  for(let i=1;i<rs.length;i++)for(const s of [-1,1]){
   const [z,x,,y]=rs[i-1],[zz,xx,,yy]=rs[i];
   beam(m,u('deadwood'),[s*x,y,z],[s*xx,yy,zz],.071,.095);
  }
  for(const z of [-1.78,-.52,.82,1.93])block(m,u('timber'),[0,.137,z],[z>1.8?1.05:1.18,.069,.25]);
  block(m,u('timber'),[0,-.05,0],[.64,.082,4.4]);
 },
 tern(m,u,r){
  birdBody(m,u,false);
 },
 egret(m,u,r){
  birdBody(m,u,true);
 },
 dolphin(m,u,r){
  loft(m,[[-1.31,.029,.035,0],[-1.00,.08,.09,.035],[-.64,.16,.16,.081],[-.21,.249,.252,.091],
   [.29,.246,.251,.083],[.65,.19,.181,.063],[.93,.122,.106,.036],[1.30,.051,.045,.022]],20,u('dolphin'));
  const f=u('dolphin');
  finPair(m,f,[[0,.28,-.45],[0,.63,-.39],[0,.34,.12]],X);
  for(const s of [-1,1]){
   finPair(m,f,[[s*.19,-.035,.41],[s*.47,-.25,-.06],[s*.22,-.15,-.26]],Y);
   finPair(m,f,[[0,.022,-1.05],[s*.44,0,-1.30],[s*.19,.002,-1.45],[0,0,-1.38]],Y);
  }
 },
};
function finPair(m,u,p,n){
 const tex=p.map((_,i)=>u(i%2,Math.floor(i/2)));
 for(const s of [1,-1])m.face(p,tex,scale(n,s));
}
function birdBody(m,u,egret){
 const rs=egret?[[-.30,.019,.018,.06],[-.17,.059,.055,.04],[.04,.079,.079,.04],[.19,.051,.064,.07],[.30,.026,.036,.13]]:
  [[-.115,.015,.017,0],[-.065,.037,.034,0],[.037,.045,.044,0],[.088,.034,.034,.009],[.132,.019,.025,.012]];
 loft(m,rs,12,u('white'));
 const z=egret?.30:.132,y=egret?.13:.012;
 tube(m,u(egret?'newLeaf':'dark'),[0,y,z],[0,y-.006,z+(egret?.11:.038)],egret?.018:.012,.004,8);
 if(egret)for(const s of [-1,1])tube(m,u('dark'),[s*.017,.01,-.13],[s*.028,-.031,-.33],.0065,.004,5);
 else oval(m,u('dark'),[0,.026,.10],.026,.020,.028,3,10);
}
function wings(m,u,egret,s){
 const tip=egret?.50:.264;
 const p=[[0,.0,.037],[tip*.42,.032,.057],[tip*.76,.02,.015],[tip,.004,-.055],
  [tip*.66,.002,-.064],[tip*.41,-.008,-.049],[.006,0,-.037]].map(([x,y,z])=>[s*x,y,z]);
 finPair(m,u('white'),p,Y);
 const t=p.slice(2,5);
 finPair(m,u(egret?'white':'dark'),t.map(([x,y,z])=>[x,y+.001,z]),Y);
}
function raw(spec){
 const atlas=new Atlas(512,seed,palette),uv=atlas.uv.bind(atlas),body=new Mesh(),rnd=random(spec.id);
 shapes[spec.shape](body,uv,rnd);
 const parts=[{name:spec.label,mesh:body}];
 if(spec.shape==='tern'||spec.shape==='egret'){
  for(const [s,side] of [[-1,'Left'],[1,'Right']]){
   const mesh=new Mesh(),translation=[s*(spec.shape==='egret'?.052:.032),spec.shape==='egret'?.075:.019,0];
   wings(mesh,uv,spec.shape==='egret',s);
   parts.push({name:'Wing'+side,mesh,translation});
  }
 }
 return {atlas,parts};
}
function normalize(parts,spec){
 const low=[Infinity,Infinity,Infinity],high=low.map(v=>-v);
 for(const p of parts)for(let i=0;i<p.mesh.positions.length;i++){
  const k=i%3,x=p.mesh.positions[i]+(p.translation?.[k]??0);
  low[k]=Math.min(low[k],x);high[k]=Math.max(high[k],x);
 }
 const ratio=spec.size.map((v,k)=>v/(high[k]-low[k]));
 const center=low.map((v,k)=>k===1?v:(v+high[k])*.5);
 const keel=spec.draft??0;
 for(const p of parts){
  const original=p.translation;
  if(original)p.translation=original.map((v,k)=>(v-center[k])*ratio[k]-(k===1?keel:0));
  for(let i=0;i<p.mesh.positions.length;i++){
   const k=i%3;
   p.mesh.positions[i]=(p.mesh.positions[i]-(original?0:center[k]))*ratio[k]-(k===1&&!original?keel:0);
  }
  for(let i=0;i<p.mesh.normals.length;i+=3){
   const n=unit(p.mesh.normals.slice(i,i+3).map((v,k)=>v/ratio[k]));
   p.mesh.normals.splice(i,3,...n);
  }
 }
 return parts;
}
function create(spec, output){
 const {atlas,parts}=raw(spec),dimensions={width:spec.size[0],height:spec.size[1],length:spec.size[2],...(spec.draft?{draft:spec.draft}:{})};
 const extras={title:spec.title,author:'Torpedo-Bomber project',license:'project-own (original mesh and paint)',
  source:spec.refs[0][1],changes:'Original seeded low-poly geometry and baked hand-authored albedo for Okinawa scenery.',
  units:'metres',dimensions,sources:spec.refs.map(r=>r[1]),...(spec.draft?{markers:[]}:{})};
 const scene=new Scene(extras,atlas);scene.material('Okinawa albedo',{roughness:.86,metallic:.02});
 const root=scene.node(spec.id,null,{extras:{class:spec.draft?'ship':'scenery',scenery:spec.shape}});
 for(const p of normalize(parts,spec))scene.node(p.name,root,p);
 scene.write(output);
}
function template(spec){return normalize(raw(spec).parts,spec);}
function atlasPng(){return new Atlas(512,seed,palette).png();}
module.exports={create,template,atlasPng,seed};
