/**
 * How wrong is the answer?
 *
 * This module exists because the honest version of NADIR is not a pin on a map.
 * A pin claims a precision the sensors cannot deliver. What the physics
 * actually supports is an ellipse, and the ellipse is wildly asymmetric: it is
 * narrow across the look direction and enormously long along it, because
 * ground distance is violently sensitive to look-down angle near the horizon
 * and barely sensitive at all beneath you.
 *
 * Everything the interface says is downstream of the numbers here. When the
 * ellipse is small the app names a delta. When it is large it names a state.
 * When it is larger still it says it does not know, which is a feature.
 */

import { castRay, horizonDip, toRad } from './geo.js';

/**
 * One-sigma sensor error budgets.
 *
 * The headline finding is that position barely matters and angle is
 * everything. GPS puts the aircraft within about 10 metres. One degree of
 * heading error at a 380 km slant range puts the answer 6.6 kilometres away.
 * The error budget is an angle problem wearing a location problem's clothes.
 */
export const SIGMA = {
  /**
   * Raw magnetometer, inside an aluminium tube, beside a seat-back screen and
   * a few hundred other phones. This is not a sensor, it is a rumour.
   */
  compassRaw: 15,

  /**
   * Heading taken instead from the GPS track: differentiate consecutive fixes
   * and you get the aircraft's course over ground to a fraction of a degree,
   * with no magnetic interference at all. This single substitution is worth
   * more than every other correction in the product combined.
   */
  trackDerived: 0.5,

  /** Pitch from the gravity vector in still air. */
  pitchCalm: 1.0,

  /** Pitch in turbulence, where the gravity vector is being shaken. */
  pitchRough: 3.0,

  /** GPS altitude. Barometric would be better, but the browser cannot have it. */
  altitudeM: 30,

  /** GPS horizontal position at altitude, with an unobstructed view of the sky. */
  positionM: 10,
};

/** Ground distance for a given depression, or null past the limb. */
function ground(altitude, depression) {
  const r = castRay({ lat: 0, lon: 0, altitude, bearing: 0, depression });
  return r ? r.groundKm : null;
}

/**
 * Propagate the sensor errors into a ground-space error ellipse.
 *
 * Along-track error comes from partial derivatives taken numerically, because
 * the analytic derivative of the limb term is unpleasant and the numerical one
 * is exact enough at these magnitudes. Cross-track error is simply the arc a
 * bearing error subtends at the resolved range.
 *
 * @returns {{alongKm, crossKm, areaKm2, capped, dDistDDepression}}
 */
export function errorEllipse({
  altitude,
  depression,
  groundKm,
  sigmaBearing = SIGMA.trackDerived,
  sigmaPitch = SIGMA.pitchCalm,
  sigmaAltitudeM = SIGMA.altitudeM,
  sigmaPositionM = SIGMA.positionM,
}) {
  const dip = horizonDip(altitude);

  // Along-track: d(ground distance) / d(depression), by central difference.
  // Step small enough to be local, large enough to stay off the floating-point
  // noise floor near the limb where the function is near-vertical.
  const h = 0.002;
  const lo = ground(altitude, depression + h);
  const hi = ground(altitude, depression - h);

  let alongKm;
  let capped = false;
  let slope = null;

  if (lo === null || hi === null) {
    // The one-sigma cone already straddles the horizon. There is no meaningful
    // upper bound on distance any more: the answer is "somewhere out to the
    // limb", and pretending otherwise would be a lie with a decimal point.
    capped = true;
    alongKm = Infinity;
  } else {
    slope = Math.abs((lo - hi) / (2 * h)); // km per degree
    const fromPitch = slope * sigmaPitch;

    // Altitude sensitivity, same treatment.
    const ha = 25;
    const a1 = ground(altitude + ha, depression);
    const a0 = ground(altitude - ha, depression);
    const fromAlt =
      a1 !== null && a0 !== null
        ? Math.abs((a1 - a0) / (2 * ha)) * sigmaAltitudeM
        : 0;

    alongKm = Math.hypot(fromPitch, fromAlt, sigmaPositionM / 1000);

    // Even inside the limb the along-track figure can exceed the distance to
    // the horizon, which is physically meaningless. Clamp it there.
    const toHorizon = ground(altitude, dip + 1e-6);
    if (toHorizon !== null && alongKm > toHorizon) {
      alongKm = toHorizon;
      capped = true;
    }
  }

  // Cross-track: a bearing error subtends an arc at the resolved range.
  const crossKm = Math.hypot(groundKm * toRad(sigmaBearing), sigmaPositionM / 1000);

  return {
    alongKm,
    crossKm,
    areaKm2: Number.isFinite(alongKm) ? Math.PI * alongKm * crossKm : Infinity,
    capped,
    dDistDDepression: slope,
  };
}

/**
 * Confidence bands.
 *
 * These thresholds decide how specific the interface is allowed to be. They
 * are the mechanism that stops the product from being confidently wrong: the
 * resolver is handed a tolerance, not a point, and it may only return a
 * feature large enough to survive that tolerance.
 */
export const BANDS = [
  { id: 'pinned', maxKm: 4, label: 'Pinned', note: 'Specific enough to name a landmark.' },
  { id: 'confident', maxKm: 20, label: 'Confident', note: 'Good enough for a town or a river.' },
  { id: 'approximate', maxKm: 80, label: 'Approximate', note: 'A region, not a place.' },
  { id: 'coarse', maxKm: 300, label: 'Coarse', note: 'A state, a sea, a desert.' },
  { id: 'unresolved', maxKm: Infinity, label: 'Unresolved', note: 'Too close to the horizon to say.' },
];

/** The band a given ellipse falls into, using its longer axis. */
export function bandFor(ellipse) {
  const worst = Math.max(
    Number.isFinite(ellipse.alongKm) ? ellipse.alongKm : Infinity,
    ellipse.crossKm
  );
  return BANDS.find((b) => worst <= b.maxKm) ?? BANDS[BANDS.length - 1];
}

/**
 * A full fix: cast the ray, then describe how much to trust it.
 * Returns null only when the ray never meets the ground.
 */
export function computeFix(observer, sigma = {}) {
  const ray = castRay(observer);
  if (!ray) return null;

  const ellipse = errorEllipse({
    altitude: observer.altitude,
    depression: observer.depression,
    groundKm: ray.groundKm,
    ...sigma,
  });

  return { ...ray, ellipse, band: bandFor(ellipse) };
}
