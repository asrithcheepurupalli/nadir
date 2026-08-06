# NADIR — status

Built 2026-08-05 to 06. Everything below builds, `npm run test:geo` passes, and
the full site is running locally.

## What it is

Aim your phone out of an aircraft window and it names the ground you are
looking at. Offline, because there is no signal at cruise. And it shows you its
error instead of a pin it cannot justify.

**Positioning: a real product, not a showcase.** Web is the demo and marketing
surface, native is the sellable thing. **$5 one time, never a subscription**
(there is no backend to justify one). Engine MIT, app sold. The pitch is
*SkyView, pointed down*.

Two facts checked rather than assumed:
- GPS works in aeroplane mode on **both** iOS and Android. The receiver is
  passive. So this is not Android-only the way Pingless was.
- Closest existing product is **Flyover Country** (NSF-funded, free, offline).
  But it is a top-down *map*. Nobody does the camera ray-cast. That is the gap.

## Built and working

**Engine** (`src/engine/`, MIT via `LICENSE-engine`)
- `geo.js` — spherical ray-cast with optical refraction (k = 1.13), plus the
  closed-form inverse `depressionForGroundRange` that round-trips to 2.4e-12°.
  Returns `null` past the limb rather than inventing a point.
- `uncertainty.js` — error propagation to a ground ellipse, confidence bands.
- `atlas.js` — pack loader, 4° spatial index, resolver. 0.18 ms/query.
- `sensors.js` — camera, GPS, orientation. Heading from the GPS track, never
  the magnetometer. Window calibration solves the phone-to-aircraft offset.
- `replay.js` — three scripted routes, identical observer shape to live.
- `npm run test:geo` — all passing.

**Pack** — `npm run pack`. **1.09 MB gzipped worldwide**, 13,394 named
features, from Natural Earth (public domain). Emits `src/data/pack-stats.js`
so the site's copy is generated from the data and cannot drift.

**Site** — Vite + React, hand-written CSS, sectional-chart art direction on buff
paper, aviation amber accent. Hero (live cross-section), demo (perspective
window view + track-up chart + live/replay), honesty (the signature
interaction), geometry, offline pack, pricing, footer. Service worker caches
shell, fonts and atlas so the page itself works offline.

**Case study** — `docs/NADIR-Case-Study.html`, 8 pages, `npm run casestudy:pdf`.
Uses NADIR's own plate system, not the older house format.

## The numbers the product is built on

```
0.001° below the dip angle   →  9.9 km short of the horizon
the same 0.001° at 60° down  →  0.3 metres
```

Degradation ladder, working:

```
on the Krishna   ±1 → Krishna (river)   ±5  → Eastern Ghats  ±250 → India
over Delhi       ±1 → New Delhi         ±20 → Delhi          ±80  → Ganges Plain
Everest          ±1 → Mount Everest     ±80 → Himalayas
Vizag            ±1 → Vishakhapatnam    ±20 → Bay of Bengal
```

## Bugs found and fixed during the build

- Two geometry test failures were the *tests* being wrong (flat-earth sign
  backwards; limb tolerance ignored the real √ε sensitivity). Chasing the second
  found a real bug: a ray aimed exactly at the dip put `s` a few ulps above 1,
  sent `asin` to NaN, and reported "sky" for the one aim that is precisely the
  horizon.
- The resolver got *less* specific as the error shrank, because tolerance was
  gating the search radius. Search wide, then let the error budget decide what
  may be said.
- `sizeKm` for rivers was derived from distance-to-river, which is circular and
  made far rivers look enormous and win on rank.
- Stop buttons nested inside a `<label>` never received their own clicks.
- Reveal-on-scroll left content permanently invisible when the browser restored
  a scroll position or a hash link jumped down the page.
- Hero copy had drifted to the pre-upgrade pack figures (780 KB / 2,130).
- Canvases repainted at 60fps unconditionally; the error bar had no visibility
  gate at all.

## Not done

- **Never seen on a real device at altitude.** No amount of maths substitutes.
- **Final visual QA is incomplete.** Late-session browser checks ran against a
  backgrounded tab (`visibilityState: hidden`), where Chrome throttles rAF to
  zero, so screenshots tore and paints were unreliable. Everything was verified
  programmatically (canvas sizing, resolver output, no console errors, no
  horizontal overflow, section geometry) and each section was seen rendering
  correctly earlier while the tab was foregrounded. Worth one careful pass with
  the window in front.
- Not deployed. No GitHub repo yet, no domain. Intended:
  `nadir.made-by-ac.com`.
- Native app, GeoNames gazetteer, per-route pack slicing.
- The waitlist form stores to `localStorage`; it needs a real list before
  launch.
- Fonts load from Google Fonts. For a genuinely offline-first product they
  should be self-hosted; the service worker caches them after first load.
