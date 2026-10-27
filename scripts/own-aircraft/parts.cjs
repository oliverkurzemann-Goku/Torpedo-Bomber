'use strict';
// Parametric airframe parts. Every dimension comes from the shape table (metres, contract frame);
// atlas regions are [u0,v0,u1,v1] in 0..1 texture space.
const G=require('./geometry.cjs');
const {Surface,table,section,airfoil,chordSamples,sub,add,norm,scale,cross,dot,lerp,clamp}=G;
const TAU=Math.PI*2;
const mapUV=(r,a,b)=>[lerp(r[0],r[2],clamp(a,0,1)),lerp(r[1],r[3],clamp(b,0,1))];

function samples(a,b,step,extra=[]){const n=Math.max(2,Math.ceil(Math.abs(b-a)/step)+1),out=[];for(let k=0;k<n;k++)out.push(lerp(a,b,k/(n-1)));return [...new Set([...out,...extra.filter(v=>v>a&&v<b)])].sort((x,y)=>x-y);}

// Lofted body of superellipse sections: fuselage, cowling, canopy fairings.
function body(name,spec,region,{ring=48,step=.04,capFront=true,capRear=true}={}){
  const st=[...spec.stations].sort((a,b)=>a.z-b.z),f=table(st,'z',['top','bottom','half','wide','nTop','nBot']);
  const z0=st[0].z,z1=st[st.length-1].z,zs=samples(z0,z1,step,st.map(s=>s.z)),rows=[];
  for(const z of zs){const row=[];for(let k=0;k<ring;k++){const [x,y]=section(f.top(z),f.bottom(z),Math.max(1e-4,f.half(z)),f.wide(z),f.nTop(z),f.nBot(z),TAU*k/ring);row.push([x,y,z]);}rows.push(row);}
  const s=new Surface(name);
  s.grid(rows,{closed:true,uvFn:(r,c)=>mapUV(region,c/ring,(z1-zs[r])/(z1-z0))});
  s.orient(0,p=>sub(p,[0,f.wide(p[2]),p[2]]));
  if(capFront&&f.half(z1)>.005){const t=s.triangles();s.cap(rows[rows.length-1],[0,0,1],mapUV(region,.25,0));}
  if(capRear&&f.half(z0)>.005)s.cap(rows[0],[0,0,-1],mapUV(region,.25,1));
  return {surface:s,f};
}

