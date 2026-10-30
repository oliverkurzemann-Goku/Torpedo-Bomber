/* FlightCore: computed point-mass flight model for every aircraft of both games. SI units, true airspeed.
 *
 * Nothing in the force model is tuned by hand. Each aircraft is described only by published figures
 * (mass, wing, engine power or thrust, propeller diameter, measured speeds, climbs and stalls); the
 * aerodynamic and engine coefficients are SOLVED from those figures when a type is first used:
 *
 *   drag      D = q S (CD0 + k CL^2 + dCD_config + dCD_stall + dCD_mach) + q * store drag areas
 *   thrust    piston/turbo: actuator-disk momentum theory  T (V + w) = eta_p P,  T = 2 rho A_disc (V + w) w
 *             piston power is constant to the full-throttle height h_c, then falls with Gagg & Ferrar's
 *             law P/P_c = (sigma/sigma_c - 0.117)/0.883;  turbo (P-47, B-17, B-24): linear lapse
 *             jet: T = T0 sigma^n;  rocket: T = T0 (fuel mass burns off)
 *   solve     per engine kind, least squares (Levenberg-Marquardt) over every published level speed,
 *             best climb rate and time to height: CD0 and eta_p, plus the one engine-altitude unknown
 *             (turbo lapse, full-throttle height, jet lapse exponent, rocket drag-rise Mach) when the
 *             data hold it; Oswald e from Raymer's straight-wing formula (six P-47 figures cannot
 *             separate it: left free it runs to its 0.4 bound)
 *   lift      CLmax clean / landing from published stall speeds; n_max = min(structure, CLmax q S / W)
 *   stall     asking the wing for more than CLmax stalls it: lift falls, drag rises, the wing drops at
 *             the type's published character (mild by game choice), recovery as soon as the pull eases
 *   roll      published roll-rate curve: helix-limited (p proportional to V) up to the speed of peak
 *             roll, stick-force-limited above it
 *   mach      Lock's drag rise above Mcrit; past the published control-limit Mach the elevator loses
 *             authority (tuck); above the published dive limit (IAS) pitch authority fades as well
 *   mass      empty + internal fuel + stores, each from published weights; stores add drag area
 *   path      d(gamma)/dt = g/V (n cos(phi) - cos(gamma)),  d(psi)/dt = g/V n sin(phi) / cos(gamma),
 *             integrated in vector form so loops pass the vertical; fixed sub-step, frame-rate free
 *
 * Values that have NO source are listed in ASSUMED (C) with their reason; the game's own choices
 * (how the stick maps to a load factor, one manoeuvre gain, one roll gain) are listed in GAME.
 * Derivation and the model-versus-source tables: FLIGHT-CORE.md, reproducible with
 *   node scripts/flight/derive-fleet.cjs
 */
