// Rebuild the small, deterministic layout from the shipped OSM and elevation.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),data=path.join(root,'terrain-system/real/data');
global.THREE=require('three');
for(const name of ['HeightProvider','OSMManager','RhineVillage','LivingWorld','RhineScenery']){
 vm.runInThisContext(fs.readFileSync(path.join(root,'terrain-system',name+'.js'),'utf8'));
}
global.fetch=async url=>{
 const buffer=fs.readFileSync(path.join(root,url.split('?')[0]));
 return {ok:true,json:async()=>JSON.parse(buffer),arrayBuffer:async()=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength)};
};
(async()=>{
 const coords=fs.readdirSync(path.join(data,'osm')).filter(f=>/^\d+_\d+\.json$/.test(f)).map(f=>f.slice(0,-5).split('_').map(Number));
 const dem=new DEMHeightProvider(4000,'terrain-system/real/data/dem/');
 await Promise.all(coords.map(([x,z])=>dem.loadTile(x,z)));
 const terrain={getRenderedHeight:(x,z)=>dem.getHeight(x,z)};
 const osm=new OSMManager(new THREE.Scene(),4000,terrain,'terrain-system/real/data/osm/');
 await osm.prepareRegion(coords,'terrain-system/real/data/waterways.json');
 const airfields=[[6000,15800],[23600,25725]];
 const layout=RhineScenery.plan(osm,terrain,airfields);
 if(layout.sites.length<20)throw Error('Incomplete Rhine scenery layout.');
 fs.writeFileSync(path.join(data,'rhine-scenery.json'),JSON.stringify(layout)+'\n');
 console.log(layout.sites.map(s=>[s.name,s.plots.length,s.kind]));
 console.log(layout.sites.length+' districts, '+layout.sites.reduce((n,s)=>n+s.plots.length,0)+' properties');
})().catch(e=>{console.error(e);process.exitCode=1;});
