/* Run: NODE_PATH=/path/to/node_modules node okinawa/tests/geometry.cjs
 * Test dependencies: three@0.128.0, @napi-rs/canvas. Not loaded by the viewer.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three'),{createCanvas}=require('@napi-rs/canvas');
global.THREE=THREE;global.window=global;global.document={createElement:t=>{assert.equal(t,'canvas');return createCanvas(1,1);}};
const dir=path.resolve(__dirname,'..');
vm.runInThisContext(fs.readFileSync(path.join(dir,'data.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(dir,'world.js'),'utf8'));
(async()=>{
 const world=await new OkinawaWorld(OKINAWA_DATA).build();
 assert.equal(world.tiles.size,16);assert.equal(world.terrain.children.length,16);
 const seams=new Map();let vertices=0,instances=0;
 for(const m of world.terrain.children){const p=m.geometry.attributes.position,n=m.geometry.attributes.normal;for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);assert.ok(Number.isFinite(x+y+z));assert.ok(n.getY(i)>0,'Ground winding points downward');
  assert.ok(Math.abs(y-world.getHeight(x,z))<.0001,'Terrain and collision height disagree');
  const key=x+','+z;if(seams.has(key))assert.ok(Math.abs(y-seams.get(key))<.00001,'Tile seam');else seams.set(key,y);vertices++;
 }}
 const mat=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
 for(const m of world.decorations){for(let i=0;i<m.count;i++){m.getMatrixAt(i,mat);assert.ok(mat.elements.every(Number.isFinite));mat.decompose(pos,q,scale);assert.ok(world.shoreDistance(pos.x,pos.z)>0,'Object in water: '+m.name);assert.ok(scale.x>0&&scale.y>0&&scale.z>0);instances++;}}
 const points={cape:[-4943,-6128],beach:[-5071,-3327],hagushi:[-3883,-390],zakimi:[-2495,-2548],offshore:[-7000,-2000]};
 const samples=Object.fromEntries(Object.entries(points).map(([k,p])=>[k,{dem:+world.rawHeight(...p).toFixed(2),surface:+world.getHeight(...p).toFixed(2),shore:+world.shoreDistance(...p).toFixed(2)}]));
 assert.ok(samples.offshore.shore<0&&samples.offshore.surface<0,'Offshore must be water');assert.ok(samples.zakimi.surface>20,'Zakimi must be on raised ground');
 // Execute the exact exporter from the viewer. Validate its container and embedded texture.
 const viewer=fs.readFileSync(path.join(dir,'viewer.js'),'utf8'),start=viewer.indexOf('function exportTerrain('),end=viewer.lastIndexOf('\n})();');
 vm.runInThisContext(viewer.slice(start,end));const blob=exportTerrain(world),buf=Buffer.from(await blob.arrayBuffer());
 assert.equal(buf.readUInt32LE(0),0x46546c67);assert.equal(buf.readUInt32LE(4),2);assert.equal(buf.readUInt32LE(8),buf.length);
 const jl=buf.readUInt32LE(12),gltf=JSON.parse(buf.subarray(20,20+jl).toString());assert.equal(gltf.meshes.length,16);assert.equal(gltf.images[0].mimeType,'image/png');
 for(const v of gltf.bufferViews)assert.ok(v.byteOffset+v.byteLength<=gltf.buffers[0].byteLength);
 console.log(JSON.stringify({tiles:16,vertices,instances,houses:world.houses,glbBytes:buf.length,samples},null,2));
 world.dispose();
})().catch(e=>{console.error(e);process.exitCode=1;});
