/**
 * Builds the NADIR offline pack from Natural Earth (public domain).
 *
 * The pack is the whole premise of the product: at cruise altitude there is no
 * network, so every feature the resolver can name has to already be on the
 * device. Three primitives come out of this, because three different kinds of
 * question get asked of a point on the ground:
 *
 *   points  a city, a peak, a cape        -> match by radius
 *   polys   a sea, a desert, a state      -> match by containment
 *   lines   a river, a coastline          -> match by distance to the line
 *
 * Everything is rounded hard and simplified with Douglas-Peucker, because the
 * pack has to survive being carried in a phone with the radio switched off.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NE = path.join(HERE, '..', '.ne');
const OUT = path.join(HERE, '..', 'public', 'pack');

const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(NE, `${name}.geojson`), 'utf8'));

/* ------------------------------------------------------------------ utils */

const r3 = (n) => Math.round(n * 1e3) / 1e3;
const r4 = (n) => Math.round(n * 1e4) / 1e4;

/** Perpendicular distance in degree-space, with longitude scaled by latitude. */
function perpDist(p, a, b, kx) {
  const px = (p[0] - a[0]) * kx;
  const py = p[1] - a[1];
  const bx = (b[0] - a[0]) * kx;
  const by = b[1] - a[1];
  const len = bx * bx + by * by;
  if (len === 0) return Math.hypot(px, py);
  let t = (px * bx + py * by) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - bx * t, py - by * t);
}

/** Douglas-Peucker, iterative so a 40k-vertex coastline ring cannot blow the stack. */
function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const kx = Math.cos((pts[0][1] * Math.PI) / 180) || 1;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let far = -1;
    let best = tol;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(pts[i], pts[lo], pts[hi], kx);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far !== -1) {
      keep[far] = 1;
      stack.push([lo, far], [far, hi]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function bbox(rings) {
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  for (const ring of rings)
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  return [r3(w), r3(s), r3(e), r3(n)];
}

/** Every polygon/multipolygon flattened to a list of outer rings. */
function outerRings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p) => p[0]);
  return [];
}

function lineStrings(geom) {
  if (!geom) return [];
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  return [];
}

/**
 * Natural Earth stores 283 of its physical-region names in block capitals and
 * scatters double spaces through others. Shouting "GANGES PLAIN" at someone is
 * a data artefact, not a design decision, so it gets normalised here rather
 * than worked around in the interface.
 *
 * Diacritics are deliberately left alone. A handful of names are genuinely
 * mis-encoded upstream, but most are correct (Rhône, Paraná, São Francisco),
 * and stripping accents to fix the few would misspell the many.
 */
const MINOR = new Set(['of', 'the', 'and', 'de', 'del', 'la', 'le', 'du', 'des', 'el', 'al', 'da', 'do']);

const titleCase = (s) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w, i) =>
      i > 0 && MINOR.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(' ');

const clean = (s) => {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 3 && t === t.toUpperCase() && /[A-Z]/.test(t) ? titleCase(t) : t;
};

/* ------------------------------------------------------------------ points */

/**
 * Physical extent of a settlement, in km, from population.
 * Calibrated against two anchors: a 1M city reads about 16km across, a 20M
 * metro about 50km. This is the feature's real size, NOT the match tolerance.
 * The resolver widens it by the error ellipse at query time, which is the
 * distinction that keeps the confidence maths honest.
 */
const cityExtentKm = (pop) => {
  if (!pop || pop <= 0) return 3;
  return Math.min(45, Math.max(2, 8 * Math.pow(pop / 1e6, 0.4)));
};

