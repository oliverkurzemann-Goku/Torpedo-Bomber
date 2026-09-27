// Regression: the Thunderbolt chase camera mirrors the world X axis when
// heading north. The HUD arrow must match screen position, not compass sign.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three');
const html=fs.readFileSync(path.resolve(__dirname,'../../remagen-mission.html'),'utf8');
const start=html.indexOf('  const dx=tx-P.pos.x, dz=tz-P.pos.z;');
const end=html.indexOf('  let closest=null,range=Infinity;',start);
assert(start>0&&end>start,'shipped navigation HUD found');
const elements=new Map();
const getElementById=id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:''});return elements.get(id);};
const P={pos:{x:0,z:0},heading:0};
const c=vm.createContext({P,document:{getElementById},R2D:180/Math.PI,MI:1609.34,
  tx:1000,tz:0,navKind:'BANDIT',hdg:0});
vm.runInContext('(function(){'+html.slice(start,end)+'})',c);
const update=()=>vm.runInContext('(function(){'+html.slice(start,end)+'})()',c);
const cam=new THREE.PerspectiveCamera(60,1,1,5000);
cam.position.set(0,0,0);
cam.lookAt(0,0,1000);cam.updateMatrixWorld();
assert(new THREE.Vector3(1000,0,1000).project(cam).x<0,'east is left of northbound chase camera');
update();
assert.match(getElementById('navArrow').style.transform,/rotate\(-90deg\)/);
assert.equal(getElementById('navCue').textContent,'LEFT');
c.tx=-1000;
update();
assert.match(getElementById('navArrow').style.transform,/rotate\(90deg\)/);
assert.equal(getElementById('navCue').textContent,'RIGHT');
c.tx=0;c.tz=1000;
update();
assert.equal(getElementById('navCue').textContent,'AHEAD');
P.heading=Math.PI/2;c.hdg=90;
update();
assert.match(getElementById('navArrow').style.transform,/rotate\(90deg\)/);
console.log('Thunderbolt arrow matches chase-camera screen left/right and heading');
