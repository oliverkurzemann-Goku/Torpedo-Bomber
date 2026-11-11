'use strict';
const {Mesh,X,Y,Z,TAU,block,beam,tube,loft,unit,sub,scale,cross}=require('./mesh.cjs');
const {letters,crossMark}=require('./atlas.cjs');

function absorb(target,part,map=p=>p,norm=n=>n){
 const off=target.positions.length/3;
 for(let i=0;i<part.positions.length;i+=3){
  target.positions.push(...map(part.positions.slice(i,i+3)));
  target.normals.push(...norm(part.normals.slice(i,i+3)));
 }
 target.uv.push(...part.uv);
 target.indices.push(...part.indices.map(i=>i+off));
 return target;
}
function sectionY(mesh,uv,x,z,rows,count=24,options={}){
 return absorb(mesh,loft(new Mesh(),rows,count,uv,options),([a,b,c])=>[a+x,c,z-b],([a,b,c])=>[a,c,-b]);
}
function prismatic(mesh,uv,outline,left,right){
 const n=outline.length;
 for(const [x,sign] of [[left,-1],[right,1]]){
  const ps=outline.map(([y,z])=>[x,y,z]);
  const ys=ps.map(p=>p[1]),zs=ps.map(p=>p[2]),yl=Math.min(...ys),zl=Math.min(...zs);
  const dy=Math.max(...ys)-yl,dz=Math.max(...zs)-zl;
  mesh.face(ps,ps.map(([,y,z])=>uv(sign>0?(z-zl)/dz:1-(z-zl)/dz,1-(y-yl)/dy)),[sign,0,0]);
 }
 const middle=outline.reduce((q,[y,z])=>[q[0]+y/n,q[1]+z/n],[0,0]);
 for(let i=0;i<n;i++){
  const a=outline[i],b=outline[(i+1)%n];
  let normal=unit([0,b[1]-a[1],a[0]-b[0]]);
  if(normal[1]*((a[0]+b[0])/2-middle[0])+normal[2]*((a[1]+b[1])/2-middle[1])<0)normal=scale(normal,-1);
  mesh.face([[left,...a],[left,...b],[right,...b],[right,...a]],
    [[0,0],[0,1],[1,1],[1,0]].map(([x,y])=>uv(x,y)),normal);
 }
 return mesh;
}

function wheels(mesh,uv,x,y,z,r,width,{count=20,hub=true,paint='steel',tyre='rubber'}={}){
 const s=Math.sign(x)||1,p=x+s*width/2;
 tube(mesh,uv(tyre),[x-width/2,y,z],[x+width/2,y,z],r,r,count);
 if(hub){
  tube(mesh,uv(paint),[p,y,z],[p+s*.026,y,z],r*.72,r*.67,count,{capA:false});
  tube(mesh,uv('dark'),[p+s*.025,y,z],[p+s*.057,y,z],r*.26,r*.23,12,{capA:false});
 }
 return mesh;
}

function track(mesh,uv,x,w,back,front,r,y){
 const end=[];
 for(let i=0;i<=10;i++){
  const a=i*Math.PI/10;
  end.push([y+r*Math.cos(a),front+r*Math.sin(a)]);
 }
 for(let i=0;i<=10;i++){
  const a=Math.PI+i*Math.PI/10;
  end.push([y+r*Math.cos(a),back+r*Math.sin(a)]);
 }
 const inner=end.map(([y0,z])=>[y+(y0-y)*.845,Math.min(front,Math.max(back,z))+(z-Math.min(front,Math.max(back,z)))*.845]);
 const edge=(p,a)=>[x+a*w/2,...p];
 const n=end.length;
 for(let i=0;i<n;i++){
  const j=(i+1)%n,d=end[i],e=end[j],a=inner[i],b=inner[j];
  const dy=e[0]-d[0],dz=e[1]-d[1],n0=unit([0,dz,-dy]);
  const u=i/n,v=(i+1)/n;
  for(const [a,b,s] of [[d,e,1],[inner[i],inner[j],-1]]){
   mesh.face([edge(a,-1),edge(b,-1),edge(b,1),edge(a,1)],
    [uv(u,0),uv(v,0),uv(v,1),uv(u,1)],scale(n0,s));
  }
  for(const s of [-1,1]){
   mesh.face([edge(d,s),edge(e,s),edge(b,s),edge(a,s)],[uv(u,0),uv(v,0),uv(v,1),uv(u,1)],[s,0,0]);
  }
 }
 return mesh;
}
function dome(mesh,uv,center,radii,{rings=8,sides=24,lower=0,angle=Math.PI/2}={}){
 const [a,b,c]=radii;
 const p=(u,v)=>{
  const t=lower+(angle-lower)*v,w=TAU*u,co=Math.cos(t),si=Math.sin(t);
  const xyz=[a*co*Math.cos(w),b*si,c*co*Math.sin(w)];
  return {p:xyz.map((v,i)=>v+center[i]),n:unit([xyz[0]/(a*a),xyz[1]/(b*b),xyz[2]/(c*c)]),uv:uv(u,v)};
 };
 for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){
  const q=[p(j/sides,i/rings),p((j+1)/sides,i/rings),p((j+1)/sides,(i+1)/rings),p(j/sides,(i+1)/rings)];
  if(i===rings-1&&Math.abs(angle-Math.PI/2)<1e-8)q.pop();
  mesh.face(q.map(o=>o.p),q.map(o=>o.uv),q.map(o=>o.n));
 }
 return mesh;
}
function wreckNode(scene,parent,mesh,name='Wreck'){
 return scene.node(name,parent,{mesh,scale:[0,0,0],extras:{role:'Wreck',visible:false}});
}
function panelNumber(text,u,v,x,y,w,h,ink=14){
 return letters(text,u,v,x,y,w,h)?ink:undefined;
}
function insigniaStar(u,v,cx,cy,rx,ry){
 const x=(u-cx)/rx,y=(v-cy)/ry;
 if(x*x+y*y>1)return;
 const vertices=Array.from({length:10},(_,i)=>{
  const a=i*Math.PI/5,r=i%2?.382:.94;return [r*Math.sin(a),-r*Math.cos(a)];
 });
 let inside=false;
 for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
  const [a,b]=vertices[i],[c,d]=vertices[j];
  if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
 }
 return inside?14:13;
}
module.exports={absorb,sectionY,prismatic,wheels,track,dome,wreckNode,panelNumber,insigniaStar,crossMark};