function buildPoints() {
  const out = [];

  for (const f of read('ne_10m_populated_places').features) {
    const p = f.properties;
    const name = clean(p.NAME || p.NAMEASCII);
    if (!name) continue;
    const [x, y] = f.geometry.coordinates;
    out.push({
      n: name,
      k: 'city',
      y: r4(y),
      x: r4(x),
      r: r3(cityExtentKm(p.POP_MAX)),
      a: clean(p.ADM1NAME) || clean(p.ADM0NAME),
      c: clean(p.ADM0NAME),
      p: p.POP_MAX || 0,
    });
  }

  // Ranges, peaks, capes, peninsulas, islands: the things you actually notice
  // from a window seat but that no city layer contains.
  const KIND = {
    range: 'range',
    'range/mtn': 'range',
    peak: 'peak',
    cape: 'cape',
    peninsula: 'peninsula',
    island: 'island',
    'island group': 'island',
    isthmus: 'isthmus',
    plateau: 'plateau',
    depression: 'basin',
    valley: 'valley',
    delta: 'delta',
    gorge: 'gorge',
    pen: 'peninsula',
  };
  // Physical features have no population to size them, so extent comes from the
  // scalerank Natural Earth already assigns by prominence.
  const rankExtentKm = (rank) => Math.min(400, Math.max(12, 320 / (rank || 4)));

  for (const f of read('ne_10m_geography_regions_points').features) {
    const p = f.properties;
    const name = clean(p.name);
    if (!name) continue;
    const fc = clean(p.featurecla).toLowerCase();
    const kind = KIND[fc] || 'landform';
    const y = p.lat_y ?? f.geometry.coordinates[1];
    const x = p.long_x ?? f.geometry.coordinates[0];
    out.push({
      n: name,
      k: kind,
      y: r4(y),
      x: r4(x),
      r: r3(rankExtentKm(p.scalerank)),
      a: clean(p.subregion) || clean(p.region),
      c: '',
      p: 0,
    });
  }

  // Named summits. A peak is the one feature class that is genuinely easier to
  // identify from 11km up than from the ground, so it earns its place.
  for (const f of read('ne_10m_geography_regions_elevation_points').features) {
    const p = f.properties;
    const name = clean(p.name);
    if (!name) continue;
    out.push({
      n: name,
      k: 'peak',
      y: r4(p.lat_y ?? f.geometry.coordinates[1]),
      x: r4(p.long_x ?? f.geometry.coordinates[0]),
      // A summit is a point, not a province. Keep the match radius tight so a
      // peak only wins when the ray genuinely lands on the massif.
      r: r3(Math.min(25, Math.max(5, rankExtentKm(p.scalerank) * 0.12))),
      a: clean(p.subregion) || clean(p.region),
      c: '',
      p: 0,
      e: p.elevation || 0,
    });
  }

  return out;
}

/* ------------------------------------------------------------------- polys */

function buildPolys() {
  const out = [];

  const push = (name, kind, geom, tol, extra = {}) => {
    if (!name) return;
    const rings = outerRings(geom)
      .map((ring) => simplify(ring, tol).map(([x, y]) => [r3(x), r3(y)]))
      .filter((ring) => ring.length >= 4);
    if (!rings.length) return;
    out.push({ n: name, k: kind, b: bbox(rings), g: rings, ...extra });
  };

  // Seas, bays, gulfs, straits. Over water this is usually the only honest
  // answer available, and it is a genuinely useful one.
  for (const f of read('ne_50m_geography_marine_polys').features)
    push(clean(f.properties.name), 'marine', f.geometry, 0.08);

  // Ranges, deserts, plateaus, deltas, basins. Natural Earth stores these as
  // polygons rather than points, which is the right shape for the question:
  // you are not near the Western Ghats, you are over them. Keeping the real
  // feature class matters because "Krishna Delta (delta)" is an answer and
  // "Krishna Delta (region)" is a shrug.
  const REGION_KIND = {
    'range/mtn': 'range',
    desert: 'desert',
    plateau: 'plateau',
    delta: 'delta',
    basin: 'basin',
    valley: 'valley',
    gorge: 'gorge',
    plain: 'plain',
    lowland: 'plain',
    foothills: 'foothills',
    tundra: 'tundra',
    wetlands: 'wetlands',
    isthmus: 'isthmus',
    peninsula: 'peninsula',
    'pen/cape': 'peninsula',
    coast: 'coast',
    island: 'island',
    'island group': 'island',
    continent: 'continent',
    geoarea: 'geoarea',
    lake: 'lake',
  };
  for (const f of read('ne_50m_geography_regions_polys').features) {
    const p = f.properties;
    const fc = clean(p.FEATURECLA || p.featurecla).toLowerCase();
    push(clean(p.NAME || p.name), REGION_KIND[fc] || 'region', f.geometry, 0.08);
  }

  for (const f of read('ne_50m_lakes').features)
    push(clean(f.properties.name), 'lake', f.geometry, 0.05);

  // Admin layers are the graceful-degradation path. When the error ellipse is
  // too wide to name a landmark, the app should still be able to say which
  // state you are over instead of inventing precision it does not have.
  for (const f of read('ne_50m_admin_1_states_provinces').features) {
    const p = f.properties;
    push(clean(p.name), 'admin1', f.geometry, 0.06, { c: clean(p.admin) });
  }

  for (const f of read('ne_50m_admin_0_countries').features) {
    const p = f.properties;
    push(clean(p.NAME || p.name), 'country', f.geometry, 0.08);
  }

  return out;
}

