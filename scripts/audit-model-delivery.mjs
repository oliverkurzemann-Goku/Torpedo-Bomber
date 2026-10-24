/* Audit real app payload, embedded textures, and candidate model URLs reachable
 * from the two public games. A license declaration is not an ownership warranty. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reportDir=path.join(root,'app/release/model-review');
const sha=b=>createHash('sha256').update(b).digest('hex');
const exists=async p=>{try{return (await fs.stat(p)).isFile();}catch{return false;}};
const payload=JSON.parse(await fs.readFile(path.join(root,'dist-app/app-payload.json'),'utf8'));
const old=JSON.parse(await fs.readFile(path.join(root,'app/release/asset-register.json'),'utf8'));
const provenance=JSON.parse(await fs.readFile(path.join(root,'app/release/model-provenance.json'),'utf8')).models;
const checks=JSON.parse(await fs.readFile(path.join(reportDir,'source-checks-20261024.json'),'utf8'));
const bySource=new Map(checks.sources.map(s=>[s.source,s]));
const oldByPath=new Map(old.models.map(m=>[m.path,m]));
const nativeFiles=new Map(payload.files.map(f=>[f.path,f]));
const codeFiles=new Set(),candidates=new Map(),queue=['index.html','torpedo-carrier.html','remagen-mission.html'];
function clean(s){try{return decodeURIComponent(s.split('?')[0].split('#')[0]);}catch{return s;}}
while(queue.length){
 const rel=queue.shift();if(codeFiles.has(rel)||!await exists(path.join(root,rel)))continue;codeFiles.add(rel);
 const code=await fs.readFile(path.join(root,rel),'utf8');
 for(const m of code.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g))if(!/^https?:/.test(m[1]))queue.push(clean(m[1]));
 for(const m of code.matchAll(/(?:import\s*\(|from\s*)["']([^"']+\.js(?:\?[^"']*)?)["']/g))if(!/^https?:/.test(m[1]))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel),clean(m[1]))));
 // Static candidates are kept distinct from observed network requests.
 for(const m of code.matchAll(/["'`]([^"'`\n]+\.(?:glb|fbx)(?:\?[^"'`\n]*)?)["'`]/gi)){
  const value=clean(m[1]);if(value.length<6||/[<>{}]/.test(value)||/^https?:/.test(value))continue;
  const locations=[value,path.posix.normalize(path.posix.join(path.posix.dirname(rel),value))];
  const found=await Promise.all(locations.map(p=>exists(path.join(root,p))));const target=locations[found.indexOf(true)]||value;
  const entry=candidates.get(target)||{path:target,referencedBy:[],exists:found.some(Boolean),scope:'static-runtime-candidate'};
  if(!entry.referencedBy.includes(rel))entry.referencedBy.push(rel);candidates.set(target,entry);
 }
}
// These are explicit spec-driven URLs assembled in NavalAssets, not quoted filenames.
if(codeFiles.has('naval-assets.js'))for(const name of ['fletcher','japanese-cargo','landing-ship','liberty','samidare','ko-hyoteki']){
 const rel='assets/ships/'+name+'.glb';candidates.set(rel,{path:rel,referencedBy:['naval-assets.js'],exists:await exists(path.join(root,rel)),scope:'spec-driven-runtime-candidate'});
}
const paths=new Set([...payload.files.filter(f=>/\.(glb|fbx)$/i.test(f.path)).map(f=>f.path),...Array.from(candidates.values()).filter(c=>c.exists).map(c=>c.path)]);
const models=[];
for(const rel of [...paths].sort()){
 const b=await fs.readFile(path.join(root,rel)),inApp=nativeFiles.has(rel),textures=[];let embedded={},external=[];
 if(inApp){const delivered=await fs.readFile(path.join(root,'dist-app',rel));if(sha(delivered)!==sha(b))throw Error('Payload source mismatch: '+rel);}
 if(/\.glb$/i.test(rel)){
  if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(8)!==b.length)throw Error('Bad GLB '+rel);
  const n=b.readUInt32LE(12),j=JSON.parse(b.toString('utf8',20,20+n)),binStart=28+n;embedded=j.asset?.extras||{};
  for(const [i,image] of (j.images||[]).entries()){
   if(image.bufferView!=null){const v=j.bufferViews[image.bufferView],bytes=b.subarray(binStart+(v.byteOffset||0),binStart+(v.byteOffset||0)+v.byteLength);textures.push({index:i,name:image.name||null,mimeType:image.mimeType,bytes:bytes.length,sha256:sha(bytes),embedded:true});}
   else if(image.uri){
    if(image.uri.startsWith('data:')){const bytes=Buffer.from(image.uri.split(',')[1],'base64');textures.push({index:i,embedded:true,bytes:bytes.length,sha256:sha(bytes)});}
    else{const name=path.posix.normalize(path.posix.join(path.posix.dirname(rel),clean(image.uri)));external.push(name);const bytes=await fs.readFile(path.join(root,name));textures.push({index:i,path:name,embedded:false,bytes:bytes.length,sha256:sha(bytes),inApp:nativeFiles.has(name)});}
   }
  }
 }
 const previous=oldByPath.get(rel)||{},meta={...embedded,...(provenance[rel]||{})},source=meta.source||previous.sourceUrl||null,check=bySource.get(source),license=meta.license||previous.declaredLicense||null,title=meta.title||previous.title||rel;
 const game=/war thunder|call of duty|world of warships|战舰世界|fps creator/i.test(title),restricted=/by-nc|by-nd|editorial/i.test(license||'');
 let category='unclear-origin',reason='Source, authorship or applicable use terms have not been established.';
 if(game){category='restriction-or-upstream-permission-required';reason='Identified upstream game/tool content. Uploader CC declaration does not establish upstream permission.';}
 else if(restricted){category='restriction-or-upstream-permission-required';reason='Declared license has noncommercial, no-derivatives or editorial limitations.';}
 else if(/CC0|by\/4\.0|CC-BY-4\.0/i.test(license||'')&&(check?.status==='verified-public-api'||previous.issue==='cc0-source-recorded')){
  const expected=(license.match(/https?:\/\/[^)\s]+/)||[])[0],actual=check?.license?.url;
  if(!actual||!expected||expected.replace('http:','https:')===actual.replace('http:','https:')){category='documented-compatible-license';reason='Compatible source license recorded; attribution/change notices and any third-party rights still apply. Not a title guarantee.';}
 }
 const supplementalTextures=payload.files.filter(f=>/\.(png|jpe?g|webp|dds)$/i.test(f.path)&&((rel.endsWith('.fbx')&&f.path.startsWith(path.posix.dirname(rel)+'/'))||(rel==='grumman tbm avenger.glb'&&f.path.startsWith('assets/aircraft/avenger-1942-'))));
 models.push({path:rel,bytes:b.length,sha256:sha(b),title,author:meta.author||previous.uploader||null,license,source,sourceCheck:check||null,category,reason,inApp,inWebCandidateGraph:candidates.has(rel),referencedBy:candidates.get(rel)?.referencedBy||[],textures,externalTextures:external,supplementalTextures,upstreamSourceHash:meta.originalSha256||embedded.sourceSha256||null,releaseApproved:false});
}
const counts={};for(const m of models)counts[m.category]=(counts[m.category]||0)+1;
const report={schema:1,checkedOn:'2026-10-24',build:payload.build,scope:{entries:['index.html','torpedo-carrier.html','remagen-mission.html'],appManifestSha256:sha(await fs.readFile(path.join(root,'dist-app/app-payload.json'))),payloadFiles:payload.files.length,payloadBytes:payload.bytes,scriptFiles:[...codeFiles].sort(),staticCandidates:[...candidates.values()],networkTrace:'See browser-delivery-trace.json when generated. Static reachability does not assert a request occurred.',limitations:['Web-hosted repository files outside runtime candidates may remain publicly reachable.','Material ownership is not established solely by metadata, hashes or a CC label.','FBX external image resolution follows the existing WorldVehicles texture mappings; related shipped image files are separately hashed.','Other app code, audio, geographic data and marks require their own compliance record.']},categories:counts,models};
await fs.mkdir(reportDir,{recursive:true});await fs.writeFile(path.join(reportDir,'delivery-audit.json'),JSON.stringify(report,null,2)+'\n');
const cell=s=>String(s??'—').replaceAll('|','\\|').replaceAll('\n',' ');
let md='# Model delivery review — 24 October 2026\n\nActual offline payload: '+payload.files.length+' files; '+models.filter(m=>m.inApp).length+' model files. Every model and embedded/external image has a SHA-256. Static candidate URLs are recorded separately from actual browser requests.\n\n';
md+='Categories describe evidence, not a court finding: documented-compatible-license = a compatible published license is recorded; unclear-origin = incomplete or inaccessible source; restriction-or-upstream-permission-required = declared restrictions or identified upstream-game material. No blanket ownership warranty.\n\n| File | App | Web candidate | Category | Source | Embedded images |\n| --- | --- | --- | --- | --- | --- |\n';
for(const m of models)md+='| '+[m.path,m.inApp?'yes':'no',m.inWebCandidateGraph?'yes':'no',m.category,m.source?'['+cell(m.author||'Source')+']('+m.source+')':'unknown',m.textures.filter(t=>t.embedded).length].map(cell).join(' | ')+' |\n';
md+='\n## Distribution decision\n\nA development build is not a rights-cleared app release. The release check must reject unresolved/blocked model hashes, including derivatives and fallback files. The existing web game is retained during replacement work; it is not certified for commercial distribution by this report.\n';
await fs.writeFile(path.join(reportDir,'DELIVERY-AUDIT.md'),md);console.log(JSON.stringify({models:models.length,appModels:models.filter(m=>m.inApp).length,embeddedImages:models.reduce((s,m)=>s+m.textures.filter(t=>t.embedded).length,0),categories:counts,missingCandidates:[...candidates.values()].filter(c=>!c.exists).length}));
if(process.argv.includes('--release')){const blockers=models.filter(m=>m.inApp&&m.category!=='documented-compatible-license');if(blockers.length){console.error('Release blocked: '+blockers.length+' model files need an independent replacement or applicable upstream permission.');process.exitCode=2;}}
