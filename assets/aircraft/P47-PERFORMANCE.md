# P-47D flight envelope used by Build 203

Game variant: bubbletop P-47D, D-28-style adaptation. Geometry began as the
independent creator's D-40, with dorsal fillet removed. Original Republic station
fidelity is not certified. Aircraft physics remain a simplified touchscreen game.

Primary sources checked 25 October 2026:

- USAAF Materiel Center, 6 October 1944, *Comparison of P-47D, P-47M and P-47N
  Performance*, original scan:
  https://wwiiaircraftperformance.com/org/p-47/p-47_files/comp-p47dmn.jpg
  P-47D combat weight 12,731 lb; WEP 2,600 bhp. Level TAS 345/383/417 mph at
  sea level/10,000/20,000 ft; 435 mph at 32,000 ft was **estimated in the source**.
  Climb 3,180/2,920/2,470/1,100 ft/min at the same altitudes.
- RAF Thunderbolt Mk II aircraft data sheet, original scan:
  https://wwiiaircraftperformance.com/org/p-47/p-47_files/P-47_thunderbolt2-aircraftdatasheet.jpg
  R-2800-59, four-blade aircraft; 40 ft 9 in span, 300 sq ft wing; source's own
  weight/boost assumptions differ from the AAF comparison. Used for dimensional,
  engine and equipment identification, not mixed into the AAF performance curve.
- USAAF Flight Test Engineering Branch, 15 July 1944, Eng-47-1774-A, P-47D
  AAF 42-26167 (R-2800-63), original report transcription:
  https://www.wwiiaircraftperformance.com/org/p-47/p47-26167.html
  At 13,230 lb, uncorrected indicated idle stalls: 116 mph clean / 98 mph full
  flap. These are P-47D-family **surrogate anchors, not a D-28-specific test**.
  Normalized by square-root weight ratio to 12,731 lb before game loading.
- USAAF AN 01-65BC-1A, 25 January 1945 (D-25/-26/-27/-28/-30/-35), archive:
  https://everyspec.com/ARMY/ARMY-General/P-47D-25--35_AIRCRAFT_PILOTS_OPERATING_INSTRUCTIONS_1945_57084/
  Dimensions were read in the previous model review; full manual download was
  unavailable during this integration. No new operational limits are claimed
  from unread pages.

Implementation boundaries:

- `p47-performance.js` linearly interpolates the AAF anchors; above 32,000 ft
  speed falloff and the 42,000-ft service-ceiling endpoint are game estimates.
- 100% throttle represents the quoted WEP envelope. Boost duration, cooling,
  turbo RPM, mixture and propeller governor are not simulated; 2,600 hp is an
  envelope identifier, not an additional engine system or unlimited real rating.
- A fitted power/drag curve makes level speed and steady climb agree at its
  anchors. Induced drag, acceleration, bank/gear/flap/tank penalties, takeoff
  acceleration and the existing load fractions are explicit game approximations.
  Zoom climbs spend kinetic energy; pitch is not a free sustained climb command.
- Ground speed/world integration use TAS; stall comparisons and pilot speed
  display use a low-Mach ISA IAS/EAS approximation. Compressibility/pitot position
  errors are not modeled. 130 mph full-flap final is a conservative game target
  of about 1.3 times the reference landing stall, adjusted for current load.
- Existing touch controls, normal/acro modes and damage behavior are retained.
  This is a documented historically anchored game envelope, not a validated
  six-degree-of-freedom flight simulator or real-aircraft operating guidance.
