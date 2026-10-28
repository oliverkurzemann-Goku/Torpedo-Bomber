# Recorded piston engine audio — Build 215

## Build 215 — cleaner loaded voices (29 October 2026)

P-47, Fw 190 and Avenger use the prepared 25-second loaded recordings with
persistent cabin tones and hiss reduced and circular envelope leveling. The same
adapted source families now supply the SBD and Zero power layers, with quicker
playback at high power. These remain declared substitutes, not authenticated
R-1820/Sakae recordings or measured engine RPM. Accepted idle recordings and
processing, Bf 109, Ju 87, Corsair and jet/rocket audio are unchanged.

Output rises across idle, 25%, 50%, 75% and full power. Actual Web Audio rendering
checks sixty-second sustain, short level dips, clipping headroom, throttle return,
stop silence, cache isolation and missing-file reporting. Source cuts, processing,
output SHA-256 and measured sample statistics are in `detail-provenance.json`.
Reproduce with `scripts/engine-audio/refine-loaded-radials.py --source-dir <external-source-dir>`
after acquiring the same verified sources as Build 214. Existing source licenses
and attribution below apply. Raw WAV sources remain outside the checkout.

## Build 214 — loaded radial sound (28 October 2026)

P-47 uses a new 25-second onboard flying R-2800 recording from Pole Position
Production's Grumman F8F Bearcat selection in the free SONNISS GameAudioGDC 2017
bundle. The onboard microphone travels with the aircraft, avoiding an exterior
pass-by Doppler sweep. The P-47 exhaust installation is adapted; source RPM and
manifold pressure are unmeasured. This is not a calibrated 2,700-RPM P-47 take.

Fw 190 and Avenger use an explicitly composite loaded game voice: airborne R-2800
exhaust texture retimed at 14/18, mixed with low-band R-2600 texture from the B-25
exterior startup/idle recording. This is not an original BMW 801 or Avenger
full-power take, and is not a physical firing-order reconstruction. Existing
idle recordings are retained. Separate power playback rate and an earlier
idle/load crossfade make throttle affect timbre as well as level.

Sources: [free GDC collection](https://sonniss.com/gameaudiogdc/),
[Bearcat](https://sonniss.com/sound-effects/grumman-f8f-bearcat/),
[B-25](https://pole.se/product/north-american-b-25-mitchell/),
[SONNISS GDC Bundle License](https://sonniss.com/gdc-bundle-license/), v2.0 effective
27 August 2026, acquired 28 October 2026. The selected free bundle recordings permit
incorporation and modification in commercial/noncommercial games and interactive
projects; attribution is not required. No standalone sound/sample-library
redistribution or AI training. Only edited game loops are included here; raw
source WAVs remain outside the public checkout and app payload.

Exact source identities, archive ranges, SHA-256 values, cuts, transformations and
output hashes are in `audio/engines/loaded-provenance.json`. Rebuild with
`scripts/engine-audio/build-loaded-radials.py --source-dir <external-source-dir>`;
`scripts/engine-audio/fetch-loaded-sources.py --dest <external-source-dir>` acquires
only the two used free bundle files. Seven other aircraft voices remain as in
Build 213. Actual Web Audio tests cover 60-second sustain and timed idle/full/idle
transitions; numerical results do not establish subjective iPad listening quality.
The reported P-47 lift-off difficulty is still open; no flight tuning in this build.

## Active recording sources

| Source | Author | License |
| --- | --- | --- |
| [P-47 Thunderbolt Startup](https://freesound.org/people/Fight2FlyPhoto/sounds/142900/) | Fight2FlyPhoto | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| [Fw-190 Taxiing](https://freesound.org/people/Fight2FlyPhoto/sounds/143556/) | Fight2FlyPhoto | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| [Bf-109 - Daimler-Benz Run-Up](https://freesound.org/people/Fight2FlyPhoto/sounds/142898/) | Fight2FlyPhoto | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| [G04-07-WWII Stuka engine drone.wav](https://freesound.org/people/craigsmith/sounds/437771/) | craigsmith | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

Edits: mono downmix, 28–6500 Hz filtering, slow level correction, selected cuts and loop-seam crossfades. Exact source/loop hashes and cut intervals: [provenance.json](provenance.json). Rebuild with `python scripts/engine-audio/build-recorded-loops.py`; `--steady-only` regenerates only the two revised powered loops. Public full-duration HQ MP3 previews are preserved in `source/`; these are not the uncompressed original WAVs.

## Current aircraft correspondence

| Aircraft | Source and limitation |
| --- | --- | --- |
| P-47D | P-47 ground idle; cleaned Bearcat R-2800 airborne power layer. Adapted installation, unmeasured source RPM. |
| Corsair | Same R-2800 family source from P-47; exhaust/three-blade installation approximate. |
| Fw 190 A-8 | BMW-powered A-5 ground idle; cleaned composite R-2800/R-2600 loaded layer. Not an original BMW full-power take. |
| Avenger / Zero | BMW ground idle; cleaned adapted composite R-2800/R-2600 loaded layer. Not original Avenger or Sakae full-power recordings. |
| SBD Dauntless | Single R-2800 ground idle and cleaned Bearcat airborne power layer. Not an R-1820 recording or nine-cylinder firing-order reconstruction. |
| Bf 109F-2 | Accepted Build 212 DB 601-powered E-3 run-up unchanged. Legacy G-6 also uses this voice; not DB 605 audio. |
| Ju 87B-2 | Accepted Build 212 Stuka-labelled USC archival effect unchanged; exact engine provenance unverified. |
| Me 262 / Komet | Procedural jet/rocket audio unchanged. |

The approved P-47/Fw 190 idle samples, Bf 109 samples and jet/rocket module are byte-identical to Build 212. Powered radial voices contain no flyby. CC BY sources and derived edits credit Fight2FlyPhoto and link to CC BY 3.0. Stuka CC0 material was digitized by craigsmith from USC-held film effects. No endorsement is implied.

## Retired and researched material

User listening feedback rejected the short repeating P-47/Fw flyby layers and the TBF/B-17 drone timbres. The original flyby source MP3s and four TBF/B-17 drone WAVs remain historical repository evidence. The drone WAVs are excluded from the offline app and no longer selected by the sampler. Their original source rows and licenses remain in provenance.json.

Further candidates examined and rejected: f.ink, [fnk_airplane_texan.wav](https://freesound.org/people/f.ink/sounds/191009/), CC BY 3.0, is another flyby. Craigsmith [R17-03 single-prop idle/revs](https://freesound.org/people/craigsmith/sounds/479526/) and [G04-25 fighter revs](https://freesound.org/people/craigsmith/sounds/437792/), both CC0, lack exact engine identification. None was incorporated. Exact R-2600/Sakae/R-1820 stationary source matching remains open.

Technical audio rendering and source correspondence are documented; subjective iPad speaker quality has not been independently verified.
