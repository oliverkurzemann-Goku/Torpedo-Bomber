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
const game=vm.createContext({THREE,Math,console,MISSIONS:[{okinawa:true}],mission:0,
 OKINAWA_OFFSET_X:10000,okinawaWorld:null,sea:{visible:true},islands:[{group:{visible:true}}],
 P:{pos:{x:0,y:0,z:0},touchResolved:false},overDeck:()=>false,DECK_Y:18,carrierX:0,
 STERN_X:-120,BOW_X:120,crashes,DECK_HALF_W:16,crash(type){crashes.push(type)} });
vm.runInContext(pick('setOkinawaActive','init'),game);
vm.runInContext(pick('resolveGroundAndDeck','trap'),game);
(async()=>{
 const world=await new OkinawaWorld(OKINAWA_DATA,{vegetationDensity:.45}).build();
 game.okinawaWorld=world;world.root.position.x=10000;
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
 game.setOkinawaActive(false);
 assert.equal(world.root.visible,false);assert.equal(game.sea.visible,true);
 assert.equal(game.islands[0].group.visible,true);
 assert.match(world.water.material.vertexShader,/vLocal=position/);
 assert.match(world.water.material.fragmentShader,/p=vLocal\.xz/);
 assert.match(html,/title:"Okinawa", sub:"Okinawa Coast · Free Flight", free:true, okinawa:true/);
 assert.match(html,/const last=mission===MISSIONS\.length-2/);
 assert.match(html,/const last = mission===MISSIONS\.length-2/);
 console.log('Okinawa game integration: '+world.objectCount+' instances; land/sea/altitude collision, scene switching and campaign finale OK');
 world.dispose();
})().catch(e=>{console.error(e);process.exitCode=1});
