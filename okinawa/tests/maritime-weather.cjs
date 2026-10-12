'use strict';
const assert=require('node:assert/strict'),THREE=require('three');
require('../../sortie-systems.js');require('../../sortie-features.js');const Recovery=require('../../carrier-recovery.js');
const Weather=require('../../maritime-weather.js');
for(const name of ['clear','haze','fog','lowcloud','rain','squall','storm','broken']){
 const cells=Weather.cellsFor(name,500,[{x:8000,z:1000}]);
 assert(cells.every(c=>Math.hypot(c.x-500,c.z)>3400),'recovery zone clear');
 for(const c of cells){
  const centre=Weather.sample(name,cells,[],{x:c.x,y:900,z:c.z}),outside=Weather.sample(name,cells,[],{x:c.x+c.radius*2,y:900,z:c.z});
  if(c.cb){assert(centre.intensity>.7&&centre.warning.includes('EXIT'));assert(outside.intensity<centre.intensity);assert(centre.far<outside.far);}
  const above=Weather.sample(name,cells,[],{x:c.x,y:c.top+600,z:c.z});assert.equal(above.intensity,0);
 }
}
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x8b989e,160,1600);
const texture=new THREE.DataTexture(new Uint8Array(4*4*4).fill(255),4,4,THREE.RGBAFormat);
const weather=Weather.create(THREE,scene,texture);weather.reset('storm');
assert.equal(weather.cells.length,3);assert.equal(weather.banks.length,2);assert(weather.layers.count<=160);
const camera=new THREE.PerspectiveCamera();camera.position.set(weather.cells[0].x,180,weather.cells[0].z);
const renderer={getPixelRatio:()=>1.5};weather.render(.05,camera,renderer,{rain:.4});
assert(weather.rainMesh.isPoints&&!weather.rainMesh.isInstancedMesh,'rain is tiny drops, never long cylinders');
assert(weather.rainMesh.visible&&weather.rainMesh.geometry.drawRange.count<=400);
const before=weather.rainMesh.geometry.attributes.position.array.slice();camera.position.x+=3;weather.render(.05,camera,renderer,{rain:.4});
assert(before.some((v,i)=>v!==weather.rainMesh.geometry.attributes.position.array[i]));
const a=weather.rainMesh.geometry.attributes.position.array;for(let i=0;i<a.length;i+=3){assert(Math.abs(a[i])<=90&&Math.abs(a[i+1])<=50&&Math.abs(a[i+2])<=90);}
const cell=weather.cells[0],p={alive:true,hull:100,pos:new THREE.Vector3(cell.x,900,cell.z),vSpeed:0,rollVel:0,pitchVel:0};let damage=0;
for(let i=0;i<600;i++){weather.render(.02,camera,renderer);weather.disturb(p,.02,n=>damage+=n);}
assert(damage>0&&Math.abs(p.pos.y-900)>1,'sustained CB penetration affects flight');
const damageBeforeExit=damage;p.pos.x=cell.x+cell.radius*3;for(let i=0;i<50;i++)weather.disturb(p,.05,n=>damage+=n);assert.equal(damage,damageBeforeExit,'no damage callbacks after leaving the cell');
p.onDeck=true;const height=p.pos.y;weather.disturb(p,1,n=>damage+=n);assert.equal(p.pos.y,height,'grounded aircraft not thrown around');
const sea={uFogNear:{value:0},uFogFar:{value:0}};for(let i=0;i<120;i++)FlightOps.visibility(scene,[],p.pos,'storm',.05,sea,{far:250});
assert(scene.fog.far<255&&sea.uFogFar.value===scene.fog.far);
weather.reset('clear');assert.equal(weather.layers.count,0);assert.equal(weather.report().exposure,0);
weather.render(0,camera,renderer);assert.equal(weather.rainMesh.visible,false);weather.dispose();assert.equal(scene.children.length,0);
const pilot={spd:35,fuel:100,flap:1,gear:1,torps:1};SortieFeatures.Handling.configure(pilot,'avenger','torpedo','pacific');
const band=Recovery.approach(pilot);assert(band.tooSlow&&band.lowLimit>band.warning&&band.highLimit>band.reference);
pilot.spd=band.reference;assert(!Recovery.approach(pilot).tooSlow&&!Recovery.approach(pilot).tooFast);
console.log('Local CB/sea-fog/rain, clear recovery zone, bounded instanced clouds/point rain, hazardous penetration and dynamic approach band passed.');
