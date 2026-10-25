'use strict';
// Geometry kit for code-built aircraft in the rig-contract frame: metres, X span, +Y up, +Z nose.
// Everything is deterministic; shapes come from station tables measured on reference drawings.

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l];},scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const lerp=(a,b,t)=>a+(b-a)*t,clamp=(v,a,b)=>v<a?a:v>b?b:v;

// A mesh under construction. uv are atlas coordinates (0..1, v down) or null for flat materials.
class Surface{
  constructor(name){this.name=name;this.p=[];this.uv=[];this.i=[];this.crease=Math.cos(55*Math.PI/180);}
  vertex(p,uv=[0,0]){this.p.push(p[0],p[1],p[2]);this.uv.push(uv[0],uv[1]);return this.p.length/3-1;}
  tri(a,b,c){this.i.push(a,b,c);}
  quad(a,b,c,d){this.i.push(a,b,c,a,c,d);}
  append(o){const base=this.p.length/3;this.p.push(...o.p);this.uv.push(...o.uv);for(const k of o.i)this.i.push(k+base);return this;}
  transform(fn){for(let k=0;k<this.p.length;k+=3){const q=fn([this.p[k],this.p[k+1],this.p[k+2]]);this.p[k]=q[0];this.p[k+1]=q[1];this.p[k+2]=q[2];}return this;}
  // Grid of rows (each an equal-length point list). closed: wrap each row. uvFn(row,col) -> uv.
  grid(rows,{closed=false,uvFn=()=>[0,0],flip=false}={}){
    const n=rows[0].length,cols=closed?n+1:n,base=this.p.length/3;
    rows.forEach((row,r)=>{for(let c=0;c<cols;c++)this.vertex(row[c%n],uvFn(r,c));});
    for(let r=0;r<rows.length-1;r++)for(let c=0;c<cols-1;c++){
      const a=base+r*cols+c,b=a+1,d=a+cols,e=d+1;flip?this.quad(a,d,e,b):this.quad(a,b,e,d);
    }
    return this;
  }
  // Fan cap over a closed point ring; normal side chosen by `toward` (expected outward direction).
  cap(ring,toward,uv=[0,0]){
    const c=ring.reduce((s,p)=>add(s,p),[0,0,0]).map(v=>v/ring.length),ci=this.vertex(c,uv),ids=ring.map(p=>this.vertex(p,uv));
    for(let k=0;k<ring.length;k++){const a=ids[k],b=ids[(k+1)%ring.length],nrm=cross(sub(ring[k],c),sub(ring[(k+1)%ring.length],c));dot(nrm,toward)>=0?this.tri(ci,a,b):this.tri(ci,b,a);}
    return this;
  }
  // Drop zero-area triangles left by collapsed sections.
  clean(){const keep=[];for(let k=0;k<this.i.length;k+=3){const a=this.i[k]*3,b=this.i[k+1]*3,c=this.i[k+2]*3;
      const A=[this.p[a],this.p[a+1],this.p[a+2]],B=[this.p[b],this.p[b+1],this.p[b+2]],C=[this.p[c],this.p[c+1],this.p[c+2]];
      if(len(cross(sub(B,A),sub(C,A)))>1e-10)keep.push(this.i[k],this.i[k+1],this.i[k+2]);}
    // compact: drop vertices no triangle uses any more
    const map=new Map(),p=[],uv=[];this.i=keep.map(j=>{if(!map.has(j)){map.set(j,p.length/3);p.push(this.p[j*3],this.p[j*3+1],this.p[j*3+2]);uv.push(this.uv[j*2],this.uv[j*2+1]);}return map.get(j);});
    this.p=p;this.uv=uv;return this;}
  // Per-vertex tangents (xyz + handedness) from uv gradients, for normal-mapped materials.
  tangents(normals){
    const n=this.p.length/3,t=new Float64Array(n*3),b=new Float64Array(n*3),out=new Float32Array(n*4);
    for(let k=0;k<this.i.length;k+=3){const [i0,i1,i2]=[this.i[k],this.i[k+1],this.i[k+2]],P=[i0,i1,i2].map(j=>[this.p[j*3],this.p[j*3+1],this.p[j*3+2]]),T=[i0,i1,i2].map(j=>[this.uv[j*2],this.uv[j*2+1]]);
      const e1=sub(P[1],P[0]),e2=sub(P[2],P[0]),du1=T[1][0]-T[0][0],dv1=T[1][1]-T[0][1],du2=T[2][0]-T[0][0],dv2=T[2][1]-T[0][1],d=du1*dv2-du2*dv1;if(Math.abs(d)<1e-14)continue;const r=1/d;
      const sd=[(e1[0]*dv2-e2[0]*dv1)*r,(e1[1]*dv2-e2[1]*dv1)*r,(e1[2]*dv2-e2[2]*dv1)*r],td=[(e2[0]*du1-e1[0]*du2)*r,(e2[1]*du1-e1[1]*du2)*r,(e2[2]*du1-e1[2]*du2)*r];
      for(const j of [i0,i1,i2])for(let c=0;c<3;c++){t[j*3+c]+=sd[c];b[j*3+c]+=td[c];}}
    for(let j=0;j<n;j++){const N=[normals[j*3],normals[j*3+1],normals[j*3+2]];let T=[t[j*3],t[j*3+1],t[j*3+2]];T=sub(T,scale(N,dot(N,T)));
      if(len(T)<1e-9){const a=Math.abs(N[0])<.9?[1,0,0]:[0,1,0];T=sub(a,scale(N,dot(N,a)));}T=norm(T);const w=dot(cross(N,T),[b[j*3],b[j*3+1],b[j*3+2]])<0?-1:1;
      out[j*4]=T[0];out[j*4+1]=T[1];out[j*4+2]=T[2];out[j*4+3]=w;}
    return out;
  }
  // Smooth normals across shared positions, but keep creases sharper than ~55 degrees.
  normals(){
    const n=this.p.length/3,face=new Float64Array(n*3),key=new Map(),groups=[];
    for(let k=0;k<this.i.length;k+=3){const ids=[this.i[k],this.i[k+1],this.i[k+2]],P=ids.map(j=>[this.p[j*3],this.p[j*3+1],this.p[j*3+2]]),f=cross(sub(P[1],P[0]),sub(P[2],P[0]));
      for(const j of ids){face[j*3]+=f[0];face[j*3+1]+=f[1];face[j*3+2]+=f[2];}}
    for(let j=0;j<n;j++){const h=`${Math.round(this.p[j*3]*1e5)},${Math.round(this.p[j*3+1]*1e5)},${Math.round(this.p[j*3+2]*1e5)}`;if(!key.has(h)){key.set(h,groups.length);groups.push([]);}groups[key.get(h)].push(j);}
    const out=new Float32Array(n*3);
    for(const g of groups)for(const j of g){const own=norm([face[j*3],face[j*3+1],face[j*3+2]]);let s=[0,0,0];
      for(const o of g){const other=[face[o*3],face[o*3+1],face[o*3+2]];if(dot(own,norm(other))>=this.crease)s=add(s,other);}
      const r=norm(s);out[j*3]=r[0];out[j*3+1]=r[1];out[j*3+2]=r[2];}
    return out;
  }
  // Flip every triangle from `from` on whose normal disagrees with dirFn(centroid) on balance.
  orient(from,dirFn){let score=0;
    for(let k=from*3;k<this.i.length;k+=3){const P=[0,1,2].map(o=>{const j=this.i[k+o]*3;return [this.p[j],this.p[j+1],this.p[j+2]];});const f=cross(sub(P[1],P[0]),sub(P[2],P[0]));score+=dot(f,dirFn(scale(add(add(P[0],P[1]),P[2]),1/3)));}
    if(score<0)for(let k=from*3;k<this.i.length;k+=3){const t=this.i[k+1];this.i[k+1]=this.i[k+2];this.i[k+2]=t;}
    return this;}
  triangles(){return this.i.length/3;}
}

