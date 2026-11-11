'use strict';

// Principal dimensions and handedness are checked from exported vertices.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const validator=require('gltf-validator');
const root=path.resolve(__dirname,'../..');
const expected={
  'enterprise-cv6-1942':{hull:246.74,waterline:234.70,beam:25.374,deck:[244.4496,26.2128],draft:7.911},
  'kaga-1942':{hull:247.65,waterline:240.30,beam:32.50,deck:[248.58,30.48],draft:9.48}
};

function positions(json,bin,mesh) {
  const accessor=json.accessors[mesh.primitives[0].attributes.POSITION];
  const view=json.bufferViews[accessor.bufferView],offset=(view.byteOffset||0)+(accessor.byteOffset||0);
  return Array.from({length:accessor.count},(_,i)=>[0,1,2].map(k=>bin.readFloatLE(offset+i*12+k*4)));
}
function bounds(points) {
  return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};
}
function close(a,b,label) {assert(Math.abs(a-b)<.015,label+': '+a+' versus '+b);}

(async()=>{
  const reports=[];
  for(const [name,spec] of Object.entries(expected)){
    const bytes=fs.readFileSync(path.join(root,'assets/ships',name+'.glb'));
    const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength));
    const bin=bytes.subarray(28+jsonLength);
    const checked=await validator.validateBytes(new Uint8Array(bytes));
    assert.equal(checked.issues.numErrors,0,name+' glTF errors');
    assert.equal(checked.issues.numWarnings,0,name+' glTF warnings');
    const hullPoints=positions(json,bin,json.meshes.find(m=>m.name==='hull-hullPaint'));
    const hull=bounds(hullPoints),waterline=bounds(hullPoints.filter(p=>Math.abs(p[1])<1e-5));
    const deck=bounds(positions(json,bin,json.meshes.find(m=>m.name==='flight-deck-deckPaint')));
    close(hull.max[2]-hull.min[2],spec.hull,name+' hull length');
    close(waterline.max[2]-waterline.min[2],spec.waterline,name+' waterline length');
    close(waterline.max[0]-waterline.min[0],spec.beam,name+' waterline beam');
    close(-hull.min[1],spec.draft,name+' draught');
    close(deck.max[2]-deck.min[2],spec.deck[0],name+' flight deck length');
    close(deck.max[0]-deck.min[0],spec.deck[1],name+' flight deck breadth');
    close(deck.max[1]-deck.min[1],0,name+' flat landing surface');
    for(const island of json.meshes.filter(m=>m.name.startsWith('island-'))){
      assert(bounds(positions(json,bin,island)).max[0]<0,name+' island must be entirely starboard');
    }
    assert(json.nodes.every(n=>!n.scale||n.scale.every(s=>s>0)),name+' uses a right-handed frame');
    const info=checked.info;
    assert(info.totalTriangleCount<150000&&info.drawCallCount<=64,name+' geometry budget');
    assert(info.resources.filter(r=>r.image).every(r=>Math.max(r.image.width,r.image.height)<=2048),name+' texture budget');
    assert.equal(json.asset.extras.markers.filter(m=>m.name==='aircraft-elevator').length,3);
    reports.push({model:name,bytes:bytes.length,triangles:info.totalTriangleCount,drawCalls:info.drawCallCount,
      measured:{hullLength:hull.max[2]-hull.min[2],waterlineLength:waterline.max[2]-waterline.min[2],
        waterlineBeam:waterline.max[0]-waterline.min[0],draft:-hull.min[1],
        flightDeckLength:deck.max[2]-deck.min[2],flightDeckBeam:deck.max[0]-deck.min[0]},
      island:'starboard, checked from all island vertices',glTF:{errors:0,warnings:0}});
  }
  console.log(JSON.stringify(reports,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
