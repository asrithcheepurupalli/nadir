/**
 * The geometry NADIR runs on.
 *
 * The question is always the same: an observer sits at a known position, at a
 * known altitude, looking along a known bearing at a known angle below the
 * horizontal. Where does that line of sight meet the ground?
 *
 * A flat earth answers d = h / tan(depression). That answer is fine for a
 * drone and useless for an airliner. At 11,300m the horizon is 380km away, and
 * as the depression angle approaches the horizon the flat-earth answer runs off
 * to infinity while the real one converges on the limb. Everything below solves
 * it on a sphere instead, which is what makes the near-horizon behaviour, and
 * therefore the uncertainty behaviour, tell the truth.
 */

export const R_EARTH = 6371008.8; // IUGG mean radius, metres

/**
 * Effective-radius approximation for atmospheric refraction. Light bends
 * downwards through the density gradient, so the geometric horizon sits
 * slightly further away than a vacuum sphere predicts. Surveyors use k = 1.13
 * for optical work; radio uses 4/3. Ignoring it costs a few km at cruise, which
 * is small next to the compass error but free to correct.
 */
export const REFRACTION_K = 1.13;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const toRad = (d) => d * D2R;
export const toDeg = (r) => r * R2D;

/** Wrap to [0, 360). */
export const norm360 = (d) => ((d % 360) + 360) % 360;

/** Wrap to (-180, 180]. */
export const norm180 = (d) => {
  const x = norm360(d);
  return x > 180 ? x - 360 : x;
};

/* -------------------------------------------------------------- horizon */

/**
 * How far below the horizontal the horizon sits, in degrees, for an observer
 * at altitude. At cruise this is only about 3.4 degrees, which is the single
 * most counter-intuitive number in the whole product: the entire visible world
 * from a window seat is compressed into a few degrees of look-down angle, and
 * every one of those degrees is worth tens of kilometres on the ground.
 */
export function horizonDip(altitudeM, { refraction = true } = {}) {
  const R = R_EARTH * (refraction ? REFRACTION_K : 1);
  return toDeg(Math.acos(R / (R + Math.max(0, altitudeM))));
}

/** Great-circle distance to the horizon, in metres. */
export function horizonDistance(altitudeM, { refraction = true } = {}) {
  const R = R_EARTH * (refraction ? REFRACTION_K : 1);
  return R * toRad(horizonDip(altitudeM, { refraction }));
}

/* ------------------------------------------------------------- ray cast */

/**
 * Central angle subtended between the observer's nadir and the point where a
 * ray at `depressionDeg` below horizontal strikes the sphere.
 *
 * Triangle: O is the earth's centre, A the observer at radius r = R + h, P the
 * ground intersection at radius R.
 *
 *   angle OAP = 90 - depression          (ray measured off the downward vertical)
 *   sin(OPA)  = (r / R) * cos(depression) (law of sines)
 *
 * P is the near intersection, so OPA is obtuse and the central angle is
 *
 *   gamma = asin((r/R) * cos(dep)) + dep - 90
 *
 * Returns null when the ray passes above the limb, ie. when (r/R)cos(dep) > 1
 * and the asin has no solution. That is the correct answer for "you are looking
 * at the sky", and refusing to fabricate a ground point there is the whole
 * reason this is not a flat-earth approximation.
 */
export function centralAngleFor(altitudeM, depressionDeg, { refraction = true } = {}) {
  if (!(depressionDeg > 0)) return null; // level or looking up
  if (depressionDeg >= 90) return 0; // straight down: the nadir itself

  const R = R_EARTH * (refraction ? REFRACTION_K : 1);
  const r = R + Math.max(0, altitudeM);
  let s = (r / R) * Math.cos(toRad(depressionDeg));

  // A ray aimed exactly at the dip angle is grazing the limb, and there
  // s should be exactly 1. In floating point it lands a few ulps above,
  // which would send asin to NaN and make the app report "sky" for the one
  // aim that is precisely the horizon. Absorb that, and only that.
  if (s > 1) {
    if (s > 1 + 1e-12) return null; // genuinely clears the limb
    s = 1;
  }

  const gamma = Math.asin(s) + toRad(depressionDeg) - Math.PI / 2;
  return gamma > 0 ? gamma : 0;
}