// Monotone cubic interpolation of a station table key over z (or any ordered parameter).
function interpolator(xs,ys){
  const n=xs.length,d=[],m=new Array(n);
  for(let k=0;k<n-1;k++)d.push((ys[k+1]-ys[k])/(xs[k+1]-xs[k]));
  m[0]=d[0];m[n-1]=d[n-2];for(let k=1;k<n-1;k++)m[k]=d[k-1]*d[k]<=0?0:(d[k-1]+d[k])/2;
  for(let k=0;k<n-1;k++){if(d[k]===0){m[k]=m[k+1]=0;continue;}const a=m[k]/d[k],b=m[k+1]/d[k],h=a*a+b*b;if(h>9){const t=3/Math.sqrt(h);m[k]=t*a*d[k];m[k+1]=t*b*d[k];}}
  return x=>{if(x<=xs[0])return ys[0];if(x>=xs[n-1])return ys[n-1];let k=0;while(x>xs[k+1])k++;
    const h=xs[k+1]-xs[k],t=(x-xs[k])/h,t2=t*t,t3=t2*t;return (2*t3-3*t2+1)*ys[k]+(t3-2*t2+t)*h*m[k]+(-2*t3+3*t2)*ys[k+1]+(t3-t2)*h*m[k+1];};
}
function table(stations,param,keys){const xs=stations.map(s=>s[param]),f={};for(const k of keys)f[k]=interpolator(xs,stations.map(s=>s[k]));return f;}

// Fuselage cross-section: separate superellipse halves above and below the widest line.
// theta 0 = top centre, increasing towards -X (left) first, so the ring is wound for +Z lofting.
function section(top,bottom,half,wide,nTop,nBot,theta){
  const c=Math.cos(theta),s=Math.sin(theta),up=c>=0,n=up?nTop:nBot,ex=2/n;
  const x=-half*Math.sign(s)*Math.pow(Math.abs(s),ex),y=wide+(up?top-wide:wide-bottom)*Math.sign(c)*Math.pow(Math.abs(c),ex);
  return [x,y];
}

// NACA 4-digit style section: chord fraction c (0 LE .. 1 TE) -> upper/lower offsets per chord.
function airfoil(c,t,camber=0,pos=.4){
  const yt=5*t*(.2969*Math.sqrt(c)-.126*c-.3516*c*c+.2843*c**3-.1036*c**4);
  const yc=camber?(c<pos?camber/(pos*pos)*(2*pos*c-c*c):camber/((1-pos)**2)*(1-2*pos+2*pos*c-c*c)):0;
  return [yc+yt,yc-yt];
}
// Cosine-spaced chord fractions, LE dense.
function chordSamples(n){return Array.from({length:n},(_,k)=>(1-Math.cos(Math.PI*k/(n-1)))/2);}

module.exports={sub,add,cross,dot,len,norm,scale,lerp,clamp,Surface,interpolator,table,section,airfoil,chordSamples};
