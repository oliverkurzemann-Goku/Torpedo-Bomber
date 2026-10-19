#!/usr/bin/env node
/* Intake triage for downloaded replacement-model candidates.
 *
 * Reads each GLB's own header (embedded Sketchfab asset.extras) and classifies it
 * against the project's rights policy (app/model-candidates/README.md): CC0 and
 * CC BY 4.0 may proceed; NC/ND and game-derived uploads are blocked as replacements;
 * BY-SA and unrecognised licenses need an individual decision. The result is a
 * checklist for a human reviewer, never a release approval.
 *
 *   node scripts/qualify-candidate.mjs [--json] [file-or-dir ...]
 *
 * With no argument every GLB below app/model-candidates/ is checked. Exit code 1 if
 * any file is blocked. Evidence convention (kept next to the candidate, never shipped):
 *   app/model-candidates/evidence/<file-stem>/license-page.png  (screenshot of the
 *   model's license/download page, taken by a signed-in person)
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const candidateDir=path.join(root,'app/model-candidates');

// Title/source heuristics only: a clean title is NOT clearance, a hit is a reason to stop.
const GAME_DERIVED=/war ?thunder|call of duty|world of warships|world of wargames|战舰世界|gaijin|activision|wargaming|fps ?creator|game ?rip|ripped from|extracted from/i;
const PART_HINTS={
  propeller:/prop(eller)?\b|rotor|spinner|blade/i,
  gear:/gear|wheel|undercarriage|\btyre|\btire|strut/i,
  flap:/flap|aileron|elevator|rudder/i,
  canopy:/canopy|cockpit|windshield|glass/i
};
const NEEDS_DECODER=['KHR_draco_mesh_compression','EXT_meshopt_compression'];

export function readGLB(bytes,name){
  if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||
     bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Not a valid GLB 2.0: '+name);
  const size=bytes.readUInt32LE(12);
  if(size>bytes.length-20)throw Error('Invalid JSON chunk: '+name);
  return JSON.parse(bytes.toString('utf8',20,20+size));
}

export function classifyLicense(license){
  const text=(license||'').trim();
  if(!text)return {level:'blocked',label:null,why:'no embedded license declaration'};
  const slug=text.split(/\s+/)[0].toUpperCase();
  if(/-NC(-|$)/.test(slug))return {level:'blocked',label:slug,why:'noncommercial license: not usable for a possibly commercial app release'};
  if(/-ND(-|$)/.test(slug))return {level:'blocked',label:slug,why:'no-derivatives license: we adapt and redistribute modified models'};
  if(/-SA(-|$)/.test(slug))return {level:'review',label:slug,why:'share-alike: needs a separate decision on redistribution conditions'};
  if(/^CC0/.test(slug))return {level:'ok',label:slug,why:'public-domain dedication'};
  if(slug==='CC-BY-4.0')return {level:'ok',label:slug,why:'needs author credit, license link and a note on our changes'};
  return {level:'review',label:slug,why:'unrecognised or older license version: decide individually'};
}

function geometryStats(json){
  let triangles=0;
  for(const mesh of json.meshes||[])for(const prim of mesh.primitives||[]){
    if((prim.mode??4)!==4)continue;
    const accessor=json.accessors?.[prim.indices!==undefined?prim.indices:prim.attributes?.POSITION];
    if(accessor)triangles+=accessor.count/3;
  }
  return {meshes:(json.meshes||[]).length,materials:(json.materials||[]).length,images:(json.images||[]).length,triangles:Math.round(triangles)};
}

function partHints(json){
  const names=[...new Set([...(json.nodes||[]),...(json.meshes||[])].map(n=>n.name).filter(Boolean))];
  const found={};
  for(const [part,re] of Object.entries(PART_HINTS)){
    const hit=names.filter(n=>re.test(n));
    if(hit.length)found[part]=hit.slice(0,6);
  }
  return found;
}

export function qualify(file){
  const abs=path.resolve(root,file);
  const bytes=fs.readFileSync(abs);
  const json=readGLB(bytes,file);
  const extras=json.asset?.extras||{};
  const license=classifyLicense(extras.license);
  const gameText=[extras.title,extras.source,extras.author].filter(Boolean).join(' | ');
  const stem=path.basename(abs).replace(/\.glb$/i,'');
  const evidenceDir=path.join(candidateDir,'evidence',stem);
  const screenshot=['png','jpg','jpeg','webp'].map(e=>path.join(evidenceDir,'license-page.'+e)).find(p=>fs.existsSync(p))||null;

  const blockers=[],todo=[];
  if(license.level==='blocked')blockers.push(license.why);
  if(GAME_DERIVED.test(gameText))blockers.push('title/source names a game or game tool: a CC label on such a re-upload is not clearance (project policy)');
  if(!extras.source)todo.push('no embedded source URL: record the model page link by hand');
  if(!extras.author)todo.push('no embedded author: record the creator by hand');
  if(!screenshot)todo.push('license-page screenshot missing: app/model-candidates/evidence/'+stem+'/license-page.png');

  const verdict=blockers.length?'blocked':license.level==='review'?'review':todo.length?'incomplete':'ready';
  const extensions=json.extensionsUsed||[];
  return {
    file:path.relative(root,abs).split(path.sep).join('/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
    verdict,blockers,todo,
    license:{declared:extras.license||null,...license},
    author:extras.author||null,source:extras.source||null,title:extras.title||null,generator:json.asset?.generator||null,
    geometry:geometryStats(json),extensions,needsDecoder:extensions.filter(e=>NEEDS_DECODER.includes(e)),
    separablePartsByNodeName:partHints(json),
    note:'Heuristic triage. No flag is not clearance: read the model description and the license page yourself.'
  };
}

function collect(args){
  const out=[];
  const visit=p=>{
    const abs=path.resolve(root,p);
    if(fs.statSync(abs).isDirectory()){
      for(const e of fs.readdirSync(abs).sort()){if(e!=='evidence')visit(path.join(abs,e));}
    }else if(/\.glb$/i.test(abs))out.push(abs);
  };
  for(const a of args.length?args:[path.relative(root,candidateDir)])visit(a);
  return out;
}

function print(r){
  const flag={ready:'READY FOR QUALIFICATION',incomplete:'INCOMPLETE',review:'NEEDS DECISION',blocked:'BLOCKED'}[r.verdict];
  const g=r.geometry;
  console.log(`\n${r.file}  (${(r.bytes/1048576).toFixed(1)} MiB, sha256 ${r.sha256.slice(0,12)}…)`);
  console.log(`  verdict : ${flag}`);
  console.log(`  license : ${r.license.declared||'none'} -> ${r.license.level}: ${r.license.why}`);
  console.log(`  credit  : ${r.author||'?'}  |  ${r.source||'no source'}`);
  console.log(`  geometry: ${g.meshes} meshes, ${g.materials} materials, ${g.images} images, ${g.triangles.toLocaleString('en-US')} triangles; ${r.extensions.join(', ')||'no extensions'}`);
  if(r.needsDecoder.length)console.log(`  decoder : ${r.needsDecoder.join(', ')} needs a decoder in the game loader`);
  const parts=Object.entries(r.separablePartsByNodeName).map(([k,v])=>`${k}[${v.length}]`).join(' ');
  console.log(`  parts   : ${parts||'no node/mesh names hint at separate propeller/gear/flap/canopy'} (name hints only)`);
  for(const b of r.blockers)console.log(`  BLOCKER : ${b}`);
  for(const t of r.todo)console.log(`  todo    : ${t}`);
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),json=args.includes('--json');
  const results=collect(args.filter(a=>a!=='--json')).map(f=>qualify(path.relative(root,f)));
  if(json)console.log(JSON.stringify(results,null,1));
  else{results.forEach(print);console.log(`\n${results.length} file(s): ${['ready','incomplete','review','blocked'].map(v=>results.filter(r=>r.verdict===v).length+' '+v).join(', ')}`);}
  process.exit(results.some(r=>r.verdict==='blocked')?1:0);
}
