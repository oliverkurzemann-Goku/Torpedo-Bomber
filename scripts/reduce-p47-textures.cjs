#!/usr/bin/env node
/* Shrinks the large embedded textures of the P-47 model. Geometry, UVs, materials, nodes and clips are not touched:
 * only the image bytes of textures wider than --size are replaced and the bufferViews re-packed.
 *
 * Why a plain box filter: halving 4096 -> 2048 with a 2x2 box is the same image the graphics card builds itself as
 * mip level 1 of the 4096 texture. Whenever the aeroplane is far enough away that the GPU samples level 1 or coarser
 * (measured in the real game: every camera the game has), the picture is the same; only the unused level 0 goes.
 * 4096x4096 RGBA with mipmaps = 85.3 MB of graphics memory per texture, 2048x2048 = 21.3 MB.
 *
 * Every reduced texture is written as 8-bit RGB PNG (lossless; own small encoder so no alpha channel is added).
 * The JPEG livery becomes a PNG too: a second JPEG pass would add compression loss and halve the colour
 * resolution again, and the lossless 2048 px file is under 1 MB anyway.
 *
 * usage: node scripts/reduce-p47-textures.cjs [input.glb] [output.glb] [--size 2048] [--keep <name part>] [--dump dir]
 * default input : assets/aircraft/source/p47-independent/p47-independent-4096.glb (the unreduced Build 204 model)
 * default output: assets/aircraft/p47-independent.glb */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2),flags={},files=[];
for(let i=0;i<args.length;i++){if(args[i].startsWith('--')){flags[args[i].slice(2)]=args[i+1];i++;}else files.push(args[i]);}
const input=files[0]||path.join(root,'assets/aircraft/source/p47-independent/p47-independent-4096.glb');
const output=files[1]||path.join(root,'assets/aircraft/p47-independent.glb');
const SIZE=+(flags.size||2048),KEEP=flags.keep?flags.keep.split(','):[];

