'use strict';
// Build 282: vendor/three-r128.min.js carries a small patch (scripts/patch-three-instancing.cjs):
// an InstancedMesh keeps its own vertex-array object and is re-bound only when its
// instance buffers change, instead of re-binding every attribute on every draw.
// This test draws the same scenes with the ORIGINAL r128 (patch reversed in memory)
// and with the PATCHED file in one page and demands bit-identical pixels, while the
// patched one issues far fewer WebGL calls. The scenes cover what the game does:
// many instanced meshes sharing one geometry with different instance matrices and
// colours, a depth/shadow pass with its own program, per-frame matrix updates,
// count changes, a replaced instance attribute, swapping geometry (tree LOD) and
// disposing/recreating meshes (young trees around the aircraft).
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('three instancing patch WebGL: skipped locally (no Chrome).');process.exit(0);}
const {chromium}=require('playwright');
const {unpatch}=require('../../scripts/patch-three-instancing.cjs');
const patched=fs.readFileSync(path.join(__dirname,'../../vendor/three-r128.min.js'),'utf8');
const original=unpatch(patched);
assert.equal(require('crypto').createHash('sha256').update(original).digest('hex'),
  '9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2','reversing the patch must give the shipped r128 file');

(async()=>{
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:400,height:300}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<html><body></body></html>');
  // two copies of three side by side
  await page.addScriptTag({content:original+';window.THREE_A=THREE;'});
  await page.addScriptTag({content:patched+';window.THREE_B=THREE;'});
  const result=await page.evaluate(()=>{
   function run(T){
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;document.body.appendChild(canvas);
    const renderer=new T.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true});
    renderer.setPixelRatio(1);renderer.setSize(320,240,false);renderer.shadowMap.enabled=true;
    const gl=renderer.getContext();let calls=0;const byName={};
    for(const k of Object.getOwnPropertyNames(Object.getPrototypeOf(gl))){const f=gl[k];if(typeof f!=='function'||k==='getExtension'||k==='isContextLost'||k==='getParameter'||k==='getShaderPrecisionFormat')continue;gl[k]=function(){calls++;byName[k]=(byName[k]||0)+1;return f.apply(gl,arguments);};}
    const scene=new T.Scene();scene.background=new T.Color(0x8899aa);
    const cam=new T.PerspectiveCamera(55,320/240,1,500);cam.position.set(0,40,90);cam.lookAt(0,0,0);
    const sun=new T.DirectionalLight(0xffffff,1);sun.position.set(30,60,20);sun.castShadow=true;sun.shadow.mapSize.set(512,512);
    Object.assign(sun.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:1,far:200});scene.add(sun,new T.AmbientLight(0x404040));
    const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0x557744}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
    const near=new T.ConeGeometry(2,8,7),far=new T.IcosahedronGeometry(2.5,0),box=new T.BoxGeometry(3,3,3);
    const mats=[new T.MeshStandardMaterial({color:0x2f6b2f}),new T.MeshLambertMaterial({color:0x8a5a2b}),new T.MeshStandardMaterial({color:0xffffff})];
    let seed=5;const rnd=()=>((seed=(seed*16807)%2147483647)-1)/2147483646;
    const m=new T.Matrix4(),q=new T.Quaternion(),s=new T.Vector3(),p=new T.Vector3();
    const cells=[];
    function makeCell(i,j,geo,mat,count,colored){
     const mesh=new T.InstancedMesh(geo,mat,count);mesh.castShadow=mesh.receiveShadow=true;
     for(let k=0;k<count;k++){p.set(i*30+rnd()*24-12,4,j*30+rnd()*24-12);s.setScalar(.6+rnd()*.8);q.setFromAxisAngle(new T.Vector3(0,1,0),rnd()*6);m.compose(p,q,s);mesh.setMatrixAt(k,m);
       if(colored)mesh.setColorAt(k,new T.Color().setHSL(rnd(),.5,.5));}
     scene.add(mesh);cells.push(mesh);return mesh;}
    // many meshes sharing the same geometry, different instance buffers (like tree cells)
    for(let i=-2;i<=2;i++)for(let j=-2;j<=1;j++){makeCell(i,j,near,mats[0],12,false);makeCell(i,j,box,(i+j)%2===0?mats[2]:mats[(i+j+9)%2],5,(i+j)%2===0);/* r128 itself cannot share one material between coloured and plain instances */}
    const shots=[];
    for(let f=0;f<24;f++){
     // per-frame matrix update in one mesh (moving crowd/vehicles)
     const mover=cells[3];for(let k=0;k<mover.count;k++){mover.getMatrixAt(k,m);m.decompose(p,q,s);p.x+=Math.sin(f+k)*.5;m.compose(p,q,s);mover.setMatrixAt(k,m);}mover.instanceMatrix.needsUpdate=true;
     if(f===6)cells[5].count=2;                                       // count change
     if(f===8){for(let k=0;k<6;k+=2)cells[k].geometry=cells[k].geometry===near?far:near;}   // LOD swap
     if(f===10){const old=cells[7];scene.remove(old);old.dispose();cells.splice(7,1);makeCell(3,3,near,mats[0],9,false);} // dispose + recreate
     if(f===12){const c=cells[9];c.instanceMatrix=new T.InstancedBufferAttribute(new Float32Array(c.instanceMatrix.array),16);} // replaced attribute
     if(f===14){const c=cells[1];c.instanceColor&&(c.instanceColor.needsUpdate=true);c.setColorAt(0,new T.Color(1,0,0));c.instanceColor&&(c.instanceColor.needsUpdate=true);}
     cam.position.x=Math.sin(f*.2)*20;cam.lookAt(0,0,0);
     renderer.render(scene,cam);
     if(f%4===3){const px=new Uint8Array(320*240*4);gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,px);shots.push(px);}
    }
    return {shots,calls,vaoMade:byName.createVertexArray||0,vaoFreed:byName.deleteVertexArray||0};
   }
   let a,b;try{a=run(THREE_A);}catch(e){throw new Error("original r128: "+e.message);}try{b=run(THREE_B);}catch(e){throw new Error("patched r128: "+e.message);}
   const diffs=a.shots.map((x,i)=>{let n=0;for(let k=0;k<x.length;k++)if(x[k]!==b.shots[i][k])n++;return n;});
   let lit=0;for(let k=0;k<a.shots[0].length;k+=4)if(a.shots[0][k]!==0x88)lit++;
   return {diffs,callsA:a.calls,callsB:b.calls,lit,vaoA:[a.vaoMade,a.vaoFreed],vaoB:[b.vaoMade,b.vaoFreed]};
  });
  assert.deepEqual(errors,[]);
  assert.ok(result.lit>5000,'scene drew something');
  assert.ok(result.diffs.every(n=>n===0),'pixels differ between original and patched r128: '+result.diffs.join(','));
  assert.ok(result.callsB<result.callsA*.75,'patched r128 should issue far fewer WebGL calls: '+result.callsA+' -> '+result.callsB);
  // the disposed mesh (frame 10) had a colour and a depth program: its vertex-array objects are freed
  assert.ok(result.vaoB[1]>=2,'vertex-array objects of a disposed mesh freed: '+result.vaoB);
  console.log('vertex-array objects made/freed: original',result.vaoA.join('/'),'patched',result.vaoB.join('/'));
  console.log('three instancing patch: identical pixels in',result.diffs.length,'frames; WebGL calls',result.callsA,'->',result.callsB);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
