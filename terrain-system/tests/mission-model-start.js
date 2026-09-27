'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../..','remagen-mission.html'),'utf8');
const start=html.indexOf('function initialMissionModelKinds(');
const end=html.indexOf('function loadModels(){',start);
assert(start>0&&end>start,'bounded aircraft preparation is present');

(async()=>{
 const requested=[];
 const ctx=vm.createContext({
  modelTpl:{me163:{}},setTimeout,clearTimeout,
  console:{warn(){}},ensureModel(kind){
   requested.push(kind);
   if(kind==='me163')return Promise.resolve({});
   return new Promise(()=>{}); // the B-17 decoder never calls back on this device
  }
 });
 vm.runInContext(html.slice(start,end),ctx);
 const mission={id:'komet',ac:'me163',bombers:{n:2,type:'b17'}};
 const begun=Date.now(),pending=await ctx.waitForMissionModels(mission,8);
 assert(Date.now()-begun<500,'Komet start cannot hang behind an unresponsive B-17 loader');
 assert.deepEqual(Array.from(pending),['b17']);
 assert.deepEqual(requested,['me163','b17']);
 assert(html.includes('show(\'loading\',false);startMission(idx);'),
  'sortie starts after the bounded wait even if a bomber is pending');
 console.log('Komet mission starts when B-17 loading stalls; late aircraft can be swapped in');
})().catch(err=>{console.error(err);process.exitCode=1;});
