// Exercise the shipped carrier HUD with an actual fighter changing position.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three');
const html=fs.readFileSync(path.resolve(__dirname,'../../torpedo-carrier.html'),'utf8');
const a=html.indexOf('function updateNav(){'),b=html.indexOf('\nfunction ',a+10);
assert(a>0&&b>a,'carrier navigation function found');
const elements=new Map();
const getElementById=id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:''});return elements.get(id);};
const fighter={alive:true,pos:new THREE.Vector3(0,500,1000)};
const c=vm.createContext({THREE,document:{getElementById},P:{pos:new THREE.Vector3(0,500,0),heading:0},
  R2D:180/Math.PI,NM:1852,zeros:[fighter],ships:[],raiders:[],shoreTargets:[],pacificOps:null,
  carrierX:0,AIM_X:0,DECK_Y:20,isDefend:()=>false});
vm.runInContext(html.slice(a,b),c);
c.updateNav();
assert.equal(getElementById('navKind').textContent,'BANDIT');
assert.match(getElementById('navArrow').style.transform,/rotate\(-90deg\)/,'fighter to screen left must point left');
fighter.pos.z=-1000;
c.updateNav();
assert.match(getElementById('navArrow').style.transform,/rotate\(90deg\)/,'fighter to screen right must point right');
fighter.alive=false;
c.updateNav();
assert.equal(getElementById('navKind').textContent,'BASE','once clear, navigate back to carrier');
console.log('Carrier arrow follows fighter left/right, then returns to carrier');
