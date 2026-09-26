// Exercise the game's actual heavy-flak routine with a straight pass and an evasive turn.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),THREE=require('three');
const source=fs.readFileSync(path.resolve(__dirname,'../../remagen-mission.html'),'utf8');
const routine=source.slice(source.indexOf('const flakShellGeo='),source.indexOf('function updateTracers('));
const randomMath=Object.create(Math);randomMath.random=()=>.5;
function trial(evade,gunZ=-1900,altitude=400){
 const player={alive:true,pos:new THREE.Vector3(0,altitude,0),heading:0,spd:120,hull:100};
 const gun={alive:true,heavy:true,cool:0,group:new THREE.Group()};gun.group.position.set(0,0,gunZ);
 const smoke=[];
 const context={THREE,Math:randomMath,P:player,ST:{FLIGHT:1},state:1,flakUnits:[gun],groundFire:[],tracers:[],scene:new THREE.Scene(),explosions:[],damagePlayer:(amount)=>player.hull-=amount,
  groundY:()=>0,D:()=>({aim:1,flak:1}),noseDir:()=>new THREE.Vector3(0,0,1),spawnSmoke:(...p)=>smoke.push(p),shake:()=>{},sfxFlak:()=>{}};
 vm.createContext(context);vm.runInContext(routine,context);
 context.updateFlak(.05);
 if(altitude<140||Math.hypot(gunZ,altitude)>3900){
  assert.equal(context.groundFire.length,0,'Heavy flak fired outside its useful altitude or range');return 100;
 }
 assert.equal(context.groundFire.length,1,'Flak should launch a shell');
 assert(smoke.some(([x,y,z])=>x===0&&z===gunZ&&y===5),'muzzle smoke must start at the actual gun');
 const shell=context.groundFire[0];assert.ok(shell.flight>2,'Airburst must have visible travel time');
 assert.equal(player.hull,100,'No instantaneous damage on firing');
 gun.cool=999;
 if(evade){player.heading=Math.PI/2;player.pos.x=300;}else player.pos.z=player.spd*shell.flight;
 context.updateFlak(shell.flight+.02);
 assert(smoke.filter(([x,y,z])=>x===0&&z===gunZ&&y===5).length>=2,'smoke must linger at the firing position');
 assert.equal(context.groundFire.length,0,'Shell resolves at the aimed position');
 if(evade)assert.equal(player.hull,100,'Turning must escape the old aim point');
 else assert.ok(player.hull<100,'A straight pass near the aim point can still be hit');
 return player.hull;
}
console.log('Heavy flak: straight hull '+trial(false).toFixed(1)+', turning hull '+trial(true).toFixed(1));
trial(false,-4200,400);trial(false,-1900,75);
