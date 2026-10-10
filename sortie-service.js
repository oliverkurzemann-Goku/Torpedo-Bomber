/* Accelerated, visible turnaround. The current mission/world are never reset. */
(function(root){
 'use strict';
 function create({document=root.document,onLaunch=()=>{},onRepair=()=>{}}={}){
  const panel=document.createElement('div');panel.id='servicePanel';
  panel.style.cssText='position:fixed;left:50%;bottom:max(235px,calc(env(safe-area-inset-bottom) + 225px));transform:translateX(-50%);width:min(300px,76vw);z-index:21;padding:12px 16px;background:rgba(20,28,23,.94);border:1px solid #899478;color:#eee5c8;text-align:center;font:12px system-ui;pointer-events:auto';
  const title=document.createElement('b'),label=document.createElement('div'),bar=document.createElement('progress'),button=document.createElement('button');
  title.textContent='GROUND SERVICE';label.id='serviceStage';label.style.margin='8px 0';
  bar.id='serviceProgress';bar.max=13;bar.value=0;bar.style.width='100%';
  button.id='serviceLaunch';button.type='button';button.style.cssText='display:block;width:100%;margin-top:10px;padding:10px;background:#d6d3aa;color:#17251b;border:0;font:inherit;font-weight:bold';
  for(const node of [title,label,bar,button])panel.appendChild(node);
  panel.hidden=true;document.body.appendChild(panel);
  let active=false,ready=false,time=0,p=null,cfg=null,startFuel=0,startHull=0,armed=false,repaired=false;
  button.onclick=()=>{if(!active||!ready)return;active=false;panel.hidden=true;onLaunch();};
  return {
   begin(plane,config){p=plane;cfg=config;active=true;ready=false;time=0;armed=repaired=false;startFuel=p.fuel;startHull=p.hull;p.throttle=0;panel.hidden=false;button.disabled=true;this.update(0);},
   update(dt){if(!active)return;if(p.alive===false){this.clear();return;}time=Math.min(13,time+Math.max(0,dt));
    p.fuel=startFuel+(100-startFuel)*Math.min(1,time/5);
    if(time>=9&&!armed){for(const key of ['ammo','bombs','rockets','torps'])if(cfg[key]!=null)p[key]=cfg[key];armed=true;}
    if(time>=9)p.hull=startHull+(cfg.maxHull-startHull)*Math.min(1,(time-9)/4);
    if(time>=13&&!repaired){repaired=true;root.SortieFeatures.Damage.reset(p,cfg.maxHull);p.gear=1;p.gearTgt=1;p.bingo=false;p.lowFuelT=0;onRepair();}
    ready=time>=13;bar.value=time;
    const text=ready?'FUEL, ARMAMENT AND REPAIRS COMPLETE':time<5?'REFUELLING · '+Math.ceil(5-time)+'s':time<9?'LOADING ARMAMENT · '+Math.ceil(9-time)+'s':'REPAIRING AIRFRAME · '+Math.ceil(13-time)+'s';
    if(label.textContent!==text)label.textContent=text;button.disabled=!ready;button.textContent=ready?'START AGAIN':'PREPARING AIRCRAFT';
   },
   clear(){active=ready=false;time=0;panel.hidden=true;},
   get active(){return active;},get ready(){return ready;},get elapsed(){return time;},panel
  };
 }
 root.SortieService={create};if(typeof module==='object'&&module.exports)module.exports=root.SortieService;
})(typeof window==='undefined'?globalThis:window);