/* ------------------------------------------------------------------- lines */

function buildLines() {
  const out = [];

  for (const f of read('ne_10m_rivers_lake_centerlines').features) {
    // name_en first: Natural Earth's local `name` gives "El Bahr el Azraq"
    // where the English field gives "Blue Nile". On a chart you want the name
    // a passenger would recognise.
    const name = clean(f.properties.name_en || f.properties.name);
    if (!name) continue;
    for (const ls of lineStrings(f.geometry)) {
      const pts = simplify(ls, 0.03).map(([x, y]) => [r3(x), r3(y)]);
      if (pts.length < 2) continue;
      out.push({ n: name, k: 'river', b: bbox([pts]), g: pts });
    }
  }

  // The coastline is unnamed, but it is the single most recognisable thing
  // from a window and it anchors the chart drawing.
  for (const f of read('ne_50m_coastline').features)
    for (const ls of lineStrings(f.geometry)) {
      const pts = simplify(ls, 0.04).map(([x, y]) => [r3(x), r3(y)]);
      if (pts.length < 2) continue;
      out.push({ n: 'Coastline', k: 'coast', b: bbox([pts]), g: pts });
    }

  return out;
}

/* -------------------------------------------------------------------- main */

fs.mkdirSync(OUT, { recursive: true });

const pack = {
  v: 1,
  built: new Date().toISOString().slice(0, 10),
  source: 'Natural Earth 1.5.0 (public domain)',
  points: buildPoints(),
  polys: buildPolys(),
  lines: buildLines(),
};

const file = path.join(OUT, 'world.json');
fs.writeFileSync(file, JSON.stringify(pack));

/**
 * Emit the headline numbers as a module the site imports.
 *
 * The site quotes the pack size and feature counts in its own copy, and those
 * numbers had already drifted once when the point layers were upgraded and the
 * hero went on claiming the old figures. Generating them here means the claim
 * cannot be wrong: change the pack, the copy changes with it.
 */
const gzipSize = zlib.gzipSync(fs.readFileSync(file)).length;
const counts = {};
for (const p of pack.points) counts[p.k] = (counts[p.k] || 0) + 1;
for (const p of pack.polys) counts[p.k] = (counts[p.k] || 0) + 1;
for (const l of pack.lines) counts[l.k] = (counts[l.k] || 0) + 1;

const stats = {
  built: pack.built,
  bytesRaw: fs.statSync(file).size,
  bytesGzip: gzipSize,
  gzipMB: (gzipSize / 1e6).toFixed(2),
  points: pack.points.length,
  polys: pack.polys.length,
  lines: pack.lines.length,
  total: pack.points.length + pack.polys.length + pack.lines.length,
  counts,
};

fs.writeFileSync(
  path.join(HERE, '..', 'src', 'data', 'pack-stats.js'),
  `// Generated by tools/build-pack.mjs. Do not edit by hand.\n` +
    `// Regenerate with \`npm run pack\`.\n` +
    `export const PACK = ${JSON.stringify(stats, null, 2)};\n`
);

const vertices =
  pack.polys.reduce((a, p) => a + p.g.reduce((b, r) => b + r.length, 0), 0) +
  pack.lines.reduce((a, l) => a + l.g.length, 0);

const kinds = {};
for (const p of pack.points) kinds[p.k] = (kinds[p.k] || 0) + 1;
for (const p of pack.polys) kinds[p.k] = (kinds[p.k] || 0) + 1;
for (const l of pack.lines) kinds[l.k] = (kinds[l.k] || 0) + 1;

console.log(`pack      ${(fs.statSync(file).size / 1e6).toFixed(2)} MB  ${file}`);
console.log(`points    ${pack.points.length}`);
console.log(`polys     ${pack.polys.length}`);
console.log(`lines     ${pack.lines.length}`);
console.log(`vertices  ${vertices.toLocaleString()}`);
console.log('kinds    ', kinds);
