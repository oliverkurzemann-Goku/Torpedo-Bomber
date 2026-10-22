/* Bakes the 1942 finish for the repository's Avenger, "Grumman Tbm Avenger" by helijah
 * (Emmanuel Baranger, with Laurent Hayvel), CC BY 4.0 via Sketchfab. Geometry and UVs stay
 * untouched; only the 2048 px airframe atlas embedded in grumman tbm avenger.glb is repainted:
 *  - the bright tri-colour with 1941 rudder stripes becomes the 1942 non-specular Blue-Gray
 *    over Light Gray, keeping the original panel lines, rivet rows and baked shading;
 *  - star-in-circle insignia, "10" on the fin, own squadron badge and stencils;
 *  - sun fading, grime, exhaust soot, chipped leading edges, wing-root walkways and yellow
 *    propeller tips;
 *  - a tangent-space normal map engraved from the same panel lines.
 * The result ships as assets/aircraft/avenger-1942-*.{webp,png}; avenger-finish.js swaps it in
 * at load time, so the game does no pixel work. Changes to helijah's texture are a CC BY
 * adaptation; credit stays in ASSET-CREDITS.md.
 *
 *   node scripts/bake-avenger-livery.cjs        # rewrites the two files
 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const SIZE=2048;
const inRect=(x,y,r)=>x>=r[0]&&x<r[2]&&y>=r[1]&&y<r[3];
const PAINT={upper:[72,84,96],lower:[135,139,136],interior:[70,76,60],metal:[168,170,166],soot:[34,31,27],walkway:[30,32,32],tip:[205,160,30]};
// Atlas rectangles in image pixels (x0,y0,x1,y1), measured on the original texture.
const KEEP=[[0,0,1295,258],[10,1250,450,1320],[24,280,224,474],[24,1655,410,2000],[1136,1840,1668,2026],[0,2008,2048,2048]];
const RUDDER=[[264,1372,388,1664],[1848,1680,1973,1972]];
// Old markings (1943 insignia bars, "4", diamonds, carrier name) are inpainted from the
// paint next to them on the same image row: circles [cx,cy,r] and rectangles [x0,y0,x1,y1].
const ERASE=[[650,1353,38],[583,1338,719,1369],[1598,1662,39],[1528,1646,1668,1676],[213,1007,37],[146,992,280,1019],
  [227,598,34],[166,584,290,613],[1426,950,1487,1055],[1403,1319,1437,1367],[805,1626,840,1675],[396,1378,472,1430],
  [387,1460,476,1568],[1758,1770,1849,1874]];
const inErase=(x,y)=>ERASE.some(e=>e.length===3?(x-e[0])**2+(y-e[1])**2<=e[2]*e[2]:x>=e[0]&&x<e[2]&&y>=e[1]&&y<e[3]);
// Wing and tailplane islands: leading edges are the lower edge of each island in the image.
const EDGES=[[48,358,776,750,3],[888,353,1624,750,3],[38,768,781,1168,1],[888,768,1622,1168,1],[1397,205,1995,426,1],[1397,0,1995,218,3]];
const ROOTS=[[38,768,781,1168,'right'],[888,768,1622,1168,'left']];
// Propeller blades: two atlas points per blade at 0.6 m and 1.6-1.9 m radius.
const BLADES=[[[1871,975,.6],[2025,948,1.75]],[[1768,925,.6],[1676,770,1.92]],[[1728,1043,.6],[1658,1170,1.6]]];
const PROP_RECT=[1590,690,2048,1262];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const mix=(a,b,t)=>a+(b-a)*t;

// Value noise from a fixed lattice: deterministic, cheap, no Math.random.
function lattice(n,seed){const a=new Float32Array(n*n);let s=seed;for(let i=0;i<a.length;i++){s=(s*16807)%2147483647;a[i]=s/2147483647;}return a;}
function sampler(grid,n,scale){
  return (x,y)=>{const fx=x/scale,fy=y/scale,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy,sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
    const x0=((ix%n)+n)%n,y0=((iy%n)+n)%n,x1=(x0+1)%n,y1=(y0+1)%n;
    const a=grid[y0*n+x0],b=grid[y0*n+x1],c=grid[y1*n+x0],d=grid[y1*n+x1];
    return mix(mix(a,b,sx),mix(c,d,sx),sy);};
}
// Box blur of v weighted by w (normalised convolution), separable, radius r. Where no weight
// is in reach the result is `empty`; `sums` optionally receives the weight in the window.
function blur(v,w,W,H,r,empty=1,sums=null){
  const N=W*H,vw=new Float32Array(N),tv=new Float32Array(N),tw=new Float32Array(N),ov=new Float32Array(N);
  for(let i=0;i<N;i++)vw[i]=v[i]*w[i];
  for(let y=0;y<H;y++){const o=y*W;let sv=0,sw=0;
    for(let x=0;x<r&&x<W;x++){sv+=vw[o+x];sw+=w[o+x];}
    for(let x=0;x<W;x++){const a=x+r,b=x-r-1;if(a<W){sv+=vw[o+a];sw+=w[o+a];}if(b>=0){sv-=vw[o+b];sw-=w[o+b];}tv[o+x]=sv;tw[o+x]=sw;}}
  // vertical pass row by row with per-column running sums (cache friendly)
  const cv=new Float64Array(W),cw=new Float64Array(W);
  for(let y=0;y<r&&y<H;y++){const o=y*W;for(let x=0;x<W;x++){cv[x]+=tv[o+x];cw[x]+=tw[o+x];}}
  for(let y=0;y<H;y++){
    const a=y+r,b=y-r-1,o=y*W;
    if(a<H){const p=a*W;for(let x=0;x<W;x++){cv[x]+=tv[p+x];cw[x]+=tw[p+x];}}
    if(b>=0){const p=b*W;for(let x=0;x<W;x++){cv[x]-=tv[p+x];cw[x]-=tw[p+x];}}
    for(let x=0;x<W;x++){const sw=cw[x];ov[o+x]=sw>1e-3?cv[x]/sw:empty;if(sums)sums[o+x]=sw;}
  }
  return ov;
}
// The same normalised blur on an f-times smaller grid: returns {at(x,y) bilinear, near(i), frac(i)}.
function blurDown(v,w,W,H,f,r,empty){
  const w2=W/f,h2=H/f,sv=new Float32Array(w2*h2),sw=new Float32Array(w2*h2),area=f*f*(2*r+1)*(2*r+1);
  for(let y=0;y<H;y++){const o=y*W,oo=(y/f|0)*w2;for(let x=0;x<W;x++){const k=oo+(x/f|0),ww=w[o+x];sv[k]+=v[o+x]*ww;sw[k]+=ww;}}
  for(let k=0;k<sv.length;k++)sv[k]=sw[k]>0?sv[k]/sw[k]:0;
  const sums=new Float32Array(w2*h2),avg=blur(sv,sw,w2,h2,r,empty,sums);
  return {
    near:i=>avg[((i/W|0)/f|0)*w2+((i%W)/f|0)],
    frac:i=>sums[((i/W|0)/f|0)*w2+((i%W)/f|0)]/area,
    at(x,y){const fx=Math.min(w2-1.001,Math.max(0,(x+.5)/f-.5)),fy=Math.min(h2-1.001,Math.max(0,(y+.5)/f-.5)),ix=fx|0,iy=fy|0,tx=fx-ix,ty=fy-iy,k=iy*w2+ix;
      const a=avg[k],b=avg[k+1],c=avg[k+w2],d=avg[k+w2+1];
      if(a!==a||b!==b||c!==c||d!==d){const n=[a,b,c,d].filter(t=>t===t);return n.length?n.reduce((p,t)=>p+t,0)/n.length:NaN;}
      return mix(mix(a,b,tx),mix(c,d,tx),ty);}
  };
}
// Smooth noise field on a coarse grid, upsampled bilinearly in the paint loop.
function field(n,cell,octaves){
  const f=new Float32Array(n*n);
  for(const [scale,weight,seed] of octaves){const s=sampler(lattice(64,seed),64,scale/cell);for(let y=0;y<n;y++)for(let x=0;x<n;x++)f[y*n+x]+=weight*s(x,y);}
  return f;
}
function star(ctx,r){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.382:r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();}
// 1942 national insignia: blue disc, white star, no bars.
function insignia(ctx,r){ctx.fillStyle='#1f2a45';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d8d6cc';star(ctx,r*.97);ctx.fill();}
// Original squadron-style badge (own artwork): torpedo and lightning bolt on a roundel.
function badge(ctx,r){
  ctx.fillStyle='#b8952f';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#24375a';ctx.beginPath();ctx.arc(0,0,r*.86,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#d6d3c8';ctx.beginPath();ctx.ellipse(-r*.05,r*.18,r*.55,r*.11,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(r*.48,r*.18);ctx.lineTo(r*.66,r*.04);ctx.lineTo(r*.66,r*.32);ctx.closePath();ctx.fill();
  ctx.fillStyle='#b8952f';ctx.beginPath();ctx.moveTo(-r*.08,-r*.62);ctx.lineTo(r*.18,-r*.62);ctx.lineTo(r*.02,-r*.25);ctx.lineTo(r*.22,-r*.25);ctx.lineTo(-r*.18,r*.06);ctx.lineTo(-r*.02,-r*.20);ctx.lineTo(-r*.22,-r*.20);ctx.closePath();ctx.fill();
}
// Every marking is drawn upright for the viewer: on this atlas aircraft "up" (or "forward"
// on the wings) runs toward +y in the image, so each stamp is flipped vertically.
function stamp(ctx,x,y,draw){ctx.save();ctx.translate(x,y);ctx.scale(1,-1);draw();ctx.restore();}

function repaint(rgba,W,H){
  const N=W*H,cls=new Uint8Array(N),sub=new Uint8Array(N),flat=new Uint8Array(N),q=new Float32Array(N),paintW=new Float32Array(N),stainable=new Uint8Array(N);
  const zone=new Uint8Array(N),mark=(r,bit)=>{for(let y=r[1];y<r[3];y++)for(let x=r[0];x<r[2];x++)zone[y*W+x]|=bit;};
  KEEP.forEach(r=>mark(r,1));RUDDER.forEach(r=>mark(r,2));mark(PROP_RECT,4);
  for(const e of ERASE){if(e.length===4){mark(e,8);continue;}const [cx,cy,rr]=e;for(let y=cy-rr;y<=cy+rr;y++)for(let x=cx-rr;x<=cx+rr;x++)if((x-cx)**2+(y-cy)**2<=rr*rr)zone[y*W+x]|=8;}
  // 1. classify: sub 1 navy (top), 2 light blue (sides), 3 cream (undersides); cls 1 upper paint,
  //    2 lower paint, 3 interior, 4 propeller. Navy/blue and cream are decided on a blurred
  //    image, so rivet dots, panel lines and painted stains belong to the surface under them.
  const lum=new Float32Array(N),blue=new Float32Array(N),grey=new Float32Array(N);
  for(let i=0;i<N;i++){
    const r=rgba[i*4],g=rgba[i*4+1],b=rgba[i*4+2],mx=r>g?(r>b?r:b):(g>b?g:b),mn=r<g?(r<b?r:b):(g<b?g:b),z=zone[i];
    lum[i]=(.2126*r+.7152*g+.0722*b)/255;
    if(z&3)continue;
    if(r>50&&r>g*1.8&&r>b*1.8){cls[i]=3;continue;}
    if(z&4&&mx<30){cls[i]=4;continue;}
    if(b>r+10)blue[i]=1;else if(mx-mn<38)grey[i]=1;
  }
  const lumBlue=blurDown(lum,blue,W,H,2,2,0),lumGrey=blurDown(lum,grey,W,H,2,2,0);
  const sumL=[0,0,0,0],cnt=[0,0,0,0];
  for(let i=0;i<N;i++){
    const z=zone[i];
    if(z&1||cls[i])continue;
    if(z&2){cls[i]=1;sub[i]=2;flat[i]=2;continue;}
    let kind=blue[i]?1:grey[i]?2:0;
    if(!kind){const fb=lumBlue.frac(i),fg=lumGrey.frac(i);kind=fb>.3&&fb>=fg?1:fg>.3?2:0;if(kind)stainable[i]=1;}
    if(kind===1){cls[i]=1;sub[i]=lumBlue.near(i)<.30?1:2;}
    else if(kind===2&&lumGrey.near(i)>.40){cls[i]=2;sub[i]=3;}
    else continue;
    if(!stainable[i]){sumL[sub[i]]+=lum[i];cnt[sub[i]]++;}
  }
  const base=sumL.map((v,k)=>cnt[k]?v/cnt[k]:1);
  // painted streaks wider than the blur window: adopt the paint found above or below (<=24 px)
  for(let x=0;x<W;x++)for(let y=0;y<H;y++){
    const i=y*W+x;if(cls[i]||zone[i]&3)continue;
    let best=-1;for(let d=1;d<=24&&best<0;d++)for(const yy of [y-d,y+d]){if(yy<0||yy>=H)continue;const k=yy*W+x;if((cls[k]===1||cls[k]===2)&&!stainable[k]){best=k;break;}}
    if(best>=0){cls[i]=cls[best];sub[i]=sub[best];stainable[i]=1;}
  }
  // inpaint old markings: take class and surface from the nearest unmarked paint on the row
  for(let y=0;y<H;y++){
    const o=y*W;let x=0;
    while(x<W){
      if(!(zone[o+x]&8)){x++;continue;}
      let x1=x;while(x1<W&&zone[o+x1]&8)x1++;
      const L=x-1,R=x1,ok=k=>k>=0&&k<W&&(cls[o+k]===1||cls[o+k]===2);
      for(let k=x;k<x1;k++){const i=o+k,src=(k-L<=R-k&&ok(L))||!ok(R)?L:R;if(!ok(src))continue;cls[i]=cls[o+src];sub[i]=sub[o+src];flat[i]=1;stainable[i]=0;}
      x=x1;
    }
  }
  for(let i=0;i<N;i++){
    q[i]=lum[i];
    if(cls[i]!==1&&cls[i]!==2)continue;
    if(flat[i]===2){const red=rgba[i*4]>rgba[i*4+1]*1.4;q[i]=lum[i]/(red?.30:.86);paintW[i]=red?0:1;continue;}  // rudder: shading from the white stripes only
    q[i]=flat[i]?1:lum[i]/base[sub[i]];paintW[i]=flat[i]||stainable[i]?0:1;
  }
  // 2. shading (large blur) and panel lines (small high-pass); class borders carry no line.
  //    Inpainted areas take the shading of the paint around them.
  const qc=new Float32Array(N);for(let i=0;i<N;i++)qc[i]=q[i]<.6?.6:q[i]>1.4?1.4:q[i];
  const lo=blurDown(qc,paintW,W,H,4,6,NaN),far=blurDown(qc,paintW,W,H,8,9,1),mid=blur(q,paintW,W,H,3);
  const line=new Float32Array(N);
  for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){
    const i=y*W+x;if(!paintW[i])continue;
    const s=sub[i];if(sub[i-1]!==s||sub[i+1]!==s||sub[i-W]!==s||sub[i+W]!==s||sub[i-2]!==s||sub[i+2]!==s||sub[i-2*W]!==s||sub[i+2*W]!==s)continue;
    const h=q[i]-mid[i];line[i]=s===1?clamp(h*.8,0,1):clamp(-h*3.2,0,1);
  }
  // 3. paint, weather, soot
  const FN=256,fade=field(FN,8,[[170,.6,7],[41,.4,19]]),GN=1024,grit=field(GN,2,[[6,1,29]]);
  for(let y=0;y<H;y++){
    const fy=y/8,iy=Math.min(FN-2,fy|0),ty=fy-iy,gy=Math.min(GN-1,y>>1);
    for(let x=0;x<W;x++){
      const i=y*W+x,c=cls[i];if(!c||c===4)continue;const o=i*4;
      if(c===3){const k=.75+.5*clamp(q[i]/.25,0,1);rgba[o]=PAINT.interior[0]*k;rgba[o+1]=PAINT.interior[1]*k;rgba[o+2]=PAINT.interior[2]*k;continue;}
      const fx=x/8,ix=Math.min(FN-2,fx|0),tx=fx-ix,j=iy*FN+ix;
      const f=mix(mix(fade[j],fade[j+1],tx),mix(fade[j+FN],fade[j+FN+1],tx),ty),gr=grit[gy*GN+(x>>1)];
      let lv=lo.at(x,y);if(lv!==lv)lv=far.at(x,y);
      const shade=clamp(1+(lv-1)*.55,.82,1.12),ln=line[i];
      const col=c===1?PAINT.upper:PAINT.lower;let r=col[0],g=col[1],b=col[2];
      if(sub[i]===1){r=r*1.02+2;g=g*1.02+2;b=b*1.01+2;}             // sun-bleached upper surfaces
      const m=shade*(1-.30*ln)*(1+.04*(gr-.5));
      r*=m;g*=m;b*=m;
      if(c===1){const t=clamp((f-.42)*.14,0,.05);r=mix(r,206,t);g=mix(g,212,t);b=mix(b,214,t);}   // chalky fading
      else{const t=clamp((f-.35)*.14,0,.07);r=mix(r,70,t);g=mix(g,64,t);b=mix(b,52,t);}            // grime underneath
      if(stainable[i]){                                                                          // exhaust/oil streaks painted by the author
        const r0=rgba[o],b0=rgba[o+2],t=Math.max(clamp((r0-b0)/40,0,1)*clamp((.85-lum[i])/.45,0,1),clamp((.42-lum[i])/.25,0,1))*.72;
        r=mix(r,PAINT.soot[0],t);g=mix(g,PAINT.soot[1],t);b=mix(b,PAINT.soot[2],t);
      }
      rgba[o]=r<0?0:r>255?255:r;rgba[o+1]=g<0?0:g>255?255:g;rgba[o+2]=b<0?0:b>255?255:b;
    }
  }
  // 4. yellow propeller tips (last 0.18 m of each 1.98 m blade)
  for(let y=PROP_RECT[1];y<PROP_RECT[3];y++)for(let x=PROP_RECT[0];x<PROP_RECT[2];x++){
    const i=y*W+x;if(cls[i]!==4)continue;let best=1e9,rad=0;
    for(const [[ax,ay,ar],[bx,by,br]] of BLADES){const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,px=x-ax,py=y-ay,d=Math.abs(px*uy-py*ux);if(d<best){best=d;rad=ar+(px*ux+py*uy)/len*(br-ar);}}
    if(rad>1.80){const o=i*4;rgba[o]=PAINT.tip[0];rgba[o+1]=PAINT.tip[1];rgba[o+2]=PAINT.tip[2];cls[i]=5;}
  }
  return {cls,sub,flat,line,base};
}

// Canvas pass: markings, walkways, chipped edges, rudder rib tapes. Returns extra relief strokes.
function decorate(ctx,sub,W){
  const rand=(()=>{let s=4242;return ()=>(s=(s*16807)%2147483647)/2147483647;})();
  // markings
  for(const [x,y,r] of [[651,1354,42],[1598,1662,42],[213,1007,44],[227,598,42]])stamp(ctx,x,y,()=>insignia(ctx,r));
  for(const [x,y] of [[432,1512],[1806,1823]])stamp(ctx,x,y,()=>{ctx.fillStyle='#d9d7cd';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 58px sans-serif';ctx.fillText('10',0,0);});
  for(const [x,y] of [[1432,1398],[812,1712]])stamp(ctx,x,y,()=>badge(ctx,25));
  for(const [x,y] of [[433,1404],[1813,1712]])stamp(ctx,x,y,()=>{ctx.fillStyle='rgba(18,20,22,.82)';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 11px sans-serif';ctx.fillText('U.S. NAVY',0,-7);ctx.font='8px sans-serif';ctx.fillText('TBF-1  BuNo 00510',0,5);});
  // rudder: doped fabric with rib tapes every ~0.2 m
  for(const [x0,y0,x1,y1] of RUDDER){for(let y=y0+12;y<y1-4;y+=24){ctx.fillStyle='rgba(225,230,232,.045)';ctx.fillRect(x0+3,y-1.5,x1-x0-6,3);ctx.fillStyle='rgba(10,12,14,.04)';ctx.fillRect(x0+3,y+1.5,x1-x0-6,1);}}
  // wing-root walkways (anti-skid) on the upper surfaces, scuffed at the edges
  const lowest=(x,y0,y1,c)=>{for(let y=y1-1;y>=y0;y--)if(sub[y*W+x]===c)return y;return -1;};
  const highest=(x,y0,y1,c)=>{for(let y=y0;y<y1;y++)if(sub[y*W+x]===c)return y;return -1;};
  for(const [x0,y0,x1,y1,side] of ROOTS){
    const rootX=side==='right'?(()=>{for(let x=x1-1;x>x0;x--)if(lowest(x,y0,y1,1)>0)return x;return x1;})():(()=>{for(let x=x0;x<x1;x++)if(lowest(x,y0,y1,1)>0)return x;return x0;})();
    const dir=side==='right'?-1:1,wx0=rootX+dir*4,wx1=rootX+dir*58;
    ctx.beginPath();
    const pts=[];for(let k=0;k<=12;k++){const x=Math.round(mix(wx0,wx1,k/12)),le=lowest(x,y0,y1,1),te=highest(x,y0,y1,1),ch=le-te;pts.push([x,le-ch*.16,le-ch*.56]);}
    pts.forEach(([x,a],k)=>k?ctx.lineTo(x,a):ctx.moveTo(x,a));for(let k=pts.length-1;k>=0;k--)ctx.lineTo(pts[k][0],pts[k][2]);ctx.closePath();
    ctx.fillStyle='rgba(30,32,32,.88)';ctx.fill();
    ctx.fillStyle='rgba(76,78,76,.35)';for(let n=0;n<420;n++){const k=rand()*12|0,[x,a,b]=pts[k];ctx.fillRect(x+rand()*dir*5,mix(a,b,rand()),1.2,1.2);}
    ctx.fillStyle='rgba(138,142,140,.55)';for(let n=0;n<90;n++){const k=rand()*12|0,[x,a,b]=pts[k],y=rand()<.5?a+rand()*7-3:b+rand()*7-3;ctx.beginPath();ctx.arc(x+rand()*dir*5,y,.5+rand()*1.3,0,7);ctx.fill();}
  }
  // chipped paint along leading edges: bare aluminium shows through, mostly tiny flecks
  const leadingEdge=(x,y0,y1,c)=>{let y=y0;while(y<y1&&sub[y*W+x]!==c)y++;if(y>=y1)return null;const te=y;let gap=0,le=y;
    for(;y<y1&&gap<4;y++){if(sub[y*W+x]===c){le=y;gap=0;}else gap++;}return le-te>40?le:null;};
  for(const [x0,y0,x1,y1,c] of EDGES){
    ctx.fillStyle=c===1?'rgba(150,154,152,.62)':'rgba(172,174,170,.45)';
    for(let x=x0;x<x1;x++){const le=leadingEdge(x,y0,y1,c);if(le===null||rand()>.16)continue;
      const d=Math.pow(rand(),2.6)*13,s=.45+rand()*rand()*1.5;ctx.beginPath();ctx.ellipse(x,le-1-d,s*1.5,s,0,0,7);ctx.fill();}
  }
}

// Height field: engraved panel lines and rivets from the original art, rudder rib tapes, walkway grain.
function normalMap(line,cls,W,H,size,makeCanvas){
  const f=W/size,h=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){let s=0;for(let j=0;j<f;j++)for(let i=0;i<f;i++)s+=line[(y*f+j)*W+x*f+i];h[y*size+x]=-Math.min(.6,s/(f*f));}
  for(const [x0,y0,x1,y1] of RUDDER)for(let y=y0+12;y<y1-4;y+=24)for(let x=x0+3;x<x1-3;x++){const X=Math.round(x/f),Y=Math.round(y/f);if(X<size&&Y<size)h[Y*size+X]+=.08;}
  const c=makeCanvas(size,size),ctx=c.getContext('2d'),img=ctx.createImageData(size,size),d=img.data,k=.9,S=size;
  for(let y=0;y<S;y++){const ym=(y?y-1:0)*S,y0=y*S,yp=(y<S-1?y+1:y)*S;
    for(let x=0;x<S;x++){const xm=x?x-1:0,xp=x<S-1?x+1:x;
      const dx=(h[ym+xp]+2*h[y0+xp]+h[yp+xp]-h[ym+xm]-2*h[y0+xm]-h[yp+xm])*k,dy=(h[yp+xm]+2*h[yp+x]+h[yp+xp]-h[ym+xm]-2*h[ym+x]-h[ym+xp])*k;
      const l=Math.sqrt(dx*dx+dy*dy+1),o=(y0+x)*4;
      d[o]=(-dx/l*.5+.5)*255;d[o+1]=(-dy/l*.5+.5)*255;d[o+2]=(1/l*.5+.5)*255;d[o+3]=255;}}
  ctx.putImageData(img,0,0);return c;
}


// Embedded atlas straight from the GLB (no loader needed): material "DefaultWhite_texture.png".
function atlasFromGlb(file){
  const b=fs.readFileSync(file),len=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+len).toString()),bin=20+len+8;
  const m=j.materials.find(x=>x.name==='DefaultWhite_texture.png'),img=j.images[j.textures[m.pbrMetallicRoughness.baseColorTexture.index].source],bv=j.bufferViews[img.bufferView];
  return b.subarray(bin+(bv.byteOffset||0),bin+(bv.byteOffset||0)+bv.byteLength);
}
async function bake({createCanvas,loadImage},glb){
  const img=await loadImage(atlasFromGlb(glb)),canvas=createCanvas(SIZE,SIZE),ctx=canvas.getContext('2d');
  ctx.drawImage(img,0,0);
  const data=ctx.getImageData(0,0,SIZE,SIZE),px=data.data;
  const at=(x,y)=>{const o=(y*SIZE+x)*4;return [px[o],px[o+1],px[o+2]];},near=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2])<60;
  // the known layout only: navy upper wing, cream lower wing, red rudder stripe, atlas background
  if(!(near(at(400,950),[28,42,74])&&near(at(400,500),[184,188,180])&&near(at(350,1520),[155,39,41])&&near(at(20,700),[139,168,182])))throw Error('unexpected Avenger atlas layout');
  const res=repaint(px,SIZE,SIZE);
  ctx.putImageData(data,0,0);
  decorate(ctx,res.sub,SIZE);
  return {map:canvas,normal:normalMap(res.line,res.cls,SIZE,SIZE,1024,createCanvas),base:res.base};
}
module.exports={bake,SIZE,PAINT,ERASE,RUDDER,BLADES};
if(require.main===module)(async()=>{
  const root=path.resolve(__dirname,'..'),canvas=require('@napi-rs/canvas'),out=path.join(root,'assets/aircraft');
  const t=Date.now(),r=await bake(canvas,path.join(root,'grumman tbm avenger.glb'));
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'avenger-1942-livery.webp'),await r.map.encode('webp',94));
  fs.writeFileSync(path.join(out,'avenger-1942-normal.png'),await r.normal.encode('png'));
  console.log('Avenger 1942 livery baked in',Date.now()-t,'ms');
})().catch(e=>{console.error(e);process.exitCode=1;});
