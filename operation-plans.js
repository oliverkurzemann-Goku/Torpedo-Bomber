/* Fictional gameplay plans. Times start airborne; optional patrols do not block recovery. */
(function(g){
g.FlightPlans={
 europe:[{}, {},
  {weather:['broken','haze'],deadline:540,notes:'Locate the convoy, destroy four vehicles. Fighters may arrive after the first pass.',events:[{kills:2,fighters:2,required:true,message:'CONVOY ESCORT SCRAMBLING — TWO BANDITS'}]},
  {weather:['lowcloud'],deadline:540,notes:'Silence both batteries under the low ceiling. Expect a fighter response.',events:[{kills:1,fighters:2,required:true,message:'FIRST BATTERY SILENCED — FIGHTERS LIFTING'}]},
  {weather:['rain','lowcloud'],deadline:600,notes:'Stop the locomotive before its departure window closes. A fog bank is moving up the valley.',events:[{at:180,weather:'fog',message:'VALLEY FOG THICKENING — USE YOUR TERRAIN CHART'}]},
  {weather:['broken'],notes:'Destroy the works and its flak battery. Cover your withdrawal against the interceptors.',events:[{clear:true,fighters:2,required:true,message:'WORKS HIT — INTERCEPTORS INBOUND, CLEAR YOUR EXIT'}]},
  {weather:['fog','haze'],deadline:600,notes:'Find the ferry on the river. Climb above the fog to navigate; descend for the attack.',events:[{at:150,weather:'lowcloud',message:'FOG LIFTING INTO LOW CLOUD'}]},
  {weather:['broken'],deadline:660,notes:'Two fighter sections. The second section joins when the first fight begins.',events:[{kills:1,fighters:2,required:true,message:'SECOND FIGHTER SECTION CROSSING THE RIDGE'}]},
  {weather:['lowcloud','rain'],deadline:720,notes:'Suppress both riverbank guns before the bridge attack. Save the single bomb for the span.',events:[{kills:2,fighters:1,required:true,message:'BRIDGE DEFENCES DOWN — ENEMY FIGHTER ON YOUR SIX'}]},
  {weather:['broken'],deadline:780,notes:'Two bomber boxes at different heights. Three in the lead box, two following.',events:[{kills:2,bombers:2,type:'b17',required:true,message:'SECOND FORTRESS BOX — CLIMB AND REPOSITION'}]},
  {weather:['haze','broken'],deadline:840,notes:'Four Liberators and their escorts, followed by two more bombers. Manage ammunition.',events:[{kills:3,bombers:2,type:'b24',required:true,message:'TRAILING LIBERATOR PAIR ENTERING THE SECTOR'}]},
  {weather:['rain'],deadline:720,notes:'Four road vehicles, a flak battery and fighter cover. Visibility improves after the rain front.',events:[{at:180,weather:'broken',message:'RAIN FRONT PASSING — VISIBILITY IMPROVING'}]},
  {weather:['broken','haze'],deadline:660,fuel:85,notes:'Two bomber elements. Use fast passes; fuel is limited and the return remains mandatory.',events:[{kills:3,bombers:2,type:'b17',required:true,message:'TRAILING BOMBERS IDENTIFIED — WATCH YOUR FUEL'}]},
  {weather:['storm'],deadline:900,notes:'Identify the crossing, silence both batteries, destroy the ferry and works. Enemy reserves will counterattack.',recon:{x:13000,z:15800,radius:1100,min:220,max:850,seconds:5},events:[{kills:2,fighters:2,required:true,message:'ENEMY RESERVE FLIGHT — TWO MORE BANDITS'},{at:210,weather:'rain',message:'THUNDERSTORM MOVING EAST — HEAVY RAIN REMAINS'}]}
 ],
 pacific:[{}, {},
  {weather:['broken','haze'],deadline:480,notes:'Confirm the contact in the blue search area, then intercept the moving merchant.',recon:{x:600,z:2450,radius:850,min:60,max:650,seconds:5}},
  {weather:['lowcloud','rain'],deadline:540,notes:'Merchant under armed escort. A second patrol will arrive if the attack drags on.',events:[{at:90,fighters:1,message:'NEW ZERO PATROL — KEEP YOUR ATTACK MOVING'}]},
  {weather:['broken'],deadline:660,notes:'Two hits on the capital ship. Escort flak and incoming fighter reserves make repeated approaches costly.',events:[{at:120,fighters:2,message:'FIGHTER RESERVES ARRIVING FROM THE EAST'}]},
  {weather:['haze'],deadline:720,notes:'Two separate merchant groups. Reposition for the second contact; do not spend every torpedo on the first.',events:[{at:160,weather:'lowcloud',message:'LOW CLOUD BANK MOVING OVER THE CONVOY'}]},
  {weather:['fog'],deadline:720,notes:'Night interception in sea fog. Use the chart to set up a beam attack; the deck remains your recovery point.',events:[{at:210,weather:'haze',message:'FOG BANK BREAKING — MOONLIGHT AHEAD'}]},
  {weather:['broken'],notes:'Defend the carrier against two raider waves. Destroy every aircraft before recovering.',events:[{kills:2,raiders:2,required:true,message:'SECOND RAID — TWO TORPEDO BOMBERS ON THE OPPOSITE BEARING'}]},
  {weather:['rain'],deadline:720,notes:'Dusk strike under a rain front. Conditions deteriorate on the return.',events:[{at:180,weather:'squall',message:'SQUALL LINE AT THE CARRIER — PREPARE FOR ROUGH RECOVERY'}]},
  {weather:['broken'],deadline:660,notes:'Dive through gaps in the cloud, attack both merchants. Fighter cover arrives after the first sinking.',events:[{kills:1,fighters:2,message:'ZEROS SCRAMBLING — REPOSITION ABOVE THE CONVOY'}]},
  {weather:['lowcloud'],deadline:720,notes:'Low ceiling forces a shallower approach. Descend below cloud before the final dive; the capital ship needs two hits.',events:[{at:160,weather:'rain',message:'RAIN OVER THE TARGET — HOLD YOUR BEARING'}]},
  {weather:['storm'],notes:'Three initial raiders, then three more after two kills. Protect the carrier through the entire attack.',events:[{kills:2,raiders:3,required:true,message:'SECOND RAID — THREE MORE AVENGERS'},{at:150,weather:'squall',message:'LIGHTNING MOVING OFF — SQUALLS REMAIN'}]},
  {weather:['haze','broken'],deadline:780,notes:'Identify the northern supply route, attack, then turn south for a second convoy.',recon:{x:3250,z:-3200,radius:900,min:80,max:700,seconds:5},events:[{at:240,weather:'rain',message:'COASTAL RAIN FRONT — SECOND CONTACT MAY BE OBSCURED'}]},
  {weather:['broken'],deadline:840,notes:'Combined strike: sink the supply ship, then destroy the two parked aircraft at the coastal dispersal. The flak position is optional.',events:[{kills:1,fighters:2,message:'AIRFIELD SCRAMBLE — ZEROS TAKING OFF'},{at:210,weather:'lowcloud',message:'CLOUD BASE FALLING OVER THE COAST'}]},
  {}
 ]};
})(window);
