/**
 * The atlas: the offline pack, an index over it, and the resolver.
 *
 * The resolver's job is not "what is the nearest thing". It is "what is the
 * most specific thing I am entitled to say, given how wrong I might be". Those
 * are different questions and only the second one is honest. Handed a point
 * with a 200 km error, naming a town would be a coin flip dressed as an
 * answer; naming the state it sits in is true. So the resolver takes a
 * tolerance, and a feature only qualifies if it is large enough to survive it.
 *
 * That single rule is what produces the graceful degradation:
 *
 *   tight ellipse  ->  Krishna Delta
 *   wider          ->  Coastal Andhra Pradesh
 *   wider still    ->  Bay of Bengal
 *   past the limb  ->  we do not know
 */

import { haversineKm } from './geo.js';

const CELL = 4; // degrees; index granularity

/* --------------------------------------------------------------- geometry */

/** Ray-casting point-in-polygon in degree space. */
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const inBbox = (lon, lat, b, pad = 0) =>
  lon >= b[0] - pad && lon <= b[2] + pad && lat >= b[1] - pad && lat <= b[3] + pad;

/** Shoelace area in km^2, longitude scaled by latitude. */
function ringAreaKm2(ring) {
  const latMid = (ring[0][1] + ring[Math.floor(ring.length / 2)][1]) / 2;
  const kx = 111.32 * Math.cos((latMid * Math.PI) / 180);
  const ky = 110.57;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky);
  }
  return Math.abs(a / 2);
}

/** Shortest distance from a point to a polyline, in km. */
function distToLineKm(lat, lon, pts) {
  let best = Infinity;
  const kx = Math.cos((lat * Math.PI) / 180);
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const dx = (x2 - x1) * kx;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy;
    let t = len ? (((lon - x1) * kx * dx + (lat - y1) * dy) / len) : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot((lon - (x1 + (x2 - x1) * t)) * kx, lat - (y1 + (y2 - y1) * t));
    if (d < best) best = d;
  }
  return best * 111.32;
}

/* ------------------------------------------------------------------ atlas */

/**
 * How specific each feature class is allowed to sound. Lower is more
 * specific. Used only to break ties between features of similar size, so that
 * "Hyderabad" beats "Telangana" when both are equally defensible.
 */
const SPECIFICITY = {
  peak: 0, city: 1, delta: 2, gorge: 2, lake: 3, river: 3, cape: 3,
  volcano: 3, valley: 4, range: 4, island: 4, plateau: 5, desert: 5,
  basin: 5, foothills: 5, wetlands: 5, plain: 6, coast: 6, peninsula: 6,
  isthmus: 6, tundra: 6, landform: 6, admin1: 7, marine: 8, region: 8,
  country: 9, geoarea: 10, continent: 11,
};

const spec = (k) => SPECIFICITY[k] ?? 6;

export class Atlas {
  constructor(pack) {
    this.pack = pack;
    this.points = pack.points;
    this.polys = pack.polys;
    this.lines = pack.lines;

    // Characteristic radius of each polygon, so the resolver can ask how big a
    // feature is without re-measuring it every frame.
    for (const p of this.polys) {
      if (p._r === undefined) {
        const area = p.g.reduce((a, r) => a + ringAreaKm2(r), 0);
        p._r = Math.sqrt(area / Math.PI);
        p._area = area;
      }
    }

    this.index = { pt: new Map(), poly: new Map(), line: new Map() };
    this.#build();
  }