/**
 * Destination point along a great circle: standard spherical direct problem.
 */
export function destination(lat, lon, bearingDeg, centralAngle) {
  const f1 = toRad(lat);
  const l1 = toRad(lon);
  const t = toRad(bearingDeg);
  const sd = Math.sin(centralAngle);
  const cd = Math.cos(centralAngle);
  const sf1 = Math.sin(f1);
  const cf1 = Math.cos(f1);

  const f2 = Math.asin(sf1 * cd + cf1 * sd * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * sd * cf1, cd - sf1 * Math.sin(f2));

  return { lat: toDeg(f2), lon: norm180(toDeg(l2)) };
}

/**
 * Cast a line of sight at the ground.
 *
 * @param {object} o
 * @param {number} o.lat        observer latitude, degrees
 * @param {number} o.lon        observer longitude, degrees
 * @param {number} o.altitude   metres above the surface
 * @param {number} o.bearing    true bearing of the look direction, degrees
 * @param {number} o.depression degrees below the horizontal
 * @returns {{lat, lon, groundKm, slantKm, centralAngle} | null}
 *          null when the ray never meets the ground.
 */
export function castRay({ lat, lon, altitude, bearing, depression }, opts = {}) {
  const gammaEff = centralAngleFor(altitude, depression, opts);
  if (gammaEff === null) return null;

  const refraction = opts.refraction !== false;
  const Reff = R_EARTH * (refraction ? REFRACTION_K : 1);

  // The effective-radius trick straightens the refracted ray by inflating the
  // sphere, so the arc it returns is measured on the inflated sphere. Convert
  // back to a true central angle before placing the point on the real globe,
  // otherwise the refraction correction quietly becomes a scaling error.
  const groundM = Reff * gammaEff;
  const gammaTrue = groundM / R_EARTH;

  const { lat: dLat, lon: dLon } = destination(lat, lon, bearing, gammaTrue);

  // Exact slant range by the law of cosines on the real sphere.
  const r = R_EARTH + Math.max(0, altitude);
  const slantM = Math.sqrt(
    r * r + R_EARTH * R_EARTH - 2 * r * R_EARTH * Math.cos(gammaTrue)
  );

  return {
    lat: dLat,
    lon: dLon,
    groundKm: groundM / 1000,
    slantKm: slantM / 1000,
    centralAngle: gammaTrue,
  };
}

/* ------------------------------------------------------------- measures */

/** Great-circle distance in km. */
export function haversineKm(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s))) / 1000;
}

/** Initial great-circle bearing from a to b, degrees. */
export function bearingTo(aLat, aLon, bLat, bLon) {
  const f1 = toRad(aLat);
  const f2 = toRad(bLat);
  const dl = toRad(bLon - aLon);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return norm360(toDeg(Math.atan2(y, x)));
}

/** Point at `fraction` along the great circle from a to b. */
export function interpolate(aLat, aLon, bLat, bLon, fraction) {
  const d = haversineKm(aLat, aLon, bLat, bLon) * 1000 / R_EARTH;
  if (d < 1e-9) return { lat: aLat, lon: aLon };
  const f1 = toRad(aLat);
  const l1 = toRad(aLon);
  const f2 = toRad(bLat);
  const l2 = toRad(bLon);
  const A = Math.sin((1 - fraction) * d) / Math.sin(d);
  const B = Math.sin(fraction * d) / Math.sin(d);
  const x = A * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2);
  const y = A * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2);
  const z = A * Math.sin(f1) + B * Math.sin(f2);
  return {
    lat: toDeg(Math.atan2(z, Math.hypot(x, y))),
    lon: toDeg(Math.atan2(y, x)),
  };
}

/** Shortest angular difference a to b, degrees, signed. */
export const angleDelta = (a, b) => norm180(b - a);

/* ----------------------------------------------------------- formatting */

/** Degrees and decimal minutes, the format on an aeronautical chart. */
export function formatLatLon(lat, lon) {
  const one = (v, pos, neg, pad) => {
    const hemi = v >= 0 ? pos : neg;
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = (a - d) * 60;
    return `${String(d).padStart(pad, '0')}°${m.toFixed(1).padStart(4, '0')}'${hemi}`;
  };
  return `${one(lat, 'N', 'S', 2)} ${one(lon, 'E', 'W', 3)}`;
}
