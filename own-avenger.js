/* Own TBM-3 Avenger: an original, fully procedural model written for this repository.
 * Built only from published overall dimensions and general WWII reference photographs.
 * No geometry, texture or UV is taken from any third-party model file.
 *
 *   const plane = OwnAvenger.create(THREE, {scheme:'museum', torpedo:true, crew:true});
 *   scene.add(plane.root); plane.set({gear:1, flaps:0, hook:0, fold:0, bay:0, cowl:0});
 *   plane.spin(dt, 1);  // propeller
 *
 * Frame: metres, nose toward -Z, up +Y, right wing +X. The origin sits on the thrust line,
 * 3.5 m behind the spinner tip (close to the wing's quarter chord).
 * Reference data: span 16.51 m, length 12.48 m, height 5.00 m (level attitude; 4.70 m is
 * also quoted), wing area 45.5 m²,
 * folded width 5.8 m, three-blade Hamilton Standard propeller of 13 ft (3.96 m),
 * Wright R-2600 two-row, 14-cylinder radial; Mk 13 torpedo 4.09 m x 0.569 m.
 */
(function(global){
'use strict';
const SPEC={span:16.51,length:12.48,height:5.00,wingArea:45.52,foldedWidth:5.8,propDiameter:3.96};
const Z0=3.5;
const zs=s=>s-Z0;
const FOLD_X=2.63,HALF_SPAN=SPEC.span/2,PROP_R=SPEC.propDiameter/2;
// Wartime US Navy finishes (approximate non-specular colours) plus a museum restoration.
const SCHEMES={
  navy42:{upper:'#3f4c5a',lower:'#878b88',number:'#dddbd2',code:'T-10',model:'TBF-1',bars:false,label:'1942 Non-specular Blue-Gray / Light Gray'},
  tricolor:{upper:'#232f40',side:'#384759',lower:'#a9aaa3',number:'#dddbd2',code:null,model:'TBM-1C',bars:true,label:'1943-44 Tri-color (Sea Blue / Intermediate Blue / White)'},
  museum:{upper:'#626a6e',lower:'#999c98',number:'#17191b',code:null,model:'TBM-3',bars:false,label:'Museum grey (TBM-3 restoration)'}
};

function pchip(xs,ys){
  const n=xs.length,h=[],d=[],m=new Array(n);
  for(let i=0;i<n-1;i++){h[i]=xs[i+1]-xs[i];d[i]=(ys[i+1]-ys[i])/h[i];}
  m[0]=d[0];m[n-1]=d[n-2];
  for(let i=1;i<n-1;i++){
    if(d[i-1]*d[i]<=0)m[i]=0;
    else{const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i]);}
  }
  return x=>{
    if(x<=xs[0])return ys[0];if(x>=xs[n-1])return ys[n-1];
    let i=0;while(x>xs[i+1])i++;
    const t=(x-xs[i])/h[i],t2=t*t,t3=t2*t;
    return (2*t3-3*t2+1)*ys[i]+(t3-2*t2+t)*h[i]*m[i]+(-2*t3+3*t2)*ys[i+1]+(t3-t2)*h[i]*m[i+1];
  };
}
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>t*t*(3-2*t);
const sp=(v,n)=>Math.sign(v)*Math.pow(Math.abs(v),2/n);
// NACA 4-digit section with a closed trailing edge, cosine spaced, x from LE (0) to TE (1).
function naca(t,m,p,N){
  const up=[],lo=[];
  for(let i=0;i<=N;i++){
    const x=(1-Math.cos(Math.PI*i/N))/2;
    const yt=5*t*(0.2969*Math.sqrt(x)-0.126*x-0.3516*x*x+0.2843*x*x*x-0.1036*x*x*x*x);
    let yc=0,dy=0;
    if(m>0){if(x<p){yc=m/(p*p)*(2*p*x-x*x);dy=2*m/(p*p)*(p-x);}else{yc=m/((1-p)*(1-p))*((1-2*p)+2*p*x-x*x);dy=2*m/((1-p)*(1-p))*(p-x);}}
    const th=Math.atan(dy);
    up.push([x-yt*Math.sin(th),yc+yt*Math.cos(th)]);lo.push([x+yt*Math.sin(th),yc-yt*Math.cos(th)]);
  }
  return {up,lo};
}
const nearestLower=(af,f)=>{let best=af.lo[0];for(const q of af.lo)if(Math.abs(q[0]-f)<Math.abs(best[0]-f))best=q;return best;};

