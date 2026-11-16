'use strict';
// Build 279: on High the tree shadows appeared late and suddenly. The shadow box
// was centred on the aircraft (+-240 m, ~200 m ahead along the track) and the
// tree casters were re-picked only every 2 s (at 150 m/s the trees just ahead
// lost their shadow for up to 1.5 s). Now the box sits on the ground ahead of
// the camera, casters are re-picked four times a second and the shadow fades
// out towards the box edge instead of stopping at a hard line.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const THREE=require('three');global.THREE=THREE;
const source=fs.readFileSync(path.join(__dirname,'../../graphics-extras.js'),'utf8');
const win={};new Function('window',source)(win);
const GE=win.GraphicsExtras;
const chunkBefore=THREE.ShaderChunk.shadowmap_pars_fragment;
const scene=new THREE.Scene(),sun=new THREE.DirectionalLight();scene.add(sun,sun.target);
const ground=12;
const cells=[1300,600,-500].map(x=>{const mesh=new THREE.Mesh();mesh.castShadow=false;return {x,mesh,sphere:new THREE.Sphere(new THREE.Vector3(x,ground,0),166)};});
const renderer={shadowMap:{enabled:false},domElement:{height:600}};
const fx=GE.create(THREE,scene,renderer,{sun,direction:new THREE.Vector3(-.52,.752,.405),
  terrain:()=>({getRenderedHeight:()=>ground}),osm:()=>({tiles:new Map(),treeCells:cells})});
const chunk=THREE.ShaderChunk.shadowmap_pars_fragment;
assert(chunk!==chunkBefore&&chunk.includes('return mix(1.0,shadow,shadowEdgeFade(shadowCoord.xy));'),'shadow fades towards the edge of the shadow map');
assert.equal(chunk.split('shadowEdgeFade').length-1,2,'patched once');
GE.create(THREE,new THREE.Scene(),renderer,{});assert.equal(THREE.ShaderChunk.shadowmap_pars_fragment,chunk,'a second create does not patch twice');

fx.configure({shadows:true,shadowSize:2048,shadowRange:360});
assert.equal(renderer.shadowMap.enabled,true);
const camera=new THREE.PerspectiveCamera(60,1.4,1,20000);
const plane=new THREE.Vector3(0,ground+60,0);
function fly(x,seconds){for(let t=0;t<seconds;t+=1/60){plane.x=x+(t*150);camera.position.set(plane.x-50,plane.y+12,0);camera.lookAt(plane.x+100,plane.y,0);camera.updateMatrixWorld();fx.update(1/60,camera,plane,{aircraft:[]});}}
fly(0,1/60);
const target=sun.target.position;
// Snapping happens in light space, so compare the light-space footprint on the ground.
const ahead=target.x-plane.x+(target.y-ground)*(.52/.752);
assert(ahead>150&&ahead<260,'shadow box centred ~200 m ahead of the aircraft on the ground: '+ahead.toFixed(0));
assert.equal(cells[1].mesh.castShadow,true,'trees 600 m ahead already cast');
assert.equal(cells[2].mesh.castShadow,true,'trees just behind still cast (camera sees them)');
assert.equal(cells[0].mesh.castShadow,false,'trees 1.3 km ahead do not cast yet');
fly(0,.35);   // 50 m further: picked within a quarter second, not after 2 s
fly(400,.3);
assert.equal(cells[0].mesh.castShadow,true,'trees coming into range cast within 0.3 s');
fx.configure({shadows:false});assert.equal(renderer.shadowMap.enabled,false);
console.log('graphics-shadows: box ahead of the camera, casters every 0.25 s, soft edge');
