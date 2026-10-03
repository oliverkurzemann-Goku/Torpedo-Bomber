/* Gameplay endurance; fuel units are percentages of the internal tank. */
(function(g){
 const supports=ac=>['p47','bf109','fw190'].includes(ac);
 g.SortieFuel={
  supports,
  reset(p,fuel=100,combat=true){p.fuel=fuel;p.tankAttached=combat&&supports(p.ac);p.tankFuel=p.tankAttached?60:0;p.tankEmptyWarned=false;},
  rate(p){const t=Math.max(0,Math.min(1,p.throttle));return p.ac==='me163'?t*.46:p.ac==='me262'?.05+t*.025:p.ac==='ju87'?.045+t*.035:.06+t*.05;},
  total(p){return p.fuel+(p.tankAttached?p.tankFuel:0);},
  consume(p,dt,difficulty=1){
   let used=this.rate(p)*Math.max(0,dt)*difficulty;
   if(p.tankAttached){const ext=Math.min(p.tankFuel,used);p.tankFuel-=ext;used-=ext;}
   p.fuel=Math.max(0,p.fuel-used);
  },
  jettison(p){if(!p.tankAttached)return 0;const fuel=p.tankFuel;p.tankFuel=0;p.tankAttached=false;return fuel;}
 };
})(typeof globalThis!=='undefined'?globalThis:window);
