# NADIR — where we stopped

Paused 2026-08-05, mid-build, at the user's request. Everything below builds
and passes. Resume at "Next up".

## What it is

Aim your phone out of an aircraft window and it names the ground you are
looking at. Offline, because there is no signal at cruise. And it shows you its
error instead of a pin it cannot justify.

Positioning agreed: **a real product, not a showcase.** Web is the demo and the
marketing surface, native is the sellable thing. **$5 one time, never a
subscription** (there is no backend to justify one). Engine to be MIT
open-sourced, app sold. The pitch line is *SkyView, pointed down*.

Checked and true, both worth remembering:
- GPS works in airplane mode on **both** iOS and Android. The receiver is
  passive. So this is not Android-only the way Pingless was.
- Closest existing thing is **Flyover Country** (NSF-funded, free, offline).
  But it is a top-down *map* app. Nobody does the camera ray-cast. That is the gap.

## Done, tested, working

**The engine** (`src/engine/`) — this is the part that had to be right.

- `geo.js` — spherical ray-cast. Observer position + altitude + bearing +
  depression gives the ground point. Solved on a sphere, not with `h/tan`,
  with an optical refraction correction (k = 1.13). Returns `null` when the
  ray clears the limb rather than fabricating a point.
- `tools/test-geo.mjs` — `npm run test:geo`, **all passing**. Two failures
  during the build were the *tests* being wrong, not the code: the flat-earth
  assertion had the sign backwards (the surface curves away beneath the ray,
  so a spherical cast lands *further* out, 146 km vs 129 km at 5 deg), and the
  limb tolerance ignored the real `sqrt` sensitivity. Fixing the second exposed
  a genuine bug, now fixed: a ray aimed exactly at the dip angle put `s` a few
  ulps above 1 and sent `asin` to NaN, so the one aim that is precisely the
  horizon reported "sky".
- `uncertainty.js` — error propagation to a ground ellipse, plus confidence
  bands. The finding that shapes the whole design: **the two error sources act
  on perpendicular axes.** Heading error stretches it sideways, pitch error
  lengthways, and they never interfere.
- `atlas.js` — pack loader, 4-degree spatial index, resolver. 0.18 ms/query.

**The offline pack** — `npm run pack`, built from Natural Earth (public domain).
**2.30 MB raw, 780 KB gzipped, for the entire planet.** 5,871 named features:
2,130 points (cities, 644 peaks, capes), 1,455 polys (seas, deserts, ranges,
deltas, plateaus, all 36 Indian states), 2,286 lines (rivers, coastline).

**The site** — Vite + React + hand-written CSS, sectional-chart art direction on
buff paper. Hero renders, nav tone-flip wired, `LimbDiagram` is a live
cross-section driven by the real `castRay` rather than an illustration.

## The two numbers the product is built on

Measured, not claimed:

```
0.001 deg below the dip angle  ->  9.9 km short of the horizon
the same 0.001 deg at 60 deg down  ->  0.3 metres
```

The identical angular twitch is worth **33,000x more ground** near the horizon.
That is the signature interaction for the honesty section.

And the degradation ladder, working:

```
on the Krishna   ±1 -> Krishna (river)   ±5  -> Eastern Ghats  ±250 -> India
over Delhi       ±1 -> New Delhi         ±20 -> Delhi          ±80  -> Ganges Plain
Everest          ±1 -> Mount Everest      ±80 -> Himalayas
Vizag            ±1 -> Vishakhapatnam     ±20 -> Bay of Bengal
```

## Decisions locked

- Name **NADIR**, not PARALLAX. Parallax needs two observation points to
  triangulate; this has one position and an attitude. Naming it after physics
  it does not use is what a jury catches.
- Accent is **aviation amber `#b8510e`**, not magenta. User rejected the
  magenta as pink. Amber is the aviation caution colour, which is right for a
  product about how wrong it might be.
- Both live sensors and a scripted replay, sharing one engine.

## Next up

1. `src/engine/sensors.js` and `replay.js` (task 1). The important design call
   is already made and should be kept: **do not trust the magnetometer.** Inside
   an aluminium tube it is a rumour, about 15 deg. Differentiate consecutive GPS
   fixes for course over ground instead, roughly 0.5 deg. Calibrate the phone
   against the aircraft axis by holding it flat to the window, which is
   perpendicular to the track.
2. Chart renderer (task 3), live demo (task 4), remaining sections (task 5).
3. Responsive pass at ~390px, SEO/OG/favicon (task 6). Nothing below the hero
   has been checked on mobile yet.
4. Case study + browser verification (task 7).

Not yet built: sensors, replay, chart renderer, demo, all sections after the
hero, favicon, OG image, manifest, service worker, case study. `index.html`
already references `/favicon.svg`, `/apple-touch-icon.png` and
`/manifest.webmanifest`, none of which exist yet.
