/* Rights-policy triage for replacement-model candidates (scripts/qualify-candidate.mjs).
 * Uses synthetic GLBs so it keeps passing after the shipped models are replaced; the one
 * real file is the supplied Bf 109 candidate, pinned by hash in model-replacements.cjs. */
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');

function glb(extras,extra={}){
  const json=Buffer.from(JSON.stringify({asset:{version:'2.0',generator:'test',extras},meshes:[{name:'Prop_blade',primitives:[{attributes:{POSITION:0}}]}],
    accessors:[{count:300}],nodes:[{name:'MainGear_L'}],...extra}));
  const pad=Buffer.alloc((4-json.length%4)%4,0x20),body=Buffer.concat([json,pad]);
  const head=Buffer.alloc(20);
  head.write('glTF',0,'ascii');head.writeUInt32LE(2,4);head.writeUInt32LE(20+body.length,8);
  head.writeUInt32LE(body.length,12);head.writeUInt32LE(0x4e4f534a,16);
  return Buffer.concat([head,body]);
}

(async()=>{
  const {qualify,classifyLicense}=await import(pathToFileURL(path.join(root,'scripts/qualify-candidate.mjs')).href);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qualify-'));
  const check=(name,extras,extra)=>{const f=path.join(dir,name+'.glb');fs.writeFileSync(f,glb(extras,extra));return qualify(f);};
  const clean={author:'Someone (https://sketchfab.com/someone)',source:'https://sketchfab.com/3d-models/x',title:'P-47D-28 Bubbletop'};

  for(const [label,level] of [['CC0-1.0 (https://creativecommons.org/publicdomain/zero/1.0/)','ok'],['CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)','ok'],
      ['CC-BY-NC-4.0','blocked'],['CC-BY-NC-SA-4.0','blocked'],['CC-BY-ND-4.0','blocked'],['CC-BY-SA-4.0','review'],['CC-BY-3.0','review'],['','blocked'],[undefined,'blocked']])
    assert.equal(classifyLicense(label).level,level,'license '+label);

  const ok=check('ok',{...clean,license:'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)'});
  assert.equal(ok.verdict,'incomplete','clean license still needs the license-page screenshot');
  assert(ok.todo.some(t=>/license-page screenshot/.test(t)));
  assert.equal(ok.geometry.triangles,100);
  assert.deepEqual(Object.keys(ok.separablePartsByNodeName).sort(),['gear','propeller']);

  const rip=check('rip',{...clean,title:'Fw 190 F-8 (War Thunder)',license:'CC-BY-4.0'});
  assert.equal(rip.verdict,'blocked');assert(rip.blockers.some(b=>/game or game tool/.test(b)),'game re-upload with a CC label is blocked');
  assert.equal(check('cod',{...clean,title:'Warships Call of Duty World at War',license:'CC-BY-4.0'}).verdict,'blocked');

  const nc=check('nc',{...clean,license:'CC-BY-NC-4.0'});
  assert.equal(nc.verdict,'blocked');assert(nc.blockers.some(b=>/noncommercial/.test(b)));
  assert.equal(check('none',{...clean}).verdict,'blocked');
  assert.equal(check('sa',{...clean,license:'CC-BY-SA-4.0'}).verdict,'review');
  assert(check('nosrc',{license:'CC0-1.0'}).todo.some(t=>/no embedded source/.test(t)));
  assert.deepEqual(check('draco',{...clean,license:'CC0-1.0'},{extensionsUsed:['KHR_draco_mesh_compression']}).needsDecoder,['KHR_draco_mesh_compression']);

  const bad=path.join(dir,'broken.glb');fs.writeFileSync(bad,Buffer.from('not a glb at all, just some text bytes'));
  assert.throws(()=>qualify(bad),/Not a valid GLB/);

  const real=qualify('app/model-candidates/bf109-manilov-remix.glb');
  assert.equal(real.license.level,'ok');assert.notEqual(real.verdict,'blocked');
  assert.equal(real.sha256,'0d3ed09912fb5b5eb7f91f2e7835de25b33c603be96a4614e928b5ed2c78cac0');

  fs.rmSync(dir,{recursive:true,force:true});
  console.log('Candidate rights triage: license classes, game re-upload block, NC/ND block, evidence checklist and invalid-file handling OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
