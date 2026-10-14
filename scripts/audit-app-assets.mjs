/* Evidence register for the actual offline payload. A license label never
 * automatically becomes original-rightsholder or distribution clearance. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const release=path.join(root,'app/release');
const payload=path.join(root,'dist-app');
const digest=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile(path.join(payload,'app-payload.json'),'utf8'));
const supplemental=JSON.parse(await fs.readFile(path.join(release,'model-provenance.json'),'utf8')).models;
const evidence=JSON.parse(await fs.readFile(path.join(release,'model-source-evidence.json'),'utf8'));
const sourceMap=new Map(evidence.sources.map(s=>[s.sourceUrl,s]));
function glbJSON(bytes,name){
 if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Invalid GLB '+name);
 const size=bytes.readUInt32LE(12);if(size>bytes.length-20)throw Error('Invalid JSON chunk '+name);
 return JSON.parse(bytes.toString('utf8',20,20+size));
}
const files=[],models=[];
for(const entry of manifest.files){
 if(path.isAbsolute(entry.path)||entry.path.split('/').includes('..'))throw Error('Unsafe payload path');
 const bytes=await fs.readFile(path.join(payload,entry.path));
 if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw Error('Payload has changed: '+entry.path);
 const extension=path.extname(entry.path).toLowerCase();
 const kind=['.glb','.fbx'].includes(extension)?'model':/\.(png|jpe?g|webp|svg)$/.test(extension)?'image':extension==='.bin'||/\/data\/|^okinawa\/data\.js$/.test(entry.path)?'geographic-data':entry.path.startsWith('vendor/')?'vendor':'code-or-notice';
 files.push({...entry,kind});
 if(kind!=='model')continue;
 const json=extension==='.glb'?glbJSON(bytes,entry.path):null;
 const embedded=json?.asset?.extras||{},extra=supplemental[entry.path]||{};
 if(extra.originalFile){
  const original=await fs.readFile(path.join(root,extra.originalFile));
  if(digest(original)!==extra.originalSha256||embedded.sourceSha256!==extra.originalSha256)throw Error('Original source mismatch: '+entry.path);
 }
 const meta={...embedded,...extra},source=sourceMap.get(meta.source)||null;
 const title=meta.title||entry.path,license=meta.license||null;
 let issue='uploader-license-review-open';
 if(/by-nc/i.test(license||''))issue='noncommercial-release-open';
 else if(/war thunder|call of duty|战舰世界|world of warships/i.test(title))issue='original-game-rights-open';
 else if(!license||!meta.source)issue='source-or-license-missing';
 else if(/fps creator/i.test(title))issue='upstream-game-rights-open';
 else if(/CC0/i.test(license))issue='cc0-source-recorded';
 const licenseURL=license?.match(/https?:\/\/[^)\s]+/)?.[0]||null;
 const pageURL=source?.declaredLicense?.url;
 const licenseMatch=!!(licenseURL&&pageURL&&licenseURL.replace(/^http:/,'https:')===pageURL.replace(/^http:/,'https:'));
 if(source?.fetchStatus==='verified-public-api'&&licenseURL&&pageURL&&!licenseMatch)issue='license-declaration-conflict';
 models.push({...entry,title,uploader:meta.author||null,originalRightsholder:null,
  sourceUrl:meta.source||null,acquiredOn:null,declaredLicense:license,
  licenseUrl:licenseURL,licenseEvidence:extra.evidence||'Exact runtime GLB asset.extras',
  sourceCheck:source?{status:source.fetchStatus,checkedOn:source.checkedOn,apiUrl:source.apiUrl,licenseMatch,descriptionSignals:source.descriptionSignals||[]}:null,
  embeddedImageCount:json?(json.images||[]).length:null,
  externalImages:(json?.images||[]).map(i=>i.uri).filter(u=>u&&!u.startsWith('data:')),
  originalFile:extra.originalFile||null,originalSha256:extra.originalSha256||null,
  changes:meta.changes||embedded.processing||'Original runtime binary preserved; runtime scaling, materials, rigging and placement are described in ASSET-CREDITS.md / CLAUDE.md.',
  issue,commercialPermissionDocument:null,bundleRedistributionGrant:null,releaseApproved:false,
  nextAction:issue==='noncommercial-release-open'?'Obtain a grant covering the intended app/business model from all relevant creators, or replace the model.':issue==='original-game-rights-open'||issue==='upstream-game-rights-open'?'Establish original mesh/texture ownership; obtain an app redistribution grant or independently authored replacement.':issue==='source-or-license-missing'?'Identify the exact author/source/version and license before distribution.':'Retain license/attribution/change notices, validate mesh/texture provenance and app-store redistribution conditions.'});
}
const register={schema:1,reviewedOn:evidence.checkedOn,build:manifest.build,
 status:'OPEN — source declarations checked; no external rights authorization obtained',
 payload:{bytes:manifest.bytes,fileCount:files.length,modelCount:models.length,manifestSha256:digest(await fs.readFile(path.join(payload,'app-payload.json')))},
 files,models,
 otherGroups:[
  {paths:['assets/remagen/ford1940/*.png','assets/remagen/ford1940/*.jpeg'],status:'Included under the Ford source review; separate provenance per texture not yet demonstrated.'},
  {paths:['terrain-system/real/data/**','okinawa/data.js'],status:'Copernicus/Overture/OSM notices and adapted-database redistribution to verify against the exact releases and source rows.'},
  {paths:['terrain-system/data/**'],status:'Synthetic prototype and historical fixtures are also currently copied by the payload builder; distinguish them from real datasets.'},
  {paths:['assets/*-campaign.webp','assets/*-campaign.svg'],status:'Generated/original project art; generation record in assets/CAMPAIGN-ART.md. No blanket grant for depicted third-party marks is inferred.'},
  {paths:['audio/*.js'],status:'Procedural Web Audio, no recorded samples in this payload. Archived WAV/MP3 excluded.'},
  {paths:['vendor/**','app-native.js'],status:'Bundled Three.js/fflate/Capacitor MIT notices retained; native package and distribution review remains open.'}
 ]};
await fs.writeFile(path.join(release,'asset-register.json'),JSON.stringify(register,null,2)+'\n');
const cell=s=>String(s??'—').replaceAll('|','\\|').replaceAll('\n',' ');
let report=`# Offline app asset register — Build ${manifest.build}\n\nChecked ${register.reviewedOn}. ${files.length} payload files, ${models.length} model files, ${(manifest.bytes/1024/1024).toFixed(1)} MiB.\n\nGenerated from the actual dist-app payload by npm run app:assets. Hashes cover embedded textures too. This is an evidence inventory; no row is automatically approved for distribution. Acquisition dates remain unknown where not recorded.\n\n| Runtime file | Source / uploader | Declared license | Open issue | SHA-256 |\n| --- | --- | --- | --- | --- |\n`;
for(const m of models)report+=`| ${cell(m.path)} | ${m.sourceUrl?'['+cell(m.uploader||m.title)+']('+m.sourceUrl+')':'Source unknown'} | ${cell(m.declaredLicense)} | ${cell(m.issue)} | ${m.sha256} |\n`;
report+='\nThe machine-readable asset-register.json contains every payload file, exact binary hashes, API-check status, embedded image counts, changes and next actions. model-source-evidence.json stores dated public metadata observations; model-provenance.json restores the exact original attribution for the two optimized fortification scans.\n\nA fresh public API observation confirms an uploader declaration, not the uploader’s authority over third-party game meshes/textures. For independent CC assets, follow attribution/change requirements and review app-store restrictions; a separate permission is not inherently required when an applicable license already covers the intended use.\n';
await fs.writeFile(path.join(release,'asset-register.md'),report);
console.log(`${files.length} verified payload files; ${models.length} model records. Rights approval remains OPEN.`);
