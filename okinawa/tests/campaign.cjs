const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const html=name=>fs.readFileSync(path.join(root,name),'utf8');
const db=new Map(),storage={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v)};
function openChapter(){const ctx=vm.createContext({window:{},localStorage:storage,Number,JSON});
 vm.runInContext(html('campaign.js'),ctx);return ctx.window.SquadronCampaign;}
const pac=openChapter();pac.record('pacific',11);pac.record('pacific',3);
const eu=openChapter();eu.record('europe',13);
const re=openChapter();re.record('remagen',2);
assert.equal(openChapter().highest('pacific'),11,'carrier progress survives chapter reload');
assert.equal(openChapter().highest('europe'),13,'Europe chapter progression survives reload');
assert.equal(openChapter().highest('remagen'),2,'Remagen progression is separate');
assert.match(html('index.html'),/remagen-mission\.html\?campaign=1/,'Europe campaign resumes at Remagen after chapter I');
assert.match(html('thunderbolt-europe.html'),/window\.location\.assign\('remagen-mission\.html\?campaign=1&mission=2'\)/);
assert.match(html('thunderbolt-europe.html'),/if\(done && window\.SquadronCampaign\)SquadronCampaign\.record\('europe',mission\)/);
assert.match(html('remagen-mission.html'),/if\(done && window\.SquadronCampaign\)SquadronCampaign\.record\('remagen',mission\)/);
console.log('Two campaign states persist independently; Europe finale enters Remagen chapter');
