# P-47 replacement: acceptance criteria fixed before detailing

Baseline: Build 201, commit fdc5fc9ff0e04e63eef8eaacc0ed011d8b67cc87.
Date: 24 October 2026. Scope: visual game model, not engineering/flight certification.

1. Provenance: exact source file hash, original creator profile, applicable license and dated evidence. No War Thunder mesh, UVs, normal maps, albedo, cockpit or crew may be inherited. A compatible-license declaration is not a warranty of third-party rights.
2. Variant: existing game depicts a P-47D-28 bubbletop. A D-22 razorback is rejected as a drop-in. The downloaded mgg8/Aviation Gazetteer source depicts a D-40-RA; any adaptation must list the differences. Dorsal fillet and underwing dive-brake differences must be resolved before claiming a D-28.
3. Scale: source-verified main dimensions within 1%; use a single global scale. Never stretch length/span independently to manufacture a pass. Conflicting museum dimensions must be recorded, not silently averaged.
4. Shape before paint: inspect side/front/top orthographic views; export longitudinal stations and transverse sections. Numerical samples of the same model are not independent proof of historical accuracy. Original station drawings or measured sections are required before claiming engineering-verified cross-sections.
5. Materials: newly authored silver/checkerboard interpretation and service wear; no photo pixels or former game textures. Transparencies and yellow prop tips must survive r128 loading and mobile texture limits.
6. Mechanics: four original propeller blades on one shaft, no stationary duplicate; three real tagged tyre groups; wheels retain circular geometry; separate flaps/ailerons/elevators/rudder; pivots remain independent in player/AI clones. Gear/flap endpoints and flat-ground contacts within 5 mm.
7. Delivery: editable .blend, uncompressed self-contained GLB, source/changes/license notices, generator and reference/comparison files. No dependence on the earlier game-derived source.
8. Technical budget: aim at <=100,000 triangles, <=40 meshes and <=12 MiB GLB; at most two 2048 paint textures plus small shared detail textures. Final limits follow whole-mission measurements, not polygon count alone.
9. Integration: actual player and AI mission, eight model barrel origins, takeoff/landing/gear/flap controls; glTF Validator zero errors; legacy P-47 hashes absent from app payload and runtime fallbacks. Existing other aircraft regressions preserved.
10. Device gate: actual target-iPad model/OS recorded, 15-minute worst-case mission including landing, frame-time p50/p95/p99, sustained memory and load time. Browser/SwiftShader/simulator results must never be called a physical-iPad pass. This gate remains pending without device access.

Acceptance is conjunctive. Record PASS, FAIL or PENDING per criterion; a nice render or matching span alone does not approve the model.
