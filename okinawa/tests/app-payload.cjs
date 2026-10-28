'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),outputName='dist-app-test-'+process.pid,out=path.join(root,outputName);
execFileSync(process.execPath,['scripts/build-app.mjs','--output='+outputName],{cwd:root,stdio:'inherit'});
const manifest=JSON.parse(fs.readFileSync(path.join(out,'app-payload.json'),'utf8'));
for(const record of manifest.files){const bytes=fs.readFileSync(path.join(out,record.path));
 assert.equal(bytes.length,record.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),record.sha256);
 if(/\.(glb|fbx|bin)$/.test(record.path))assert(bytes.equals(fs.readFileSync(path.join(root,record.path))),'original asset changed: '+record.path);
}
for(const entry of ['index.html','torpedo-carrier.html','remagen-mission.html']){
 const html=fs.readFileSync(path.join(out,entry),'utf8');
 assert(!/<script[^>]+src=["']https?:/i.test(html));assert(html.includes('app-native.js'));
 for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
  const relative=match[1].split('?')[0];if(/^(https?:|#|data:)/.test(relative))continue;
  assert(fs.existsSync(path.join(out,decodeURIComponent(relative))),entry+' missing dependency '+relative);
 }
}
for(const required of ['audio/engines/r2800-detail-power.wav','audio/engines/radial14-detail-power.wav','audio/engines/detail-provenance.json','audio/engines/r2800-idle.wav','audio/engines/r2800-power.wav','audio/engines/bmw801-power.wav','audio/engines/db601-power.wav','audio/engines/jumo-power.wav','audio/engines/CREDITS.md','audio/engines/provenance.json'])assert(fs.existsSync(path.join(out,required)),'Missing recorded engine '+required);
for(const retired of ['r2600-idle.wav','r2600-power.wav','r1820-idle.wav','r1820-power.wav','r2800-loaded-power.wav','radial14-loaded-power.wav'])assert(!fs.existsSync(path.join(out,'audio/engines',retired)),'Retired drone omitted');
assert(!fs.existsSync(path.join(out,'audio/engines/source')),'Development recordings excluded');
for(const unwanted of ['.git','node_modules','CLAUDE.md','thunderbolt-europe.html','torpedo-carrier-open-sea.html','model-check.html','p47d_alt.glb','f4u-1c_corsair_war_thunder.glb','b17.glb','sbd dauntless.glb','fw190.glb','me163.glb'])assert(!fs.existsSync(path.join(out,unwanted)));
for(const required of ['assets/aircraft/fw190a8-own.glb','assets/aircraft/me163b-own.glb','me163-native.js'])assert(fs.existsSync(path.join(out,required)),'Missing new original aircraft '+required);
for(const required of ['assets/aircraft/b17-helijah.glb','assets/aircraft/B17-CREDITS.txt','b17-native.js','corsair-native.js','assets/aircraft/corsair-f4u1d-own.glb','sbd-native.js','assets/aircraft/sbd-dauntless.glb','assets/aircraft/SBD-CREDITS.txt','assets/aircraft/bf109f2-own.glb','aircraft-contract.js'])assert(fs.existsSync(path.join(out,required)),'Missing native aircraft payload '+required);
assert(fs.readFileSync(path.join(out,'remagen-mission.html'),'utf8').includes("b17:   ['assets/aircraft/b17-helijah.glb']"));
assert(fs.readFileSync(path.join(out,'remagen-mission.html'),'utf8').includes("['assets/aircraft/bf109f2-own.glb','bf109new.glb',"),'own Bf 109 F-2 is the first Rhine Bf 109 model');
const config=JSON.parse(fs.readFileSync(path.join(root,'capacitor.config.json'),'utf8'));assert.equal(config.webDir,'dist-app');assert(!config.server?.url);
const plist=fs.readFileSync(path.join(root,'ios/App/App/Info.plist'),'utf8');assert(!plist.includes('UIInterfaceOrientationPortrait'));
assert(fs.readFileSync(path.join(root,'ios/App/App/PrivacyInfo.xcprivacy'),'utf8').includes('CA92.1'));
console.log('Offline payload hashes, immutable models, local dependency closure, excluded tools/archives, landscape and native privacy configuration passed.');
fs.rmSync(out,{recursive:true,force:true});