function readGLB(buf){
 if(buf.toString('ascii',0,4)!=='glTF')throw Error('not a GLB');
 let off=12,json=null,bin=null;
 while(off<buf.length){const len=buf.readUInt32LE(off),type=buf.toString('ascii',off+4,off+8),data=buf.subarray(off+8,off+8+len);
  if(type.startsWith('JSON'))json=JSON.parse(data.toString('utf8'));else if(type.startsWith('BIN'))bin=data;off+=8+len;}
 return {json,bin};
}
function writeGLB(json,bin){
 let text=Buffer.from(JSON.stringify(json),'utf8');const jp=(4-text.length%4)%4;if(jp)text=Buffer.concat([text,Buffer.alloc(jp,0x20)]);
 const bp=(4-bin.length%4)%4;if(bp)bin=Buffer.concat([bin,Buffer.alloc(bp)]);
 const head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
 head.write('glTF',0,'ascii');head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+text.length+8+bin.length,8);
 jh.writeUInt32LE(text.length,0);jh.write('JSON',4,'ascii');bh.writeUInt32LE(bin.length,0);bh.write('BIN\0',4,'ascii');
 return Buffer.concat([head,jh,text,bh,bin]);
}
// 8-bit RGB PNG, adaptive row filter (smallest sum of absolute residuals), zlib level 9
function encodePNG(rgb,w,h){
 const stride=w*3,raw=Buffer.alloc((stride+1)*h),cand=[0,1,2,3,4].map(()=>Buffer.alloc(stride));
 for(let y=0;y<h;y++){
  const row=y*stride,prev=row-stride;let best=0,bestSum=Infinity;
  for(let f=0;f<5;f++){const out=cand[f];let sum=0;
   for(let i=0;i<stride;i++){const x=rgb[row+i],a=i>=3?rgb[row+i-3]:0,b=y?rgb[prev+i]:0,c=(y&&i>=3)?rgb[prev+i-3]:0;let v;
    if(f===0)v=x;else if(f===1)v=x-a;else if(f===2)v=x-b;else if(f===3)v=x-((a+b)>>1);
    else{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v=x-(pa<=pb&&pa<=pc?a:pb<=pc?b:c);}
    v&=255;out[i]=v;sum+=v<128?v:256-v;}
   if(sum<bestSum){bestSum=sum;best=f;}}
  raw[y*(stride+1)]=best;cand[best].copy(raw,y*(stride+1)+1);
 }
 const chunk=(type,data)=>{const len=Buffer.alloc(4),crc=Buffer.alloc(4),body=Buffer.concat([Buffer.from(type,'ascii'),data]);
  len.writeUInt32BE(data.length);crc.writeUInt32BE(zlib.crc32(body)>>>0);return Buffer.concat([len,body,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
async function decode(bytes){
 const img=await loadImage(bytes),c=createCanvas(img.width,img.height),g=c.getContext('2d');g.drawImage(img,0,0);
 return {w:img.width,h:img.height,data:g.getImageData(0,0,img.width,img.height).data};
}
function box(src,w,h,k){ // k x k box filter, RGB out
 const W=w/k,H=h/k,out=Buffer.alloc(W*H*3),n=k*k,half=n>>1;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let ch=0;ch<3;ch++){let s=0;
  for(let j=0;j<k;j++)for(let i=0;i<k;i++)s+=src[((y*k+j)*w+x*k+i)*4+ch];
  out[(y*W+x)*3+ch]=(s+half)/n|0;}
 return {w:W,h:H,rgb:out};
}
(async()=>{
 const src=fs.readFileSync(input),{json,bin}=readGLB(src),sourceSha=crypto.createHash('sha256').update(src).digest('hex');
 const replaced=new Map(),report=[];
 for(const [index,image] of json.images.entries()){
  const view=json.bufferViews[image.bufferView],bytes=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
  const d=await decode(bytes);
  if(d.w<=SIZE||KEEP.some(k=>image.name.includes(k))){report.push({name:image.name,size:d.w+'x'+d.h,bytes:bytes.length,kept:true});continue;}
  if(d.w%SIZE||d.w!==d.h)throw Error('unexpected texture size '+d.w+'x'+d.h+' for '+image.name);
  for(let i=3;i<d.data.length;i+=4)if(d.data[i]!==255)throw Error(image.name+' has transparency; this script only handles opaque textures');
  const small=box(d.data,d.w,d.h,d.w/SIZE);
  const out=encodePNG(small.rgb,small.w,small.h);
  replaced.set(image.bufferView,out);image.mimeType='image/png';
  report.push({name:image.name,from:d.w+'x'+d.h,to:small.w+'x'+small.h,bytesBefore:bytes.length,bytesAfter:out.length});
  if(flags.dump){fs.mkdirSync(flags.dump,{recursive:true});fs.writeFileSync(path.join(flags.dump,index+'-'+SIZE+'.png'),out);}
 }
 // re-pack the binary chunk in bufferView order; every view starts on a 4-byte boundary
 const order=json.bufferViews.map((v,i)=>i).sort((a,b)=>(json.bufferViews[a].byteOffset||0)-(json.bufferViews[b].byteOffset||0));
 const parts=[];let length=0;
 for(const i of order){const v=json.bufferViews[i];if(v.buffer!==0)throw Error('external buffer');
  const data=replaced.get(i)||bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),p=(4-length%4)%4;
  if(p){parts.push(Buffer.alloc(p));length+=p;}
  v.byteOffset=length;v.byteLength=data.length;parts.push(data);length+=data.length;}
 json.buffers[0].byteLength=length;
 json.asset.extras=json.asset.extras||{};
 json.asset.extras.textureReduction={from:path.relative(root,input).split(path.sep).join('/'),sourceSha256:sourceSha,maxSize:SIZE,filter:'box',
  note:'Textures wider than '+SIZE+' px halved with a box filter (equal to GPU mip level 1). Geometry, UVs, materials and clips unchanged.'};
 const glb=writeGLB(json,Buffer.concat(parts));
 fs.writeFileSync(output,glb);
 console.log(JSON.stringify({input:path.relative(root,input),sourceSha256:sourceSha,output:path.relative(root,output),bytes:glb.length,
  sha256:crypto.createHash('sha256').update(glb).digest('hex'),images:report},null,1));
})().catch(e=>{console.error(e);process.exit(1);});
