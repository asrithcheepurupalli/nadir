# NADIR

**n.** the point on the ground directly beneath an observer.

Aim a phone out of an aircraft window and it names the ground below. With the
radio off, because the whole atlas is already on the device. And it shows you
how wrong it might be, instead of a pin it cannot justify.

## Why it is not a map app

Three constraints decide the whole build:

- **No network at cruise.** Not slow. None.
- **No trustworthy compass.** A magnetometer inside an aluminium tube is off by
  fifteen degrees or worse.
- **Brutal angular sensitivity.** At a 300 km slant range, one degree is five
  kilometres of ground.

So heading does not come from the magnetometer. It comes from differentiating
consecutive GPS fixes, which gives course over ground to about half a degree.
Turning that into the *phone's* heading uses the one geometric fact a cabin
gives away free: a window is perpendicular to the direction of flight.

## The engine

```
src/engine/geo.js           spherical ray-cast, refraction, and its inverse
src/engine/uncertainty.js   error propagation to a ground ellipse
src/engine/atlas.js         offline pack, spatial index, resolver
src/engine/sensors.js       GPS, orientation, track-derived heading
src/engine/replay.js        scripted flight, identical observer shape
```

The ray-cast is solved on a sphere, not with `h / tan(depression)`. At the
horizon the flat approximation is out by a factor of two. It returns `null`
when the ray clears the limb rather than inventing a ground point.

```bash
npm run test:geo
```

The tests print the measurement the product is built on: one thousandth of a
degree near the horizon is worth **9.9 km** of ground, while the identical
movement at 60° down is worth **0.3 m**.

## The resolver

It does not answer "what is nearest". It answers "what is the most specific
thing I am entitled to say, given how wrong I might be". A feature only
qualifies if it is at least as large as the error radius.

```
on the Krishna   ±1 km → Krishna (river)   ±5 → Eastern Ghats   ±250 → India
over Delhi       ±1 km → New Delhi         ±20 → Delhi          ±80  → Ganges Plain
Everest          ±1 km → Mount Everest      ±80 → Himalayas
Vizag            ±1 km → Vishakhapatnam     ±20 → Bay of Bengal
```

## The pack

**1.09 MB gzipped for the entire planet**, 13,394 named features, built from
Natural Earth (public domain).

```bash
npm run pack     # rebuilds public/pack/world.json and src/data/pack-stats.js
```

The site quotes its own figures from the generated stats module, so the copy
cannot drift away from the data.

Source GeoJSON is downloaded into `.ne/` and is gitignored. `npm run pack`
expects it; see `tools/build-pack.mjs` for the file list.

## Running it

```bash
npm install
npm run dev
npm run build
npm run casestudy:pdf
```

## Licence

The engine is MIT, see `LICENSE-engine`. The site, art direction and copy are
not. The engine is open because "we tell you when we do not know" is only worth
something if the error maths can be checked by someone who does not trust it.

Map data: [Natural Earth](https://www.naturalearthdata.com/), public domain.

Built by [made. by ac](https://made-by-ac.com).

## Deploy notes

`vercel.json` sets three cache policies that matter:

- **`/sw.js` is never cached.** A cached service worker is a site that can never
  be updated, because the copy telling the browser about the new build is itself
  stale.
- **`/assets/*` is immutable**, because Vite fingerprints those filenames.
- **`/pack/*` revalidates hourly and serves stale for a week** while it does.
  The atlas is not fingerprinted, and the service worker holds the offline copy
  anyway.
