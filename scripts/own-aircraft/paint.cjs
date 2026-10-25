'use strict';
// Bakes a paint atlas from world-space paint rules: every texel a triangle covers is coloured by
// the 3D point and normal it maps to, so camouflage, markings and wear follow the airframe shape
// instead of the UV layout. Also bakes a height field (panel lines) into a tangent-space normal map.
const {createCanvas}=require('@napi-rs/canvas');

function bake(items,size,paint){
  const rgb=new Float32Array(size*size*3),height=new Float32Array(size*size),covered=new Uint8Array(size*size);
  for(const {surface:s,normals,tag} of items){
    for(let k=0;k<s.i.length;k+=3){
      const ids=[s.i[k],s.i[k+1],s.i[k+2]],U=ids.map(j=>[s.uv[j*2]*size,s.uv[j*2+1]*size]);
      const area=(U[1][0]-U[0][0])*(U[2][1]-U[0][1])-(U[2][0]-U[0][0])*(U[1][1]-U[0][1]);if(Math.abs(area)<1e-9)continue;
      const x0=Math.max(0,Math.floor(Math.min(U[0][0],U[1][0],U[2][0]))),x1=Math.min(size-1,Math.ceil(Math.max(U[0][0],U[1][0],U[2][0])));
      const y0=Math.max(0,Math.floor(Math.min(U[0][1],U[1][1],U[2][1]))),y1=Math.min(size-1,Math.ceil(Math.max(U[0][1],U[1][1],U[2][1])));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const px=x+.5,py=y+.5,w0=((U[1][0]-px)*(U[2][1]-py)-(U[2][0]-px)*(U[1][1]-py))/area,w1=((U[2][0]-px)*(U[0][1]-py)-(U[0][0]-px)*(U[2][1]-py))/area,w2=1-w0-w1;
        if(w0<-.01||w1<-.01||w2<-.01)continue;
        const p=[0,0,0],n=[0,0,0];for(let a=0;a<3;a++){const w=[w0,w1,w2][a],j=ids[a];for(let c=0;c<3;c++){p[c]+=w*s.p[j*3+c];n[c]+=w*normals[j*3+c];}}
        const l=Math.hypot(n[0],n[1],n[2])||1;n[0]/=l;n[1]/=l;n[2]/=l;
        const out=paint(p,n,tag),i=y*size+x;rgb[i*3]=out.rgb[0];rgb[i*3+1]=out.rgb[1];rgb[i*3+2]=out.rgb[2];height[i]=out.h||0;covered[i]=1;
      }
    }
  }
  dilate(rgb,height,covered,size,4);
  return {rgb,height,covered,size};
}
// Grow painted islands a few texels so mip-mapping never samples unpainted black at UV seams.
function dilate(rgb,height,covered,size,steps){
  for(let s=0;s<steps;s++){const add=[];
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x;if(covered[i])continue;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=size||Y>=size)continue;const j=Y*size+X;if(covered[j]){add.push([i,j]);break;}}}
    for(const [i,j] of add){rgb[i*3]=rgb[j*3];rgb[i*3+1]=rgb[j*3+1];rgb[i*3+2]=rgb[j*3+2];height[i]=height[j];covered[i]=1;}}
}
function toPng({rgb,size}){
  const c=createCanvas(size,size),ctx=c.getContext('2d'),img=ctx.createImageData(size,size);
  for(let i=0;i<size*size;i++){img.data[i*4]=Math.max(0,Math.min(255,Math.round(rgb[i*3])));img.data[i*4+1]=Math.max(0,Math.min(255,Math.round(rgb[i*3+1])));img.data[i*4+2]=Math.max(0,Math.min(255,Math.round(rgb[i*3+2])));img.data[i*4+3]=255;}
  ctx.putImageData(img,0,0);return c.toBuffer('image/png');
}
// Height field -> tangent-space normal map (OpenGL/glTF convention, +Y green up in UV v).
function normalPng({height,size},strength=2.2,outSize=size/2){
  const f=size/outSize,c=createCanvas(outSize,outSize),ctx=c.getContext('2d'),img=ctx.createImageData(outSize,outSize),H=(x,y)=>height[Math.min(size-1,Math.max(0,y))*size+Math.min(size-1,Math.max(0,x))];
  for(let y=0;y<outSize;y++)for(let x=0;x<outSize;x++){const X=Math.round(x*f),Y=Math.round(y*f),dx=(H(X+1,Y)-H(X-1,Y))*strength,dy=(H(X,Y+1)-H(X,Y-1))*strength,l=Math.hypot(dx,dy,1);
    const o=(y*outSize+x)*4;img.data[o]=Math.round((-dx/l*.5+.5)*255);img.data[o+1]=Math.round((dy/l*.5+.5)*255);img.data[o+2]=Math.round((1/l*.5+.5)*255);img.data[o+3]=255;}
  ctx.putImageData(img,0,0);return c.toBuffer('image/png');
}

