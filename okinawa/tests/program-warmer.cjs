'use strict';
// Build 293: GameRuntime.ProgramWarmer builds shader programs and uploads textures ahead of use.
// Checks with three r128 objects and a recording stand-in renderer (no WebGL needed):
//   * all() hands the whole scene (hidden objects too) to renderer.compile and uploads every texture once;
//   * tick() waits a second, then warms only top-level branches holding unseen materials, always together
//     with every light (the light set is part of the program key), and restores scene.children afterwards;
//   * nothing new -> no compile at all; render-target, cube and image-less textures are skipped;
//   * a failing compile never leaves the scene with its children swapped out.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const THREE=require('three');
const win={performance:{now:()=>0},navigator:{},THREE};
new Function('window',fs.readFileSync(path.join(__dirname,'../../game-runtime.js'),'utf8'))(win);
const {ProgramWarmer}=win.GameRuntime;assert.ok(ProgramWarmer,'ProgramWarmer exported');

function stand(){
  const calls=[],uploads=[];let fail=false;
  return {calls,uploads,info:{programs:[]},set fail(v){fail=v;},
    compile(scene){if(fail)throw new Error('boom');const seen=[];scene.traverse(o=>{if(o.material)seen.push(o.name);});
      calls.push({children:scene.children.map(c=>c.name),seen});this.info.programs.push({});},
    initTexture(t){uploads.push(t.name);}};
}
const tex=name=>{const t=new THREE.Texture({width:4,height:4});t.name=name;t.needsUpdate=true;return t;};
const mesh=(name,map)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial({map}));m.name=name;return m;};

const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
const sun=new THREE.DirectionalLight();sun.name='sun';scene.add(sun);
const rig=new THREE.Group();rig.name='rig';const lamp=new THREE.PointLight();rig.add(lamp);scene.add(rig);
const hidden=mesh('hidden',tex('hiddenMap'));hidden.visible=false;
const world=new THREE.Group();world.name='world';world.add(mesh('tile',tex('tileMap')),hidden);scene.add(world);
const rt=new THREE.WebGLRenderTarget(4,4);const post=mesh('post',rt.texture);scene.add(post);
const bare=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial({map:new THREE.Texture()}));bare.name='bare';scene.add(bare);

const r=stand(),w=new ProgramWarmer(r,scene,camera);
assert.equal(w.all(),1,'one compile pass');
assert.deepEqual(r.calls[0].children,['sun','rig','world','post','bare'],'all(): the whole scene');
assert.ok(r.calls[0].seen.includes('hidden'),'all(): hidden objects are compiled too');
assert.deepEqual(r.uploads.sort(),['hiddenMap','tileMap'],'all(): textures uploaded once, render-target/image-less skipped');

// Nothing new: the first tick only counts down, the next finds nothing to do.
assert.equal(w.tick(.5),0);assert.equal(w.tick(.6),0);assert.equal(r.calls.length,1,'no compile without new materials');

// A model that finished loading later: only its branch (plus the lights) is compiled.
const late=new THREE.Group();late.name='late';late.add(mesh('horse',tex('horseMap')));scene.add(late);
const before=scene.children.slice();
assert.equal(w.tick(.4),0,'waits for its one-second step');
w.tick(.7);
assert.equal(r.calls.length,2,'one compile for the new branch');
assert.deepEqual(r.calls[1].children,['sun','rig','late'],'new branch with every light holder, nothing else');
assert.deepEqual(r.calls[1].seen,['horse']);
assert.deepEqual(scene.children,before,'scene.children restored');
assert.ok(r.uploads.includes('horseMap'),'new texture uploaded');
w.tick(1.1);assert.equal(r.calls.length,2,'already warmed');

// A failing compile restores the scene as well.
scene.add(mesh('crow',null));r.fail=true;const kept=scene.children.slice();
w.tick(1.1);assert.deepEqual(scene.children,kept,'children restored after an exception');
assert.equal(w.stats.runs,3);
console.log('program-warmer: ok',JSON.stringify(w.stats));
