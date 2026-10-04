'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),THREE=require('three');
const {createCanvas}=require('@napi-rs/canvas');
global.THREE=THREE;global.document={createElement:()=>createCanvas(1,1)};
for(const name of ['HeightProvider','TerrainTile','TerrainManager','OSMManager'])
 vm.runInThisContext(fs.readFileSync('terrain-system/'+name+'.js','utf8'));
const atlas=makeTerrainSurfaceAtlas(),ctx=atlas.image.getContext('2d');
assert.equal(atlas.image.width,1024);assert.equal(atlas.image.height,512);
const surfaces=new Set();for(let i=0;i<8;i++){
 const pixels=ctx.getImageData(i%4*256,Math.floor(i/4)*256,256,256).data;
 let signature=0;for(let j=0;j<pixels.length;j+=4){signature=(signature*31+pixels[j])>>>0;assert.equal(pixels[j+3],255);}
 surfaces.add(signature);
}assert.equal(surfaces.size,8,'eight distinct shared ground surfaces');
const types=new Set();let earth=0,green=0,colors=new Set();
for(const file of fs.readdirSync('terrain-system/real/data/osm').filter(f=>/^\d+_\d+\.json$/.test(f))){
 const [x,z]=file.slice(0,-5).split('_').map(Number),data=JSON.parse(fs.readFileSync('terrain-system/real/data/osm/'+file));
 const image=makeTerrainLandcover(x,z,4000,data).getContext('2d').getImageData(0,0,128,128).data;
 for(let i=0;i<image.length;i+=4){
  assert(image[i+3]>0,'surface metadata cannot erase grass RGB through transparent canvas pixels');
  types.add(Math.round(image[i+3]/255*9-1));
  earth+=image[i]>image[i+1]+7;green+=image[i+1]>image[i]+7;
  colors.add((image[i]>>3)+','+(image[i+1]>>3)+','+(image[i+2]>>3));
 }
}
assert(types.size>=6&&colors.size>100,'whole Rhine region has varied meadow, soil, crop and woodland palettes');
assert(earth>60000&&green>60000,'warm earth and living greens are both visible at landscape scale');
const terrain={getRenderedHeight:(x,z)=>x*.02+z*.03},osm=new OSMManager(new THREE.Scene(),4000,terrain);
const group=new THREE.Group(),ring=[[0,0],[4000,0],[4000,4000],[0,4000],[0,0]];
const placements=osm._forestPlacements([ring],0,0);
const stands=placements.filter(p=>p.kind<2&&p.x>300&&p.x<3700&&p.z>300&&p.z<3700);
assert(stands.some(p=>p.radius>18)&&stands.every(p=>p.radius<=20),'woodland uses small rooted tree groups, not giant domes');
let covered=0,samples=0;for(let x=350;x<3650;x+=75)for(let z=350;z<3650;z+=75){samples++;covered+=stands.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius);}
assert(covered/samples>.65,'woodland crown envelopes form a connected mass: '+covered/samples);
assert.equal(osm.deciduousGeo.index.count/3,108,'lobed broadleaf tree group stays within its triangle budget');
osm._buildForests(group,[ring],0,0);assert(group.children.length<=7,'forest draw-call budget stays bounded');
for(const mesh of group.children.filter(m=>m.geometry.attributes.canopyGround)){
 const ground=mesh.geometry.attributes.canopyGround;assert.equal(ground.count,mesh.count);
 assert([...ground.array].every(Number.isFinite),'canopy terrain correction has finite samples');
 const pos=mesh.geometry.attributes.position;
 for(let i=0;i<pos.count;i++)assert(Math.hypot(pos.getX(i),pos.getZ(i))<=1.00001,'rendered crown fits its validated envelope');
 if(mesh.geometry.userData.forestRoots){
  assert.equal(mesh.geometry.userData.forestRoots.length,3,'each stand has three separate tree roots');
  const part=mesh.geometry.attributes.forestPart;assert([...part.array].some((v,i)=>i%2===1&&v===1),'real trunks are part of the bounded forest mesh');
  const normal=mesh.geometry.attributes.normal;
  for(let vertex=0;vertex<part.count;vertex++)if(part.getY(vertex)===1){
   const [rx,rz]=mesh.geometry.userData.forestRoots[part.getX(vertex)];
   assert(normal.getX(vertex)*(pos.getX(vertex)-rx)+normal.getZ(vertex)*(pos.getZ(vertex)-rz)>0,'trunk faces point outward and remain visible with front-face culling');
  }
  const m=new THREE.Matrix4();
  for(let i=0;i<Math.min(mesh.count,60);i++){
   mesh.getMatrixAt(i,m);
   for(let root=0;root<3;root++){
    const [x,z]=mesh.geometry.userData.forestRoots[root],p=new THREE.Vector3(x,0,z).applyMatrix4(m);
    p.y+=ground.array[i*4+root]*m.elements[5];
    assert(Math.abs(p.y-terrain.getRenderedHeight(p.x,p.z))<.0001,'rotated tree roots follow the terrain, without floating/stacked sheets');
   }
  }
 }
}
console.log(JSON.stringify({surfaces:surfaces.size,landcoverTypes:types.size,paletteColors:colors.size,earthPixels:earth,greenPixels:green,
 forestCoverage:covered/samples,forestBuckets:group.children.length,stands:placements.length}));