// Wing, tailplane (spanAxis 'x', mirrored) or fin (spanAxis 'y'). Stations: {s, le, te, t, y|x,
// twist}. Controls cut the trailing edge between span positions from..to aft of chord fraction h.
function liftingSurface(name,spec,regions){
  const fin=spec.spanAxis==='y',st=[...spec.stations].sort((a,b)=>a.s-b.s);
  const keys=['le','te','t',fin?'x':'y','twist'].filter(k=>st.every(s=>s[k]!==undefined));
  const f=table(st,'s',keys),cs=chordSamples(spec.points||22),camber=spec.camber||0;
  const sMin=st[0].s,sMax=st[st.length-1].s,controls=spec.controls||[],hg=spec.hingeGap??.004;
  const zr=[Math.min(...st.map(s=>s.te)),Math.max(...st.map(s=>s.le))];
  const point=(side,s,c,off)=>{
    const le=f.le(s),te=f.te(s),chord=le-te,tw=(f.twist?f.twist(s):0)*Math.PI/180;
    let a=-(c-.25)*chord,b=off*chord;const ca=Math.cos(tw),sa=Math.sin(tw);[a,b]=[a*ca-b*sa,a*sa+b*ca];const z=le-.25*chord+a;
    return fin?[(f.x?f.x(s):0)+b,s,z]:[side*s,f.y(s)+b,z];
  };
  const uvFor=(side,upper,p)=>{const r=regions[fin?(upper?'R':'L'):(side<0?'L':'R')+(upper?'U':'D')];// fin: 'upper' offsets lie on +X
    const sv=fin?p[1]:Math.abs(p[0]);return mapUV(r,(sv-sMin)/(sMax-sMin),(zr[1]-p[2])/(zr[1]-zr[0]));};
  const hOf=(c,s)=>c.hAt?c.hAt(s):c.h;// chord fraction of the hinge line at span s
  const breaks=controls.flatMap(c=>[c.from,c.to,...(c.breaks||[])]);
  const regular=samples(sMin,sMax,spec.step||.08,[...breaks,...(spec.spanSamples||[])]);
  const span=[];for(const s of regular){if(breaks.includes(s)){span.push({s,before:true},{s,before:false});}else span.push({s});}
  const hingeAt=(s,before)=>{let h=1;for(const c of controls){const inside=before===undefined?s>c.from&&s<c.to:before?(s>c.from&&s<=c.to):(s>=c.from&&s<c.to);if(inside)h=Math.min(h,hOf(c,s));}return h;};
  const sides=fin?[1]:spec.mirror===false?[1]:[-1,1],fixed=new Surface(name),parts=[];
  for(const side of sides){
    const up=[],dn=[],wall=[];
    for(const {s,before} of span){const h=hingeAt(s,before),U=[],D=[];
      for(const c0 of cs){const c=Math.min(c0,h),[yu,yl]=airfoil(c,f.t(s),camber);U.push(point(side,s,c,yu));D.push(point(side,s,c,yl));}
      up.push(U);dn.push(D);wall.push([U[U.length-1],D[D.length-1]]);}
    let t0=fixed.triangles();fixed.grid(up,{uvFn:(r,c)=>uvFor(side,true,up[r][c])});fixed.orient(t0,()=>fin?[1,0,0]:[0,1,0]);
    t0=fixed.triangles();fixed.grid(dn,{uvFn:(r,c)=>uvFor(side,false,dn[r][c])});fixed.orient(t0,()=>fin?[-1,0,0]:[0,-1,0]);
    t0=fixed.triangles();fixed.grid(wall,{uvFn:(r,c)=>uvFor(side,true,wall[r][0])});fixed.orient(t0,()=>[0,0,-1]);// one atlas region: a wall spanning upper and lower regions would paint across both
    const tipU=up[up.length-1],tipD=dn[dn.length-1];t0=fixed.triangles();
    fixed.grid([tipU,tipD.map((p,k)=>{const q=tipU[k];return [(p[0]+q[0])/2,(p[1]+q[1])/2,(p[2]+q[2])/2];})],{uvFn:(r,c)=>uvFor(side,true,tipU[c])});
    fixed.grid([tipD.map((p,k)=>{const q=tipU[k];return [(p[0]+q[0])/2,(p[1]+q[1])/2,(p[2]+q[2])/2];}),tipD],{uvFn:(r,c)=>uvFor(side,false,tipD[c])});
    fixed.orient(t0,()=>fin?[0,1,0]:[side,0,0]);
    for(const ctl of controls){
      const ov=spec.controlOverlap||0,ss=samples(ctl.from+(ctl.gap??.012),ctl.to-(ctl.gap??.012),spec.step||.08,ctl.breaks||[]),c0=chordSamples(Math.max(6,Math.round((spec.points||22)*(1-(ctl.hAt?.3:ctl.h)))));
      const ccAt=s=>{const h=hOf(ctl,s);return [...(ov?[Math.max(0,h-ov)]:[]),...c0.map(c=>h+c*(1-h))];};
      const hinge=s=>{const h=hOf(ctl,s),[yu,yl]=airfoil(h,f.t(s),camber);return point(side,s,h+hg,(yu+yl)/2);};
      const [sa,sb]=ctl.axisSpan||[ss[0],ss[ss.length-1]],a=hinge(sa),b=hinge(sb),pivot=scale(add(a,b),.5);let axis=norm(sub(b,a));if((fin?axis[1]:axis[0])<0)axis=scale(axis,-1);
      const U=[],D=[],W=[];
      for(const s of ss){const u=[],d=[],h=hOf(ctl,s);for(const c of ccAt(s)){const [yu,yl]=airfoil(c,f.t(s),camber),k=c<h?.9:1,m=(yu+yl)/2;u.push(point(side,s,c+hg,m+(yu-m)*k));d.push(point(side,s,c+hg,m+(yl-m)*k));}U.push(u);D.push(d);W.push([u[0],d[0]]);}
      const surf=new Surface(ctl.name+'Skin'),rel=p=>sub(p,pivot);
      let k=0;surf.grid(U,{uvFn:(r,c)=>uvFor(side,true,U[r][c])});surf.orient(k,()=>fin?[1,0,0]:[0,1,0]);
      k=surf.triangles();surf.grid(D,{uvFn:(r,c)=>uvFor(side,false,D[r][c])});surf.orient(k,()=>fin?[-1,0,0]:[0,-1,0]);
      k=surf.triangles();surf.grid(W,{uvFn:(r,c)=>uvFor(side,true,W[r][0])});surf.orient(k,()=>[0,0,1]);
      for(const [row,dir] of [[0,-1],[ss.length-1,1]]){const ring=[...U[row],...[...D[row]].reverse()];k=surf.triangles();surf.cap(ring,fin?[0,dir,0]:[side*dir,0,0],uvFor(side,true,U[row][0]));}
      surf.transform(rel);
      parts.push({name:ctl.name.replace('%',side<0?'Left':'Right'),surface:surf.clean(),pivot,axis,side,ctl});
    }
  }
  return {surface:fixed.clean(),parts,f,point};
}

