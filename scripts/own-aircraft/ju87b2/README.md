# Original Ju 87 B-2 exterior game model

Build with `node scripts/build-own-ju87.cjs`; add `--release` to update the runtime GLB.
Dependencies are in the repository package.json. Geometry helpers and GLB writer are
shared with the existing original-aircraft pipeline. The shape.json dimensions and
trace coordinates are the source of truth; measure.py documents the measured image
coordinates and can regenerate them when the owner's original PDF is at
`../upload/ju-87b2.pdf`. The PDF itself is not redistributed.

Coordinates: metres, span X, up Y, nose +Z. The model has fixed landing gear.
Animation clips: Flaps, DiveBrakes, Roll, Pitch, Yaw, Propeller. The game uses
ju87-native.js to drive the same named components and never slices the airframe.

The upper-wing height profile, cross sections, airfoil, interior, small fittings
and fictional S2+AN camouflage are approximations. This is a visual game asset.

Checks: `node terrain-system/tests/ju87-native.cjs` and
`GAME_TEST_CHROME=/path/to/chrome node okinawa/tests/ju87-integration-browser.cjs`.
Preview: `ju87-preview.html` from a local HTTP server.
