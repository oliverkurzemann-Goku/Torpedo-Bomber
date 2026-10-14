# Squadron — iPad prototype, Build 196

The existing Three.js flight engine is retained. This is a **native project and tested
offline web payload**, not an App Store submission, signed IPA or physical-iPad certification.

## Already implemented

- Both current campaigns use checked-in Three.js r128, GLTF/FBX loaders, SkeletonUtils and
  fflate. No runtime CDN dependency. Original GLBs/FBX/DEM binaries are copied byte-for-byte.
- Reproducible, allowlisted `dist-app/` payload: around 267 MiB uncompressed. Archived
  games, calibration tools, unused alternative aircraft, repository metadata and test
  sources are excluded. Model files are not re-exported or destructively optimized.
- Capacitor 8.5.3 / Swift Package Manager iPad project, landscape-only/fullscreen, local
  `webDir`, no remote `server.url`, iPadOS 15.4+ provisional minimum. Browser Pages remains
  available and does not load the native bridge.
- Native background events pause the game. Native checkpoints are mirrored to Capacitor
  Preferences/UserDefaults with the required app-private `CA92.1` privacy manifest.
- Each campaign has its own versioned, checksummed, dual-slot airborne checkpoint.
  Automatic saves every 20 seconds of live flight, plus Pause/background/Main Menu.
  Continue restores paused, never into a running firefight while loading.
- Saves preserve player position/attitude/speed/fuel/stores/control damage, AI states,
  moving/destructible targets, operational phases/events/deadlines, ships/convoys and
  flooding, already released weapons, night flares and navigation RTB mode. Renderer
  resources and decorative smoke/debris are rebuilt, not serialized. Aircraft cosmetic
  bullet holes are not restored; physical damage is.
- Starting a new mission or Abort discards its old checkpoint. Completed recoveries,
  losses, bailout and ditching clear it before career awards so restoration cannot
  duplicate previously recorded results.

## Deliberate limits

Only airborne flight is checkpointed: no takeoff roll, deck/field service, landing roll,
parachute/rescue or result screen. Returning to Main Menu from such a phase keeps the
last eligible airborne checkpoint unless the sortie has already been completed/lost.
Periodic saves limit loss from an abrupt process kill to the last successful checkpoint;
an OS kill cannot be guaranteed to allow a final background save.

Browser storage denial/quota failure leaves a session-only fallback, not a promise of
persistent storage. Native Preferences mirroring is asynchronous and may also fail;
no cloud account or telemetry has been added. Browser logbook/preferences remain localStorage;
Safari-to-app progress migration and durable native career backup are future work.
Corrupt/latest-incompatible slots are rejected, with the previous valid slot retained.

## Build on a Mac

For Oliver's current setup (**Mac, no paid Developer Program membership**), use the
[German own-iPad installation guide](app/release/IPAD-INSTALLATION-DE.md) and
`bash iPad-vorbereiten.command`. A free Apple Personal Team supports direct testing on
his own device, with Apple's seven-day provisioning limit. TestFlight is a later paid-
membership distribution step, not required for the initial cable installation.

Prerequisites: supported Node (22+), Xcode 26+, an actual iPad for device QA. Native signing
requires the owner's selected development team; none is configured in this repository.
The provisional bundle ID `at.kurzemann.squadron` and name `Squadron` must be confirmed
before registering/distributing the app.

```sh
npm ci
npm run app:sync
npm run app:open
```

Select the App scheme and development team in Xcode, then run on the connected iPad.
The generated payload and native copied `public/` are ignored; rebuild/sync after changes.
Default Capacitor icon/splash are prototype placeholders, not final store artwork.
`PrivacyInfo.xcprivacy` is explicitly part of the Xcode Resources build phase.
Choose an Xcode/macOS combination that supports the actual connected iPadOS; the previously
verified Xcode 26.3 simulator compile is not a promise of compatibility with later device OSs.
`npm run app:doctor` performs read-only local checks; account/team selection and Run remain in Xcode.
The [device-test sheet](app/release/DEVICE-TEST-DE.md) is prepared and intentionally unfilled.

The current rights evidence/register and unsent licensing drafts are linked from
[APP-ASSET-AUDIT.md](APP-ASSET-AUDIT.md). These preparation files do not change the
Build 196 game/physics or certify any model for distribution.

An unsigned simulator build can be run with:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/squadron-native-qa CODE_SIGNING_ALLOWED=NO build
```

## Verification

- Native compilation verified on a macOS 15 runner with **Xcode 26.3 / 17C529**:
  [successful unsigned simulator build](https://github.com/oliverkurzemann-Goku/Torpedo-Bomber/actions/runs/38481797488),
  commit `e5008c6135b607d2364cf7c78cb9471757a01e34`. Both arm64 and x86_64
  AppDelegate/SceneDelegate compile and the log ends `BUILD SUCCEEDED`. The
  `iPad app build` workflow retains compiler diagnostics and reruns for native
  project/dependency changes. This is not device signing, installation or play-testing.
- `npm test`: syntax, terrain and gameplay regression suites.
- `app-payload.cjs`: payload hashes, original-asset equality, local HTML dependency closure,
  exclusions, landscape config, local `webDir` and native privacy reason.
- `checkpoint.cjs`: codec, checksums, interrupted/corrupt write, separate campaigns,
  storage denial, native hydration/ordered mirror/clear and compatibility rejection.
- `checkpoint-browser.cjs`: actual SBD/Zero/P47 GLBs and real game functions, cold page
  reload, actual Continue/Resume buttons, preserved AI/objectives/bombs/damage, live
  physics and Abort; all external runtime requests are blocked.
- `GAME_TEST_ROOT=$PWD/dist-app` runs that same browser test from the actual app payload,
  including the bundled native bridge in its non-native fallback mode.
- Existing carrier start/recovery/ship-contact and combat-sortie tests remain required.

Desktop headless Chrome tests are **not** WKWebView or an iPad performance/thermal
benchmark. Native compilation was performed separately on the Mac runner above;
no signing, physical-device or native gameplay test is claimed from this Linux host.

## Gates before TestFlight/publication

1. Asset provenance/rights clearance — see [APP-ASSET-AUDIT.md](APP-ASSET-AUDIT.md).
2. Compile/sign on Mac, confirm bundle ID/team, replace prototype icon/splash.
3. Cold launch in airplane mode; both campaigns/models/terrain/audio without internet.
4. Background/control-centre interruption, app termination/relaunch and memory/context loss.
5. 30-minute sorties on the chosen oldest supported and a current iPad, with wind/weather,
   flak, voice radio, sinking ships and landings; record frame intervals, RAM, heat/battery.
   Aim for stable 60 fps where possible; a stable 30-fps device tier is acceptable only
   after real-device tuning. `GameRuntime.frames.report()` and `flightQuality.report()`
   already expose bounded diagnostics without analytics uploads.
6. Complete new-player tutorial, readable touch/HUD layouts, privacy policy/age rating,
   store screenshots and a small reviewed TestFlight release. App Review is not guaranteed.
