'use strict';
const assert=require('node:assert/strict');
const C=require('../../custom-sortie.js'),preview=require('../../sortie-preview.js');
const cases={
 p47:{bombs:2,rockets:8,tank:60},
 bf109:{bombs:1},fw190:{bombs:1},ju87:{bombs:4},
 me262:{bombs:2},sbd:{bombs:3},avenger:{bombs:2},
 corsair:{bombs:2,rockets:8},zero:{},me163:{}
};
for(const [ac,stores] of Object.entries(cases)){
 const mounts=preview.hardpoints(ac,stores),bombs=mounts.filter(h=>h.kind==='bomb'),rockets=mounts.filter(h=>h.kind==='rocket');
 const expected=ac==='avenger'||ac==='corsair'||ac==='zero'||ac==='me163'?0:ac==='sbd'?2:stores.bombs||0;
 assert.equal(bombs.length,expected,ac+' correct external bomb count');
 assert.equal(rockets.length,ac==='p47'?8:0,ac+' rockets use designated stations');
 for(const h of mounts){
  assert(Number.isFinite(h.x+h.y+h.z+h.scale+h.roofY),ac+' finite mount');
  assert(h.y<h.roofY,ac+' weapon below airframe mount');
  assert(h.scale>.2&&h.scale<1,ac+' reasonable physical store size');
  assert(h.z>=0&&h.z<2,ac+' ordnance forward of trailing edge');
 }
 if(ac==='me262')assert(bombs.every(h=>Math.abs(h.x)<1.2&&h.y>-.5),'Me262 bombs hug the fuselage, not the nacelles');
 if(ac==='ju87')assert(bombs.every(h=>Math.abs(h.x)>2&&h.scale<.4),'Ju87 four small underwing bombs');
 if(ac==='sbd')assert(bombs.every(h=>Math.abs(h.x)>2&&h.scale<.4),'SBD centre bomb belongs to native rig');
 if(ac==='avenger')assert.equal(mounts.length,0,'Avenger bombs are never hung outside the internal bay');
 if(ac==='corsair')assert.equal(mounts.length,0,'Corsair authored mounts remain untouched');
}
const p47=preview.hardpoints('p47',{bombs:2,rockets:8});
assert.equal(p47.length,10);assert.equal(new Set(p47.map(h=>h.x.toFixed(3)+':'+h.z)).size,10);
for(const ac of ['p47','bf109','fw190','ju87','me262','avenger','sbd','corsair']){
 const c=C.normalize({...C.defaults(C.planes[ac].theatre),ac,kit:'bombs'});
 assert.equal(C.stores(c).bombs,cases[ac].bombs,ac+' selection count matches mounts');
}
console.log('Hardpoints: correct model-specific bomb/rocket locations, native Corsair/SBD centre store and Avenger internal bay.');