// Surface of revolution about an axis through `origin` (axis 'x' or 'z'); profile [[a, r], ...].
function lathe(name,profile,{axis='z',origin=[0,0,0],ring=32,region=null,capStart=false,capEnd=false}={}){
  const rows=profile.map(([a,r])=>Array.from({length:ring},(_,k)=>{const t=TAU*k/ring,c=Math.cos(t)*r,s=Math.sin(t)*r;
    return axis==='z'?[origin[0]+s,origin[1]+c,origin[2]+a]:[origin[0]+a,origin[1]+c,origin[2]+s];}));
  const S=new Surface(name),total=profile.length-1;
  S.grid(rows,{closed:true,uvFn:(r,c)=>region?mapUV(region,c/ring,r/total):[0,0]});
  S.orient(0,p=>axis==='z'?[p[0]-origin[0],p[1]-origin[1],0]:[0,p[1]-origin[1],p[2]-origin[2]]);
  const dir=axis==='z'?[0,0,1]:[1,0,0];
  if(capStart&&profile[0][1]>1e-4)S.cap(rows[0],scale(dir,-Math.sign(profile[total][0]-profile[0][0])),region?mapUV(region,.5,0):[0,0]);
  if(capEnd&&profile[total][1]>1e-4)S.cap(rows[total],scale(dir,Math.sign(profile[total][0]-profile[0][0])),region?mapUV(region,.5,1):[0,0]);
  return S.clean();
}
// Oriented box between two points (thickness w across, d deep), flat uv.
function bar(name,a,b,w,d,up=[0,1,0]){
  const axis=norm(sub(b,a));let side=cross(axis,up);if(G.len(side)<1e-6)side=cross(axis,[1,0,0]);side=norm(side);const n=norm(cross(side,axis));
  const S=new Surface(name),c=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>add(scale(side,i*w/2),scale(n,j*d/2)));
  const ra=c.map(o=>add(a,o)),rb=c.map(o=>add(b,o));S.grid([ra,rb],{closed:true});S.orient(0,p=>{const t=dot(sub(p,a),axis);return sub(p,add(a,scale(axis,t)));});
  S.cap(ra,scale(axis,-1));S.cap(rb,axis);return S.clean();
}
function cylinder(name,a,b,r1,r2,ring=14){
  const axis=norm(sub(b,a)),L=G.len(sub(b,a));let u=cross(axis,[0,1,0]);if(G.len(u)<1e-6)u=cross(axis,[1,0,0]);u=norm(u);const v=norm(cross(axis,u));
  const rowAt=(p,r)=>Array.from({length:ring},(_,k)=>{const t=TAU*k/ring;return add(p,add(scale(u,Math.cos(t)*r),scale(v,Math.sin(t)*r)));});
  const S=new Surface(name),A=rowAt(a,r1),B=rowAt(b,r2);S.grid([A,B],{closed:true});S.orient(0,p=>{const t=dot(sub(p,a),axis);return sub(p,add(a,scale(axis,t)));});
  S.cap(A,scale(axis,-1));S.cap(B,axis);return S.clean();
}
// Half ellipsoid blister sitting on a surface: centre c, radii rx, ry (up), rz.
function blister(name,c,rx,ry,rz,ring=16,stacks=7){
  const rows=[];for(let i=0;i<=stacks;i++){const a=-Math.PI/2+Math.PI*i/stacks,zc=Math.sin(a)*rz,rr=Math.cos(a);rows.push(Array.from({length:ring},(_,k)=>{const t=Math.PI*k/(ring-1);return [c[0]+Math.cos(t)*rx*rr,c[1]+Math.sin(t)*ry*rr,c[2]+zc];}));}
  const S=new Surface(name);S.grid(rows);S.orient(0,p=>sub(p,c));return S.clean();
}

// Three (or n) paddle blades in the plane z = 0 of the rotor node; radius stations {r, chord, t, pitch}.
function blades(name,spec){
  const S=new Surface(name),st=spec.stations,cs=chordSamples(12);
  for(let b=0;b<spec.blades;b++){
    const rot=TAU*b/spec.blades,rad=[Math.sin(rot),Math.cos(rot),0],tan=[Math.cos(rot),-Math.sin(rot),0],U=[],D=[];
    for(const s of st){const p=s.pitch*Math.PI/180,dChord=add(scale(tan,Math.cos(p)),[0,0,-Math.sin(p)]),dThick=norm(cross(dChord,rad));const u=[],d=[];
      for(const c of cs){const [yu,yl]=airfoil(c,s.t);const base=add(scale(rad,s.r),scale(dChord,(c-.4)*s.chord));u.push(add(base,scale(dThick,yu*s.chord)));d.push(add(base,scale(dThick,yl*s.chord)));}
      U.push(u);D.push(d);}
    const mid=st[Math.floor(st.length/2)],pm=mid.pitch*Math.PI/180,thick=norm(cross(add(scale(tan,Math.cos(pm)),[0,0,-Math.sin(pm)]),rad));
    let k=S.triangles();S.grid(U);S.orient(k,()=>thick);
    k=S.triangles();S.grid(D);S.orient(k,()=>scale(thick,-1));
    k=S.triangles();S.cap([...U[U.length-1],...[...D[D.length-1]].reverse()],rad);
  }
  return S.clean();
}

module.exports={samples,body,liftingSurface,lathe,bar,cylinder,blister,blades,mapUV};
