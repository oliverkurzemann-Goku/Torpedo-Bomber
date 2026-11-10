# 2-Player Duel (Build 238)

Two pilots, two devices, one sky over the Rhine. P-47D, Bf 109, Fw 190 or Me 262 (each pilot chooses). No server: the two
browsers connect directly (WebRTC data channels) after the pilots swap two short text codes.

## How to play

1. Both open the game, tap **2-Player Duel** (menu, left column next to *Pilot's Logbook*).
2. **Host** taps *Host a duel*, copies or shares the invitation code (`TB1.o...`, ~570 characters) and sends it by message.
3. **Guest** taps *Join a duel*, pastes the invitation, taps *Create answer*, sends the answer code (`TB1.a...`) back.
4. Host pastes the answer and taps *Connect*. Both show **Connected** with the other pilot's callsign, aircraft and ping.
5. Both pick their aircraft; the host sets *first to 3/5/10 kills* and the time limit and taps **Start duel**.
6. Both start in the air, 3 km apart and facing each other, 900 m above the ground. A diamond marks the other aeroplane
   (distance, above/below); the top line shows the score and the time left.
7. A kill needs sustained hits: a fresh aeroplane goes down after about 6 s of continuous hits (`Duel.TTK`), tougher types
   (P-47) a little later, lighter ones (Me 163) earlier. Down: 4 s later you get a new aeroplane somewhere else on the arena
   ring, protected for 3 s. Crashing or touching the ground counts as a death (no point for the other pilot unless they hit
   you in the last 10 s). Leaving the 9 km arena damages the aeroplane. Guns that stay empty for 15 s (`Duel.RELOAD`) are refilled.
8. Match over: result screen, **Rematch** returns to the lobby with the link still open; leaving the duel tells the other pilot
   (they win by forfeit).

*Play over the internet* (lobby checkbox, default on) asks Google's public STUN server for the device's public address so two
different networks can connect. Off = same Wi-Fi only, no outside request at all. Some strict routers (symmetric NAT, client
isolation) cannot connect either way: there is no relay server.

## Modules

| file | role |
|---|---|
| `duel-net.js` (`DuelNet`) | the link: invitation/answer codes (deflate-raw + base64url, FNV checksum), two data channels (`st` unordered 20 Hz positions, `ev` reliable events), heartbeat/ping, `lost`/`closed` detection. No game knowledge. |
| `duel.js` (`Duel`) | rules and maths: state packets, `Track` (snapshot interpolation with clock-offset estimate, 100 ms delay, 0.4 s extrapolation), damage normalisation, `createMatch`, arena/spawns. No THREE/DOM/network. |
| `remagen-mission.html` block *DUEL* | lobby, avatar, hits, deaths, respawn, marker, result; hooks in `crash`, `updateBullets`, `startMission`, `togglePause`, `exitToMenuFromPause`, `animate`. |
| `duel.css` | lobby and in-flight marker. |

The duel flies as a free-flight mission installed in slot 0 of `MISSIONS` for the match (`duelInstallMission`, restored by
`duelRestoreMission`): no AI, targets, wingmen, surprises, checkpoint or bailout.

## Authority and messages

Every client is the only authority over its own aeroplane (position, hull, death). The other pilot is an avatar drawn from the
state packets, shown ~100 ms in the past, so what you aim at is what you see. **Hits are decided by the shooter**: a bullet that
reaches the avatar (9 m bubble) adds to `hitAcc`; every 0.1 s a `hit` event carries the percent of structure to the victim, who
applies it (divided by the type's toughness, ignored while protected or paused). The victim announces `dead`; both clients count
the same events, the host's `end` carries the final score. No anti-cheat (a duel between friends).

State packet (20 Hz, unreliable): `[n, t, x,y,z, qx,qy,qz,qw, spd, thr, hull%, flags, flap, epoch, volley]`.
Events (reliable): `hello{v,name,ac,build}`, `start{seed,rules}`, `ready`, `hit{pct}`, `dead{cause,e}`, `away{on}`, `end{f}`, `bye`, `ping/pong`.

## Game decisions (tune here)

`Duel.TTK` 6 s, `Duel.TOUGH` per type, `Duel.PROTECT` 3 s, `Duel.RESPAWN` 4 s, `Duel.RELOAD` 15 s, `Duel.HIT_RADIUS` 9 m, arena radius 9 km
(`Duel.arena`), spawn distance 3 km / altitude 900 m AGL, interpolation delay 0.1 s (`new Duel.Track`).

## Tests

`okinawa/tests/duel.cjs` (codes, fake-WebRTC link, packets, track, damage, match, arena) and `okinawa/tests/duel-browser.cjs`
(two real game pages in one Chromium joined by a real WebRTC link: lobby, start, avatars, a hit and its damage, death, score on
both sides, respawn with protection, result, rematch, pause/away, forfeit; writes `app/release/duel-browser.json`).

## Not tested / limits

Two physical iPads, real Wi-Fi/NAT/Safari WebRTC and the native app's WKWebView (iOS asks for Local Network permission the first
time; `NSLocalNetworkUsageDescription` is set in `Info.plist`) were not available: the browser test runs both pages on one
machine over loopback. The opponent's engine is not heard (only gunfire). Pacific has no duel. No spectators, no more than two pilots.