(function(root){
'use strict';
const G=9.80665,HP=745.69987,PS=735.49875,KGF=9.80665,LB=.45359237,FT=.3048,MPH=.44704,KMH=1/3.6,KT=.514444,
 FPM=FT/60,GAL=3.785411784,R=287.053,KAPPA=1.4,RHO0=1.225,AVGAS=.72,J2=.83;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const DEG=Math.PI/180;

/* ---- published figures ----
 * Tags: A = primary document; B = published secondary figure (reference books, museum and simulator
 * specification sheets compiled from wartime tests), found and read through web search on 29-30 Oct
 * 2026 - most source pages themselves are not reachable from the build environment; C = no figure found,
 * see ASSUMED. Every row names its reference. Speeds are true airspeed unless marked IAS. */
const row=(q,h,v,ref,text,mode='max',h1)=>({q,h,v,ref,text,mode,h1});
const SOURCES={
 p47:{name:'P-47D-28 Thunderbolt (R-2800-59, 2600 bhp WEP)',
  refs:{A1:'USAAF performance comparison, 6 Oct 1944 (assets/aircraft/P47-PERFORMANCE.md)',
   A2:'USAAF Flight Test Engineering Branch Eng-47-1774-A, 15 Jul 1944',B1:'Curtiss Electric 836 propeller, 13 ft 1-2 in',
   B2:'Roll rate compilation, FLIGHT-ENVELOPE.md'},
  mass:12731*LB,massRef:'A1',S:300*FT*FT,b:12.42,geomRef:'A1',propD:3.99,propRef:'B1',
  engine:{kind:'turbo',power:2600*HP,count:1,ref:'A1',text:'2600 bhp WEP'},
  perf:[row('speed',0,345*MPH,'A1','345 mph @ SL'),row('speed',10000*FT,383*MPH,'A1','383 mph @ 10 000 ft'),
   row('speed',20000*FT,417*MPH,'A1','417 mph @ 20 000 ft'),row('climb',0,3180*FPM,'A1','3180 ft/min @ SL'),
   row('climb',10000*FT,2920*FPM,'A1','2920 ft/min @ 10 000 ft'),row('climb',20000*FT,2470*FPM,'A1','2470 ft/min @ 20 000 ft')],
  stall:{mass:13230*LB,clean:116*MPH,landing:98*MPH,ref:'A2',text:'116 / 98 mph IAS power off at 13 230 lb'},
  roll:{peak:95,at:130,fall:.8,ref:'B2'}},
 bf109:{name:'Bf 109F-2 (DB 601N)',
  refs:{A1:'User-supplied Bf 109 reference PDF (German Wikipedia, 51 p.), data table',
   B1:'IL-2 Great Battles aircraft specification, Bf 109 F-2 (il2sturmovik.com museum; aergistal/il2 spec sheets)',
   B2:'Roll rate compilation, FLIGHT-ENVELOPE.md'},
  mass:2789,massRef:'B1',S:16.1,b:9.92,geomRef:'A1',propD:3.0,propRef:'B1',
  engine:{kind:'piston',power:1175*PS,count:1,ref:'B1',text:'DB 601N, 1 175 PS take-off/emergency (product with eta_p solved)'},
  perf:[row('speed',0,528*KMH,'B1','528 km/h @ SL (emergency)'),row('speed',2000,563*KMH,'B1','563 km/h @ 2 000 m'),
   row('speed',5000,606*KMH,'B1','606 km/h @ 5 000 m'),row('climb',0,16.4,'B1','16.4 m/s @ SL'),row('climb',6000,10,'B1','10 m/s @ 6 000 m')],
  // IL-2 lists 151-168 km/h IAS clean, 144-159 landing, for 2 445 - 3 092 kg; read at 2 789 kg by sqrt(W).
  stall:{mass:2789,clean:151*KMH*Math.sqrt(2789/2445),landing:144*KMH*Math.sqrt(2789/2445),ref:'B1',text:'151-168 / 144-159 km/h IAS over 2 445-3 092 kg'},
  fuel:{kg:400*AVGAS,ref:'A1',text:'400 l internal'},
  limits:{vne:850*KMH,ref:'B1',text:'dive limit 850 km/h IAS'},
  roll:{peak:100,at:95,fall:1.7,ref:'B2'}},
 fw190:{name:'Fw 190A-8 (BMW 801 D-2)',
  refs:{B1:'IL-2 Great Battles aircraft specification, Fw 190 A-8 (il2sturmovik.com museum)',
   B2:'Luftwaffe Resource Center / Eduard A-8 sheet (FLIGHT-ENVELOPE.md)',B3:'Roll rate compilation, FLIGHT-ENVELOPE.md; RAE 1231 discussion',
   B4:'Pilot reports of a sharp wing drop in accelerated stalls (e.g. RAE / Eric Brown)'},
  mass:4391,massRef:'B1',S:18.3,b:10.5,geomRef:'B2',propD:3.3,propRef:'B2',
  engine:{kind:'piston',power:1700*PS,count:1,ref:'B2',text:'BMW 801 D-2, 1 700 PS take-off/emergency'},
  perf:[row('speed',0,558*KMH,'B1','558 km/h @ SL (emergency)'),row('speed',6200,641*KMH,'B1','641 km/h @ 6 200 m (emergency)'),
   row('speed',0,532*KMH,'B1','532 km/h @ SL (combat)','combat'),row('speed',5800,612*KMH,'B1','612 km/h @ 5 800 m (combat)','combat'),
   row('climb',0,13.8,'B1','13.8 m/s @ SL (combat)','combat'),row('climb',3000,10.1,'B1','10.1 m/s @ 3 000 m (combat)','combat'),
   row('climb',6000,7.8,'B1','7.8 m/s @ 6 000 m (combat)','combat')],
  // IL-2: 177-208 km/h IAS clean, 164-188 landing between minimum and 5 239 kg; minimum weight from the same ratio.
  stall:{mass:4391,clean:177*KMH*Math.sqrt(4391/(5239*(177/208)**2)),landing:164*KMH*Math.sqrt(4391/(5239*(177/208)**2)),ref:'B1',
   text:'177-208 / 164-188 km/h IAS, read at 4 391 kg by sqrt(W)'},
  fuel:{kg:498,ref:'B1',text:'498 kg'},
  roll:{peak:150,at:115,fall:.55,ref:'B3'},stallChar:{severity:.9,ref:'B4'}},
 ju87:{name:'Ju 87B-2 Stuka (Jumo 211 Da)',
  refs:{B1:'Ju 87 B-2 Betriebsanleitung / data compilations (armedconflicts, aeropedia, airpages): 4 250 kg, 380 km/h @ 4 100 m, 4 000 m in 12 min, 1 200 PS',
   B2:'Dive brakes held the dive to about 500 km/h (weltkrieg2.de / flugzeug-lexikon)',A1:'Shape reference ju-87b2.pdf, p. 14 (scripts/own-aircraft/ju87b2)'},
  mass:4250,massRef:'B1',S:31.9,b:13.8,geomRef:'B1',propD:3.4,propRef:'A1',
  engine:{kind:'piston',power:1200*PS,count:1,fth:4100,ref:'B1',text:'Jumo 211 Da 1 200 PS; full-throttle height = altitude of the published top speed'},
  perf:[row('speed',4100,380*KMH,'B1','380 km/h @ 4 100 m'),row('time',0,12*60,'B1','4 000 m in 12 min','max',4000)],
  stores:{refBombs:4},fuel:{kg:480*AVGAS,ref:'C',text:'480 l (C)'},
  diveBrake:{speed:500*KMH,angle:80*DEG,ref:'B2',text:'about 500 km/h with brakes; 80 deg dive (C)'},
  limits:{vne:540*KMH,ref:'B1',text:'540 km/h (Betriebsanleitung, read as dive limit)'},
  roll:{peak:55,at:70,fall:1,ref:'C'}},
 me262:{name:'Me 262A-1a (2 x Jumo 004B)',
  refs:{B1:'Fliegerweb / flugrevue / flugzeuginfo.net: 6 400 kg normal take-off, 870 km/h @ 6 000 m, initial climb 20 m/s',
   B2:'Jumo 004B: 8.8 kN static thrust each (NASM, Wikipedia via search)',B3:'Approach 240 km/h, touch-down 160 km/h (flugzeug-lexikon); Wendel 230-250 km/h approach',
   B4:'Pilot reports: nose-down tuck from about Mach 0.82-0.86',
   B5:'Take-off distance about 1 005 m at 7 130 kg (ultimatespecs / aerocorner)',
   B6:'Rheinmetall-Borsig RI 502 take-off rocket: about 6 s at 600 kgf nominal (NASM A19602002000); field kit for two 109-502 on the Me 262 (Warbirds Resource Group, Me 262 Ruestsaetze)'},
  // RB6: two RI 502 for heavy take-offs; when to fire them is the game's decision (C, see GAME_RATO in remagen-mission.html)
  rato:{thrust:2*600*KGF,burn:6,ref:'B6'},
  check:{takeoff:{mass:7130,distance:1005,ref:'B5',text:'about 1 005 m at 7 130 kg (whether ground roll or to 15 m is not stated)'}},
  mass:6400,massRef:'B1',S:21.7,b:12.65,geomRef:'B1',propD:0,
  engine:{kind:'jet',thrust:8800,count:2,ref:'B2',text:'2 x 8.8 kN static'},
  perf:[row('speed',6000,870*KMH,'B1','870 km/h @ 6 000 m'),row('climb',0,20,'B1','20 m/s @ SL')],
  stores:{},fuel:{kg:1970*J2,ref:'C',text:'1 970 l J2 (C)'},
  limits:{mlimit:.82,ref:'B4',text:'tuck from Mach 0.82'},
  roll:{peak:80,at:120,fall:1.6,ref:'C'}},
 me163:{name:'Me 163B-1a Komet (Walter HWK 109-509A)',
  refs:{B1:'migflug / aerocorner / ww2db: 4 310 kg take-off, 1 700 kp thrust, 468 kg C-Stoff + 1 550 kg T-Stoff, 9.33 m span',
   B2:'Climb from a standing start: 2 000 m in 1.48 min, 10 000 m in 3.19 min',B3:'About 960 km/h in level flight; severe compressibility above Mach 0.82',
   B4:'Never-exceed 900 km/h IAS',B5:'Wing area 19.6 m2 (FLIGHT-ENVELOPE.md)'},
  mass:4310,massRef:'B1',S:19.6,b:9.33,geomRef:'B5',propD:0,
  engine:{kind:'rocket',thrust:1700*KGF,count:1,ref:'B1',text:'1 700 kp'},
  // the 2-to-10 km segment avoids the take-off run hidden in "from a standing start"
  perf:[{...row('time',2000,(3.19-1.48)*60,'B2','2 000 -> 10 000 m in 1.71 min','max',10000),burnBefore:1.48*60},
   row('speed',4000,960*KMH,'B3','960 km/h level (altitude C: 4 000 m)')],
  fuel:{kg:468+1550,ref:'B1',text:'2 018 kg propellant'},
  limits:{mlimit:.82,vne:900*KMH,ref:'B3',text:'Mach 0.82 / 900 km/h IAS'},
  roll:{peak:100,at:120,fall:1.2,ref:'C'}},
 avenger:{name:'TBF-1 Avenger (R-2600-8)',
  refs:{B1:"Fiddler's Green / Zeno's Warbird Videos: 15 905 lb gross, 271 mph @ 12 000 ft, 1 430 ft/min, R-2600-8 1 700 hp",
   A1:'Grumman specification 490 ft2, 54 ft 2 in (FLIGHT-ENVELOPE.md)',B2:'Mk 13 aerial torpedo 2 216 lb'},
  mass:15905*LB,massRef:'B1',S:490*FT*FT,b:16.51,geomRef:'A1',propD:4.01,propRef:'A1',
  engine:{kind:'piston',power:1700*HP,count:1,fth:12000*FT,ref:'B1',text:'R-2600-8 1 700 hp; full-throttle height = altitude of the published top speed'},
  perf:[row('speed',12000*FT,271*MPH,'B1','271 mph @ 12 000 ft'),row('climb',0,1430*FPM,'B1','1 430 ft/min @ SL')],
  stores:{refTorps:1},fuel:{kg:335*GAL*AVGAS,ref:'C',text:'335 gal (C)'},
  roll:{peak:50,at:85,fall:1,ref:'C'}},
 sbd:{name:'SBD-3 Dauntless (R-1820-52)',
  refs:{B1:'US Navy NNAM: 10 400 lb gross; National WWII Museum / migflug / classicwarbirds: 250 mph, R-1820-52 1 000 hp',
   B3:'armedconflicts.com SBD-3 data: climb 1 190 ft/min. NNAM 1 500 and migflug 1 700 ft/min need eta_p > 0.93 with 250 mph and 1 000 hp: not used',
   B2:'migflug: stall 78 mph (68 kt) gear and flaps down',A1:'NNAM: 325 ft2 wing, 41 ft 6 in span (FLIGHT-ENVELOPE.md)'},
  mass:10400*LB,massRef:'B1',S:325*FT*FT,b:12.66,geomRef:'A1',propD:3.3,propRef:'C',
  engine:{kind:'piston',power:1000*HP,count:1,fth:16000*FT,ref:'B1',text:'R-1820-52 1 000 hp; full-throttle height = altitude of the published top speed'},
  perf:[row('speed',16000*FT,250*MPH,'B1','250 mph @ 16 000 ft'),row('climb',0,1190*FPM,'B3','1 190 ft/min @ SL')],
  stall:{mass:10400*LB,landing:78*MPH,ref:'B2',text:'78 mph IAS gear and flaps down'},
  stores:{refBombs:1},fuel:{kg:260*GAL*AVGAS,ref:'C',text:'260 gal (C)'},
  diveBrake:{speed:276*MPH,angle:70*DEG,ref:'C',text:'about 276 mph in a 70 deg dive (C)'},
  roll:{peak:70,at:85,fall:1,ref:'C'}},
 corsair:{name:'F4U-1D Corsair (R-2800-8W)',
  refs:{B1:'Military Machine / Wings of Glory: 425 mph @ 20 000 ft, 3 120 ft/min, 2 000 hp + 250 hp water injection',
   A1:'AN 01-45HA-1 (user manual, general data): 314 ft2, 41 ft span, 13 ft 4 in propeller',
   B2:'Vought-Sikorsky F4U-1 performance trials: power-off stall 86 mph at full load (read as landing configuration)',
   B3:'Compiled specification: 12 039 lb normal take-off (FLIGHT-ENVELOPE.md)',B4:'Roll rate compilation (America\'s Hundred Thousand via forum)',
   B5:'Pilot reports: left wing dropped without warning at the stall'},
  mass:12039*LB,massRef:'B3',S:314*FT*FT,b:12.50,geomRef:'A1',propD:4.06,propRef:'A1',
  engine:{kind:'piston',power:2250*HP,count:1,fth:20000*FT,ref:'B1',text:'2 250 hp WEP; full-throttle height = altitude of the published top speed'},
  perf:[row('speed',20000*FT,425*MPH,'B1','425 mph @ 20 000 ft'),row('climb',0,3120*FPM,'B1','3 120 ft/min @ SL')],
  stall:{mass:12039*LB,landing:86*MPH,ref:'B2',text:'86 mph IAS power off, full load'},
  fuel:{kg:237*GAL*AVGAS,ref:'C',text:'237 gal (C)'},
  roll:{peak:100,at:130,fall:.8,ref:'B4'},stallChar:{severity:.7,ref:'B5'}},
 zero:{name:'A6M2 Model 21 Zero (Sakae 12)',
  refs:{B1:'Japanese data via j-aircraft / Francillon / Dunn: 2 410 kg, 533 km/h @ 4 550 m, 945 m/min, Sakae 12 940 hp',
   A1:'22.44 m2, 12.0 m span (FLIGHT-ENVELOPE.md)',B2:'Roll rate: Navy Akutan tests, light controls to 200 mph, stiff above (FLIGHT-ENVELOPE.md)'},
  mass:2410,massRef:'B1',S:22.44,b:12.0,geomRef:'A1',propD:2.9,propRef:'B1',
  engine:{kind:'piston',power:940*HP,count:1,fth:4550,ref:'B1',text:'Sakae 12 940 hp; full-throttle height = altitude of the published top speed'},
  perf:[row('speed',4550,533*KMH,'B1','533 km/h @ 4 550 m'),row('climb',0,945/60,'B1','945 m/min @ SL')],
  fuel:{kg:518*AVGAS,ref:'C',text:'518 l (C)'},
  roll:{peak:115,at:85,fall:1.5,ref:'B2'}},
 b17:{name:'B-17G Flying Fortress (4 x R-1820-97 turbo)',
  refs:{B1:'Sally B technical data: 287 mph @ 25 000 ft, 20 000 ft in 37 min',B2:'reddog1944: 1 420 ft2; 103 ft 9 in span',B3:'4 x 1 200 hp R-1820-97 with turbochargers'},
  mass:55000*LB,massRef:'C',S:1420*FT*FT,b:31.62,geomRef:'B2',propD:3.53,propRef:'C',
  engine:{kind:'turbo',power:1200*HP,count:4,lapse:0,ref:'B3',text:'4 x 1 200 hp, turbocharged to 25 000 ft'},
  perf:[row('speed',25000*FT,287*MPH,'B1','287 mph @ 25 000 ft'),row('time',0,37*60,'B1','20 000 ft in 37 min','max',20000*FT)],
  roll:{peak:30,at:75,fall:1,ref:'C'}},
 b24:{name:'B-24J Liberator (4 x R-1830-65 turbo)',
  refs:{B1:'kasselmission.org: 300 mph @ 30 000 ft, 277 mph @ 20 000 ft, 20 000 ft in 25 min at 56 000 lb, 1 048 ft2',B2:'4 x 1 200 hp R-1830-65 with turbochargers'},
  mass:56000*LB,massRef:'B1',S:1048*FT*FT,b:33.53,geomRef:'B1',propD:3.53,propRef:'C',
  engine:{kind:'turbo',power:1200*HP,count:4,ref:'B2',text:'4 x 1 200 hp, turbocharged'},
  perf:[row('speed',20000*FT,277*MPH,'B1','277 mph @ 20 000 ft'),row('speed',30000*FT,300*MPH,'B1','300 mph @ 30 000 ft'),
   row('time',0,25*60,'B1','20 000 ft in 25 min','max',20000*FT)],
  roll:{peak:30,at:75,fall:1,ref:'C'}}
};

/* ---- values without a source: used, but named. C = assumed class value. ---- */
// Class defaults; each type below repeats the ones it uses so the table in FLIGHT-CORE.md is complete.
const CLASS=Object.freeze({
 nNegative:3.0,     // C negative structural limit, fighter category
 clMinRatio:.6,     // C inverted CLmax as a share of upright CLmax (cambered section)
 gearCD:.020,       // C gear-down zero-lift drag increment (wing-area basis)
 flapCD:.050,       // C full-flap zero-lift drag increment
 windmill:.07,      // C closed-throttle windmilling propeller drag, disc-area basis (FLIGHT-ENVELOPE.md)
 spool:1.25,        // C piston power build-up time constant (s), kept from flight-dynamics.js
 clClean:1.4,       // C clean CLmax where no stall figure exists (FLIGHT-ENVELOPE.md class value)
 clLandingRatio:1.35,// C landing / clean CLmax where only one of them is published (split / slotted flaps)
 severity:.25,      // C stall character: 0 benign ... 1 sharp wing drop
 tankArea:.05,bombArea:.02,heavyBombArea:.03,rocketArea:.005, // C store drag areas CD*S (m2)
 tankShell:30,      // C empty drop tank (kg)
 mcrit:.72          // C drag-rise onset Mach where nothing is published
});
const A_=(o)=>Object.freeze({...CLASS,...o});
const ASSUMED={
 p47:A_({nLimit:7.0,mcrit:.72,mlimit:.75,vne:500*MPH,tankArea:.05,severity:.3,
  stores:{bomb:227,bombArea:.02,rocket:64,rocketArea:.005,tankFuel:108*GAL*AVGAS,tankShell:45,fuel:370*GAL*AVGAS}}),
 bf109:A_({nLimit:6.5,mlimit:.78,severity:.25,stores:{bomb:250,bombArea:.02,tankFuel:300*AVGAS,tankShell:30}}),
 fw190:A_({nLimit:6.5,mlimit:.78,vne:850*KMH,stores:{bomb:250,bombArea:.02,tankFuel:300*AVGAS,tankShell:30}}),
 ju87:A_({nLimit:6.0,mlimit:.70,gearCD:0,severity:.2,stores:{bomb:125,bombArea:.012}}),  // fixed gear: in the measured drag
 me262:A_({nLimit:5.5,mcrit:.74,vne:950*KMH,spool:2.6,windmill:0,severity:.35,stores:{bomb:250,bombArea:.02}}),
 me163:A_({nLimit:6.0,clClean:1.1,clLandingRatio:1.15,spool:.3,windmill:0,gearCD:0,severity:.05,isp:2000}),
 avenger:A_({nLimit:4.5,mcrit:.66,mlimit:.70,vne:320*KT,severity:.25,stores:{torpedo:2216*LB,bomb:227,bombArea:0}}), // internal bay
 sbd:A_({nLimit:5.5,mcrit:.66,mlimit:.70,vne:350*MPH,severity:.2,stores:{bomb:454,bombArea:.03}}),
 corsair:A_({nLimit:7.0,mcrit:.70,mlimit:.73,vne:450*KT,stores:{bomb:454,bombArea:.03,rocket:64,rocketArea:.005}}),
 zero:A_({nLimit:6.0,mcrit:.68,mlimit:.72,vne:340*KT,severity:.15,stores:{bomb:60,bombArea:.008,tankFuel:330*AVGAS,tankShell:25}}),
 b17:A_({nLimit:3.0,nNegative:1.0,mcrit:.62,mlimit:.68,severity:.1}),
 b24:A_({nLimit:3.0,nNegative:1.0,mcrit:.62,mlimit:.68,severity:.1})
};

/* ---- the game's own choices: not aircraft data ---- */
const GAME={
 // One manoeuvre time-scale gain on the flight-path rotation (turns, pull-ups) for two-thumb touch
 // control; forces, drag and energy are NOT scaled. 1 = unassisted physics. Same for the AI.
 manoeuvreGain:2.2,
 // One fleet roll gain: chosen so the P-47 keeps the peak roll rate it was confirmed with (Build 219,
 // 145 deg/s), then every other type rolls in its published proportion. A touch ceiling caps the fastest.
 rollGain:145.4/95,rollCeiling:220*DEG,
 // Wing drop at the stall, deg/s at stall character 1 (a sharp stall); mild by design for touch control.
 stallRoll:65*DEG,
 substepHz:120,
 // Arcade ("Normal") stick law only (Build 227, game decisions C). REALISTIC flight and every AI pilot leave
 // these alone. Forces, lift limits and top speed stay the computed ones; what changes is how quickly the
 // path answers the stick and how much of the thrust surplus becomes speed or height.
 arcade:{
  // Turn reference: the Zero's full-stick level-turn rate at the same speed and height. The path-rotation gain
  // of a slower-turning type is raised by (reference / own rate)^turnPull, at most turnGainMax: the load, drag
  // and stall of the wing are unchanged, only the path swings faster for the same load.
  turnPull:.6,turnGainMax:2.2,refLoadFloor:1.6,ownLoadFloor:1.2,
  // Thrust surplus (thrust - drag > 0) is multiplied by 1 + power, but never raised by more than powerCap m/s^2:
  // faster acceleration and climb everywhere, top speed (surplus 0) unchanged.
  power:.6,powerCap:1.8,
  // Build 228: more of it at the slow end, where the climb-out and the stall recovery happen. At the stall speed the
  // gain is raised by powerSlow (cap by powerSlowCap m/s^2), fading out at slowTo x the stall speed - so the top
  // speed and the fast manoeuvres keep the Build 227 figures.
  powerSlow:.8,powerSlowCap:1.4,slowTo:1.7,
  // Aileron / elevator effectiveness never drops below this share near the stall (Realistic keeps the real fade).
  controlFloor:.8,
  // Speed protection of the nose-up command: the climb angle the stick may ask for is the one the thrust surplus
  // sustains plus the speed above climbFloor x stall speed converted to height over climbHorizon seconds
  // (never below climbMin rad, so a flare still works). Without it a held back stick climbs at the pitch limit,
  // bleeds off the speed, stalls, drops the nose and pulls up again every ~8 s.
  climbFloor:1.2,climbHorizon:5,climbMin:.2,
  // Stick forward in a bank: the load follows the stick like Realistic instead of snapping through zero.
  // Full unload (n = 0, ballistic) is reached at 1/unload of the stick; banks below pushBankLo / above pushBankHi
  // are free / fully protected.
  unload:1.6,pushBankLo:.17,pushBankHi:.6
 }
};

/* ---- atmosphere (ISA) ---- */
function atmosphere(h){
 h=clamp(h,-500,20000);let T,p;
 if(h<=11000){T=288.15-.0065*h;p=101325*Math.pow(T/288.15,5.255877);}
 else{T=216.65;p=22632.06*Math.exp(-G*(h-11000)/(R*T));}
 return {T,p,rho:p/(R*T),a:Math.sqrt(KAPPA*R*T)};
}
const sigmaAt=h=>atmosphere(h).rho/RHO0;

/* ---- propeller: ideal actuator disk with one profile efficiency ---- */
// Ideal power eta_p*P = T (V + w) with T = 2 rho A (V + w) w; solved for the induced velocity w
// (Newton from the static root, which lies to the right of every root with V > 0: monotone).
function propThrust(P,V,rho,A,etaP){
 const Pi=etaP*P;if(!(Pi>0)||!(A>0))return 0;
 V=Math.max(0,V);let w=Math.cbrt(Pi/(2*rho*A));
 for(let i=0;i<40;i++){
  const s=V+w,f=2*rho*A*s*s*w-Pi,df=2*rho*A*(s*s+2*s*w),nw=Math.max(0,w-f/df);
  if(Math.abs(nw-w)<1e-7*(1+w)){w=nw;break;}w=nw;
 }
 return Pi/(V+w);
}

/* ---- Lift-curve slope: Helmbold's lifting-surface formula for an unswept wing ---- */
function liftSlope(A){return 2*Math.PI*A/(2+Math.sqrt(A*A+4));}

/* ---- engine ---- */
// Shaft power factor with height. Turbo: solved linear lapse. Piston: constant to the full-throttle height,
// then Gagg & Ferrar's law relative to it.
function shaftFactor(m,h){
 if(m.engine.kind==='turbo')return clamp(1-m.lapse*Math.max(0,h),.3,1);
 const hc=m.fth;if(h<=hc)return 1;
 return Math.max(.05,(sigmaAt(h)/sigmaAt(hc)-.117)/.883);
}
function shaft(m,h,mode){return m.P*shaftFactor(m,h)*(mode==='combat'?m.combatRatio:1);}
function thrust(m,V,rho,power,h=0,mode){
 const k=m.engine.kind,p=clamp(power,0,1);
 if(k==='jet')return m.T0*Math.pow(rho/RHO0,m.nT)*p;
 if(k==='rocket')return m.T0*p;
 return propThrust(shaft(m,h,mode)*p,V,rho,m.disc,m.etaP);
}
// Propellant mass flow (kg/s) at a power setting: rockets only (the game meters other fuel itself).
function fuelFlow(m,power){return m.engine.kind==='rocket'?m.T0*clamp(power,0,1)/m.assumed.isp:0;}

/* ---- drag ---- */
// cfg: gear, flaps (0..1), brakes (dive brakes 0..1), storeArea (m2), stall (0..1)
function drag(m,V,rho,a,n,W,cfg={}){
 const q=.5*rho*V*V,S=m.S,CL=n*W/(q*S),M=V/a,A=m.assumed;
 const config=(cfg.gear||0)*A.gearCD+(cfg.flaps||0)*A.flapCD+(cfg.tank?A.tankArea/S:0)+(cfg.brakes||0)*(m.brakeCD||0)
  +(cfg.stall||0)*.12;
 const mach=M>m.mcrit?20*Math.pow(M-m.mcrit,4):0;   // Lock's fourth-power drag-rise law
 return q*S*(m.CD0+m.k*CL*CL+config+mach)+q*(cfg.storeArea||0);
}
function windmillDrag(m,V,rho,power){
 if(!m.disc||!m.assumed.windmill)return 0;
 const t=clamp(power/.30,0,1),closed=1-t*t*(3-2*t);
 return .5*rho*V*V*m.disc*m.assumed.windmill*closed;
}
// Available load factor at V: lift-limited below the corner speed, structure above.
function loadLimits(m,V,rho,W,cfg={}){
 const q=.5*rho*V*V,f=clamp(cfg.flaps||0,0,1),pen=cfg.clFactor??1;
 const clmax=(m.CLmax+(m.CLmaxLanding-m.CLmax)*f)*pen;
 return {max:Math.min(m.assumed.nLimit*(cfg.gFactor??1),clmax*q*m.S/W),
  min:-Math.min(m.assumed.nNegative,m.assumed.clMinRatio*clmax*q*m.S/W),clmax};
}

/* ---- roll: published curve, helix-limited below the speed of peak roll, stick-force-limited above ---- */
// Real roll rate (rad/s) at equivalent airspeed V (m/s).
function rollRateReal(m,V){
 const r=m.roll,f=V<r.at?V/r.at:Math.pow(r.at/V,r.fall);
 return Math.max(.15,f)*r.peak*DEG;
}
function rollRate(m,V){return Math.min(GAME.rollCeiling,GAME.rollGain*rollRateReal(m,V));}
function rollPeak(m){return rollRate(m,m.roll.at);}

/* ---- steady performance (used by the solver and the report) ---- */
// Highest speed at which full power still balances drag in level flight (scan down, then bisect).
function levelMaxSpeed(m,h,W,mode){
 const {rho,a}=atmosphere(h),f=V=>thrust(m,V,rho,1,h,mode)-drag(m,V,rho,a,1,W);
 let hi=330;if(f(hi)>0)return hi;
 let lo=hi-10;while(lo>25&&f(lo)<=0){hi=lo;lo-=10;}
 if(lo<=25)return 25;
 for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(f(mid)>0)lo=mid;else hi=mid;}
 return (lo+hi)/2;
}
// Steady climb at V (lift = W cos gamma), corrected for the kinetic energy a constant-IAS climb
// schedule adds per metre of height (true speed rises as density falls).
// constTAS: climb at constant true speed (rocket); otherwise the usual constant-IAS schedule.
function climbAt(m,h,W,V,mode,constTAS){
 const {rho,a,T}=atmosphere(h),T0=thrust(m,V,rho,1,h,mode);
 let s=0;for(let i=0;i<6;i++){const c=Math.sqrt(Math.max(0,1-s*s));s=clamp((T0-drag(m,V,rho,a,c,W))/W,-1,1);}
 const dVdh=h<=11000&&!constTAS?V*.5*5.255877*.0065/T:0;
 return V*s/(1+V*dVdh/G);
}
function bestClimb(m,h,W,mode,constTAS){
 let lo=40,hi=Math.max(60,levelMaxSpeed(m,h,W,mode));const gr=(Math.sqrt(5)-1)/2;
 let x1=hi-gr*(hi-lo),x2=lo+gr*(hi-lo),f1=climbAt(m,h,W,x1,mode,constTAS),f2=climbAt(m,h,W,x2,mode,constTAS);
 for(let i=0;i<40;i++){
  if(f1<f2){lo=x1;x1=x2;f1=f2;x2=lo+gr*(hi-lo);f2=climbAt(m,h,W,x2,mode,constTAS);}
  else{hi=x2;x2=x1;f2=f1;x1=hi-gr*(hi-lo);f1=climbAt(m,h,W,x1,mode,constTAS);}
 }
 const V=(lo+hi)/2;return {V,rate:climbAt(m,h,W,V,mode,constTAS)};
}
// Time from h0 to h1 at the best climb speed; rockets lose propellant mass on the way (and climb at
// constant true speed). burnBefore: seconds of full-thrust burn before h0 (a figure "from a standing start").
function timeToClimb(m,h0,h1,W,mode,burnBefore=0){
 const n=10,dh=(h1-h0)/n,rocket=m.engine.kind==='rocket';let t=0,w=W-fuelFlow(m,1)*burnBefore*G;
 for(let i=0;i<n;i++){const r=bestClimb(m,h0+(i+.5)*dh,w,mode,rocket).rate;if(r<=.05)return 1e5;const dt=dh/r;t+=dt;w-=fuelFlow(m,1)*dt*G;}
 return t;
}
function evaluate(m,d,W){
 if(d.q==='speed')return levelMaxSpeed(m,d.h,W,d.mode);
 if(d.q==='climb')return bestClimb(m,d.h,W,d.mode).rate;
 return timeToClimb(m,d.h,d.h1,W,d.mode,d.burnBefore||0);
}

/* ---- solve the unknowns from the published figures (Levenberg-Marquardt, any number of parameters) ---- */
function linsolve(M,b){
 const n=b.length,a=M.map((row,i)=>[...row,b[i]]);
 for(let i=0;i<n;i++){let p=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;[a[i],a[p]]=[a[p],a[i]];
  if(Math.abs(a[i][i])<1e-300)a[i][i]=1e-300;
  for(let j=i+1;j<n;j++){const f=a[j][i]/a[i][i];for(let k=i;k<=n;k++)a[j][k]-=f*a[i][k];}}
 const x=new Array(n).fill(0);for(let i=n-1;i>=0;i--){let s=a[i][n];for(let k=i+1;k<n;k++)s-=a[i][k]*x[k];x[i]=s/a[i][i];}
 return x;
}
function fitParams(base){
 const k=base.engine.kind,data=base.data,P=[{key:'CD0',x0:.022,lo:.008,hi:.08,step:1e-6}];
 if(k==='turbo'||k==='piston')P.push({key:'etaP',x0:.8,lo:.4,hi:.97,step:1e-6});
 if(k==='turbo'&&base.engine.lapse==null&&data.length>=3)P.push({key:'lapse',x0:5e-6,lo:-2e-5,hi:6e-5,step:1e-10});
 if(k==='piston'&&base.engine.fth==null)P.push({key:'fth',x0:4000,lo:500,hi:9000,step:1});
 if(k==='piston'&&data.some(d=>d.mode==='combat'))P.push({key:'combatRatio',x0:.85,lo:.5,hi:1,step:1e-6});
 if(k==='jet')P.push({key:'nT',x0:.8,lo:.2,hi:1.6,step:1e-6});
 if(k==='rocket')P.push({key:'mcrit',x0:.72,lo:.5,hi:.95,step:1e-6});
 return P;
}
function solve(base){
 const W=base.mass*G,data=base.data,P=fitParams(base),n=P.length;
 const model=x=>{const m={...base};P.forEach((p,i)=>m[p.key]=x[i]);return m;};
 const residuals=x=>{const m=model(x);return data.map(d=>(evaluate(m,d,W)-d.v)/d.v);};
 const cost=r=>r.reduce((s,v)=>s+v*v,0);
 let x=P.map(p=>p.x0),r=residuals(x),c=cost(r),lambda=1e-3;
 for(let it=0;it<80;it++){
  const J=x.map((xi,j)=>{const dx=Math.max(P[j].step,Math.abs(xi)*1e-4),xp=x.slice();xp[j]+=dx;return residuals(xp).map((v,i)=>(v-r[i])/dx);});
  const A=Array.from({length:n},()=>new Array(n).fill(0)),b=new Array(n).fill(0);
  for(let i=0;i<r.length;i++)for(let p=0;p<n;p++){b[p]-=J[p][i]*r[i];for(let q=0;q<n;q++)A[p][q]+=J[p][i]*J[q][i];}
  let improved=false;
  for(let tries=0;tries<12&&!improved;tries++){
   const M=A.map((rowA,p)=>rowA.map((v,q)=>v+(p===q?lambda*(A[p][p]||1):0)));
   const dx=linsolve(M,b),xn=x.map((v,j)=>clamp(v+dx[j],P[j].lo,P[j].hi));
   const rn=residuals(xn),cn=cost(rn);
   if(cn<c){x=xn;r=rn;improved=Math.abs(c-cn)>1e-14;c=cn;lambda=Math.max(1e-9,lambda/4);}
   else lambda*=8;
  }
  if(!improved)break;
 }
 return {x,params:P.map(p=>p.key),model:model(x),residuals:r,rms:Math.sqrt(c/Math.max(1,r.length))};
}

/* ---- build a model from the published sheet ---- */
function build(kind){
 const src=SOURCES[kind],assumed=ASSUMED[kind];if(!src)return null;
 const S=src.S,b=src.b,A=b*b/S,e=1.78*(1-.045*Math.pow(A,.68))-.64,eng=src.engine;
 // CLmax from the published stalls (IAS read as EAS at these low speeds); only one of them: class ratio.
 const cl=(V,mass)=>2*mass*G/(RHO0*S*V*V);
 let CLmax=assumed.clClean,CLmaxLanding=assumed.clClean*assumed.clLandingRatio;
 if(src.stall?.clean)CLmax=cl(src.stall.clean,src.stall.mass);
 if(src.stall?.landing)CLmaxLanding=cl(src.stall.landing,src.stall.mass);
 if(src.stall?.clean&&!src.stall.landing)CLmaxLanding=CLmax*assumed.clLandingRatio;
 if(src.stall?.landing&&!src.stall.clean)CLmax=CLmaxLanding/assumed.clLandingRatio;
 const base={kind,name:src.name,mass:src.mass,S,b,A,e,k:1/(Math.PI*A*e),lift:liftSlope(A),assumed,CLmax,CLmaxLanding,
  engine:{kind:eng.kind,count:eng.count||1,lapse:eng.lapse,fth:eng.fth},
  disc:src.propD?(eng.count||1)*Math.PI*(src.propD/2)**2:0,P:(eng.power||0)*(eng.count||1),T0:(eng.thrust||0)*(eng.count||1),
  lapse:eng.lapse??0,fth:eng.fth??4000,combatRatio:1,nT:.8,mcrit:assumed.mcrit,etaP:.8,CD0:.022,
  roll:{peak:src.roll.peak,at:src.roll.at,fall:src.roll.fall},
  severity:src.stallChar?.severity??assumed.severity,
  mlimit:src.limits?.mlimit??assumed.mlimit??(assumed.mcrit+.06),vne:src.limits?.vne??assumed.vne??null,
  data:src.perf};
 const fit=solve(base),m={...fit.model};
 // Dive brakes: drag increment that holds the published terminal speed in the published dive, engine idle.
 if(src.diveBrake){
  const d=src.diveBrake,atm=atmosphere(1500),V=d.speed/Math.sqrt(atm.rho/RHO0),W=m.mass*G,q=.5*atm.rho*V*V;
  const n=Math.cos(d.angle),CL=n*W/(q*S);
  const need=(W*Math.sin(d.angle)-windmillDrag(m,V,atm.rho,0))/(q*S)-(m.CD0+m.k*CL*CL);
  m.brakeCD=Math.max(0,need);
 }
 // Mass composition at the published weight: full internal fuel plus the stores the weight includes.
 const st=assumed.stores||{},fuelKg=src.fuel?.kg??st.fuel??0;
 const refStores=(src.stores?.refBombs||0)*(st.bomb||0)+(src.stores?.refTorps||0)*(st.torpedo||0);
 m.fuelKg=fuelKg;m.empty=m.mass-fuelKg-refStores;m.stores=st;
 m.fit=Object.freeze({params:fit.params,x:fit.x,residuals:fit.residuals,rms:fit.rms,data:src.perf});
 delete m.data;
 return Object.freeze(m);
}
const cache={};
function model(kind){return cache[kind]||(cache[kind]=build(kind));}
function has(kind){return !!SOURCES[kind];}

/* ---- live mass and store drag from the game's loadout ---- */
// p: {fuel 0-100 (internal), tankAttached, tankFuel, tankCapacity, bombs, rockets, torps, bombKg, torpedo}
// Store counts are capped at what the airframe physically carries (the games allow arcade reloads).
const CAPACITY={p47:{bomb:2,rocket:10},bf109:{bomb:1},fw190:{bomb:1},ju87:{bomb:4},me262:{bomb:2},avenger:{bomb:4,torpedo:1},
 sbd:{bomb:1},corsair:{bomb:2,rocket:8},zero:{bomb:2}};
function loadout(m,p={}){
 const st=m.stores||{},cap=CAPACITY[m.kind]||{},fuel=clamp((p.fuel??100)/100,0,1);
 let mass=m.empty+m.fuelKg*fuel,area=0;
 const n=(count,key)=>Math.max(0,Math.min(count||0,cap[key]??0));
 const torps=p.torpedo?n(p.torps,'torpedo'):0,bombs=n(p.torpedo?0:(p.bombs??p.torps),'bomb');
 const bombKg=p.bombKg??st.bomb??0,bombArea=(p.bombKg&&st.bomb?p.bombKg/st.bomb:1)*(st.bombArea??CLASS.bombArea);
 mass+=bombs*bombKg+torps*(st.torpedo||0);area+=bombs*bombArea;
 const rockets=n(p.rockets,'rocket');mass+=rockets*(st.rocket||0);area+=rockets*(st.rocketArea||0);
 const tank=!!p.tankAttached&&st.tankFuel!=null;
 if(tank){mass+=(st.tankShell??CLASS.tankShell)+st.tankFuel*clamp((p.tankFuel||0)/(p.tankCapacity||60),0,1);}
 return {mass,ratio:mass/m.mass,storeArea:area,tank};
}

/* ---- orientation helpers (game convention: Euler(-pitch, heading, -roll, 'YXZ'), nose +Z) ---- */
function axes(pitch,heading,roll){
 const sp=Math.sin(pitch),cp=Math.cos(pitch),sh=Math.sin(heading),ch=Math.cos(heading),sr=Math.sin(roll),cr=Math.cos(roll);
 return {d:[cp*sh,sp,cp*ch],u:[sr*ch-cr*sp*sh,cr*cp,-sr*sh-cr*sp*ch]};
}
function eulerFrom(d,u,prev){
 const p0=Math.asin(clamp(d[1],-1,1)),flat=Math.hypot(d[0],d[2]);
 const h0=flat>1e-5?Math.atan2(d[0],d[2]):prev.heading;
 const cand=[[p0,h0],[Math.PI-p0,h0+Math.PI]];
 let best=null,bestCost=Infinity;
 for(const [p,h] of cand){const cost=wrap(p-prev.pitch)**2+wrap(h-prev.heading)**2;if(cost<bestCost){bestCost=cost;best=[p,h];}}
 const [p,h]=best,sp=Math.sin(p),cp=Math.cos(p),sh=Math.sin(h),ch=Math.cos(h);
 const u0=[-sp*sh,cp,-sp*ch],w0=[ch,0,-sh];
 const r=Math.atan2(u[0]*w0[0]+u[1]*w0[1]+u[2]*w0[2],u[0]*u0[0]+u[1]*u0[1]+u[2]*u0[2]);
 return {pitch:wrap(p),heading:prev.heading+wrap(h-prev.heading),roll:r};
}
const norm=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

/* ---- control helpers ---- */
// Load factor that keeps the flight-path angle (level coordinated turn when banked), plus 'extra'
// in units of g along the vertical. Smoothly hands over to "no lift" at knife edge.
function holdLoad(pitch,roll,extra=0,minCos=.139){
 const c=Math.cos(roll);return (Math.cos(pitch)+extra)*c/Math.max(c*c,minCos*minCos);
}
// Elevator authority left at this speed (0..1): fades past the control-limit Mach (tuck) and above
// the published dive limit (IAS). Returns the share and a nose-down load (g) the tuck adds.
function highSpeed(m,V,h){
 const atm=atmosphere(h),M=V/atm.a,eas=V*Math.sqrt(atm.rho/RHO0);
 const tuck=clamp((M-m.mlimit)/.06,0,1),over=m.vne?clamp((eas-m.vne)/(.15*m.vne),0,1):0;
 return {mach:M,eas,tuck,overspeed:over,authority:(1-.7*tuck)*(1-.6*over)};
}

/* ---- the integrator ----
 * s: {spd, pitch, heading, roll, nLoad, power, altitude, stall, dropDir}  (updated in place)
 * o: {throttle, damage, massKg | mass (ratio), gear, flaps, tank, storeArea, brakes, clFactor, gFactor,
 *     elevator, extraDrag (m/s^2), substepHz, stallModel (default true), mode,
 *     command:(s,V,lim)=>n  - the control law, evaluated every substep, gain}
 * returns the last substep's diagnostics. */
function step(m,s,dt,o){
 const gain=o.gain??GAME.manoeuvreGain,hz=o.substepHz||GAME.substepHz;
 const steps=Math.max(1,Math.ceil(clamp(dt,0,.25)*hz)),h=clamp(dt,0,.25)/steps;
 const mass=o.massKg??m.mass*(o.mass??1),W=mass*G;let out=null;
 const spool=m.assumed.spool,stallOn=o.stallModel!==false;
 for(let i=0;i<steps;i++){
  const throttle=clamp(o.throttle??0,0,1);
  s.power=(s.power??throttle)+(throttle-(s.power??throttle))*(1-Math.exp(-h/spool));
  const atm=atmosphere(s.altitude),V=Math.max(1,s.spd);
  const lim=loadLimits(m,V,atm.rho,W,o),hs=highSpeed(m,V,s.altitude);
  // control law -> commanded load factor; elevator damage and high-speed stiffening cap the pull
  let nCmd=o.command?o.command(s,V,lim):holdLoad(s.pitch,s.roll);
  const el=clamp(o.elevator??1,0,1)*hs.authority,hold=holdLoad(s.pitch,s.roll);
  nCmd=hold+(nCmd-hold)*el-hs.tuck*.6*Math.cos(s.roll);
  // stall: asking for more than the wing has. Lift falls by up to 30 %, drag rises, a wing drops.
  const demand=nCmd>=0?nCmd/Math.max(.05,lim.max):nCmd/Math.min(-.05,lim.min);
  const target=stallOn?clamp((demand-1)/.10,0,1):0;
  s.stall=(s.stall||0)+(target-(s.stall||0))*(1-Math.exp(-h/(target>(s.stall||0)?.25:.6)));
  const top=lim.max*(1-.30*s.stall),bottom=lim.min*(1-.30*s.stall);
  s.nLoad=clamp(nCmd,bottom,top);
  if(s.stall>.25&&!s.dropDir)s.dropDir=Math.abs(s.roll)>.05?Math.sign(s.roll):(Math.sin(s.altitude*12.9898+V*78.233)>=0?1:-1);
  if(s.stall<.05)s.dropDir=0;
  if(s.dropDir)s.roll+=s.dropDir*m.severity*GAME.stallRoll*s.stall*h;
  const buffet=clamp((demand-.88)/.12,0,1);
  // speed: thrust - drag - weight component along the path
  const T=thrust(m,V,atm.rho,s.power*clamp(o.damage??1,0,1),s.altitude,o.mode);
  const D=drag(m,V,atm.rho,atm.a,s.nLoad,W,{...o,stall:s.stall})+windmillDrag(m,V,atm.rho,s.power);
  const ax=axes(s.pitch,s.heading,s.roll),d=ax.d,u=ax.u;
  // o.surplusGain: arcade stick law only - a thrust surplus is multiplied (capped at o.surplusCap m/s^2 extra).
  // o.surplusSlow / surplusSlowCap / surplusSlowTo / surplusRef: on top of that, up to this much more gain and cap
  // at the stall speed o.surplusRef, fading out at surplusSlowTo x that speed (the climb-out and the slow end).
  const fade=o.surplusRef?clamp((o.surplusSlowTo-V/o.surplusRef)/(o.surplusSlowTo-1),0,1):0;
  const sg=(o.surplusGain||0)+(o.surplusSlow||0)*fade,sc=(o.surplusCap??Infinity)+(o.surplusSlowCap||0)*fade;
  const net=(T-D)/mass,surplus=net>0&&sg?Math.min(net*sg,sc):0;
  const accel=net+surplus-G*d[1]-(o.extraDrag||0);
  s.spd=Math.max(2,s.spd+accel*h);
  // flight path: lift along the aircraft's up axis plus gravity across the path
  const Vr=Math.max(10,V),gperp=[G*d[1]*d[0],-G+G*d[1]*d[1],G*d[1]*d[2]];
  const a=[0,1,2].map(k=>gain*(s.nLoad*G*u[k]+gperp[k]));
  const dn=norm([d[0]+a[0]*h/Vr,d[1]+a[1]*h/Vr,d[2]+a[2]*h/Vr]);
  const un=norm(u.map((v,k)=>v-dot(u,dn)*dn[k]));
  const e=eulerFrom(dn,un,s);
  s.pathRate=wrap(e.pitch-s.pitch)/h;
  s.pitch=e.pitch;s.heading=e.heading;s.roll=e.roll;
  s.altitude+=s.spd*dn[1]*h;
  out={T,D,accel,nCmd,nMax:lim.max,nMin:lim.min,clmax:lim.clmax,stall:s.stall,buffet,mach:hs.mach,eas:hs.eas,
   tuck:hs.tuck,overspeed:hs.overspeed,fuelFlow:fuelFlow(m,s.power)};
 }
 return out;
}

/* ---- ground run: the same forces with the wheels on the ground ----
 * Returns the along-track acceleration (m/s^2) at airspeed V (relative wind) for the game's ground code.
 * o: {power, damage, massKg, flaps, gear, storeArea, tank, brake (0..1), rotated (0..1), mu, altitude, wingHeight, extraThrust (N)} */
function groundAcceleration(m,V,o={}){
 const h=o.altitude||0,atm=atmosphere(h),mass=o.massKg??m.mass,W=mass*G,q=.5*atm.rho*V*V;
 const f=clamp(o.flaps||0,0,1),clmax=m.CLmax+(m.CLmaxLanding-m.CLmax)*f;
 // ground attitude: tail-up roll CL 0.25 (C), rising to 85 % of CLmax as the pilot rotates (C)
 const CL=Math.min(clmax*.85,.25+(clmax*.85-.25)*clamp(o.rotated||0,0,1)),L=q*m.S*CL;
 const hb=16*(o.wingHeight??1.8)/m.b,ge=hb*hb/(1+hb*hb);       // McCormick's ground-effect factor on induced drag
 const A=m.assumed,D=q*m.S*(m.CD0+ge*m.k*CL*CL+(o.gear??1)*A.gearCD+f*A.flapCD)+q*((o.storeArea||0)+(o.tank?A.tankArea:0))+windmillDrag(m,V,atm.rho,o.power??0);
 const N=Math.max(0,W-L),mu=o.mu??.04,brake=clamp(o.brake||0,0,1)*.30;
 const T=thrust(m,V,atm.rho,clamp(o.power??0,0,1)*clamp(o.damage??1,0,1),h)+(o.extraThrust||0);   // extraThrust: take-off rockets (N)
 return {accel:(T-D-(mu+brake)*N)/mass,lift:L,weight:W,liftoff:L>=W,thrust:T,drag:D};
}

/* ---- convenience for the games and for the report ---- */
// Equivalent (indicated) airspeed, the HUD's IAS approximation.
function equivalent(V,h){return V*Math.sqrt(atmosphere(h).rho/RHO0);}
// Stall speed (TAS) at height h. massRatio: live mass / published mass, or pass massKg in o.
function stallSpeed(m,h,massRatio=1,flaps=0,clFactor=1){
 const {rho}=atmosphere(h),W=m.mass*massRatio*G,cl=(m.CLmax+(m.CLmaxLanding-m.CLmax)*clamp(flaps,0,1))*clFactor;
 return Math.sqrt(2*W/(rho*m.S*cl));
}
// Level-flight acceleration at V with the given power, for control-law limits (departure).
function levelAcceleration(m,V,h,o={}){
 const {rho,a}=atmosphere(h),mass=o.massKg??m.mass*(o.mass??1),W=mass*G;
 return (thrust(m,V,rho,(o.power??1)*(o.damage??1),h)-drag(m,V,rho,a,1,W,o)-windmillDrag(m,V,rho,o.power??1))/mass-(o.extraDrag||0);
}

// Lowest entry speed from which a full-pull, full-power loop at height h never drops below the
// 1-g clean stall speed (same criterion as FlightEnvelope.aeroEntry), plus the same 8 % margin.
const entryCache={};
function aeroEntry(m,gain=GAME.manoeuvreGain,h=1500){
 const key=m.kind+':'+gain+':'+h;if(entryCache[key])return entryCache[key];
 const vs=stallSpeed(m,h),run=v0=>{
  const s={spd:v0,pitch:0,heading:0,roll:0,nLoad:1,power:1,altitude:h};let turned=0,prev=0;
  for(let t=0;t<40&&turned<2*Math.PI;t+=1/60){step(m,s,1/60,{throttle:1,gain,stallModel:false,command:(st,V,l)=>l.max});
   turned+=Math.abs(wrap(s.pitch-prev));prev=s.pitch;if(s.spd<vs*.98)return false;}
  return turned>=2*Math.PI;};
 let lo=vs*1.05,hi=vs*6;
 if(!run(hi))return entryCache[key]=hi;
 for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(run(mid))hi=mid;else lo=mid;}
 return entryCache[key]=hi*1.08;
}

// Flight-path time constant T_theta2 (s): the path follows a pitch-attitude step with this lag.
function pathLag(m,V,h,massRatio=1){return 2*m.mass*massRatio/(atmosphere(h).rho*Math.max(20,V)*m.S*m.lift);}

const api={SOURCES,ASSUMED,CLASS,GAME,CAPACITY,G,HP,PS,KGF,LB,FT,MPH,KMH,KT,FPM,GAL,DEG,atmosphere,propThrust,liftSlope,model,has,
 step,holdLoad,highSpeed,axes,eulerFrom,levelMaxSpeed,bestClimb,climbAt,timeToClimb,evaluate,levelAcceleration,stallSpeed,
 equivalent,loadLimits,thrust,shaft,shaftFactor,drag,windmillDrag,fuelFlow,aeroEntry,pathLag,rollRateReal,rollRate,rollPeak,
 loadout,groundAcceleration};
root.FlightCore=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
