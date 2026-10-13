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
for(const unwanted of ['.git','node_modules','CLAUDE.md','thunderbolt-europe.html','torpedo-carrier-open-sea.html','model-check.html','p47d_alt.glb'])assert(!fs.existsSync(path.join(out,unwanted)));
const config=JSON.parse(fs.readFileSync(path.join(root,'capacitor.config.json'),'utf8'));assert.equal(config.webDir,'dist-app');assert(!config.server?.url);
const plist=fs.readFileSync(path.join(root,'ios/App/App/Info.plist'),'utf8');assert(!plist.includes('UIInterfaceOrientationPortrait'));
assert(fs.readFileSync(path.join(root,'ios/App/App/PrivacyInfo.xcprivacy'),'utf8').includes('CA92.1'));
console.log('Offline payload hashes, immutable models, local dependency closure, excluded tools/archives, landscape and native privacy configuration passed.');
fs.rmSync(out,{recursive:true,force:true});