  #put(map, key, i) {
    let a = map.get(key);
    if (!a) map.set(key, (a = []));
    a.push(i);
  }

  #build() {
    this.points.forEach((p, i) => {
      this.#put(this.index.pt, `${Math.floor(p.y / CELL)}:${Math.floor(p.x / CELL)}`, i);
    });

    const spread = (b, map, i) => {
      const y0 = Math.floor(b[1] / CELL);
      const y1 = Math.floor(b[3] / CELL);
      const x0 = Math.floor(b[0] / CELL);
      const x1 = Math.floor(b[2] / CELL);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) this.#put(map, `${y}:${x}`, i);
    };

    this.polys.forEach((p, i) => spread(p.b, this.index.poly, i));
    this.lines.forEach((l, i) => spread(l.b, this.index.line, i));
  }

  /** Feature indices in the cells covering a point plus a padding radius. */
  #near(map, lat, lon, padDeg) {
    const out = new Set();
    const y0 = Math.floor((lat - padDeg) / CELL);
    const y1 = Math.floor((lat + padDeg) / CELL);
    const x0 = Math.floor((lon - padDeg) / CELL);
    const x1 = Math.floor((lon + padDeg) / CELL);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const a = map.get(`${y}:${x}`);
        if (a) for (const i of a) out.add(i);
      }
    return out;
  }

  /**
   * Everything that plausibly sits at this point, with how far off-centre it
   * is and how big it is. Unfiltered: `resolve` decides what may be said.
   *
   * The search radius is deliberately NOT the tolerance. Tying the two
   * together inverts the whole product: a tighter fix would sweep a smaller
   * area, find fewer candidates, and therefore return a vaguer answer than a
   * sloppy one. Search wide, then let `resolve` decide what the error budget
   * entitles you to say.
   */
  candidates(lat, lon, tolKm) {
    const found = [];
    const searchKm = Math.max(120, tolKm * 1.5);
    const padDeg = Math.min(20, searchKm / 111 + 0.5);

    for (const i of this.#near(this.index.pt, lat, lon, padDeg)) {
      const p = this.points[i];
      const d = haversineKm(lat, lon, p.y, p.x);
      if (d > p.r + searchKm) continue;
      found.push({
        name: p.n, kind: p.k, lat: p.y, lon: p.x,
        sizeKm: p.r, offKm: d, admin: p.a, country: p.c,
        population: p.p, elevation: p.e, contains: d <= p.r,
      });
    }

    for (const i of this.#near(this.index.poly, lat, lon, 0)) {
      const p = this.polys[i];
      if (!inBbox(lon, lat, p.b)) continue;
      if (!p.g.some((ring) => pointInRing(lon, lat, ring))) continue;
      found.push({
        name: p.n, kind: p.k, lat, lon,
        sizeKm: p._r, offKm: 0, admin: '', country: p.c || '',
        areaKm2: p._area, contains: true,
      });
    }

    for (const i of this.#near(this.index.line, lat, lon, padDeg)) {
      const l = this.lines[i];
      // Coastline segments are unnamed drawing geometry. They are the most
      // recognisable thing out of a window and the least useful thing to be
      // told, because "Coastline" is not a place. The chart renderer reads
      // them straight off the atlas; the resolver never offers them.
      if (l.k === 'coast') continue;
      if (!inBbox(lon, lat, l.b, padDeg)) continue;
      const d = distToLineKm(lat, lon, l.g);
      if (d > searchKm) continue;
      // A river's size is its width, roughly, and emphatically not how far
      // away from it you happen to be. Deriving one from the other made
      // distant rivers look like enormous features and win on rank.
      found.push({
        name: l.n, kind: l.k, lat, lon,
        sizeKm: 3, offKm: d, admin: '', country: '',
        contains: d <= 3,
      });
    }

    return found;
  }

  /**
   * The answer, and the reason it is that answer.
   *
   * @param {number} lat
   * @param {number} lon
   * @param {number} tolKm  the larger semi-axis of the error ellipse
   */
  resolve(lat, lon, tolKm) {
    const all = this.candidates(lat, lon, tolKm);
    if (!all.length) {
      return { primary: null, context: [], all: [], reason: 'nothing in the pack covers this point' };
    }

    // Two independent gates, and a feature has to pass both.
    //
    // Reachable: could the true point actually be inside it? A river 10 km
    // away is not the answer when the error is 2 km, because at that
    // precision you know you are not over it.
    //
    // Sayable: is it big enough to be distinguishable at this error? A
    // feature has to be at least as large as the error radius. Anything
    // smaller cannot be told apart from its neighbours, so choosing it would
    // be a guess set in a confident font.
    const reachable = all.filter((c) => c.offKm <= c.sizeKm + tolKm);
    const sayable = reachable.filter((c) => c.sizeKm >= tolKm);

    const rank = (a, b) => {
      // Prefer whatever is genuinely smaller, then whatever is more specific,
      // then whatever is closest to the resolved point.
      const sa = a.sizeKm + a.offKm;
      const sb = b.sizeKm + b.offKm;
      if (Math.abs(sa - sb) > Math.max(sa, sb) * 0.25) return sa - sb;
      if (spec(a.kind) !== spec(b.kind)) return spec(a.kind) - spec(b.kind);
      return a.offKm - b.offKm;
    };

    const pool = sayable.length
      ? sayable
      : reachable.filter((c) => c.contains).length
        ? reachable.filter((c) => c.contains)
        : all.filter((c) => c.contains);

    const ordered = [...(pool.length ? pool : all)].sort(rank);
    const primary = ordered[0] ?? null;

    // Context is the ladder above the answer: the larger things that also
    // contain the point, so the interface can say where the place sits.
    // Deduplicated case-insensitively, because Natural Earth ships both a
    // country called "India" and a geoarea called "India".
    const seen = new Set([primary?.name.toLowerCase()]);
    const context = all
      .filter((c) => c !== primary && c.contains && c.sizeKm > (primary?.sizeKm ?? 0))
      .sort((a, b) => a.sizeKm - b.sizeKm)
      .filter((c) => {
        const k = c.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 3);

    return {
      primary,
      context,
      all: ordered.slice(0, 8),
      degraded: !sayable.length,
      reason: sayable.length
        ? `${sayable.length} feature(s) larger than the ${tolKm.toFixed(1)} km error radius`
        : `no feature survives a ${tolKm.toFixed(1)} km error radius, falling back to what contains the point`,
    };
  }
}

/** Fetch and index the pack. */
export async function loadAtlas(url = '/pack/world.json', onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pack ${res.status}`);

  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress) {
    return new Atlas(await res.json());
  }

  // Stream it so the loading state can show the pack arriving. The pack is the
  // product's central claim, so watching it land is worth the few extra lines.
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(total ? got / total : null, got);
  }
  const buf = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.length;
  }
  return new Atlas(JSON.parse(new TextDecoder().decode(buf)));
}
