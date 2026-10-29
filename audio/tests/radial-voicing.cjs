/* Acoustic regression: real decoded recordings, native graph, broad spectral bands. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
const executable=[process.env.GAME_TEST_CHROME,'/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));
if(!executable){if(process.env.CI)throw Error('Chrome required');console.log('Radial tone: skipped locally (no Chrome).');process.exit(0);}
const reference=JSON.parse(fs.readFileSync(path.join(root,'app/release/radial-tone-validation.json')));
function spectrum(a,rate){
 const size=16384,power=new Float64Array(size/2+1);
 for(let start=0;start+size<=a.length;start+=size/2){
  const re=new Float64Array(size),im=new Float64Array(size);let mean=0;
  for(let i=0;i<size;i++)mean+=a[start+i]/size;
  for(let i=0,j=0;i<size;i++){re[j]=(a[start+i]-mean)*(.5-.5*Math.cos(2*Math.PI*i/size));let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;}
  for(let width=2;width<=size;width*=2){const half=width/2;for(let start=0;start<size;start+=width)for(let k=0;k<half;k++){const angle=-2*Math.PI*k/width,c=Math.cos(angle),s=Math.sin(angle),i=start+k,j=i+half,tr=c*re[j]-s*im[j],ti=s*re[j]+c*im[j];re[j]=re[i]-tr;im[j]=im[i]-ti;re[i]+=tr;im[i]+=ti;}}
  for(let i=0;i<power.length;i++)power[i]+=(re[i]**2+im[i]**2)*(i&&i<size/2?2:1);
 }
 let total=0,weighted=0,high=0,body=0,sum=0,peak=0;
 for(let i=0;i<power.length;i++){const hz=i*rate/size,p=power[i];total+=p;weighted+=p*hz;if(hz>=1000)high+=p;if(hz>=80&&hz<400)body+=p;}
 for(const x of a){assert(Number.isFinite(x));sum+=x*x;peak=Math.max(peak,Math.abs(x));}
 return {rms:Math.sqrt(sum/a.length),peak,centroid:weighted/total,above1000Fraction:high/total,lowBodyFraction:body/total};
}
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':'application/javascript');res.end(b);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/engine-preview.html');
  const audio={};
  for(const rate of [24000,48000]){
   const renders=await page.evaluate(async rate=>{
    const result={};for(const kind of ['p47','fw190','avenger','sbd','zero','corsair']){
     const ctx=new OfflineAudioContext(1,rate*10,rate),node=AircraftEngine.create(ctx,ctx.destination),start=performance.now();
     await node.ready(kind);const preparedMs=performance.now()-start;node.select(kind);await Promise.resolve();
     for(let i=0;i<600;i++)node.update(1/60,kind,1,true);
     result[kind]={preparedMs,samples:Array.from((await ctx.startRendering()).getChannelData(0).slice(rate*2,rate*10))};
    }return result;
   },rate);
   audio[rate]={};
   for(const [kind,{samples,preparedMs}] of Object.entries(renders)){
    const m=spectrum(samples,rate),before=reference.baseline215[kind];audio[rate][kind]={...m,preparedMs};
    assert(m.centroid<before.centroid*.75,kind+' deeper spectral centre');
    assert(m.above1000Fraction<before.above1000Fraction*.6,kind+' less high-frequency hum');
    assert(m.lowBodyFraction>(kind==='corsair'?.75:before.lowBodyFraction*1.5),kind+' recorded low exhaust body: '+m.lowBodyFraction);
    assert(m.rms>.15&&m.rms<.3&&m.peak<.95,kind+' volume and headroom');
   }
  }
  fs.mkdirSync(path.join(root,'test-visuals'),{recursive:true});fs.writeFileSync(path.join(root,'test-visuals/build216-tone.json'),JSON.stringify(audio,null,2));
  console.log('Radial tone: six real voices at 24/48 kHz; deeper body, reduced high band and safe headroom.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
