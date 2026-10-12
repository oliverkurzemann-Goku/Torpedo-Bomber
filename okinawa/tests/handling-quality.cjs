'use strict';
const assert=require('node:assert/strict');
require('../../sortie-features.js');require('../../ground-run.js');require('../../game-runtime.js');
require('../../carrier-recovery.js');
require('../../flight-indicators.js');
const {Handling,Damage}=global.SortieFeatures;
const make=(kind,theatre='europe',weapon='bomb')=>{
 const p={alive:true,hull:65,fuel:100,bombs:3,rockets:8,torps:1,gear:1,flap:0,spd:40};
 Handling.configure(p,kind,weapon,theatre);Damage.reset(p);return p;
};
for(const kind of ['p47','bf109','fw190','ju87','me262','me163','avenger','sbd','corsair','zero']){
 const p=make(kind,kind==='avenger'?'pacific':'europe','torpedo'),heavy=Handling.sample(p),ref=Handling.speeds(p,31,40);
 p.bombs=p.rockets=p.torps=0;p.fuel=15;
 const light=Handling.sample(p);
 assert(heavy.ratio>light.ratio&&heavy.ratio<=1.24&&light.ratio>=.9);
 assert(heavy.acceleration<light.acceleration&&heavy.climb<light.climb&&heavy.turn<light.turn);
 assert(ref.reference>Handling.speeds(p,31,40).reference,'live fuel/stores lower recovery reference');
 p.fuel=50;assert.equal(Handling.sample(p).ratio,1,'neutral baseline preserved');
}
const tank=make('p47');tank.bombs=tank.rockets=tank.torps=0;tank.tankAttached=true;tank.tankFuel=60;
const full=Handling.sample(tank).ratio;tank.tankFuel=0;const dry=Handling.sample(tank).ratio;tank.tankAttached=false;
assert(full>dry&&dry>Handling.sample(tank).ratio,'transfer and jettison reduce mass independently');
for(const theatre of ['europe','pacific']){
 const left=make('avenger',theatre),right=make('avenger',theatre);
 Damage.surfaceHit(left,'aileron','left');Damage.surfaceHit(right,'aileron','right');
 assert.equal(Damage.controls(left).bias,-Damage.controls(right).bias);
 assert(Damage.controls(left).bias>0,'loss of left-wing authority banks the physical left wing down');
 assert(Damage.controls(left).roll<1&&Damage.controls(left).pitch===1);
 Damage.surfaceHit(left,'elevator');assert(Damage.controls(left).pitch<1);
 Damage.surfaceHit(left,'flap','left');left.flap=right.flap=1;
 const c=Damage.controls(left);assert.equal(c.flaps.left,0);assert.equal(c.flaps.right,1);
 assert(c.drag>0&&c.flaps.asymmetry===1&&Math.abs(c.bias)<=.16);
 assert(Handling.speeds(left,31,40).stall>Handling.speeds(right,31,40).stall);
 for(let i=0;i<20;i++)Damage.surfaceHit(left,'aileron','left');
 assert(Damage.controls(left).roll>=.725,'remaining roll authority is recoverable');
 assert(Damage.status(left).includes('L AILERON')&&Damage.status(left).includes('ELEVATOR')&&Damage.status(left).includes('L FLAP JAM'));
 assert.equal(global.FlightIndicators.controlFaults(left),'L AIL / ELEV / L FLAP');
 Damage.reset(left);assert.equal(Damage.status(left),'');assert.equal(global.FlightIndicators.controlFaults(left),'');assert.equal(Damage.controls(left).roll,1);assert.equal(Damage.controls(left).flaps.left,1);
}
const komet=make('me163');assert.match(Damage.surfaceHit(komet,'flap'),/FLAP JAMMED/);
for(const roll of [.83,.85,.88,.91,.93]){
 const p=make('p47');assert(Damage.hit(p,25,'',()=>roll));assert(Damage.status(p));
}
const recovery=make('avenger','pacific','torpedo');
assert.equal(global.CarrierRecovery.envelope(recovery,31,40).reference,Handling.speeds(recovery,31,40,7,0).reference);
assert.equal(global.CarrierRecovery.landing({speed:45,sink:1,offset:0,bank:0,reference:45,wire:3},40).grade,'OK-3');
for(const fps of [20,60,120]){
 const run=ratio=>{const p={spd:0,throttle:1,braking:false,groundPower:0};for(let i=0;i<fps*8;i++)global.GroundRun.step(p,1/fps,{carrier:true,massRatio:ratio});return p.spd;};
 assert(run(1.2)<run(.95),'heavier ground run accelerates more slowly at '+fps+' FPS');
}
const renderer={ratio:1.5,getPixelRatio(){return this.ratio;},setPixelRatio(v){this.ratio=v;}};
const q=global.GameRuntime.createQuality(renderer,{enabled:true});
for(let i=0;i<700;i++)q.sample(.05);
assert.equal(q.tier,3);assert(renderer.ratio>=.75&&renderer.ratio<1.5);
const retained=q.tier;q.sample(12);q.sample(.05,false);assert.equal(q.tier,retained);
for(let i=0;i<3600;i++)q.sample(1/60);
assert.equal(q.tier,0);assert.equal(renderer.ratio,1.5);
q.setTier(3);let admitted=0;for(let i=0;i<100;i++)if(q.allow())admitted++;
assert(admitted>=34&&admitted<=36);for(let i=0;i<100;i++)assert(q.allow('screen',true));
const cloud={visible:false,children:Array.from({length:9},()=>({visible:true}))},rain={isInstancedMesh:true,instanceMatrix:{count:700}};
q.weather([cloud],rain);assert.equal(cloud.visible,false);assert.equal(cloud.children.filter(p=>p.visible).length,3);assert.equal(rain.count,280);
q.setTier(0);q.weather([cloud],rain);assert(cloud.children.every(p=>p.visible));assert.equal(rain.count,700);
renderer.ratio=.25;q.sample(.05);q.setTier(3);assert.equal(renderer.ratio,.25,'explicit low-resolution diagnostic cap retained');
const off=new global.GameRuntime.AdaptiveQuality(renderer,{enabled:false});for(let i=0;i<1000;i++)off.sample(.05);assert.equal(off.tier,0);
console.log('Loading: ten types, stores/fuel/tank/references; individual recoverable controls and repair; adaptive render budgets, hysteresis, pause and restoration.');
