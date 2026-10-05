'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');global.THREE=require('three');
for(const name of ['HeightProvider','TerrainTile','TerrainManager'])vm.runInThisContext(fs.readFileSync('terrain-system/'+name+'.js','utf8'));
global.fetch=async url=>{const b=fs.readFileSync(url);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}};
(async()=>{
 const dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/'),scene=new THREE.Scene();
 const coords=[[0,2],[1,2],[0,3],[1,3]];await Promise.all(coords.map(([x,z])=>dem.loadTile(x,z)));
 const t=Object.create(TerrainManager.prototype);Object.assign(t,{scene,tileSize:4000,heightProvider:dem,tiles:new Map(),material:new THREE.MeshStandardMaterial()});
 coords.forEach(([x,z],i)=>t.ensureTile(x,z,i%3));
 let maxGap=0,samples=0;
 for(const [x,z] of [[100,8100],[7000,15000],[100,8100]])for(let frame=0;frame<48;frame++){
  t.updateLOD(x,z,1/60);
  for(const a of t.tiles.values())for(const [dx,dz] of [[1,0],[0,1]]){
   const b=t.tiles.get((a.tileX+dx)+','+(a.tileZ+dz));if(!b)continue;
   const common=Math.min(a._renderSeg,b._renderSeg);
   for(let i=0;i<=common;i++){
    const ai=i*a._renderSeg/common,bi=i*b._renderSeg/common;
    const an=a._renderSeg+1,bn=b._renderSeg+1;
    const av=dx?ai*an+an-1:ai+an*(an-1),bv=dx?bi*bn:bi;
    const na=new THREE.Vector3().fromBufferAttribute(a.mesh.geometry.attributes.normal,av);
    const nb=new THREE.Vector3().fromBufferAttribute(b.mesh.geometry.attributes.normal,bv);
    assert(na.distanceTo(nb)<1e-6,'adjacent surface edge lighting agrees across LODs');
   }
   for(let i=0;i<=128;i++){
    const px=dx?b.worldOriginX:a.worldOriginX+i*4000/128,pz=dz?b.worldOriginZ:a.worldOriginZ+i*4000/128;
    const gap=Math.abs(t.getRenderedHeight(px-dx*.0001,pz-dz*.0001)-t.getRenderedHeight(px+dx*.0001,pz+dz*.0001));
    maxGap=Math.max(maxGap,gap);assert(gap<.003,`LOD seam cliff ${gap} at ${px},${pz}`);samples++;
   }
  }
 }
 // Coarse interpolation has to agree with PlaneGeometry's actual diagonal,
 // not a bilinear patch that jumps when the downgrade completes.
 const a=t.tiles.get('0,2');a.setLOD(0,t.material);a.updateMorph(1);a.setLOD(2,t.material);a.updateMorph(.59999);
 const p=a.mesh.geometry.attributes.position,s=a._renderSeg,n=s+1,before=[];
 for(let iz=0;iz<=s;iz++)for(let ix=0;ix<=s;ix++)before.push([p.getX(ix+iz*n),p.getY(ix+iz*n),p.getZ(ix+iz*n)]);
 a.updateMorph(.02);
 for(const [lx,y,lz] of before){const expected=coarseInterpHeight(dem,4000,a.centerX,a.centerZ,4,lx,lz);assert(Math.abs(y-expected)<.02,'last morph step remains bounded');}
 console.log(JSON.stringify({seamSamples:samples,maxGap,noSkirtLighting:true}));
})().catch(e=>{console.error(e);process.exit(1)});
