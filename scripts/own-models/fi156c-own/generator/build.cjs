'use strict';
const {build}=require('./aircraft.cjs');
const {reference}=require('./config.cjs');
build({
 id:'fi156c-own',title:'Fieseler Fi 156 C Storch',kind:'fi156',class:'tailwheel-light',aircraft:true,storch:true,
 texture:2048,seed:1561943,span:14.25,length:9.90,height:3.05,colors:['3a4636','4e5b3c','9fb3c8'],
 number:'G7',mark:.368,engine:[1.98,4.745,0,2.60,2],gear:[1.455,2.56,1.09,.25,.18,-4.28,.141],tailGearHeight:.42,
 rearGun:[0,2.58,-.69],doorPivot:[-.56,1.77,.10],glassFrame:.035,flapSpan:3.85,
 body:[[-4.95,.032,.045,.82],[-4.46,.104,.128,.85],[-3.70,.178,.168,.99],[-2.59,.278,.244,1.18],
  [-1.60,.368,.30,1.39],[-.93,.44,.37,1.57],[-.26,.48,.415,1.67],[.63,.51,.409,1.72],
  [1.24,.478,.385,1.76],[1.78,.411,.39,1.79],[2.46,.379,.398,1.83],[3.66,.395,.40,1.89],
  [4.22,.339,.35,1.94],[4.57,.225,.25,1.98],[4.65,.173,.20,1.98]],
 canopy:[[-1.58,1.78,.32,.19],[-.98,1.94,.45,.73],[-.53,2.02,.53,.82],[.27,2.08,.53,.83],
  [1.03,2.08,.49,.82],[1.46,2.00,.435,.38],[1.62,1.98,.395,.085]],
 wing:[[0,2.885,1.58,-.34,.31],[1.27,2.885,1.58,-.35,.31],[3.44,2.882,1.57,-.35,.30],
  [5.21,2.867,1.56,-.35,.267],[6.75,2.859,1.53,-.32,.235],[7.015,2.847,1.43,-.20,.18],
  [7.125,2.836,1.30,-.074,.117]],
 tail:[[.11,1.17,-3.27,-4.51,.16],[.74,1.20,-3.44,-4.51,.14],[1.54,1.23,-3.81,-4.53,.11],[1.83,1.23,-4.02,-4.41,.072]],
 fin:[[1.00,-3.41,-4.76,.18],[1.45,-3.70,-4.80,.17],[1.91,-4.02,-4.85,.14],[2.35,-4.29,-4.83,.098],[2.54,-4.46,-4.77,.075]],
 references:[
  reference('Fieseler Fi 156 Storch, Profile Publications 228','https://www.gruppofalchi.com/files/Profile-Publications-Aircraft-228---Fieseler-Fi-156-Storch.pdf','Published reference, copyright retained','Fi 156 C family outline, Argus inverted V-8, fixed slats, and 2.60 m propeller.'),
  reference('Fieseler Fi 156 Storch, Flugzeuginfo','https://www.flugzeuginfo.net/acdata_php/acdata_fi156_dt.php','Copyrighted page and photographs','Fi 156 C-2 overall dimensions of 14.25 × 9.90 × 3.05 m.'),
 ],
});
