/* FlightCore: computed point-mass flight model (first type: P-47D). SI units, true airspeed.
 *
 * Nothing in the force model is tuned by hand. The aircraft is described only by published
 * figures (mass, wing, engine power, propeller diameter, measured speeds, climbs and stalls);
 * the aerodynamic coefficients are SOLVED from those figures when the module loads:
 *
 *   drag      D = q S (CD0 + k CL^2 + dCD_config + dCD_mach)          k = 1/(pi A e)
 *   thrust    actuator-disk momentum theory: T (V + w) = eta_p P,  T = 2 rho A_disc (V + w) w
 *   solve     CD0, eta_p and the shaft-power lapse with height by least squares over the AAF level
 *             speeds AND climbs at 0/10k/20k ft; Oswald e from Raymer's straight-wing formula
 *             (left free, e runs to its 0.4 bound: these six figures cannot separate it)
 *   lift      CLmax clean / landing from the USAAF stall tests; n_max = min(structure, CLmax q S / W)
 *   lag       flight path follows the load factor with T_theta2 = 2 m / (rho V S a)  (lift response)
 *   path      d(gamma)/dt = g/V (n cos(phi) - cos(gamma)),  d(psi)/dt = g/V n sin(phi) / cos(gamma)
 *             integrated in vector form so loops pass the vertical
 *
 * Values that have NO source are listed in ASSUMED with their reason; the game's control law
 * (how the stick maps to a load factor) and its one manoeuvre gain are listed in GAME.
 * The full derivation and the model-versus-source table: FLIGHT-CORE.md,
 * reproducible with  node scripts/flight/derive-p47.cjs
 */
