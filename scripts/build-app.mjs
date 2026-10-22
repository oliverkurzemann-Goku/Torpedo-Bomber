/* Explicit offline app payload. No repository, tests, tools or archived games.
 * Existing original assets are copied byte-for-byte; no GLB re-export. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputName=process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'dist-app';
if(!/^dist-app(?:-test-\d+)?$/.test(outputName))throw Error('Unsafe output name');
const output=path.join(root,outputName);
const entries=['index.html','torpedo-carrier.html','remagen-mission.html'];
const directories=['assets','audio','vendor','okinawa','terrain-system'];
const extensions=new Set(['.js','.css','.glb','.fbx','.bin','.json','.png','.jpg','.jpeg','.webp','.svg','.txt']);
const excluded=new Set(['tests','node_modules','__pycache__','real-tools','tools']);
const rootModels=['b17.glb','b24.glb','bf109new.glb','p47new.glb','fw190.glb','me262.glb','me163.glb','ju87.glb',
 'grumman tbm avenger.glb','sbd dauntless.glb','zero.glb','f4u-1c_corsair_war_thunder.glb','uss_midway.glb','ijn carrier.glb',
 'tiger.glb','m16_mgmc.glb','flak88_sfl.glb','jagdpanther.glb','sherman_m4a1.glb','treepack.glb'];
const files=[];
async function collect(relative){
 const absolute=path.join(root,relative),stat=await fs.stat(absolute);
 if(stat.isDirectory()){
  for(const name of (await fs.readdir(absolute)).sort())if(!excluded.has(name))await collect(path.posix.join(relative,name));
 }else if(extensions.has(path.extname(relative).toLowerCase()))files.push(relative);
}
for(const file of (await fs.readdir(root)).sort())if(/\.(js|css)$/.test(file))files.push(file);
files.push(...rootModels);
for(const directory of directories)await collect(directory);
files.push(...entries,'ASSET-CREDITS.md');
// Remove only a validated, disposable build output, never a checkout root.
if(path.dirname(output)!==root||path.basename(output)!==outputName)throw Error('Unsafe output directory');
await fs.rm(output,{recursive:true,force:true});await fs.mkdir(output,{recursive:true});
const manifest=[];
for(const relative of [...new Set(files)].sort()){
 let content=await fs.readFile(path.join(root,relative));
 if(entries.includes(relative)){
  const html=content.toString();
  if(/<script[^>]+src=["']https?:/i.test(html))throw Error('Remote script in '+relative);
  content=Buffer.from(html.replace(/<nav class="workshop"[\s\S]*?<\/nav>/,'').replace('</head>','<script src="app-native.js"></script>\n</head>'));
 }
 const destination=path.join(output,relative);await fs.mkdir(path.dirname(destination),{recursive:true});
 await fs.writeFile(destination,content);
 manifest.push({path:relative,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});
}
await build({entryPoints:[path.join(root,'app/native-bridge.mjs')],bundle:true,format:'iife',target:'safari15',outfile:path.join(output,'app-native.js')});
const bridge=await fs.readFile(path.join(output,'app-native.js'));
manifest.push({path:'app-native.js',bytes:bridge.length,sha256:createHash('sha256').update(bridge).digest('hex')});
const bytes=manifest.reduce((n,f)=>n+f.bytes,0);
await fs.writeFile(path.join(output,'app-payload.json'),JSON.stringify({schema:1,build:198,bytes,files:manifest},null,2));
console.log('Offline app:',manifest.length,'files,',(bytes/1024/1024).toFixed(1),'MiB; original assets preserved.');
