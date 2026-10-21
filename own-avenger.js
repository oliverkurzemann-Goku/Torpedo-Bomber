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
const SCHEMES={
  museum:{upper:'#8d969b',lower:'#c8cac5',frame:'#858e93',label:'Museum grey (TBM-3 restoration)'},
  navy42:{upper:'#56697a',lower:'#b2b6b3',frame:'#506373',label:'1942 Blue-Gray / Light Gray'},
  tricolor:{upper:'#2f3f55',lower:'#dadad3',frame:'#2f3f55',label:'1943 Tri-color'}
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
  const scheme=SCHEMES[opts.scheme]||SCHEMES.museum;
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
  // Revolve [[station,radius],...] around the thrust line.
  function revolve(profile,seg){
    const rows=profile.map(([s,r])=>{const ring=[];for(let k=0;k<=seg;k++){const a=2*Math.PI*k/seg;ring.push([Math.sin(a)*r,Math.cos(a)*r,zs(s)]);}return ring;});
    return gridSurface(rows,(i,j)=>[i/(rows.length-1),j/seg],{seam:true});
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
  function star(ctx,r){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*0.382:r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();}
  function insignia(ctx,r){ctx.fillStyle='#1f2f5c';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f1f0e8';star(ctx,r*0.98);ctx.fill();}
  function weathering(ctx,w,h,seed,amount){
    let x=seed;const rnd=()=>((x=(x*16807)%2147483647)/2147483647);
    for(let i=0;i<w*h/1400;i++){ctx.fillStyle=`rgba(${rnd()<.55?'0,0,0':'255,255,255'},${amount*rnd()})`;const s=6+rnd()*34;ctx.fillRect(rnd()*w,rnd()*h,s,s*(.25+rnd()*.5));}
  }
  // Own squadron-style badge (original artwork): torpedo and lightning bolt on a roundel.
  function badge(ctx,r){
    ctx.fillStyle='#e0b531';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#22406e';ctx.beginPath();ctx.arc(0,0,r*.86,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#e9e7de';ctx.beginPath();ctx.ellipse(-r*.05,r*.18,r*.55,r*.11,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(r*.48,r*.18);ctx.lineTo(r*.66,r*.04);ctx.lineTo(r*.66,r*.32);ctx.closePath();ctx.fill();
    ctx.fillStyle='#e0b531';ctx.beginPath();ctx.moveTo(-r*.08,-r*.62);ctx.lineTo(r*.18,-r*.62);ctx.lineTo(r*.02,-r*.25);ctx.lineTo(r*.22,-r*.25);ctx.lineTo(-r*.18,r*.06);ctx.lineTo(-r*.02,-r*.20);ctx.lineTo(-r*.22,-r*.20);ctx.closePath();ctx.fill();
  }
  const FTW=2048,FTH=1024;
  // Draw in metres at station s and ring index k, readable from outside on either side.
  function onFuselage(ctx,s,k,draw){
    const r=ringRow(s),v=r.acc[k]/r.per,right=k<RING/2;
    ctx.save();ctx.translate(fusU(s)*FTW,(1-v)*FTH);
    ctx.scale((FTW/(FUS_U[1]-FUS_U[0]))*(right?-1:1),(FTH/r.per)*(right?-1:1));
    draw();ctx.restore();
  }
  function paintFuselage(){
    const c=makeCanvas(FTW,FTH);if(!c)return null;const ctx=c.getContext('2d');
    const up=scheme.upper,lo=scheme.lower,g=ctx.createLinearGradient(0,FTH,0,0);
    g.addColorStop(0,up);g.addColorStop(.26,up);g.addColorStop(.34,lo);g.addColorStop(.66,lo);g.addColorStop(.74,up);g.addColorStop(1,up);
    ctx.fillStyle=g;ctx.fillRect(0,0,FTW,FTH);weathering(ctx,FTW,FTH,11,.035);
    ctx.strokeStyle='rgba(18,22,26,.24)';ctx.lineWidth=2;
    for(let s=2.0;s<12.2;s+=0.52){const x=fusU(s)*FTW;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,FTH);ctx.stroke();}
    for(const v of [.09,.18,.31,.42,.58,.69,.82,.91]){const y=(1-v)*FTH;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(FTW,y);ctx.stroke();}
    ctx.strokeStyle='rgba(12,14,16,.6)';ctx.lineWidth=3;
    const bx0=fusU(BAY[0])*FTW,bx1=fusU(BAY[1])*FTW;
    for(const v of [.5-DOOR_K/RING,.5,.5+DOOR_K/RING]){const y=(1-v)*FTH;ctx.beginPath();ctx.moveTo(bx0,y);ctx.lineTo(bx1,y);ctx.stroke();}
    for(const v of [.29,.71]){
      const y=(1-v)*FTH,x0=fusU(1.95)*FTW,x1=fusU(5.4)*FTW,eg=ctx.createLinearGradient(x0,0,x1,0);
      eg.addColorStop(0,'rgba(34,30,27,.6)');eg.addColorStop(1,'rgba(34,30,27,0)');
      ctx.fillStyle=eg;ctx.beginPath();ctx.ellipse((x0+x1)/2,y,(x1-x0)/2,FTH*.03,0,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='rgba(28,38,44,.92)';
    for(const v of [.42,.58]){const x=fusU(7.0)*FTW;ctx.fillRect(x,(1-v)*FTH-FTH*.022,fusU(7.32)*FTW-x,FTH*.044);}
    for(const k of [RING/4,3*RING/4]){
      const out=k<RING/2?-1:1;
      onFuselage(ctx,8.15,k,()=>insignia(ctx,.52));
      onFuselage(ctx,10.45,k+out*2,()=>{ctx.fillStyle='#16191c';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 0.12px sans-serif';ctx.fillText('U.S. NAVY',0,0);ctx.font='0.075px sans-serif';ctx.fillText('TBM-3',0,0.12);});
      onFuselage(ctx,2.75,k+out*3,()=>badge(ctx,.30));
    }
    return tex(c);
  }
  function paintWing(left){
    const c=makeCanvas(WTW,WTH);if(!c)return null;const ctx=c.getContext('2d');
    ctx.fillStyle=scheme.upper;ctx.fillRect(0,0,WTW,WTH/2);ctx.fillStyle=scheme.lower;ctx.fillRect(0,WTH/2,WTW,WTH/2);
    weathering(ctx,WTW,WTH,left?37:23,.03);
    const pxU=WTW/W_U,pxV=(WTH/2)/(W_ZMAX-W_ZMIN);
    const chordLine=(x0,x1,f,upper)=>{ctx.beginPath();for(let x=x0;x<=x1+1e-6;x+=.05){const w=wingAt(x),[px,py]=wingPx(x,w.le+f*w.c,upper);x===x0?ctx.moveTo(px,py):ctx.lineTo(px,py);}ctx.stroke();};
    const cross=(x,f0,f1,upper)=>{const w=wingAt(x),a=wingPx(x,w.le+f0*w.c,upper),b=wingPx(x,w.le+f1*w.c,upper);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();};
    for(const upper of [true,false]){
      ctx.strokeStyle='rgba(18,22,26,.24)';ctx.lineWidth=2;
      for(let x=0.9;x<8.2;x+=0.55)cross(x,0,1,upper);
      for(const f of [.15,.42,.66])chordLine(0,8.2,f,upper);
      ctx.strokeStyle='rgba(10,12,14,.62)';ctx.lineWidth=3;
      chordLine(5.25,7.85,.74,upper);cross(5.25,.74,1,upper);cross(7.85,.74,1,upper);
      cross(FOLD_X,0,1,upper);
      if(!upper){chordLine(.92,FOLD_X-.06,.76,upper);chordLine(FOLD_X+.06,5.15,.76,upper);}
    }
    {const w=wingAt(1.2),[x0,y0]=wingPx(0.85,w.le+.18*w.c,true),[x1,y1]=wingPx(1.70,w.le+.55*w.c,true);ctx.fillStyle='rgba(36,38,38,.30)';ctx.fillRect(x0,y1,x1-x0,y0-y1);}
    // leading-edge slots ahead of the ailerons (upper surface)
    ctx.strokeStyle='rgba(14,16,18,.75)';ctx.lineWidth=5;chordLine(5.35,7.75,.09,true);
    {const [cx,cy]=wingPx(GEAR.attach[0]+GEAR.leg,GEAR.attach[2],false);ctx.fillStyle='rgba(20,22,20,.85)';ctx.beginPath();ctx.ellipse(cx,cy,(GEAR.r+.04)*pxU,(GEAR.r+.04)*pxV,0,0,Math.PI*2);ctx.fill();
     const [lx0,ly0]=wingPx(GEAR.attach[0]-.08,GEAR.attach[2]-.12,false),[lx1,ly1]=wingPx(GEAR.attach[0]+GEAR.leg-.25,GEAR.attach[2]+.12,false);ctx.fillRect(lx0,ly1,lx1-lx0,ly0-ly1);}
    {const w=wingAt(3.35),[gx,gy]=wingPx(3.35,w.le+.02,true);ctx.fillStyle='#1a1c1d';ctx.beginPath();ctx.arc(gx,gy,6,0,Math.PI*2);ctx.fill();}
    // US Navy practice: star on the upper left wing and the lower right wing.
    const upper=left,x=6.0,w=wingAt(x),[cx,cy]=wingPx(x,w.le+.46*w.c,upper),r=Math.min(.66,w.c*.36);
    ctx.save();ctx.translate(cx,cy);ctx.scale(pxU,pxV);
    if(upper)ctx.rotate(Math.PI);
    insignia(ctx,r);ctx.restore();
    return tex(c);
  }
  function paintTail(){
    const c=makeCanvas(TTW,TTH);if(!c)return null;const ctx=c.getContext('2d');
    ctx.fillStyle=scheme.upper;ctx.fillRect(0,0,TTW,TTH);ctx.fillStyle=scheme.lower;ctx.fillRect(TTW/2,TTH/2,TTW/2,TTH/2);
    weathering(ctx,TTW,TTH,51,.03);
    ctx.strokeStyle='rgba(10,12,14,.62)';ctx.lineWidth=3;
    for(const left of [false,true]){ctx.beginPath();for(let y=FIN_Y0+.2;y<=FIN_TOP-.1;y+=.05){const z=lerp(finLE(y),finTE(y),.72),[px,py]=finPx(z,y,left);y===FIN_Y0+.2?ctx.moveTo(px,py):ctx.lineTo(px,py);}ctx.stroke();}
    for(const upper of [true,false]){ctx.beginPath();for(let x=0;x<=STAB_HALF;x+=.05){const s=stabAt(x),[px,py]=stabPx(x,s.le+.70*s.c,upper);x?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
    for(const left of [false,true]){
      const [x,y]=finPx(zs(11.62),1.50,left);
      ctx.save();ctx.translate(x,y);ctx.scale(((TTW/2)/FIN_ZR)*(left?1:-1),(TTH/2)/FIN_YR);
      ctx.fillStyle='#16181a';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='bold 0.60px sans-serif';ctx.fillText('10',0,0);ctx.restore();
    }
    return tex(c);
  }

  // ---------- materials ----------
  const fusMap=paintFuselage(),wingMapR=paintWing(false),wingMapL=paintWing(true),tailMap=paintTail();
  const skin=(map,hex)=>mat({color:map?0xffffff:srgb(hex),map,roughness:.58,metalness:.12});
  const mats={
    fus:skin(fusMap,scheme.upper),wingR:skin(wingMapR,scheme.upper),wingL:skin(wingMapL,scheme.upper),tail:skin(tailMap,scheme.upper),
    paint:mat({color:srgb(scheme.upper),roughness:.6,metalness:.12}),
    paintLow:mat({color:srgb(scheme.lower),roughness:.6,metalness:.12}),
    frame:mat({color:srgb(scheme.frame),roughness:.55,metalness:.15}),
    glass:mat({color:srgb('#c2d6df'),roughness:.05,metalness:.35,transparent:true,opacity:.24,depthWrite:false,side:T.DoubleSide}),
    interior:mat({color:srgb('#4f5838'),roughness:.85,metalness:.05,side:T.DoubleSide}),
    primer:mat({color:srgb('#626b46'),roughness:.8,metalness:.05}),
    dark:mat({color:srgb('#1c1e1e'),roughness:.8,metalness:.2,side:T.DoubleSide}),
    engine:mat({color:srgb('#4a4c4d'),roughness:.42,metalness:.6}),
    steel:mat({color:srgb('#b8bdc1'),roughness:.26,metalness:.85}),
    tire:mat({color:srgb('#1b1b1b'),roughness:.92,metalness:0}),
    blade:mat({color:srgb('#151515'),roughness:.5,metalness:.25}),
    tip:mat({color:srgb('#d7a91c'),roughness:.45,metalness:.1}),
    gun:mat({color:srgb('#202224'),roughness:.4,metalness:.7}),
    exhaust:mat({color:srgb('#3b2b23'),roughness:.9,metalness:.3}),
    torpedo:mat({color:srgb('#5d625b'),roughness:.5,metalness:.35}),
    wood:mat({color:srgb('#8a6a43'),roughness:.8,metalness:0,side:T.DoubleSide}),
    flight:mat({color:srgb('#6b4b30'),roughness:.8,metalness:0}),
    face:mat({color:srgb('#c49a7c'),roughness:.7,metalness:0}),
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
    add(root,mesh(revolve([[0.74,.60],[0.52,.625],[0.46,.66],[0.45,.71],[0.48,.752],[0.60,.774],[1.10,.781],[1.62,.774],[1.86,.762]],48),mats.paint,'cowling'));
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
    p.add(mesh(hub,mats.steel,'propHub'));
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
    for(const s of [3.55,4.10,4.75,5.20,5.75,6.25]){const pts=[];for(let k=0;k<=24;k++)pts.push(canopyPoint(s,-Math.PI/2+Math.PI*k/24));for(let k=0;k<24;k++)frames.push(cylinderBetween(pts[k],pts[k+1],.022,6));}
    for(const a of [-Math.PI/2,-1.05,-.45,0,.45,1.05,Math.PI/2]){const pts=ss.filter((_,i)=>i%2===0).map(s=>canopyPoint(s,a));for(let k=0;k<pts.length-1;k++)frames.push(cylinderBetween(pts[k],pts[k+1],.018,6));}
    add(root,mesh(merge(frames),mats.frame,'canopyFrames'));
    const mastBase=[0,SILL(3.9)+CH(3.9)-.02,zs(3.9)],mastTop=[0,SILL(3.9)+CH(3.9)+.36,zs(3.98)];
    add(root,mesh(merge([cylinderBetween(mastBase,mastTop,.032,6,.018),cylinderBetween(mastTop,[0,FIN_TOP-.10,zs(11.95)],.006,4)]),mats.gun,'antenna'));
    const tub=[boxAt(1.1,.05,3.3,0,0.05,zs(4.7))];
    for(const sx of [-1,1])tub.push(boxAt(.04,.62,3.3,sx*.52,.36,zs(4.7)));
    tub.push(boxAt(1.1,.85,.04,0,.42,zs(3.10)),boxAt(.42,.40,.06,0,.66,zs(3.55)),boxAt(.42,.62,.10,0,.42,zs(4.75)),boxAt(.40,.10,.40,0,.18,zs(4.55)),boxAt(.4,.5,.06,0,.40,zs(5.65)));
    add(root,mesh(merge(tub),mats.interior,'cockpitTub'));
    add(root,mesh(boxAt(.36,.24,.02,0,.62,zs(3.13)),mats.dark,'instrumentPanel'));
    if(opts.crew!==false){
      const suit=[],faces=[];
      for(const [s,y] of [[4.45,.98],[5.55,.92]]){suit.push(sphereAt(.13,0,y,zs(s)),boxAt(.46,.32,.26,0,y-.27,zs(s)+.04));faces.push(sphereAt(.105,0,y-.035,zs(s)-.035,12,8));}
      add(root,mesh(merge(suit),mats.flight,'crew'));add(root,mesh(merge(faces),mats.face,'crewFaces'));
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
    if(opts.crew!==false)t.add(mesh(sphereAt(.12,-.08,.08,-.05),mats.flight,'gunnerHead'));
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
    const hub=geo(new T.CylinderGeometry(.215,.215,.17,24));hub.rotateZ(Math.PI/2);wheel.add(mesh(hub,mats.steel,'hub'));
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
    const th=geo(new T.CylinderGeometry(.08,.08,.08,14));th.rotateZ(Math.PI/2);w.add(mesh(th,mats.steel,'tailHub'));
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