(function(root){
'use strict';
const G=9.80665,HP=745.69987,LB=.45359237,FT=.3048,MPH=.44704,FPM=FT/60,R=287.053,KAPPA=1.4;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

/* ---- published figures (confidence: A = primary document, B = secondary/consistent sources) ---- */
const SOURCES={
 p47:Object.freeze({
  name:'P-47D Thunderbolt (R-2800-59, 2600 bhp WEP)',
  weightLb:12731,                 // A  AAF performance comparison, 6 Oct 1944 (weight of the speed/climb figures)
  wingAreaFt2:300,                // A  same document / AN 01-65BC-1A
  spanM:12.42,                    // A  40 ft 9 in
  shaftHp:2600,                   // A  WEP, the power the AAF figures were flown at
  propDiameterM:3.99,             // B  Curtiss Electric 836 blades, 13 ft 1 in - 13 ft 2 in
  maxSpeedMph:[[0,345],[10000,383],[20000,417]],   // A  TAS at WEP, same document
  climbFpm:[[0,3180],[10000,2920],[20000,2470]],   // A  same document
  stallTestLb:13230,              // A  USAAF Eng-47-1774-A, 15 Jul 1944
  stallCleanMph:116,              // A  power off, clean (IAS)
  stallLandingMph:98              // A  power off, gear and flaps down (IAS)
 })
};

/* ---- values without a source: used, but named. C = assumed class value. ---- */
const ASSUMED={
 p47:Object.freeze({
  nLimit:7.0,       // C  positive structural limit; no P-47 figure found (kept from FLIGHT-ENVELOPE.md)
  nNegative:3.0,    // C  negative structural limit, typical US fighter category
  clMinRatio:.6,    // C  inverted CLmax as a share of upright CLmax (cambered section)
  mcrit:.72,        // C  drag-rise onset Mach; dive-compressibility reports put the P-47 at about 0.7
  gearCD:.020,      // C  gear-down zero-lift drag increment (wing-area basis)
  flapCD:.050,      // C  full-flap zero-lift drag increment
  tankCD:.006,      // C  belly drop tank
  windmill:.07,     // C  closed-throttle windmilling propeller drag, disc-area basis (from FLIGHT-ENVELOPE.md)
  spool:1.25        // C  engine power build-up time constant (s), kept from flight-dynamics.js
 })
};

/* ---- the game's own choices: not aircraft data ---- */
const GAME={
 // One manoeuvre time-scale gain on the flight-path rotation (turns, pull-ups) for two-thumb
 // touch control; forces, drag and energy are NOT scaled. 1 = unassisted physics.
 manoeuvreGain:2.2,
 substepHz:120
};

/* ---- atmosphere (ISA) ---- */
function atmosphere(h){
 h=clamp(h,-500,20000);let T,p;
 if(h<=11000){T=288.15-.0065*h;p=101325*Math.pow(T/288.15,5.255877);}
 else{T=216.65;p=22632.06*Math.exp(-G*(h-11000)/(R*T));}
 return {T,p,rho:p/(R*T),a:Math.sqrt(KAPPA*R*T)};
}

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

/* ---- forces for a configuration ---- */
// Base aircraft with the solved coefficients; cfg adds loading, power setting and configuration.
function drag(m,V,rho,a,n,W,cfg={}){
 const q=.5*rho*V*V,S=m.S,CL=n*W/(q*S),M=V/a;
 const config=(cfg.gear||0)*m.assumed.gearCD+(cfg.flaps||0)*m.assumed.flapCD+(cfg.tank?m.assumed.tankCD:0);
 const mach=M>m.assumed.mcrit?20*Math.pow(M-m.assumed.mcrit,4):0;   // Lock's fourth-power drag-rise law
 return q*S*(m.CD0+m.k*CL*CL+config+mach);
}
function windmillDrag(m,V,rho,power){
 if(!m.disc)return 0;
 const t=clamp(power/.30,0,1),closed=1-t*t*(3-2*t);
 return .5*rho*V*V*m.disc*m.assumed.windmill*closed;
}
// Shaft power falls linearly with height at the solved lapse (turbocharged WEP, see FLIGHT-CORE.md).
function shaft(m,h){return m.P*clamp(1-m.lapse*Math.max(0,h),.3,1);}
function thrust(m,V,rho,power,h=0){return propThrust(shaft(m,h)*clamp(power,0,1),V,rho,m.disc,m.etaP);}
// Available load factor at V: lift-limited below the corner speed, structure above.
function loadLimits(m,V,rho,W,cfg={}){
 const q=.5*rho*V*V,f=clamp(cfg.flaps||0,0,1),pen=cfg.clFactor??1;
 const clmax=(m.CLmax+(m.CLmaxLanding-m.CLmax)*f)*pen;
 return {max:Math.min(m.assumed.nLimit*(cfg.gFactor??1),clmax*q*m.S/W),
  min:-Math.min(m.assumed.nNegative,m.assumed.clMinRatio*clmax*q*m.S/W),clmax};
}

/* ---- steady performance of a candidate coefficient set (used by the solver and the report) ---- */
function levelMaxSpeed(m,h,W){
 const {rho,a}=atmosphere(h);let lo=60,hi=320;
 const f=V=>thrust(m,V,rho,1,h)-drag(m,V,rho,a,1,W);
 if(f(hi)>0)return hi;
 for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(f(mid)>0)lo=mid;else hi=mid;}
 return (lo+hi)/2;
}
// Steady climb at V (lift = W cos gamma), corrected for the kinetic energy a constant-IAS climb
// schedule adds per metre of height (true speed rises as density falls).
function climbAt(m,h,W,V){
 const {rho,a,T}=atmosphere(h),T0=thrust(m,V,rho,1,h);
 let s=0;for(let i=0;i<6;i++){const c=Math.sqrt(Math.max(0,1-s*s));s=clamp((T0-drag(m,V,rho,a,c,W))/W,-1,1);}
 const dVdh=h<=11000?V*.5*5.255877*.0065/T:0;
 return V*s/(1+V*dVdh/G);
}
function bestClimb(m,h,W){
 let lo=45,hi=levelMaxSpeed(m,h,W);const gr=(Math.sqrt(5)-1)/2;
 let x1=hi-gr*(hi-lo),x2=lo+gr*(hi-lo),f1=climbAt(m,h,W,x1),f2=climbAt(m,h,W,x2);
 for(let i=0;i<60;i++){
  if(f1<f2){lo=x1;x1=x2;f1=f2;x2=lo+gr*(hi-lo);f2=climbAt(m,h,W,x2);}
  else{hi=x2;x2=x1;f2=f1;x1=hi-gr*(hi-lo);f1=climbAt(m,h,W,x1);}
 }
 const V=(lo+hi)/2;return {V,rate:climbAt(m,h,W,V)};
}

/* ---- solve CD0, eta_p, power lapse from the published speeds and climbs (Levenberg-Marquardt) ---- */
function solve(base,src){
 const W=src.weightLb*LB*G;
 const data=[];
 for(const [ft,mph] of src.maxSpeedMph)data.push({type:'speed',h:ft*FT,value:mph*MPH});
 for(const [ft,fpm] of src.climbFpm)data.push({type:'climb',h:ft*FT,value:fpm*FPM});
 const model=x=>({...base,CD0:x[0],etaP:x[1],lapse:x[2]});
 const residuals=x=>{const m=model(x);return data.map(d=>{
  const v=d.type==='speed'?levelMaxSpeed(m,d.h,W):bestClimb(m,d.h,W).rate;return (v-d.value)/d.value;});};
 const cost=r=>r.reduce((s,v)=>s+v*v,0);
 let x=[.022,.85,5e-6],r=residuals(x),c=cost(r),lambda=1e-3;
 const lo=[.008,.50,-2e-5],hi=[.06,.97,6e-5];
 for(let it=0;it<80;it++){
  const J=x.map((xi,j)=>{const dx=Math.max([1e-6,1e-6,1e-10][j],Math.abs(xi)*1e-4),xp=x.slice();xp[j]+=dx;return residuals(xp).map((v,i)=>(v-r[i])/dx);});
  // normal equations (J^T J + lambda diag) dx = -J^T r
  const A=[[0,0,0],[0,0,0],[0,0,0]],b=[0,0,0];
  for(let i=0;i<r.length;i++)for(let p=0;p<3;p++){b[p]-=J[p][i]*r[i];for(let q=0;q<3;q++)A[p][q]+=J[p][i]*J[q][i];}
  let improved=false;
  for(let tries=0;tries<12&&!improved;tries++){
   const M=A.map((row,p)=>row.map((v,q)=>v+(p===q?lambda*(A[p][p]||1):0)));
   const dx=solve3(M,b);const xn=x.map((v,j)=>clamp(v+dx[j],lo[j],hi[j]));
   const rn=residuals(xn),cn=cost(rn);
   if(cn<c){x=xn;r=rn;improved=Math.abs(c-cn)>1e-14;c=cn;lambda=Math.max(1e-9,lambda/4);}
   else lambda*=8;
  }
  if(!improved)break;
 }
 return {x,model:model(x),residuals:r,rms:Math.sqrt(c/r.length),data,W};
}
function solve3(M,b){
 const a=M.map((row,i)=>[...row,b[i]]);
 for(let i=0;i<3;i++){let p=i;for(let j=i+1;j<3;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;[a[i],a[p]]=[a[p],a[i]];
  for(let j=i+1;j<3;j++){const f=a[j][i]/a[i][i];for(let k=i;k<4;k++)a[j][k]-=f*a[i][k];}}
 const x=[0,0,0];for(let i=2;i>=0;i--){let s=a[i][3];for(let k=i+1;k<3;k++)s-=a[i][k]*x[k];x[i]=s/a[i][i];}
 return x;
}

/* ---- build a model from the published sheet ---- */
function build(kind){
 const src=SOURCES[kind],assumed=ASSUMED[kind];if(!src)return null;
 const S=src.wingAreaFt2*FT*FT,A=src.spanM*src.spanM/S,disc=Math.PI*(src.propDiameterM/2)**2;
 const rho0=atmosphere(0).rho,Wstall=src.stallTestLb*LB*G;
 // Oswald span efficiency of the complete aircraft: Raymer, Aircraft Design, straight-wing formula.
 const e=1.78*(1-.045*Math.pow(A,.68))-.64;
 const base={kind,name:src.name,mass:src.weightLb*LB,S,b:src.spanM,A,disc,P:src.shaftHp*HP,assumed,e,k:1/(Math.PI*A*e),
  // IAS taken as EAS at these low speeds (no position-error correction published with the figures)
  CLmax:2*Wstall/(rho0*S*(src.stallCleanMph*MPH)**2),
  CLmaxLanding:2*Wstall/(rho0*S*(src.stallLandingMph*MPH)**2),
  lift:liftSlope(A)};
 const fit=solve(base,src);
 const m=Object.freeze({...fit.model,fit:Object.freeze({residuals:fit.residuals,rms:fit.rms,data:fit.data})});
 return m;
}
const cache={};
function model(kind){return cache[kind]||(cache[kind]=build(kind));}

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

/* ---- the integrator ----
 * s: {spd, pitch, heading, roll, nLoad, power, altitude}  (updated in place)
 * o: {throttle, damage, mass, gear, flaps, tank, clFactor, gFactor, elevator, extraDrag (m/s^2),
 *     command:(s,V,lim)=>n  - the control law, evaluated every substep, gain}
 * returns the last substep's diagnostics. */
function step(m,s,dt,o){
 const gain=o.gain??GAME.manoeuvreGain,steps=Math.max(1,Math.ceil(clamp(dt,0,.25)*GAME.substepHz)),h=clamp(dt,0,.25)/steps;
 const mass=m.mass*(o.mass??1),W=mass*G;let out=null;
 for(let i=0;i<steps;i++){
  const throttle=clamp(o.throttle??0,0,1);
  s.power=(s.power??throttle)+(throttle-(s.power??throttle))*(1-Math.exp(-h/m.assumed.spool));
  const atm=atmosphere(s.altitude),V=Math.max(1,s.spd);
  const lim=loadLimits(m,V,atm.rho,W,o);
  // control law -> commanded load factor, inside what the wing (and elevator) can deliver
  let nCmd=o.command?o.command(s,V,lim):holdLoad(s.pitch,s.roll);
  const el=clamp(o.elevator??1,0,1),hold=clamp(holdLoad(s.pitch,s.roll),lim.min,lim.max);
  nCmd=clamp(hold+(nCmd-hold)*el,lim.min,lim.max);
  // lift builds with the flight-path time constant (compressed by the declared manoeuvre gain)
  const tau=2*mass/(atm.rho*V*m.S*m.lift);
  s.nLoad=(s.nLoad??1)+(nCmd-(s.nLoad??1))*(1-Math.exp(-h*gain/tau));
  s.nLoad=clamp(s.nLoad,lim.min,lim.max);
  // speed: thrust - drag - weight component along the path
  const T=thrust(m,V,atm.rho,s.power*clamp(o.damage??1,0,1),s.altitude);
  const D=drag(m,V,atm.rho,atm.a,s.nLoad,W,o)+windmillDrag(m,V,atm.rho,s.power);
  const ax=axes(s.pitch,s.heading,s.roll),d=ax.d,u=ax.u;
  const accel=(T-D)/mass-G*d[1]-(o.extraDrag||0);
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
  out={T,D,accel,nCmd,nMax:lim.max,nMin:lim.min,clmax:lim.clmax,tau,mach:V/atm.a};
 }
 return out;
}

/* ---- convenience for the game and for the report ---- */
// Equivalent (indicated) airspeed, the HUD's IAS approximation.
function equivalent(V,h){return V*Math.sqrt(atmosphere(h).rho/atmosphere(0).rho);}
function stallSpeed(m,h,massRatio=1,flaps=0,clFactor=1){
 const {rho}=atmosphere(h),W=m.mass*massRatio*G,cl=(m.CLmax+(m.CLmaxLanding-m.CLmax)*clamp(flaps,0,1))*clFactor;
 return Math.sqrt(2*W/(rho*m.S*cl));
}
// Level-flight acceleration at V with the given power, for control-law limits (P-47 departure).
function levelAcceleration(m,V,h,o={}){
 const {rho,a}=atmosphere(h),mass=m.mass*(o.mass??1),W=mass*G;
 return (thrust(m,V,rho,(o.power??1)*(o.damage??1),h)-drag(m,V,rho,a,1,W,o)-windmillDrag(m,V,rho,o.power??1))/mass-(o.extraDrag||0);
}

// Lowest entry speed from which a full-pull, full-power loop at height h never drops below the
// 1-g clean stall speed (same criterion as FlightEnvelope.aeroEntry), plus the same 8 % margin.
const entryCache={};
function aeroEntry(m,gain=GAME.manoeuvreGain,h=1500){
 const key=m.kind+':'+gain+':'+h;if(entryCache[key])return entryCache[key];
 const vs=stallSpeed(m,h),run=v0=>{
  const s={spd:v0,pitch:0,heading:0,roll:0,nLoad:1,power:1,altitude:h};let turned=0,prev=0;
  for(let t=0;t<40&&turned<2*Math.PI;t+=1/60){step(m,s,1/60,{throttle:1,gain,command:(st,V,l)=>l.max});
   turned+=Math.abs(wrap(s.pitch-prev));prev=s.pitch;if(s.spd<vs*.98)return false;}
  return turned>=2*Math.PI;};
 let lo=vs*1.05,hi=vs*5;
 if(!run(hi))return entryCache[key]=hi;
 for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(run(mid))hi=mid;else lo=mid;}
 return entryCache[key]=hi*1.08;
}

const api={SOURCES,ASSUMED,GAME,G,HP,LB,FT,MPH,FPM,atmosphere,propThrust,liftSlope,model,step,holdLoad,axes,eulerFrom,
 levelMaxSpeed,bestClimb,climbAt,levelAcceleration,stallSpeed,equivalent,loadLimits,thrust,shaft,drag,windmillDrag,aeroEntry};
root.FlightCore=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
