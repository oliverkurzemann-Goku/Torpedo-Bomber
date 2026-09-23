/* Run with NODE_PATH pointing to three@0.128.0 and @napi-rs/canvas. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const THREE=require('three'),{createCanvas}=require('@napi-rs/canvas');
global.THREE=THREE;global.window=global;global.document={createElement:()=>createCanvas(1,1)};
const root=path.resolve(__dirname,'../..');
vm.runInThisContext(fs.readFileSync(path.join(root,'okinawa/data.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root,'okinawa/world.js'),'utf8'));
const html=fs.readFileSync(path.join(root,'torpedo-carrier.html'),'utf8');
const pick=(name,next)=>{
 const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction '+next+'(',start+1);
 assert.ok(start>0&&end>start,name+' exists');return html.slice(start,end);
};
const crashes=[];
const game=vm.createContext({THREE,Math,console,MISSIONS:[{okinawa:true},{okinawa:false}],mission:0,
 OKINAWA_OFFSET_X:10000,okinawaWorld:null,sea:{visible:true},islands:[{group:{visible:true}}],
 P:{pos:{x:0,y:0,z:0},touchResolved:false},overDeck:()=>false,DECK_Y:18,carrierX:0,
 STERN_X:-120,BOW_X:120,crashes,DECK_HALF_W:16,crash(type){crashes.push(type)},
 planeShadow:{position:new THREE.Vector3(),scale:new THREE.Vector3(),material:{opacity:1},visible:true},
 scene:new THREE.Scene()});
vm.runInContext(pick('setOkinawaActive','init'),game);
vm.runInContext(pick('updateShadow','updateClouds'),game);
vm.runInContext(pick('resolveGroundAndDeck','trap'),game);
(async()=>{
 const world=await new OkinawaWorld(OKINAWA_DATA,{vegetationDensity:.45}).build();
 game.okinawaWorld=world;world.root.position.x=10000;game.scene.add(world.root);
 game.setOkinawaActive(true);
 assert.equal(world.root.visible,true);assert.equal(game.sea.visible,false);
 assert.equal(game.islands[0].group.visible,false);
 assert.ok(world.objectCount<30000,'Reduced game decoration fits its budget');
 assert.ok(world.shoreDistance(-2495,-2548)>100,'Measured land location');
 game.P.pos={x:7505,y:50,z:-2548};game.resolveGroundAndDeck(.016);
 assert.deepEqual(game.crashes,['TERRAIN'],'Player hits measured hillside after root translation');
 game.crashes.length=0;game.P.pos={x:7505,y:150,z:-2548};game.resolveGroundAndDeck(.016);
 assert.deepEqual(game.crashes,[],'Player above hillside remains airborne');
 game.P.pos={x:3000,y:50,z:-2000};game.resolveGroundAndDeck(.016);
 assert.deepEqual(game.crashes,[],'Offshore air has no land collision');
 game.P.pos={x:7505,y:200,z:-2548};game.updateShadow();
 assert.ok(Math.abs(game.planeShadow.position.y-world.getHeight(-2495,-2548)-.12)<.001,'Shadow rests on actual land');
 assert.ok(game.planeShadow.visible,'Shadow remains visible at low altitude above terrain');
 game.P.pos={x:3000,y:200,z:-2000};game.updateShadow();
 assert.equal(game.planeShadow.position.y,.45,'Shadow returns to sea level offshore');
 game.P.pos={x:0,y:50,z:0};game.updateShadow();
 assert.equal(game.planeShadow.position.y,19.05,'Carrier deck shadow is unchanged');
 game.setOkinawaActive(false);
 assert.equal(world.root.visible,false);assert.equal(game.sea.visible,true);
 assert.equal(game.islands[0].group.visible,true);
 assert.match(world.water.material.vertexShader,/vLocal=position/);
 assert.match(world.water.material.fragmentShader,/p=vLocal\.xz/);
 assert.match(html,/title:"Okinawa", sub:"Okinawa Coast · Free Flight", free:true, okinawa:true/);
 assert.match(html,/const last=mission===MISSIONS\.length-2/);
 assert.match(html,/const last = mission===MISSIONS\.length-2/);
 assert.match(html,/if\(!MISSIONS\[idx\]\.okinawa\)releaseOkinawa\(\)/);
 assert.match(html,/function exitToMenu\(\)[\s\S]*?setOkinawaActive\(false\);\s*releaseOkinawa\(\)/);
 const count=world.objectCount;game.releaseOkinawa();
 assert.equal(game.okinawaWorld,null,'Leaving Okinawa releases the cached world');
 assert.equal(world.root.parent,null,'Leaving Okinawa detaches its scene from the renderer');
 game.releaseOkinawa(); // repeated exits must remain safe
 console.log('Okinawa game integration: '+count+' instances; land/sea/deck shadows, collision, scene switching, disposal and campaign finale OK');
})().catch(e=>{console.error(e);process.exitCode=1});
