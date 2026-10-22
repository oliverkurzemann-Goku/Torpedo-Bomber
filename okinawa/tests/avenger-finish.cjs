/* helijah's Avenger with the baked 1942 livery: the shipped files match the bake script, carry
 * the period markings without the 1941 rudder stripes, and avenger-finish.js swaps them in
 * through PacificAssets without touching geometry, UVs or the other textures. Real GLB,
 * real GLTFLoader and natively decoded images. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three'),canvas=require('@napi-rs/canvas'),{Image,createCanvas,loadImage}=canvas;
const root=path.resolve(__dirname,'../..');
global.window=global;global.self=global;global.THREE=THREE;global.createImageBitmap=undefined;
global.document={createElement:()=>createCanvas(1,1),createElementNS(){
 const image=new Image(),listeners={};
 image.addEventListener=(event,fn)=>listeners[event]=fn;image.removeEventListener=()=>{};
 image.onload=()=>listeners.load?.call(image);image.onerror=e=>listeners.error?.call(image,e);
 const nativeSrc=Object.getOwnPropertyDescriptor(Image.prototype,'src');
 Object.defineProperty(image,'src',{set(url){
  const read=/^(blob|data|https?):/.test(url)?fetch(url).then(r=>r.arrayBuffer()).then(b=>Buffer.from(b)):fs.promises.readFile(path.resolve(root,decodeURIComponent(url.split('?')[0])));
  read.then(b=>nativeSrc.set.call(image,b)).catch(e=>listeners.error?.(e));
 }});
 return image;
}};
vm.runInThisContext(fs.readFileSync(require.resolve('three/examples/js/loaders/GLTFLoader.js'),'utf8'));
require('../../pacific-assets.js');require('../../avenger-finish.js');
const {PacificAssets,AvengerFinish}=global,Bake=require('../../scripts/bake-avenger-livery.cjs');
const glbPath=path.join(root,'grumman tbm avenger.glb');
const parse=()=>{const b=fs.readFileSync(glbPath);return new Promise((yes,no)=>new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',g=>yes(g.scene),no));};
const pixels=async file=>{const img=await loadImage(fs.readFileSync(path.join(root,file))),c=createCanvas(img.width,img.height),x=c.getContext('2d');x.drawImage(img,0,0);return {w:img.width,h:img.height,d:x.getImageData(0,0,img.width,img.height).data};};
const lum=(r,g,b)=>(.2126*r+.7152*g+.0722*b)/255;
const geometryHash=scene=>{let h=0;scene.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position.array,u=o.geometry.attributes.uv?.array||[];for(let i=0;i<p.length;i+=97)h=(h*31+Math.round(p[i]*1e4))|0;for(let i=0;i<u.length;i+=97)h=(h*31+Math.round(u[i]*1e4))|0;});return h;};

(async()=>{
 const MAP='assets/aircraft/avenger-1942-livery.webp',NORMAL='assets/aircraft/avenger-1942-normal.png';
 // 1. Shipped files are what the bake script produces today (WebP is lossy: compare decoded pixels).
 const map=await pixels(MAP),normal=await pixels(NORMAL);
 assert.equal(map.w,2048);assert.equal(map.h,2048);assert.equal(normal.w,1024);assert.equal(normal.h,1024);
 const fresh=await Bake.bake(canvas,glbPath),fd=fresh.map.getContext('2d').getImageData(0,0,2048,2048).data;
 let diff=0;for(let i=0;i<fd.length;i+=4)diff+=Math.abs(fd[i]-map.d[i])+Math.abs(fd[i+1]-map.d[i+1])+Math.abs(fd[i+2]-map.d[i+2]);
 assert(diff/(2048*2048*3)<1.5,'shipped livery matches scripts/bake-avenger-livery.cjs (mean error '+(diff/(2048*2048*3)).toFixed(2)+')');
 const nd=fresh.normal.getContext('2d').getImageData(0,0,1024,1024).data;let nDiff=0;for(let i=0;i<nd.length;i++)nDiff=Math.max(nDiff,Math.abs(nd[i]-normal.d[i]));
 assert(nDiff<=1,'shipped normal map matches the bake script exactly');

 // 2. Period finish: no 1941 rudder stripes, 1942 star-in-circle, blue-gray over light gray, details.
 const at=(x,y)=>{const o=(y*2048+x)*4;return [map.d[o],map.d[o+1],map.d[o+2]];};
 for(const [x0,y0,x1,y1] of Bake.RUDDER)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const [r,g,b]=at(x,y);assert(!(r>120&&r>g*1.6&&r>b*1.6),'no red rudder stripe at '+x+','+y);}
 for(const [x,y,r] of [[651,1354,42],[1598,1662,42],[213,1007,44],[227,598,42]]){
  assert(lum(...at(x,y))>.6,'white star centre at '+x+','+y);
  let blue=0,n=0;for(let a=0;a<Math.PI*2;a+=.05){const [R,G,B]=at(Math.round(x+Math.cos(a)*r*.9),Math.round(y+Math.sin(a)*r*.9));n++;if(B>R+10&&lum(R,G,B)<.25)blue++;}
  assert(blue/n>.6,'blue disc around the star at '+x+','+y);
  let bars=0;for(const dx of [-r*1.4,r*1.4]){const [R,G,B]=at(Math.round(x+dx),y);if(lum(R,G,B)>.6)bars++;}
  assert.equal(bars,0,'no 1943 insignia bars beside '+x+','+y);
 }
 for(const [x,y] of [[400,950],[1300,1000],[1000,1330]]){const [r,g,b]=at(x,y),l=lum(r,g,b);assert(b>r+4&&l>.2&&l<.5,'blue-gray upper/side paint at '+x+','+y+': '+[r,g,b]);}
 for(const [x,y] of [[400,500],[1300,560]]){const [r,g,b]=at(x,y),l=lum(r,g,b);assert(Math.max(r,g,b)-Math.min(r,g,b)<20&&l>.4&&l<.7,'light gray underside at '+x+','+y+': '+[r,g,b]);}
 const count=(x0,y0,x1,y1,test)=>{let n=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(test(...at(x,y)))n++;return n;};
 assert(count(1590,690,2048,1262,(r,g,b)=>r>170&&g>120&&b<80)>400,'yellow propeller tips');
 assert(count(398,1480,466,1545,(r,g,b)=>lum(r,g,b)>.7)>300,'fin number 10 (starboard)');
 assert(count(1772,1790,1840,1856,(r,g,b)=>lum(r,g,b)>.7)>300,'fin number 10 (port)');
 assert(count(1405,1372,1460,1425,(r,g,b)=>r>150&&g>120&&b<90)>60,'squadron badge');
 let tilted=0;for(let i=0;i<normal.d.length;i+=4)if(Math.abs(normal.d[i]-128)>8||Math.abs(normal.d[i+1]-128)>8)tilted++;
 assert(tilted/(1024*1024)>.01&&tilted/(1024*1024)<.4,'normal map engraves panel lines, flat elsewhere ('+(tilted/(1024*1024)).toFixed(3)+')');

 // 3. Runtime swap on the real model: geometry/UVs and other textures untouched, idempotent.
 const scene=await parse(),atlas=AvengerFinish.findAtlas(scene),original=atlas.map,hash=geometryHash(scene);
 const others=new Map();scene.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))if(m!==atlas)others.set(m,m.map);});
 let disposed=false;original.addEventListener('dispose',()=>disposed=true);
 const info=await AvengerFinish.apply(THREE,scene);
 assert(info&&atlas.map!==original&&disposed,'delivered atlas replaced and released');
 assert.equal(atlas.map.image.width,2048);assert.equal(atlas.map.flipY,false);assert.equal(atlas.map.encoding,original.encoding);
 assert.equal(atlas.normalMap.image.width,1024);assert(atlas.normalScale.y<0&&atlas.normalScale.x>0,'glTF normal-map orientation');
 assert(atlas.roughness>=.8&&atlas.metalness===0,'matte non-specular paint');
 for(const [m,t] of others)assert.equal(m.map,t,'other material '+m.name+' keeps its texture');
 let glass=null;scene.traverse(o=>{if(o.isMesh&&o.material.name==='transparentExt')glass=o.material;});assert(glass.userData.avengerFinish&&glass.roughness<.2,'canopy glazing');
 assert.equal(geometryHash(scene),hash,'geometry and UVs unchanged');
 assert.equal(await AvengerFinish.apply(THREE,scene),info,'second call keeps the first result');
 // a missing file keeps the delivered texture instead of breaking the model
 const plain=await parse(),plainAtlas=AvengerFinish.findAtlas(plain),plainMap=plainAtlas.map,warn=console.warn;console.warn=()=>{};
 try{assert.equal(await AvengerFinish.apply(THREE,plain,{files:{map:'assets/aircraft/missing.webp',normal:NORMAL}}),null);}finally{console.warn=warn;}
 assert.equal(plainAtlas.map,plainMap,'original texture kept when the livery is unavailable');

 // 4. The game wiring: one decode, finished before any clone is handed out, clones share it.
 const html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
 assert(html.includes('<script src="avenger-finish.js?v=198"></script>')&&/PacificAssets\.configure\('grumman%20tbm%20avenger\.glb',root=>AvengerFinish\.apply\(THREE,root/.test(html),'torpedo-carrier.html registers the livery');
 const decoded=[];THREE.GLTFLoader.prototype.load=function(url,yes,_p,no){decoded.push(url);const b=fs.readFileSync(path.join(root,decodeURIComponent(url.split('?')[0])));return this.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',yes,no);};
 PacificAssets.configure('grumman%20tbm%20avenger.glb',r=>AvengerFinish.apply(THREE,r));
 const loader=PacificAssets.loader(),copies=[];
 await Promise.all([loader.load('grumman%20tbm%20avenger.glb?v=2',g=>copies.push(g.scene)),loader.load('grumman%20tbm%20avenger.glb?v=2',g=>copies.push(g.scene))]);
 const a=AvengerFinish.findAtlas(copies[0]),b=AvengerFinish.findAtlas(copies[1]);
 assert.equal(decoded.length,1,'one decode for player, wingmen and raiders');
 assert(a.userData.avengerFinish&&a===b&&a.map.image.width===2048,'every clone shares the finished 2048 px livery');
 console.log('Avenger finish: baked livery matches its script, 1942 markings, no rudder stripes; runtime swap keeps geometry/UVs/other textures, falls back cleanly, one shared decode');
})().catch(e=>{console.error(e);process.exitCode=1;});