// Deterministic value noise and fbm, no Math.random.
function hash(x,y,z,seed){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,1440662683)^Math.imul(seed|0,2246822519);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
function noise(x,y,z,seed=1){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z),fx=x-X,fy=y-Y,fz=z-Z,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),sz=fz*fz*(3-2*fz);let v=0;
  for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)v+=hash(X+a,Y+b,Z+c,seed)*(a?sx:1-sx)*(b?sy:1-sy)*(c?sz:1-sz);return v;}
function fbm(x,y,z,seed=1,oct=4){let v=0,a=.5,f=1;for(let o=0;o<oct;o++){v+=a*noise(x*f,y*f,z*f,seed+o*17);f*=2.03;a*=.5;}return v/(1-Math.pow(.5,oct));}

// Glyph bitmap for numbers/letters, sampled in local units 0..1 (x right, y down).
function glyph(text,font='bold 400px DejaVu Sans'){
  const c=createCanvas(600,520),ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,600,520);ctx.font=font;ctx.fillStyle='#fff';ctx.textBaseline='top';
  const m=ctx.measureText(text);ctx.fillText(text,(600-m.width)/2,30);const d=ctx.getImageData(0,0,600,520).data;
  let x0=600,y0=520,x1=0,y1=0;for(let y=0;y<520;y++)for(let x=0;x<600;x++)if(d[(y*600+x)*4]>128){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(x1<x0)return {aspect:1,sample:()=>0,near:()=>false};// no font available: skip the marking rather than crash
  const w=x1-x0+1,h=y1-y0+1;
  return {aspect:w/h,sample(u,v){if(u<0||v<0||u>1||v>1)return 0;const x=Math.min(w-1,Math.floor(u*w))+x0,y=Math.min(h-1,Math.floor(v*h))+y0;return d[(y*600+x)*4]/255;},
    // distance-ish outline test: any covered sample within r (in glyph units)
    near(u,v,r){for(const [a,b] of [[r,0],[-r,0],[0,r],[0,-r],[r*.7,r*.7],[-r*.7,r*.7],[r*.7,-r*.7],[-r*.7,-r*.7]])if(this.sample(u+a/this.aspect,v+b)>.5)return true;return false;}};
}
// Balkenkreuz in local units (centre 0,0, half size 1): 'core' black arms, 'edge' white outline.
function cross(u,v,arm=.25,edge=.09){const a=Math.abs(u),b=Math.abs(v);if(a>1+edge||b>1+edge)return null;
  const inCore=(a<=arm&&b<=1)||(b<=arm&&a<=1),inEdge=(a<=arm+edge&&b<=1+edge)||(b<=arm+edge&&a<=1+edge);return inCore?'core':inEdge?'edge':null;}

module.exports={bake,toPng,normalPng,noise,fbm,hash,glyph,cross};