function create(THREE,opts={}){
  const T=THREE;
  const scheme=SCHEMES[opts.scheme]||SCHEMES.navy42;
  const owned={geometries:[],materials:[],textures:[]};
  const geo=g=>(owned.geometries.push(g),g);
  const srgb=hex=>{const c=new T.Color(hex);if(opts.srgbOutput!==false)c.convertSRGBToLinear();return c;};
  const mat=o=>{const m=new T.MeshStandardMaterial(o);owned.materials.push(m);return m;};
  const makeCanvas=(w,h)=>{
    if(opts.createCanvas)return opts.createCanvas(w,h);
    if(typeof document==='undefined')return null;
    const c=document.createElement('canvas');c.width=w;c.height=h;return c;
  };
  const tex=canvas=>{
    if(!canvas)return null;
    const t=new T.CanvasTexture(canvas);t.encoding=T.sRGBEncoding;t.anisotropy=opts.anisotropy||4;
    owned.textures.push(t);return t;
  };

  // ---------- geometry builders ----------
  function build(P,U,I){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(P,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(U,2));
    g.setIndex(I);g.computeVertexNormals();return geo(g);
  }
  // Grid of rings. Winding is chosen so faces point away from each ring's centroid,
  // which is outward for tubes, airfoils, half-shells and blades alike.
  function gridSurface(rows,uv,{closed=false,skip=null,inward=false,seam=false}={}){
    const P=[],U=[],I=[],R=rows.length,C=rows[0].length;
    for(let i=0;i<R;i++)for(let j=0;j<C;j++){const p=rows[i][j];P.push(p[0],p[1],p[2]);const q=uv(i,j,p);U.push(q[0],q[1]);}
    const cent=rows.map(r=>{let x=0,y=0,z=0;for(const p of r){x+=p[0];y+=p[1];z+=p[2];}return [x/r.length,y/r.length,z/r.length];});
    let score=0;
    for(let i=0;i<R-1;i++)for(let j=0;j<C-1+(closed?1:0);j++){
      if(skip&&skip(i,j))continue;
      const j1=(j+1)%C,a=i*C+j,b=i*C+j1,c=(i+1)*C+j,d=(i+1)*C+j1;
      I.push(a,b,c,b,d,c);
      const pa=rows[i][j],pb=rows[i][j1],pc=rows[i+1][j];
      const ux=pb[0]-pa[0],uy=pb[1]-pa[1],uz=pb[2]-pa[2],vx=pc[0]-pa[0],vy=pc[1]-pa[1],vz=pc[2]-pa[2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,o=cent[i];
      score+=nx*(pa[0]-o[0])+ny*(pa[1]-o[1])+nz*(pa[2]-o[2]);
    }
    if((score<0)!==inward)for(let k=0;k<I.length;k+=3){const t=I[k+1];I[k+1]=I[k+2];I[k+2]=t;}
    const g=build(P,U,I);
    if(seam){ // weld normals of the duplicated first/last ring column
      const n=g.attributes.normal;
      for(let i=0;i<R;i++){const a=i*C,b=i*C+C-1;const x=n.getX(a)+n.getX(b),y=n.getY(a)+n.getY(b),z=n.getZ(a)+n.getZ(b),l=Math.hypot(x,y,z)||1;n.setXYZ(a,x/l,y/l,z/l);n.setXYZ(b,x/l,y/l,z/l);}
    }
    return g;
  }
  // Revolve [[station,radius],...] around the thrust line; u follows the profile's arc length.
  function revolve(profile,seg){
    const rows=profile.map(([s,r])=>{const ring=[];for(let k=0;k<=seg;k++){const a=2*Math.PI*k/seg;ring.push([Math.sin(a)*r,Math.cos(a)*r,zs(s)]);}return ring;});
    const arc=[0];for(let i=1;i<profile.length;i++)arc.push(arc[i-1]+Math.hypot(profile[i][0]-profile[i-1][0],profile[i][1]-profile[i-1][1]));
    return gridSurface(rows,(i,j)=>[arc[i]/arc[arc.length-1],j/seg],{seam:true});
  }
  // Flat fan cap facing `out`.
  function capFrom(ring,uvFn,out){
    const P=[],U=[],I=[];let cx=0,cy=0,cz=0;for(const p of ring){cx+=p[0];cy+=p[1];cz+=p[2];}
    cx/=ring.length;cy/=ring.length;cz/=ring.length;P.push(cx,cy,cz);U.push(...uvFn([cx,cy,cz]));
    ring.forEach(p=>{P.push(...p);U.push(...uvFn(p));});
    let nx=0,ny=0,nz=0;
    for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];nx+=(a[1]-b[1])*(a[2]+b[2]);ny+=(a[2]-b[2])*(a[0]+b[0]);nz+=(a[0]-b[0])*(a[1]+b[1]);}
    const flip=nx*out[0]+ny*out[1]+nz*out[2]<0;
    for(let i=1;i<ring.length;i++)flip?I.push(0,i+1,i):I.push(0,i,i+1);
    return build(P,U,I);
  }
  function cylinderBetween(a,b,r,seg=8,r2=r){
    const g=geo(new T.CylinderGeometry(r2,r,1,seg,1,false));
    const A=new T.Vector3(...a),B=new T.Vector3(...b),d=B.clone().sub(A),len=d.length();
    const m=new T.Matrix4().makeScale(1,len,1);
    m.premultiply(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize())));
    m.premultiply(new T.Matrix4().makeTranslation(...A.add(B).multiplyScalar(.5).toArray()));
    g.applyMatrix4(m);return g;
  }
  function boxAt(w,h,d,x,y,z,rx=0,ry=0,rz=0){
    const g=geo(new T.BoxGeometry(w,h,d));
    g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(rx,ry,rz)));
    g.translate(x,y,z);return g;
  }
  function sphereAt(r,x,y,z,ws=16,hs=12,thS=0,thL=Math.PI){
    const g=geo(new T.SphereGeometry(r,ws,hs,0,Math.PI*2,thS,thL));g.translate(x,y,z);return g;
  }
  function mirrorX(g){
    const c=geo(g.clone());c.scale(-1,1,1);
    const idx=c.index.array;for(let i=0;i<idx.length;i+=3){const t=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=t;}
    c.index.needsUpdate=true;c.computeVertexNormals();return c;
  }
  function merge(list){
    const P=[],N=[],U=[],I=[];let off=0;
    for(const g of list){
      const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;
      for(let i=0;i<p.count;i++){P.push(p.getX(i),p.getY(i),p.getZ(i));N.push(n.getX(i),n.getY(i),n.getZ(i));U.push(u?u.getX(i):0,u?u.getY(i):0);}
      if(g.index)for(const i of g.index.array)I.push(i+off);else for(let i=0;i<p.count;i++)I.push(i+off);
      off+=p.count;
    }
    const m=new T.BufferGeometry();
    m.setAttribute('position',new T.Float32BufferAttribute(P,3));
    m.setAttribute('normal',new T.Float32BufferAttribute(N,3));
    m.setAttribute('uv',new T.Float32BufferAttribute(U,2));
    m.setIndex(I);return geo(m);
  }
  function mesh(g,m,name){const o=new T.Mesh(g,m);o.name=name||'';o.castShadow=true;o.receiveShadow=true;return o;}

  // ---------- fuselage ----------
  const S=[1.80,2.20,2.80,3.40,4.20,5.40,6.40,6.95,7.35,8.20,9.20,10.30,11.30,12.00,12.30];
  const F={
    hw:pchip(S,[.76,.78,.80,.81,.81,.80,.78,.74,.70,.62,.52,.40,.27,.15,.05]),
    top:pchip(S,[.76,.78,.78,.80,.82,.82,.84,.86,.84,.78,.70,.60,.50,.40,.28]),
    bot:pchip(S,[.76,.90,1.18,1.25,1.28,1.28,1.18,1.08,.76,.64,.55,.44,.32,.20,.08]),
    yc:pchip(S,[0,0,0,0,0,0,0,0,0,.02,.06,.12,.20,.30,.36]),
    nT:pchip(S,[2,2.1,2.3,2.4,2.4,2.4,2.4,2.4,2.3,2.2,2.1,2.1,2,2,2]),
    nB:pchip(S,[2,2.2,2.5,2.9,3.2,3.2,3.1,3.0,2.6,2.3,2.2,2.1,2,2,2])
  };
  const RING=48;
  function fusPoint(s,k){
    const a=2*Math.PI*k/RING,sn=Math.sin(a),cs=Math.cos(a),top=cs>=0,n=top?F.nT(s):F.nB(s);
    return [F.hw(s)*sp(sn,n),F.yc(s)+(top?F.top(s):F.bot(s))*sp(cs,n),zs(s)];
  }
  const fusTop=s=>F.yc(s)+F.top(s),fusBot=s=>F.yc(s)-F.bot(s);
  const BAY=[2.80,6.90],DOOR_K=4;
  const FUS_S=[];for(let s=1.80;s<12.30-1e-6;s+=0.1)FUS_S.push(+s.toFixed(3));FUS_S.push(12.30);
  function ringRow(s){
    const pts=[];for(let k=0;k<=RING;k++)pts.push(fusPoint(s,k%RING));
    const acc=[0];for(let k=1;k<pts.length;k++)acc.push(acc[k-1]+Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1]));
    return {pts,acc,per:acc[acc.length-1]};
  }
  const FUS_U=[1.80,12.30],fusU=s=>(s-FUS_U[0])/(FUS_U[1]-FUS_U[0]);
  const fusRows=FUS_S.map(ringRow);
  const inBay=s=>s>=BAY[0]-1e-6&&s<=BAY[1]+1e-6;

  // ---------- wing ----------
  const ROOT_LE=zs(2.55),ROOT_C=3.55,FOLD_C=3.30,TIP_X=7.70,TIP_C=1.80,ROOT_Y=-0.22;
  function wingAt(x){
    x=Math.abs(x);
    const yFold=ROOT_Y+FOLD_X*Math.tan(.5*Math.PI/180);
    if(x<=FOLD_X){const t=x/FOLD_X;return {le:ROOT_LE+.02*t,c:lerp(ROOT_C,FOLD_C,t),y:ROOT_Y+x*Math.tan(.5*Math.PI/180)};}
    const y=yFold+(x-FOLD_X)*Math.tan(6.5*Math.PI/180);
    const le0=ROOT_LE+.02+(Math.min(x,TIP_X)-FOLD_X)*0.07;
    if(x<=TIP_X){const t=(x-FOLD_X)/(TIP_X-FOLD_X);return {le:le0,c:lerp(FOLD_C,TIP_C,t),y};}
    const e=clamp((x-TIP_X)/(HALF_SPAN-TIP_X),0,1),k=Math.sqrt(Math.max(0,1-e*e)),mid=le0+TIP_C*.40;
    return {le:mid-(mid-le0)*k,c:Math.max(.02,TIP_C*k),y};
  }
  const wingThick=x=>lerp(.155,.095,clamp(Math.abs(x)/HALF_SPAN,0,1));
  const AF_N=22;
  function wingRows(x0,x1,steps,tipRound){
    const xs=[];for(let i=0;i<=steps;i++){const t=i/steps;xs.push(tipRound?x0+(x1-x0)*Math.sin(t*Math.PI/2):lerp(x0,x1,t));}
    return xs.map(x=>{
      const w=wingAt(x),af=naca(wingThick(x),.02,.4,AF_N),tw=-(x/HALF_SPAN)*1.5*Math.PI/180,ring=[];
      const put=([cx,cy])=>{const zc=cx*w.c,yc=cy*w.c;ring.push([x,w.y+zc*Math.sin(tw)+yc*Math.cos(tw),w.le+zc*Math.cos(tw)-yc*Math.sin(tw)]);};
      for(let i=AF_N;i>=0;i--)put(af.lo[i]);for(let i=1;i<=AF_N;i++)put(af.up[i]);
      return ring;
    });
  }
  // Wing textures: u spanwise (|x|), v chordwise; lower surface in v 0-.5, upper in .5-1.
  const WTW=2048,WTH=1024,W_ZMIN=-1.05,W_ZMAX=2.75,W_U=8.40;
  const wingUV=(x,z,upper)=>[Math.abs(x)/W_U,(upper?.5:0)+.5*clamp((z-W_ZMIN)/(W_ZMAX-W_ZMIN),0,1)];
  const wingPx=(x,z,upper)=>{const [u,v]=wingUV(x,z,upper);return [u*WTW,(1-v)*WTH];};
  function wingGeo(x0,x1,steps,tipRound){
    const rows=wingRows(x0,x1,steps,tipRound);
    return {g:gridSurface(rows,(i,j,p)=>wingUV(p[0],p[2],j>AF_N)),rows};
  }

  // ---------- tail ----------
  const STAB_Y=0.50,STAB_HALF=2.90,STAB_ROOT_LE=zs(10.55);
  function stabAt(x){
    x=Math.abs(x);const sweep=.17;
    if(x<=2.45)return {le:STAB_ROOT_LE+x*sweep,c:lerp(1.92,1.20,x/2.45),y:STAB_Y};
    const e=clamp((x-2.45)/(STAB_HALF-2.45),0,1),k=Math.sqrt(Math.max(0,1-e*e)),le0=STAB_ROOT_LE+2.45*sweep,mid=le0+1.20*.45;
    return {le:mid-(mid-le0)*k,c:Math.max(.02,1.20*k),y:STAB_Y};
  }
  const FIN_Y0=0.40,FIN_TOP=2.93,fy=y=>FIN_Y0+(y-FIN_Y0)*(FIN_TOP-FIN_Y0)/2.48;
  const finLE=pchip([0.40,0.62,0.85,1.10,2.30,2.62,2.80,2.88].map(fy),[zs(9.10),zs(10.05),zs(10.55),zs(10.82),zs(11.30),zs(11.55),zs(11.85),zs(12.05)]);
  const finTE=pchip([0.40,1.00,2.20,2.55,2.78,2.88].map(fy),[zs(12.48),zs(12.48),zs(12.42),zs(12.34),zs(12.20),zs(12.06)]);
  // Tail texture: left half = fin (top quarter right side, bottom quarter left side); right half = stab (top upper, bottom lower).
  const TTW=2048,TTH=1024,FIN_ZMIN=zs(9.0),FIN_ZR=3.6,FIN_YR=3.0,STAB_ZMIN=zs(10.4),STAB_ZR=2.3;
  const finPx=(z,y,left)=>[((z-FIN_ZMIN)/FIN_ZR)*(TTW/2),(left?TTH/2:0)+(1-clamp((y-0.3)/FIN_YR,0,1))*(TTH/2)];
  const stabPx=(x,z,upper)=>[TTW/2+Math.abs(x)/3.1*(TTW/2),(upper?0:TTH/2)+(1-clamp((z-STAB_ZMIN)/STAB_ZR,0,1))*(TTH/2)];
  const pxUV=([px,py])=>[px/TTW,1-py/TTH];

  // ---------- landing gear: outward-retracting legs, wheels turn flat inside the wing ----------
  const GEAR={attach:[0.85,-0.33,zs(3.30)],leg:1.36,r:.405,w:.21,splay:10*Math.PI/180};

  // ---------- livery ----------
  // Painted here on canvases: wartime US Navy non-specular finishes with original markings,
  // engraved seams and rivet rows, sun-faded upper paint, chipping, exhaust soot and oil.
  const rnd=seed=>{let x=seed;return ()=>((x=(x*16807)%2147483647)/2147483647);};
  const fade0=c=>c.replace(/[\d.]+\)$/,'0)');
  const SIDE=scheme.side||scheme.upper,CHIP='rgba(150,155,156,.8)',SOOT='rgba(36,31,27,A)';
  function star(ctx,r){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*0.382:r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();}
  // National insignia: blue disc with white star; from mid-1943 also white bars in a blue surround.
  function insignia(ctx,r){
    const blue='#1d2a47',white='#d9d7ce';
    if(scheme.bars){const b=r/8;ctx.fillStyle=blue;ctx.fillRect(-2*r-b,-r/4-b,4*r+2*b,r/2+2*b);ctx.beginPath();ctx.arc(0,0,r+b,0,Math.PI*2);ctx.fill();ctx.fillStyle=white;ctx.fillRect(-2*r,-r/4,4*r,r/2);}
    ctx.fillStyle=blue;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.fillStyle=white;star(ctx,r*0.98);ctx.fill();
  }
  // Own squadron-style badge (original artwork): torpedo and lightning bolt on a roundel.
  function badge(ctx,r){
    ctx.fillStyle='#c9a234';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#22385e';ctx.beginPath();ctx.arc(0,0,r*.86,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#dcd9cf';ctx.beginPath();ctx.ellipse(-r*.05,r*.18,r*.55,r*.11,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(r*.48,r*.18);ctx.lineTo(r*.66,r*.04);ctx.lineTo(r*.66,r*.32);ctx.closePath();ctx.fill();
    ctx.fillStyle='#c9a234';ctx.beginPath();ctx.moveTo(-r*.08,-r*.62);ctx.lineTo(r*.18,-r*.62);ctx.lineTo(r*.02,-r*.25);ctx.lineTo(r*.22,-r*.25);ctx.lineTo(-r*.18,r*.06);ctx.lineTo(-r*.02,-r*.20);ctx.lineTo(-r*.22,-r*.20);ctx.closePath();ctx.fill();
  }
  const path=(ctx,pts)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));};
  // Engraved seam: dark groove with a faint light lip on one side.
  function seam(ctx,pts,dark=.32){ctx.lineWidth=1.6;ctx.strokeStyle=`rgba(12,16,20,${dark})`;path(ctx,pts);ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.07)';path(ctx,pts.map(([x,y])=>[x+1.2,y+1.2]));ctx.stroke();}
  // Rivet heads evenly spaced along a polyline.
  function rivets(ctx,pts,step,alpha=.26){
    ctx.fillStyle=`rgba(14,18,22,${alpha})`;let carry=0;
    for(let i=1;i<pts.length;i++){const [x0,y0]=pts[i-1],[x1,y1]=pts[i],d=Math.hypot(x1-x0,y1-y0);let t=carry;
      while(t<d){ctx.fillRect(x0+(x1-x0)*t/d-.9,y0+(y1-y0)*t/d-.9,1.8,1.8);t+=step;}carry=t-d;}
  }
  // Irregular small flecks: paint chips down to bare metal, dirt specks.
  function flecks(ctx,r,x0,y0,w,h,n,color,size){
    ctx.fillStyle=color;
    for(let i=0;i<n;i++){const x=x0+r()*w,y=y0+r()*h,s=size*(.3+r()*r()*1.8),k=4+(r()*4|0);ctx.beginPath();
      for(let j=0;j<k;j++){const a=j/k*Math.PI*2+r()*.7,rr=s*(.45+r()*.7);ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr*(.55+r()*.6));}ctx.closePath();ctx.fill();}
  }
  // Soft blotches (fading, grime), stretched along the texture x axis.
  function blotches(ctx,r,x0,y0,w,h,n,color,rad,stretch=2){
    for(let i=0;i<n;i++){const x=x0+r()*w,y=y0+r()*h,rr=rad*(.4+r()),g=ctx.createRadialGradient(0,0,0,0,0,rr);
      g.addColorStop(0,color);g.addColorStop(1,fade0(color));ctx.save();ctx.translate(x,y);ctx.scale(1+r()*stretch,1);ctx.fillStyle=g;ctx.fillRect(-rr,-rr,2*rr,2*rr);ctx.restore();}
  }
  // Streaks blown along the airflow: dx,dy is the flow direction in texture pixels.
  function streaks(ctx,r,x0,y0,w,h,n,color,len,width,dx=1,dy=0){
    for(let i=0;i<n;i++){const x=x0+r()*w,y=y0+r()*h,l=len*(.3+r()*.7),wd=width*(.4+r()*1.1),ex=x+dx*l,ey=y+dy*l,nx=-dy*wd/2,ny=dx*wd/2;
      const g=ctx.createLinearGradient(x,y,ex,ey);g.addColorStop(0,color);g.addColorStop(1,fade0(color));ctx.fillStyle=g;
      ctx.beginPath();ctx.moveTo(x+nx,y+ny);ctx.lineTo(ex+nx*.4,ey+ny*.4);ctx.lineTo(ex-nx*.4,ey-ny*.4);ctx.lineTo(x-nx,y-ny);ctx.closePath();ctx.fill();}
  }
  // Flecks scattered along an edge polyline (leading edges, cowl lip).
  function edgeFlecks(ctx,r,pts,density,color,size,pad){
    for(let i=1;i<pts.length;i++){const [x0,y0]=pts[i-1],[x1,y1]=pts[i],n=Math.round(density*Math.hypot(x1-x0,y1-y0)/100);
      flecks(ctx,r,Math.min(x0,x1)-pad,Math.min(y0,y1)-pad,Math.abs(x1-x0)+2*pad,Math.abs(y1-y0)+2*pad,n,color,size);}
  }
  function tone(ctx,r,pts,amount){const d=r()-.5;ctx.fillStyle=d>0?`rgba(255,255,255,${d*amount*1.6})`:`rgba(0,0,0,${-d*amount*2})`;path(ctx,pts);ctx.closePath();ctx.fill();}
  const soot=a=>SOOT.replace('A',a);
  const FTW=2048,FTH=1024;
  // Draw in metres at station s and ring index k, readable from outside on either side.
  function onFuselage(ctx,s,k,draw){
    const r=ringRow(s),v=r.acc[k]/r.per,right=k<RING/2;
    ctx.save();ctx.translate(fusU(s)*FTW,(1-v)*FTH);
    ctx.scale((FTW/(FUS_U[1]-FUS_U[0]))*(right?-1:1),(FTH/r.per)*(right?-1:1));
    draw();ctx.restore();
  }
  function vAt(s,x,y){const rr=ringRow(s);let best=0,bd=Infinity;rr.pts.forEach((p,k)=>{const d=Math.hypot(p[0]-x,p[1]-y);if(d<bd){bd=d;best=k;}});return rr.acc[best]/rr.per;}
  const FRAMES=[1.86,2.42,3.02,3.55,4.30,5.12,5.80,6.42,7.02,7.58,8.20,8.84,9.46,10.05,10.62,11.12,11.62,12.05];
  const LAPS=[.07,.16,.25,.36,.45,.55,.64,.75,.84,.93];
  function demarcation(ctx,w,h,e){
    const g=ctx.createLinearGradient(0,h,0,0),soft=.014;
    g.addColorStop(0,scheme.upper);g.addColorStop(.09,SIDE);g.addColorStop(e-soft,SIDE);g.addColorStop(e+soft,scheme.lower);
    g.addColorStop(1-e-soft,scheme.lower);g.addColorStop(1-e+soft,SIDE);g.addColorStop(.91,SIDE);g.addColorStop(1,scheme.upper);
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  }
  function paintFuselage(){
    const c=makeCanvas(FTW,FTH);if(!c)return null;const ctx=c.getContext('2d'),r=rnd(11);
    const X=s=>fusU(s)*FTW,Y=v=>(1-v)*FTH;
    demarcation(ctx,FTW,FTH,.30);
    const bands=[0,...LAPS,1];
    for(let i=0;i<FRAMES.length-1;i++)for(let j=0;j<bands.length-1;j++){const x0=X(FRAMES[i]),x1=X(FRAMES[i+1]),y0=Y(bands[j]),y1=Y(bands[j+1]);tone(ctx,r,[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],.035);}
    // sun-faded, chalky upper paint and rain-washed streaks on the sides
    for(const [a,b] of [[0,.24],[.76,1]])blotches(ctx,r,0,Y(b),FTW,Y(a)-Y(b),90,'rgba(222,230,236,.05)',70,3);
    for(const [a,b] of [[.12,.28],[.72,.88]])streaks(ctx,r,X(2.0),Y(b),FTW-X(2.0),Y(a)-Y(b),50,'rgba(225,230,232,.03)',360,14);
    // seams, rivet rows, access panels
    for(const s of FRAMES){const x=X(s),step=.035*FTH/ringRow(s).per;seam(ctx,[[x,0],[x,FTH]]);rivets(ctx,[[x+4,0],[x+4,FTH]],step);}
    for(let i=0;i<FRAMES.length-1;i++){const s=(FRAMES[i]+FRAMES[i+1])/2,x=X(s);rivets(ctx,[[x,0],[x,FTH]],.04*FTH/ringRow(s).per,.15);}
    for(const v of LAPS){const y=Y(v);seam(ctx,[[X(1.86),y],[FTW,y]],.22);rivets(ctx,[[X(1.86),y+3],[FTW,y+3]],7,.2);}
    const hatch=(s0,s1,v0,v1,dark=.38)=>{const x0=X(s0),x1=X(s1),y0=Y(v1),y1=Y(v0);seam(ctx,[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]],dark);
      ctx.fillStyle='rgba(14,18,22,.42)';for(const [x,y] of [[x0+4,y0+4],[x1-4,y0+4],[x1-4,y1-4],[x0+4,y1-4],[(x0+x1)/2,y0+4],[(x0+x1)/2,y1-4]])ctx.fillRect(x-1.3,y-1.3,2.6,2.6);};
    for(const [a,b] of [[.17,.23],[.77,.83]])hatch(2.48,2.92,a,b);
    for(const [a,b] of [[.10,.16],[.84,.90]])hatch(7.66,8.02,a,b);
    for(const [a,b] of [[.37,.43],[.57,.63]])hatch(10.66,11.02,a,b);
    hatch(6.45,6.98,.26,.39,.5); // starboard entry door to the radio compartment
    ctx.strokeStyle='rgba(12,14,16,.62)';ctx.lineWidth=3;
    const bx0=X(BAY[0]),bx1=X(BAY[1]);
    for(const v of [.5-DOOR_K/RING,.5,.5+DOOR_K/RING]){const y=Y(v);ctx.beginPath();ctx.moveTo(bx0,y);ctx.lineTo(bx1,y);ctx.stroke();}
    ctx.fillStyle='rgba(24,32,38,.94)';
    for(const v of [.42,.58]){const x=X(7.0);ctx.fillRect(x,Y(v)-FTH*.022,X(7.32)-x,FTH*.044);}
    ctx.fillStyle='rgba(16,18,20,.8)';for(const v of [.14,.86])ctx.fillRect(X(3.95),Y(v)-3,22,6); // hand holds
    // markings
    for(const k of [RING/4,3*RING/4]){
      const out=k<RING/2?-1:1;
      onFuselage(ctx,8.15,k,()=>insignia(ctx,scheme.bars?.44:.52));
      if(scheme.code)onFuselage(ctx,9.80,k,()=>{ctx.fillStyle=scheme.number;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 0.34px sans-serif';ctx.fillText(scheme.code,0,0);});
      onFuselage(ctx,10.95,k-out*2,()=>{ctx.fillStyle='rgba(20,22,24,.8)';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 0.07px sans-serif';ctx.fillText('U.S. NAVY',0,0);ctx.font='0.05px sans-serif';ctx.fillText(scheme.model,0,0.07);});
      onFuselage(ctx,2.75,k+out*3,()=>badge(ctx,.27));
    }
    // grime and oil under the belly, running aft from the engine and the bay doors
    blotches(ctx,r,X(1.9),Y(.62),FTW-X(1.9),Y(.38)-Y(.62),70,'rgba(38,36,30,.09)',60,3);
    streaks(ctx,r,X(1.85),Y(.55),X(2.3)-X(1.85),Y(.45)-Y(.55),26,'rgba(32,25,18,.32)',X(5.5)-X(1.9),4);
    streaks(ctx,r,X(2.8),Y(.5+DOOR_K/RING+.01),X(6.6)-X(2.8),Y(.5-DOOR_K/RING-.01)-Y(.5+DOOR_K/RING+.01),30,'rgba(30,26,20,.18)',260,5);
    // exhaust soot from the stacks on the lower cowl sides, fanning back along the fuselage
    const vEx=vAt(2.2,.70,-.50);
    for(const v of [vEx,1-vEx]){
      const y=Y(v),down=v<.5?1:-1;
      blotches(ctx,r,X(2.2),y-40,X(4.2)-X(2.2),80,26,soot(.07),46,3);
      streaks(ctx,r,X(2.12),y-30,40,60,46,soot(.09),X(6.3)-X(2.2),46,1,down*.07);
      streaks(ctx,r,X(2.12),y-16,24,32,26,soot(.13),X(4.8)-X(2.2),22,1,down*.05);
      streaks(ctx,r,X(2.15),y-6,10,12,10,'rgba(150,145,136,.10)',X(4.0)-X(2.2),10,1,down*.03);
    }
    // chipped paint where crew and mechanics climb, sit and work
    for(const [a,b] of [[.075,.10],[.90,.925]])flecks(ctx,r,X(3.2),Y(b),X(6.3)-X(3.2),Y(a)-Y(b),150,CHIP,1.9);
    for(const [a,b] of [[0,.06],[.94,1]])flecks(ctx,r,X(6.3),Y(b),X(7.5)-X(6.3),Y(a)-Y(b),60,CHIP,1.6);
    for(const [a,b] of [[.19,.31],[.69,.81]]){flecks(ctx,r,X(3.0),Y(b),X(5.2)-X(3.0),Y(a)-Y(b),70,CHIP,1.6);blotches(ctx,r,X(3.0),Y(b),X(5.2)-X(3.0),Y(a)-Y(b),14,'rgba(40,36,30,.08)',40,1);}
    flecks(ctx,r,X(1.80),0,X(2.02)-X(1.80),FTH,160,CHIP,1.6);
    flecks(ctx,r,X(BAY[0]),Y(.5+DOOR_K/RING+.012),X(BAY[1])-X(BAY[0]),Y(.5-DOOR_K/RING-.012)-Y(.5+DOOR_K/RING+.012),220,CHIP,1.5);
    flecks(ctx,r,0,0,FTW,FTH,160,CHIP,1.0);
    return tex(c);
  }
  const RIBS=[.81,1.25,1.72,2.18,FOLD_X,3.10,3.62,4.15,4.70,5.25,5.80,6.40,7.00,7.55,8.05];
  function paintWing(left){
    const c=makeCanvas(WTW,WTH);if(!c)return null;const ctx=c.getContext('2d'),r=rnd(left?37:23);
    ctx.fillStyle=scheme.upper;ctx.fillRect(0,0,WTW,WTH/2);ctx.fillStyle=scheme.lower;ctx.fillRect(0,WTH/2,WTW,WTH/2);
    const pxU=WTW/W_U,pxV=(WTH/2)/(W_ZMAX-W_ZMIN);
    const P=(x,f,upper)=>{const w=wingAt(x);return wingPx(x,w.le+f*w.c,upper);};
    const quad=(x0,x1,f0,f1,upper)=>[P(x0,f0,upper),P(x1,f0,upper),P(x1,f1,upper),P(x0,f1,upper)];
    const span=(f,upper,x0=.81,x1=8.12)=>{const pts=[];for(let x=x0;x<=x1+1e-6;x+=.08)pts.push(P(x,f,upper));return pts;};
    const chord=(x,upper,f0=0,f1=1)=>{const pts=[];for(let f=f0;f<=f1+1e-6;f+=.05)pts.push(P(x,f,upper));return pts;};
    const CH=[0,.06,.25,.62,.76,1];
    for(const upper of [true,false])for(let i=0;i<RIBS.length-1;i++)for(let j=0;j<CH.length-1;j++)tone(ctx,r,quad(RIBS[i],RIBS[i+1],CH[j],CH[j+1],upper),.035);
    blotches(ctx,r,0,0,WTW,WTH/2,70,'rgba(222,230,236,.045)',70,2.5);
    streaks(ctx,r,0,WTH*.04,WTW,WTH*.42,50,'rgba(228,232,234,.025)',220,14,0,-1);
    for(const upper of [true,false]){
      RIBS.forEach((x,i)=>{const pts=chord(x,upper);if(i%2===0)seam(ctx,pts,.22);rivets(ctx,pts.map(([a,b])=>[a+3,b]),6,.24);});
      for(const f of [.06,.25,.62]){const pts=span(f,upper);seam(ctx,pts,.26);rivets(ctx,pts.map(([a,b])=>[a,b-3]),6,.22);rivets(ctx,pts.map(([a,b])=>[a,b+3]),6,.16);}
      ctx.strokeStyle='rgba(10,12,14,.6)';ctx.lineWidth=2.6;
      path(ctx,span(.74,upper,5.25,7.85));ctx.stroke();path(ctx,chord(5.25,upper,.74,1));ctx.stroke();path(ctx,chord(7.85,upper,.74,1));ctx.stroke();
      path(ctx,chord(FOLD_X,upper));ctx.stroke();
      if(!upper){path(ctx,span(.76,upper,.92,FOLD_X-.06));ctx.stroke();path(ctx,span(.76,upper,FOLD_X+.06,5.15));ctx.stroke();}
      // fabric-covered aileron: rib tapes
      ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=3;for(let x=5.45;x<7.8;x+=.26){path(ctx,chord(x,upper,.76,.99));ctx.stroke();}
      // leading-edge erosion and grime
      edgeFlecks(ctx,r,span(.02,upper,.9,8.1),30,CHIP,1.6,9);
      edgeFlecks(ctx,r,span(.01,upper,.9,8.1),10,'rgba(30,28,24,.18)',2.4,6);
    }
    // gun bay and ammunition doors on the outer panel, fuel filler on the centre section
    const panel=(x0,x1,f0,f1)=>{const q=quad(x0,x1,f0,f1,true);seam(ctx,[...q,q[0]],.42);ctx.fillStyle='rgba(14,18,22,.45)';for(const [x,y] of q)ctx.fillRect(x-1.4,y-1.4,2.8,2.8);};
    panel(3.22,3.70,.08,.36);panel(3.80,4.62,.10,.38);
    {const [fx,fy]=P(1.95,.40,true);streaks(ctx,r,fx-10,fy-4,20,8,8,'rgba(58,50,32,.22)',150,12,0,-1);
     ctx.strokeStyle='rgba(12,14,16,.7)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(fx,fy,.075*pxU,.075*pxV,0,0,Math.PI*2);ctx.stroke();
     ctx.fillStyle='rgba(120,120,112,.5)';ctx.beginPath();ctx.ellipse(fx,fy,.045*pxU,.045*pxV,0,0,Math.PI*2);ctx.fill();}
    // walkway at the root, scuffed by boots
    ctx.fillStyle='rgba(28,30,30,.86)';path(ctx,quad(.84,1.62,.14,.56,true));ctx.closePath();ctx.fill();
    {const q=quad(.84,1.62,.14,.56,true),xs=q.map(p=>p[0]),ys=q.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0;
     flecks(ctx,r,x0,y0,w,h,90,'rgba(70,72,70,.35)',1.6);flecks(ctx,r,x0-14,y0-14,w+40,h+28,80,CHIP,1.7);blotches(ctx,r,x0-10,y0-10,w+40,h+20,16,'rgba(34,32,28,.10)',50,1);}
    // lower surface: exhaust soot over the wing root and oil around the gear well
    {const [x0,y0]=P(.81,.02,false),[x1,y1]=P(1.55,.30,false);streaks(ctx,r,x0,y1,x1-x0,y0-y1,30,soot(.20),y1-P(.9,1,false)[1],30,0,-1);}
    {const [cx,cy]=wingPx(GEAR.attach[0]+GEAR.leg,GEAR.attach[2],false);
     ctx.fillStyle='rgba(20,22,20,.85)';ctx.beginPath();ctx.ellipse(cx,cy,(GEAR.r+.04)*pxU,(GEAR.r+.04)*pxV,0,0,Math.PI*2);ctx.fill();
     const [lx0,ly0]=wingPx(GEAR.attach[0]-.08,GEAR.attach[2]-.12,false),[lx1,ly1]=wingPx(GEAR.attach[0]+GEAR.leg-.25,GEAR.attach[2]+.12,false);ctx.fillRect(lx0,ly1,lx1-lx0,ly0-ly1);
     streaks(ctx,r,lx0,ly1-8,cx-lx0,30,16,'rgba(30,25,18,.26)',220,5,0,-1);}
    {const w=wingAt(3.35),[gx,gy]=wingPx(3.35,w.le+.02,true);ctx.fillStyle='#1a1c1d';ctx.beginPath();ctx.arc(gx,gy,6,0,Math.PI*2);ctx.fill();
     streaks(ctx,r,gx-6,gy-6,12,6,10,soot(.25),120,10,0,-1);}
    // US Navy practice: star on the upper left wing and the lower right wing.
    const upper=left,x=6.0,w=wingAt(x),[cx,cy]=wingPx(x,w.le+.46*w.c,upper),ri=Math.min(.66,w.c*.36)*(scheme.bars?.8:1);
    ctx.save();ctx.translate(cx,cy);ctx.scale(pxU,pxV);if(upper)ctx.rotate(Math.PI);insignia(ctx,ri);ctx.restore();
    flecks(ctx,r,cx-ri*pxU*2.2,cy-ri*pxV*1.2,ri*pxU*4.4,ri*pxV*2.4,40,CHIP,1.2);
    flecks(ctx,r,0,0,WTW,WTH,160,CHIP,1.0);
    return tex(c);
  }
  function paintTail(){
    const c=makeCanvas(TTW,TTH);if(!c)return null;const ctx=c.getContext('2d'),r=rnd(51);
    ctx.fillStyle=SIDE;ctx.fillRect(0,0,TTW/2,TTH);ctx.fillStyle=scheme.upper;ctx.fillRect(TTW/2,0,TTW/2,TTH/2);ctx.fillStyle=scheme.lower;ctx.fillRect(TTW/2,TTH/2,TTW/2,TTH/2);
    for(const left of [false,true])for(let y=FIN_Y0;y<FIN_TOP;y+=.42)for(const [f0,f1] of [[0,.3],[.3,.72],[.72,1]]){
      const q=[[f0,y],[f1,y],[f1,y+.42],[f0,y+.42]].map(([f,yy])=>finPx(lerp(finLE(yy),finTE(yy),f),yy,left));tone(ctx,r,q,.035);}
    blotches(ctx,r,0,0,TTW,TTH/2,40,'rgba(222,230,236,.07)',60,1.5);blotches(ctx,r,0,TTH/2,TTW/2,TTH/2,40,'rgba(222,230,236,.07)',60,1.5);
    for(const left of [false,true]){
      ctx.strokeStyle='rgba(10,12,14,.6)';ctx.lineWidth=2.6;ctx.beginPath();for(let y=FIN_Y0+.2;y<=FIN_TOP-.1;y+=.05){const z=lerp(finLE(y),finTE(y),.72),[px,py]=finPx(z,y,left);y===FIN_Y0+.2?ctx.moveTo(px,py):ctx.lineTo(px,py);}ctx.stroke();
      for(let y=FIN_Y0+.25;y<FIN_TOP-.1;y+=.22){const a=finPx(lerp(finLE(y),finTE(y),.74),y,left),b=finPx(finTE(y)-.03,y,left);ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=3;path(ctx,[a,b]);ctx.stroke();}
      for(let y=FIN_Y0+.3;y<FIN_TOP-.1;y+=.42){const pts=[];for(let f=0;f<=.7;f+=.05)pts.push(finPx(lerp(finLE(y),finTE(y),f),y,left));rivets(ctx,pts,6,.22);}
      for(const f of [.3]){const pts=[];for(let y=FIN_Y0;y<=FIN_TOP-.15;y+=.05)pts.push(finPx(lerp(finLE(y),finTE(y),f),y,left));seam(ctx,pts,.24);rivets(ctx,pts.map(([a,b])=>[a+3,b]),6,.2);}
      const le=[];for(let y=FIN_Y0+.1;y<=FIN_TOP-.1;y+=.1)le.push(finPx(finLE(y)+.02,y,left));
      edgeFlecks(ctx,r,le,40,CHIP,1.5,8);
    }
    for(const upper of [true,false]){
      ctx.strokeStyle='rgba(10,12,14,.6)';ctx.lineWidth=2.6;ctx.beginPath();for(let x=0;x<=STAB_HALF;x+=.05){const s=stabAt(x),[px,py]=stabPx(x,s.le+.70*s.c,upper);x?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();
      for(let x=.3;x<STAB_HALF-.15;x+=.28){const s=stabAt(x),a=stabPx(x,s.le+.73*s.c,upper),b=stabPx(x,s.le+.98*s.c,upper);ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=3;path(ctx,[a,b]);ctx.stroke();}
      for(let x=.2;x<STAB_HALF-.1;x+=.55){const s=stabAt(x),pts=[];for(let f=0;f<=.68;f+=.05)pts.push(stabPx(x,s.le+f*s.c,upper));rivets(ctx,pts,6,.22);}
      const le=[];for(let x=.1;x<=STAB_HALF-.1;x+=.1){const s=stabAt(x);le.push(stabPx(x,s.le+.02*s.c,upper));}
      edgeFlecks(ctx,r,le,40,CHIP,1.4,8);
    }
    for(const left of [false,true]){
      const [x,y]=finPx(zs(11.62),1.50,left);
      ctx.save();ctx.translate(x,y);ctx.scale(((TTW/2)/FIN_ZR)*(left?1:-1),(TTH/2)/FIN_YR);
      ctx.fillStyle=scheme.number;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='bold 0.60px sans-serif';ctx.fillText('10',0,0);ctx.restore();
    }
    flecks(ctx,r,0,0,TTW,TTH,120,CHIP,1.0);
    return tex(c);
  }
  // Cowling: u runs along the revolved profile's arc length, v around the ring (0 = top).
  const COWL=[[0.74,.60],[0.52,.625],[0.46,.66],[0.45,.71],[0.48,.752],[0.60,.774],[1.10,.781],[1.62,.774],[1.86,.762]];
  const COWL_ARC=(()=>{const a=[0];for(let i=1;i<COWL.length;i++)a.push(a[i-1]+Math.hypot(COWL[i][0]-COWL[i-1][0],COWL[i][1]-COWL[i-1][1]));return a.map(v=>v/a[a.length-1]);})();
  const cowlU=s=>{for(let i=3;i<COWL.length-1;i++)if(s<=COWL[i+1][0])return lerp(COWL_ARC[i],COWL_ARC[i+1],clamp((s-COWL[i][0])/(COWL[i+1][0]-COWL[i][0]),0,1));return 1;};
  const CTW=1024,CTH=512;
  function paintCowl(){
    const c=makeCanvas(CTW,CTH);if(!c)return null;const ctx=c.getContext('2d'),r=rnd(71);
    const X=s=>cowlU(s)*CTW,Y=v=>(1-v)*CTH,SEAMS=[.125,.375,.625,.875];
    demarcation(ctx,CTW,CTH,.30);
    ctx.fillStyle='rgba(20,22,24,.35)';ctx.fillRect(0,0,X(.45),CTH); // inside of the intake lip
    const bands=[0,...SEAMS,1];
    for(const [s0,s1] of [[.60,1.62],[1.62,1.86]])for(let j=0;j<bands.length-1;j++){const x0=X(s0),x1=X(s1),y0=Y(bands[j]),y1=Y(bands[j+1]);tone(ctx,r,[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],.04);}
    blotches(ctx,r,X(.5),Y(.22),CTW-X(.5),Y(0)-Y(.22),24,'rgba(222,230,236,.08)',40,2);blotches(ctx,r,X(.5),0,CTW-X(.5),Y(.78),24,'rgba(222,230,236,.08)',40,2);
    for(const s of [.60,1.62]){const x=X(s);seam(ctx,[[x,0],[x,CTH]],.42);}
    ctx.fillStyle='rgba(14,18,22,.5)';
    for(const v of SEAMS){const y=Y(v);seam(ctx,[[X(.60),y],[CTW,y]],.42);ctx.fillStyle='rgba(14,18,22,.5)';for(let s=.68;s<1.84;s+=.11){const x=X(s);ctx.fillRect(x-1.5,y-6.5,3,3);ctx.fillRect(x-1.5,y+3.5,3,3);}}
    for(let v=0;v<1;v+=.03)ctx.fillRect(X(1.62)-6.5,Y(v)-1.5,3,3);
    streaks(ctx,r,X(.9),Y(.55),X(1.3)-X(.9),Y(.45)-Y(.55),14,'rgba(32,25,18,.30)',CTW-X(1.1),3);
    blotches(ctx,r,X(.6),Y(.65),CTW-X(.6),Y(.35)-Y(.65),18,'rgba(38,36,30,.10)',40,2);
    flecks(ctx,r,X(.44),0,X(.62)-X(.44),CTH,520,CHIP,1.6);
    flecks(ctx,r,0,0,CTW,CTH,90,CHIP,1.0);
    return tex(c);
  }
  // Small sky/sea cube map, used only by the glazing so it reads as glass.
  function envCube(){
    const S=64,faces=[];
    for(let i=0;i<6;i++){const c=makeCanvas(S,S);if(!c)return null;const x=c.getContext('2d');
      if(i===2)x.fillStyle='#8db2d2';else if(i===3)x.fillStyle='#22313c';
      else{const g=x.createLinearGradient(0,0,0,S);g.addColorStop(0,'#83aacd');g.addColorStop(.46,'#d2dfe7');g.addColorStop(.52,'#5a7182');g.addColorStop(1,'#25343e');x.fillStyle=g;}
      x.fillRect(0,0,S,S);faces.push(c);}
    const t=new T.CubeTexture(faces);t.encoding=T.sRGBEncoding;t.needsUpdate=true;owned.textures.push(t);return t;
  }

  // ---------- materials ----------
  const fusMap=paintFuselage(),wingMapR=paintWing(false),wingMapL=paintWing(true),tailMap=paintTail(),cowlMap=paintCowl(),env=envCube();
  const PAINT={roughness:.82,metalness:0};
  const skin=(map,hex)=>mat({color:map?0xffffff:srgb(hex),map,...PAINT});
  const mats={
    fus:skin(fusMap,scheme.upper),wingR:skin(wingMapR,scheme.upper),wingL:skin(wingMapL,scheme.upper),tail:skin(tailMap,scheme.upper),cowl:skin(cowlMap,scheme.upper),
    paint:mat({color:srgb(scheme.upper),...PAINT}),
    paintLow:mat({color:srgb(scheme.lower),...PAINT}),
    frame:mat({color:srgb(scheme.frame||scheme.upper),roughness:.75,metalness:0}),
    glass:mat({color:srgb('#7d939f'),roughness:.04,metalness:.45,envMap:env,envMapIntensity:1.15,transparent:true,opacity:.40,depthWrite:false,side:T.DoubleSide}),
    interior:mat({color:srgb('#414933'),roughness:.9,metalness:0,side:T.DoubleSide}),
    primer:mat({color:srgb('#5e6744'),roughness:.85,metalness:0}),
    dark:mat({color:srgb('#1b1d1d'),roughness:.85,metalness:.1,side:T.DoubleSide}),
    engine:mat({color:srgb('#3f4243'),roughness:.55,metalness:.5}),
    steel:mat({color:srgb('#a9aeb1'),roughness:.32,metalness:.85}),
    hub:mat({color:srgb('#55595b'),roughness:.55,metalness:.4}),
    tire:mat({color:srgb('#1f1f1f'),roughness:.95,metalness:0}),
    blade:mat({color:srgb('#141414'),roughness:.62,metalness:.1}),
    tip:mat({color:srgb('#cba01f'),roughness:.62,metalness:0}),
    gun:mat({color:srgb('#1d1f21'),roughness:.45,metalness:.6}),
    exhaust:mat({color:srgb('#3a2b22'),roughness:.9,metalness:.3}),
    torpedo:mat({color:srgb('#5a5f58'),roughness:.55,metalness:.3}),
    wood:mat({color:srgb('#806240'),roughness:.85,metalness:0,side:T.DoubleSide}),
    flight:mat({color:srgb('#57503c'),roughness:.9,metalness:0}),
    helmet:mat({color:srgb('#33271d'),roughness:.7,metalness:0}),
    vest:mat({color:srgb('#8c7742'),roughness:.9,metalness:0}),
    face:mat({color:srgb('#a37c64'),roughness:.75,metalness:0}),
    red:mat({color:srgb('#c21a1a'),emissive:srgb('#5a0000'),roughness:.3}),
    green:mat({color:srgb('#13a33a'),emissive:srgb('#004a14'),roughness:.3}),
    white:mat({color:srgb('#f4f4ee'),emissive:srgb('#3a3a36'),roughness:.3})
  };
  mats.glass.name='glass';

  const root=new T.Group();root.name='OwnAvenger';
  const parts={},add=(p,o)=>(p.add(o),o);

  // ---------- fuselage shell; the bay strip becomes the two doors ----------
  {
    const skip=(i,j)=>inBay(FUS_S[i])&&inBay(FUS_S[i+1])&&j>=RING/2-DOOR_K&&j<RING/2+DOOR_K;
    const g=gridSurface(fusRows.map(r=>r.pts),(i,j)=>[fusU(FUS_S[i]),fusRows[i].acc[j]/fusRows[i].per],{skip,seam:true});
    add(root,mesh(g,mats.fus,'fuselage'));
    add(root,mesh(capFrom(fusRows[fusRows.length-1].pts.slice(0,RING),()=>[.999,.5],[0,0,1]),mats.fus,'tailCap'));
  }
  {
    const bayRows=[],bayIdx=[];FUS_S.forEach((s,i)=>{if(inBay(s)){bayRows.push(fusRows[i]);bayIdx.push(i);}});
    // open-bottomed well: side walls from the door hinge lines up to a ceiling under the wing spar
    const y1=-0.50,walls=[];
    for(const k of [RING/2-DOOR_K,RING/2+DOOR_K]){const rows=bayRows.map(r=>{const q=r.pts[k];return [q,[q[0]*.98,y1,q[2]]];});walls.push(gridSurface(rows,()=>[0,0]));}
    const ceil=bayRows.map(r=>[[r.pts[RING/2-DOOR_K][0]*.98,y1,r.pts[0][2]],[r.pts[RING/2+DOOR_K][0]*.98,y1,r.pts[0][2]]]);walls.push(gridSurface(ceil,()=>[0,0]));
    for(const r of [bayRows[0],bayRows[bayRows.length-1]]){const q0=r.pts[RING/2-DOOR_K],q1=r.pts[RING/2+DOOR_K];walls.push(build([q0[0],q0[1],q0[2],q1[0],q1[1],q1[2],q1[0]*.98,y1,q1[2],q0[0]*.98,y1,q0[2]],[0,0,0,0,0,0,0,0],[0,1,2,0,2,3]));}
    add(root,mesh(merge(walls),mats.interior,'bombBayWell'));
    for(const [name,k0,k1,kh,sgn] of [['bayDoorL',RING/2,RING/2+DOOR_K,RING/2+DOOR_K,-1],['bayDoorR',RING/2-DOOR_K,RING/2,RING/2-DOOR_K,1]]){
      const hp=bayRows.map(r=>r.pts[kh]),hx=hp.reduce((a,q)=>a+q[0],0)/hp.length,hy=Math.max(...hp.map(q=>q[1]));
      const rows=bayRows.map(r=>r.pts.slice(k0,k1+1));
      const g=gridSurface(rows,(i,j)=>{const r=bayRows[i];return [fusU(FUS_S[bayIdx[i]]),r.acc[k0+j]/r.per];});
      g.translate(-hx,-hy,0);
      const pivot=new T.Group();pivot.name=name;pivot.position.set(hx,hy,0);
      pivot.add(mesh(g,mats.fus,name+'Skin'));
      const inner=geo(g.clone());inner.translate(0,.015,0);pivot.add(mesh(inner,mats.interior,name+'Inner'));
      pivot.userData.sign=sgn;add(root,pivot);parts[name]=pivot;
    }
  }
  // ---------- cowling, engine ----------
  {
    add(root,mesh(revolve(COWL,48),mats.cowl,'cowling'));
    add(root,mesh(revolve([[1.20,0],[1.20,.61]],24),mats.dark,'cowlBaffle'));
    const eng=[revolve([[0.40,0],[0.44,.20],[0.62,.30],[0.80,.38],[0.95,.40]],20)];
    const ring=geo(new T.TorusGeometry(.43,.018,6,40));ring.translate(0,0,zs(0.84));eng.push(ring);
    for(let row=0;row<2;row++)for(let i=0;i<7;i++){
      const a=(i+row*.5)*2*Math.PI/7,s=0.88+row*.22,r0=.30,r1=.58;
      eng.push(cylinderBetween([Math.sin(a)*r0,Math.cos(a)*r0,zs(s)],[Math.sin(a)*r1,Math.cos(a)*r1,zs(s)],.085,10));
      for(let f=0;f<5;f++){const rr=r0+.05+f*.05,d=geo(new T.CylinderGeometry(.115,.115,.012,12));d.applyMatrix4(new T.Matrix4().makeRotationZ(-a));d.translate(Math.sin(a)*rr,Math.cos(a)*rr,zs(s));eng.push(d);}
      eng.push(boxAt(.13,.10,.16,Math.sin(a)*(r1+.03),Math.cos(a)*(r1+.03),zs(s),0,0,-a));
      eng.push(cylinderBetween([Math.sin(a)*r1*.95,Math.cos(a)*r1*.95,zs(s)],[Math.sin(a)*.42,Math.cos(a)*.42,zs(0.62)],.018,5)); // push rods
    }
    add(root,mesh(merge(eng),mats.engine,'engine'));
    const g=new T.Group();g.name='cowlFlaps';g.userData.flaps=[];
    for(let i=0;i<16;i++){
      if(i===8)continue;   // lower centre: oil cooler outlet
      const a=i*2*Math.PI/16,p=new T.Group();p.position.set(Math.sin(a)*.785,Math.cos(a)*.785,zs(1.84));p.rotation.z=-a;
      p.add(mesh(boxAt(.30,.012,.26,0,0,.13),mats.paint,'cowlFlap'));g.add(p);g.userData.flaps.push(p);
    }
    add(root,g);parts.cowlFlaps=g;
    for(const sx of [-1,1])add(root,mesh(cylinderBetween([sx*.60,-.44,zs(1.80)],[sx*.70,-.50,zs(2.20)],.05,8,.06),mats.exhaust,'exhaust'));
    add(root,mesh(boxAt(.34,.16,.55,0,-.82,zs(2.05)),mats.paint,'oilCoolerScoop'));
    add(root,mesh(boxAt(.30,.12,.02,0,-.82,zs(1.78)),mats.dark,'oilCoolerIntake'));
  }
  // ---------- propeller ----------
  {
    const p=new T.Group();p.name='propeller';p.position.set(0,0,zs(0.36));
    const hub=revolve([[0.00,0],[0.02,.09],[0.08,.17],[0.18,.225],[0.32,.25],[0.46,.25]],32);hub.translate(0,0,-zs(0.36));
    p.add(mesh(hub,mats.hub,'propHub'));
    const seg=12,N=10,rows=[];
    for(let i=0;i<=seg;i++){
      const t=i/seg,r=lerp(.20,PROP_R,t);
      const chord=t<.12?lerp(.11,.21,t/.12):t<.62?lerp(.21,.29,(t-.12)/.5):.29*Math.sqrt(Math.max(.03,1-Math.pow((t-.62)/.38,2)));
      const thick=t<.1?lerp(.10,.05,t/.1):lerp(.05,.012,(t-.1)/.9),pitch=lerp(64,17,t)*Math.PI/180,ring=[];
      for(let k=0;k<N;k++){const a=2*Math.PI*k/N,cx=Math.cos(a)*chord/2,cy=Math.sin(a)*thick/2;ring.push([cx*Math.cos(pitch)-cy*Math.sin(pitch),r,cx*Math.sin(pitch)+cy*Math.cos(pitch)]);}
      rows.push(ring);
    }
    const blade=gridSurface(rows,(i,j)=>[i/seg,j/N],{closed:true});
    const tipCap=capFrom(rows[seg],()=>[1,0],[0,1,0]);
    const tip=gridSurface(rows.slice(seg-2).map(r=>r.map(([x,y,z])=>[x*1.02,y+.004,z*1.02])),(i,j)=>[i,j/N],{closed:true});
    for(let b=0;b<3;b++){
      const holder=new T.Group();holder.rotation.z=b*2*Math.PI/3;
      holder.add(mesh(blade,mats.blade,'blade'));holder.add(mesh(tipCap,mats.tip,'bladeTipCap'));holder.add(mesh(tip,mats.tip,'bladeTip'));
      p.add(holder);
    }
    add(root,p);parts.propeller=p;
  }
  // ---------- canopy, interior, crew ----------
  const CS=[2.95,3.20,3.55,4.00,5.50,6.05,6.35],CH=pchip(CS,[.02,.34,.60,.65,.65,.62,.56]),CW=pchip(CS,[.50,.53,.56,.57,.57,.56,.55]);
  const SILL=s=>fusTop(s)-.035;
  const canopyPoint=(s,a)=>[CW(s)*sp(Math.sin(a),3.2),SILL(s)+CH(s)*sp(Math.cos(a),3.2),zs(s)];
  {
    const ss=[];for(let s=CS[0];s<=CS[CS.length-1]+1e-6;s+=.06)ss.push(s);
    const rows=ss.map(s=>{const r=[];for(let k=0;k<=24;k++)r.push(canopyPoint(s,-Math.PI/2+Math.PI*k/24));return r;});
    add(root,mesh(gridSurface(rows,(i,j)=>[i/(rows.length-1),j/24]),mats.glass,'canopyGlass'));
    const frames=[];
    // slim painted frames: windscreen bow, sliding hoods, sills and roof rails
    for(const s of [3.55,4.10,4.75,5.20,5.75,6.25]){const pts=[];for(let k=0;k<=24;k++)pts.push(canopyPoint(s,-Math.PI/2+Math.PI*k/24));for(let k=0;k<24;k++)frames.push(cylinderBetween(pts[k],pts[k+1],s===3.55?.017:.012,5));}
    for(const a of [-Math.PI/2,-1.05,-.45,0,.45,1.05,Math.PI/2]){const pts=ss.filter((_,i)=>i%2===0).map(s=>canopyPoint(s,a));for(let k=0;k<pts.length-1;k++)frames.push(cylinderBetween(pts[k],pts[k+1],Math.abs(a)>1.5?.016:.010,5));}
    add(root,mesh(merge(frames),mats.frame,'canopyFrames'));
    const mastBase=[0,SILL(3.9)+CH(3.9)-.02,zs(3.9)],mastTop=[0,SILL(3.9)+CH(3.9)+.36,zs(3.98)];
    add(root,mesh(merge([cylinderBetween(mastBase,mastTop,.032,6,.018),cylinderBetween(mastTop,[0,FIN_TOP-.10,zs(11.95)],.006,4)]),mats.gun,'antenna'));
    const tub=[boxAt(1.1,.05,3.3,0,0.05,zs(4.7))];
    for(const sx of [-1,1])tub.push(boxAt(.04,.62,3.3,sx*.52,.36,zs(4.7)));
    tub.push(boxAt(1.1,.85,.04,0,.42,zs(3.10)),boxAt(.42,.40,.06,0,.66,zs(3.55)),boxAt(.42,.62,.10,0,.42,zs(4.75)),boxAt(.40,.10,.40,0,.18,zs(4.55)),boxAt(.4,.5,.06,0,.40,zs(5.65)));
    add(root,mesh(merge(tub),mats.interior,'cockpitTub'));
    add(root,mesh(boxAt(.36,.24,.02,0,.62,zs(3.13)),mats.dark,'instrumentPanel'));
    if(opts.crew!==false){
      // pilot and radioman: leather helmet with goggles, inflatable life vest, flight suit
      const suit=[],faces=[],helmets=[],vests=[];
      for(const [s,y] of [[4.45,.98],[5.55,.92]]){
        helmets.push(sphereAt(.112,0,y,zs(s)+.01,14,10),boxAt(.20,.035,.05,0,y+.035,zs(s)-.085));
        faces.push(sphereAt(.088,0,y-.035,zs(s)-.045,12,8));
        vests.push(boxAt(.38,.18,.24,0,y-.26,zs(s)+.03),boxAt(.14,.07,.18,0,y-.14,zs(s)+.01));
        suit.push(boxAt(.38,.26,.24,0,y-.45,zs(s)+.05));
      }
      add(root,mesh(merge(suit),mats.flight,'crew'));add(root,mesh(merge(faces),mats.face,'crewFaces'));
      add(root,mesh(merge(helmets),mats.helmet,'crewHelmets'));add(root,mesh(merge(vests),mats.vest,'crewVests'));
    }
  }
  // ---------- dorsal turret and ventral gun ----------
  {
    const s0=6.30,s1=7.45,yb=fusTop(6.85)-.05,rows=[];
    for(let s=s0;s<=s1+1e-6;s+=.05){const t=(s-s0)/(s1-s0),r=.58*Math.sqrt(Math.max(0,Math.sin(Math.PI*t)))+.02,ring=[];for(let k=0;k<=24;k++){const a=-Math.PI/2+Math.PI*k/24;ring.push([Math.sin(a)*r,yb+Math.max(0,Math.cos(a))*r*.62,zs(s)]);}rows.push(ring);}
    add(root,mesh(gridSurface(rows,()=>[.5,.98]),mats.paint,'turretFairing'));
    const t=new T.Group();t.name='turret';t.position.set(0,yb+.36,zs(6.85));
    t.add(mesh(sphereAt(.50,0,0,0,28,16,Math.PI*.52,Math.PI*.48),mats.paint,'turretBall'));
    t.add(mesh(sphereAt(.495,0,0,0,28,12,0,Math.PI*.52),mats.glass,'turretGlass'));
    const tf=[];for(const ph of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const pts=[];for(let k=0;k<=10;k++){const th=Math.PI*.52*k/10;pts.push([Math.sin(th)*Math.cos(ph)*.5,Math.cos(th)*.5,Math.sin(th)*Math.sin(ph)*.5]);}for(let k=0;k<10;k++)tf.push(cylinderBetween(pts[k],pts[k+1],.016,5));}
    t.add(mesh(merge(tf),mats.frame,'turretFrames'));
    const gun=new T.Group();gun.name='turretGun';gun.position.set(.13,.04,0);
    gun.add(mesh(merge([cylinderBetween([0,0,.10],[0,0,1.25],.024,8),cylinderBetween([0,0,.02],[0,0,.55],.05,8)]),mats.gun,'turretBarrel'));
    t.add(gun);
    if(opts.crew!==false)t.add(mesh(sphereAt(.11,-.08,.08,-.05,14,10),mats.helmet,'gunnerHead'));
    add(root,t);parts.turret=t;parts.turretGun=gun;
    add(root,mesh(cylinderBetween([0,fusBot(7.25)+.10,zs(7.15)],[0,fusBot(7.25)-.02,zs(7.95)],.018,6),mats.gun,'ventralGun'));
  }
  // ---------- wings: centre section, folding outer panels, flaps ----------
  const outerPanels={};
  const sideMesh=(g,side,m,name)=>mesh(side>0?g:mirrorX(g),m,name);
  function flapPivot(side,x0,x1,name){
    const f=.76,steps=8,P=[],U=[],I=[];
    const nearestUpper=(af,t)=>{let best=af.up[0];for(const q of af.up)if(Math.abs(q[0]-t)<Math.abs(best[0]-t))best=q;return best;};
    for(const inner of [0,1])for(let i=0;i<=steps;i++){
      const x=lerp(x0,x1,i/steps),w=wingAt(x),af=naca(wingThick(x),.02,.4,AF_N);
      for(const t of [f,.985]){const q=nearestLower(af,t),y=inner?lerp(q[1],nearestUpper(af,t)[1],.3):q[1];
        P.push(x,w.y+y*w.c-.006,w.le+q[0]*w.c);U.push(...wingUV(x,w.le+q[0]*w.c,false));}
    }
    const n=(steps+1)*2,Io=[],Ii=[];
    for(let i=0;i<steps;i++){const a=i*2,b=a+1,c=a+2,d=a+3;Io.push(a,c,b,b,c,d);Ii.push(n+a,n+b,n+c,n+b,n+d,n+c);}
    const xm=(x0+x1)/2,wm=wingAt(xm),hq=nearestLower(naca(wingThick(xm),.02,.4,AF_N),f),hinge=[xm,wm.y+hq[1]*wm.c-.006,wm.le+hq[0]*wm.c];
    const p=new T.Group();p.name=name;p.position.set(side*hinge[0],hinge[1],hinge[2]);
    // outer skin in the wing paint, the face hidden inside the wing in primer
    for(const [idx,m,suffix] of [[Io,side>0?mats.wingR:mats.wingL,'Plate'],[Ii,mats.primer,'Inner']]){
      const g=build(P,U,idx);g.translate(-hinge[0],-hinge[1],-hinge[2]);p.add(mesh(side>0?g:mirrorX(g),m,name+suffix));
    }
    return p;
  }
  {
    const centre=wingGeo(0,FOLD_X,10,false),outer=wingGeo(FOLD_X,TIP_X,18,false),tip=wingGeo(TIP_X,HALF_SPAN,10,true);
    const uvLow=p=>wingUV(p[0],p[2],false);
    for(const side of [1,-1]){
      const m=side>0?mats.wingR:mats.wingL,sx=side>0?'R':'L';
      add(root,sideMesh(centre.g,side,m,'wingCentre'));
      add(root,sideMesh(capFrom(centre.rows[centre.rows.length-1],uvLow,[1,0,0]),side,mats.interior,'foldFaceCentre'));
      const w=wingAt(FOLD_X),hp=[side*FOLD_X,w.y,w.le+.42*w.c];
      const pivot=new T.Group();pivot.name='wingFold'+sx;pivot.position.set(...hp);
      const panel=new T.Group();panel.position.set(-hp[0],-hp[1],-hp[2]);pivot.add(panel);
      panel.add(sideMesh(outer.g,side,m,'wingOuter'));
      panel.add(sideMesh(tip.g,side,m,'wingTip'));
      panel.add(sideMesh(capFrom(outer.rows[0],uvLow,[-1,0,0]),side,mats.interior,'foldFaceOuter'));
      const gw=wingAt(3.35);panel.add(mesh(cylinderBetween([side*3.35,gw.y+.03,gw.le+.12],[side*3.35,gw.y+.035,gw.le-.62],.024,8),mats.gun,'wingGun'));
      const tw=wingAt(HALF_SPAN-.06);panel.add(mesh(sphereAt(.05,side*(HALF_SPAN-.05),tw.y,tw.le+tw.c*.35,8,6),side>0?mats.green:mats.red,'navLight'));
      if(side>0){const pw=wingAt(7.2);panel.add(mesh(cylinderBetween([7.2,pw.y-.05,pw.le+.08],[7.2,pw.y-.05,pw.le-.45],.012,6),mats.steel,'pitot'));}
      const fo=flapPivot(side,FOLD_X+.06,5.15,'flapOuter'+sx);panel.add(fo);parts['flapOuter'+sx]=fo;
      parts['flapInner'+sx]=add(root,flapPivot(side,.92,FOLD_X-.06,'flapInner'+sx));
      add(root,pivot);outerPanels[side]=pivot;parts[pivot.name]=pivot;
      // Sto-Wing: one rotation about a skewed hinge. The span ends up running aft, the
      // leading edge points down and the upper skin faces outboard, as on the real folded wing.
      const tipW=wingAt(TIP_X),spanDir=new T.Vector3(side*(TIP_X-FOLD_X),tipW.y-w.y,0).normalize();
      const chordDir=new T.Vector3(0,0,1),upDir=spanDir.clone().cross(chordDir).multiplyScalar(-side).normalize();
      const tChord=new T.Vector3(0,1,0),tSpan=new T.Vector3(0,.10,1);tSpan.addScaledVector(tChord,-tSpan.dot(tChord)).normalize();
      const tUp=tChord.clone().cross(tSpan).multiplyScalar(side).normalize();
      const from=new T.Matrix4().makeBasis(spanDir,chordDir,upDir),to=new T.Matrix4().makeBasis(tSpan,tChord,tUp);
      pivot.userData.foldQuat=new T.Quaternion().setFromRotationMatrix(to.multiply(from.invert()));
    }
  }
  // ---------- tailplane and fin ----------
  {
    const af=naca(.10,0,.4,16),sr=[];
    for(let i=0;i<=20;i++){const x=STAB_HALF*Math.sin(i/20*Math.PI/2),s=stabAt(x),ring=[];
      for(let k=16;k>=0;k--)ring.push([x,s.y+af.lo[k][1]*s.c,s.le+af.lo[k][0]*s.c]);for(let k=1;k<=16;k++)ring.push([x,s.y+af.up[k][1]*s.c,s.le+af.up[k][0]*s.c]);sr.push(ring);}
    const stab=gridSurface(sr,(i,j,p)=>pxUV(stabPx(p[0],p[2],j>16)));
    add(root,mesh(stab,mats.tail,'stabR'));add(root,mesh(mirrorX(stab),mats.tail,'stabL'));
    const fr=[];
    for(let i=0;i<=22;i++){const y=FIN_Y0+(FIN_TOP-FIN_Y0)*Math.sin(i/22*Math.PI/2),le=finLE(y),c=Math.max(.02,finTE(y)-le),half=Math.min(.06,.035*c+.01),ring=[];
      for(let k=16;k>=0;k--)ring.push([-Math.abs(af.lo[k][1])/.05*half,y,le+af.lo[k][0]*c]);for(let k=1;k<=16;k++)ring.push([Math.abs(af.up[k][1])/.05*half,y,le+af.up[k][0]*c]);fr.push(ring);}
    add(root,mesh(gridSurface(fr,(i,j,p)=>pxUV(finPx(p[2],p[1],j<=16))),mats.tail,'fin'));
    add(root,mesh(sphereAt(.045,0,FIN_TOP-.55,finTE(FIN_TOP-.55)+.01,8,6),mats.white,'tailLight'));
  }
  // ---------- main gear ----------
  function gearLeg(side){
    const g=new T.Group();g.name=side>0?'gearR':'gearL';g.position.set(side*GEAR.attach[0],GEAR.attach[1],GEAR.attach[2]);
    const leg=new T.Group(),L=GEAR.leg;g.add(leg);
    leg.add(mesh(merge([cylinderBetween([0,0,0],[0,-L*.62,0],.075,10),boxAt(.20,.12,.20,0,-.02,0)]),mats.paintLow,'oleo'));
    leg.add(mesh(cylinderBetween([0,-L*.60,0],[0,-L+.05,0],.052,10),mats.steel,'piston'));
    leg.add(mesh(merge([boxAt(.05,.36,.10,-.15,-L+.06,0),boxAt(.05,.36,.10,.15,-L+.06,0),boxAt(.35,.06,.10,0,-L+.22,0),
      boxAt(.04,.24,.04,0,-L*.70,-.12,-.5,0,0),boxAt(.04,.24,.04,0,-L*.85,-.12,.5,0,0)]),mats.paintLow,'fork'));
    const wheel=new T.Group();wheel.position.set(0,-L,0);wheel.name='mainWheel';wheel.userData.groundWheel=true;
    const tyre=geo(new T.TorusGeometry(GEAR.r-.10,.10,12,36));tyre.scale(1,1,1.05);tyre.rotateY(Math.PI/2);
    wheel.add(mesh(tyre,mats.tire,'tyre'));
    const hub=geo(new T.CylinderGeometry(.215,.215,.17,24));hub.rotateZ(Math.PI/2);wheel.add(mesh(hub,mats.paintLow,'hub'));
    leg.add(wheel);
    // fairing on the face that becomes the underside once the leg folds outward
    leg.add(mesh(boxAt(.025,L*.74,.42,-.12,-L*.43,0),mats.paintLow,'gearDoor'));
    if(side<0)leg.scale.x=-1;
    return g;
  }
  parts.gearL=add(root,gearLeg(-1));parts.gearR=add(root,gearLeg(1));
  {
    const s=10.55,g=new T.Group();g.name='tailGear';g.position.set(0,fusBot(s)+.10,zs(s));
    g.add(mesh(merge([cylinderBetween([0,.05,-.02],[0,-.40,.10],.042,8),boxAt(.04,.20,.06,-.07,-.44,.12),boxAt(.04,.20,.06,.07,-.44,.12)]),mats.paintLow,'tailStrut'));
    const w=new T.Group();w.position.set(0,-.50,.13);w.name='tailWheel';w.userData.groundWheel=true;
    const ty=geo(new T.TorusGeometry(.12,.055,10,20));ty.rotateY(Math.PI/2);w.add(mesh(ty,mats.tire,'tailTyre'));
    const th=geo(new T.CylinderGeometry(.08,.08,.08,14));th.rotateZ(Math.PI/2);w.add(mesh(th,mats.paintLow,'tailHub'));
    g.add(w);add(root,g);parts.tailGear=g;
  }
  // ---------- arrestor hook: stows along the underside of the tail cone ----------
  {
    const s=11.0,g=new T.Group();g.name='hook';g.position.set(0,fusBot(s)+.02,zs(s));
    g.add(mesh(merge([cylinderBetween([0,0,0],[0,0,1.25],.033,8),boxAt(.07,.10,.15,0,-.05,1.25)]),mats.gun,'hookBar'));
    g.userData.stowed=-Math.atan2(fusBot(12.25)-fusBot(11.0),1.25)-.02;
    add(root,g);parts.hook=g;
  }
  // ---------- Mk 13 torpedo with plywood nose drag ring and box tail ----------
  if(opts.torpedo!==false){
    const t=new T.Group();t.name='torpedo';t.position.set(0,-0.82,zs(4.78));
    const L=4.09,R=.285,at=s=>s+Z0;
    t.add(mesh(revolve([[-L/2,0],[-L/2+.05,.12],[-L/2+.22,.25],[-L/2+.5,R],[L/2-.8,R],[L/2-.25,.16],[L/2,.06]].map(([s,r])=>[at(s),r]),24),mats.torpedo,'torpedoBody'));
    const ring=geo(new T.CylinderGeometry(.33,.33,.42,24,1,true));ring.rotateX(Math.PI/2);ring.translate(0,0,-L/2+.36);
    t.add(mesh(ring,mats.wood,'dragRing'));
    const box=[boxAt(.54,.02,.32,0,0,L/2-.12),boxAt(.02,.54,.32,0,0,L/2-.12)];
    for(const [w,h,x,y] of [[.56,.02,0,.27],[.56,.02,0,-.27],[.02,.56,.27,0],[.02,.56,-.27,0]])box.push(boxAt(w,h,.30,x,y,L/2-.08));
    t.add(mesh(merge(box),mats.wood,'boxTail'));
    add(root,t);parts.torpedo=t;
  }

  // ---------- animation ----------
  const state={gear:1,flaps:0,hook:0,fold:0,bay:0,cowl:0,turretYaw:0,turretPitch:0};
  const Q0=new T.Quaternion();
  function set(next={}){
    Object.assign(state,next);
    const g=smooth(clamp(state.gear,0,1));
    for(const side of [-1,1])parts[side>0?'gearR':'gearL'].rotation.z=side*lerp(Math.PI/2,GEAR.splay,g);
    parts.tailGear.rotation.x=lerp(1.35,0,g);
    const f=smooth(clamp(state.flaps,0,1))*50*Math.PI/180;
    for(const n of ['flapInnerL','flapInnerR','flapOuterL','flapOuterR']){parts[n].rotation.x=f;parts[n].children[1].visible=f>.005;}
    parts.hook.rotation.x=lerp(parts.hook.userData.stowed,62*Math.PI/180,smooth(clamp(state.hook,0,1)));
    const fold=smooth(clamp(state.fold,0,1));
    for(const side of [-1,1]){const p=outerPanels[side];p.quaternion.copy(Q0).slerp(p.userData.foldQuat,fold);}
    const bay=smooth(clamp(state.bay,0,1))*95*Math.PI/180;
    parts.bayDoorL.rotation.z=-bay;parts.bayDoorR.rotation.z=bay;
    const cowl=.04+smooth(clamp(state.cowl,0,1))*.30;for(const p of parts.cowlFlaps.userData.flaps)p.rotation.x=-cowl;
    parts.turret.rotation.y=state.turretYaw;parts.turretGun.rotation.x=-.10-state.turretPitch;
    return state;
  }
  set({});
  // Visual propeller rate (rad/s at rate 1), kept below the frame-rate aliasing limit for three blades.
  function spin(dt,rate=1){parts.propeller.rotation.z-=dt*rate*15;}
  function dispose(){owned.geometries.forEach(g=>g.dispose());owned.materials.forEach(m=>m.dispose());owned.textures.forEach(t=>t.dispose());if(root.parent)root.parent.remove(root);}
  function stats(){let triangles=0,meshes=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;}});return {meshes,triangles,materials:owned.materials.length,textures:owned.textures.length};}
  return {root,parts,state,set,spin,dispose,stats,scheme,mats,wingAt,fusTop,fusBot,GEAR,FOLD_X,owned};
}
const OwnAvenger={SPEC,SCHEMES,create,Z0};
global.OwnAvenger=OwnAvenger;
if(typeof module!=='undefined'&&module.exports)module.exports=OwnAvenger;
})(typeof window!=='undefined'?window:globalThis);
