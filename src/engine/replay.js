/**
 * A flight, for everyone who is not currently on one.
 *
 * This exists so the demo is honest on a desktop. It does not fake results: it
 * fakes only the two things a laptop genuinely cannot supply, a position at
 * altitude and a direction of flight. Everything downstream, the ray-cast, the
 * error propagation and the resolver, runs on this exactly as it runs on live
 * sensors, and it emits the identical observer shape. If the engine were
 * wrong, the replay would be wrong in precisely the same way.
 *
 * The route is real. Bengaluru to Delhi crosses the Deccan, the Godavari, the
 * Narmada, the Vindhyas and the Gangetic plain in under three hours, which
 * makes it a good demonstration of the resolver changing its mind.
 */

import { interpolate, bearingTo, haversineKm, norm360 } from './geo.js';

export const ROUTES = {
  'blr-del': {
    id: 'blr-del',
    name: 'Bengaluru to Delhi',
    from: { code: 'BLR', name: 'Kempegowda', lat: 13.1986, lon: 77.7066 },
    to: { code: 'DEL', name: 'Indira Gandhi', lat: 28.5562, lon: 77.1 },
    cruiseAltitude: 11278, // FL370
    minutes: 165,
  },
  'bom-ccu': {
    id: 'bom-ccu',
    name: 'Mumbai to Kolkata',
    from: { code: 'BOM', name: 'Chhatrapati Shivaji', lat: 19.0887, lon: 72.8679 },
    to: { code: 'CCU', name: 'Netaji Subhas', lat: 22.6547, lon: 88.4467 },
    cruiseAltitude: 11887, // FL390
    minutes: 155,
  },
  'del-dxb': {
    id: 'del-dxb',
    name: 'Delhi to Dubai',
    from: { code: 'DEL', name: 'Indira Gandhi', lat: 28.5562, lon: 77.1 },
    to: { code: 'DXB', name: 'Dubai Intl', lat: 25.2532, lon: 55.3657 },
    cruiseAltitude: 11887,
    minutes: 220,
  },
};

/**
 * Altitude at a given fraction of the route.
 *
 * Modelled rather than held flat because the horizon distance goes with the
 * square root of altitude, so the whole error picture breathes during climb
 * and descent. Watching the confidence tighten as the aircraft comes down is
 * one of the more persuasive things the demo does.
 */
function altitudeAt(p, cruise) {
  const CLIMB = 0.11;
  const DESCENT = 0.86;
  if (p < CLIMB) {
    // Smooth acceleration out of the field rather than a straight ramp.
    const t = p / CLIMB;
    return 300 + (cruise - 300) * (1 - Math.pow(1 - t, 2.2));
  }
  if (p > DESCENT) {
    const t = (p - DESCENT) / (1 - DESCENT);
    return 300 + (cruise - 300) * Math.pow(1 - t, 1.7);
  }
  return cruise;
}

export class Replay {
  constructor(routeId = 'blr-del', onUpdate) {
    this.route = ROUTES[routeId] ?? ROUTES['blr-del'];
    this.onUpdate = onUpdate;

    this.distanceKm = haversineKm(
      this.route.from.lat,
      this.route.from.lon,
      this.route.to.lat,
      this.route.to.lon
    );

    // Where along the route, 0 to 1.
    this.progress = 0.42;
    // Where the passenger is aiming: degrees off the aircraft's nose, and
    // degrees below level. Starting on the left window looking well down.
    this.relativeBearing = -90;
    this.depression = 22;

    this.playing = false;
    this._raf = 0;
    this._last = 0;
    this.speed = 260; // demo minutes per real minute
  }

  get name() {
    return this.route.name;
  }

  /** The observer, in the same shape the live rig emits. */
  sample() {
    const p = Math.min(1, Math.max(0, this.progress));
    const { from, to } = this.route;

    const here = interpolate(from.lat, from.lon, to.lat, to.lon, p);
    // Track from a short forward step along the same great circle, which is
    // the same measurement the live rig makes from consecutive GPS fixes.
    const ahead = interpolate(from.lat, from.lon, to.lat, to.lon, Math.min(1, p + 0.004));
    const track = norm360(bearingTo(here.lat, here.lon, ahead.lat, ahead.lon));

    return {
      source: 'replay',
      ready: true,
      lat: here.lat,
      lon: here.lon,
      altitude: altitudeAt(p, this.route.cruiseAltitude),
      accuracyM: 10,
      gpsSpeed: 240,
      track,
      trackQuality: { baselineKm: 4, seconds: 16 },
      turning: false,
      depression: this.depression,
      relAzimuth: null,
      bearing: norm360(track + this.relativeBearing),
      calibrated: true,
      compassRaw: null,
      error: null,
      // Replay-only extras, for the flight strip.
      progress: p,
      remainingKm: this.distanceKm * (1 - p),
      routeName: this.route.name,
      from: this.route.from,
      to: this.route.to,
    };
  }

  #emit() {
    this.onUpdate?.(this.sample());
  }

  /** Aim the virtual phone. Both values are clamped to what a seat allows. */
  aim({ relativeBearing, depression }) {
    if (relativeBearing !== undefined) {
      // A window seat cannot see across the aisle and out the far side, so the
      // demo does not pretend it can.
      const side = Math.sign(this.relativeBearing) || -1;
      this.relativeBearing = Math.max(
        side < 0 ? -160 : 20,
        Math.min(side < 0 ? -20 : 160, relativeBearing)
      );
    }
    if (depression !== undefined) {
      this.depression = Math.max(0.5, Math.min(89, depression));
    }
    this.#emit();
  }

  setSide(side) {
    this.relativeBearing = side === 'left' ? -90 : 90;
    this.#emit();
  }

  seek(p) {
    this.progress = Math.min(1, Math.max(0, p));
    this.#emit();
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this._last = performance.now();

    const tick = (now) => {
      if (!this.playing) return;
      const dt = (now - this._last) / 1000;
      this._last = now;
      // Advance by the compressed clock, and loop rather than stop, so the
      // demo never dead-ends on an arrivals gate.
      this.progress += (dt * this.speed) / (this.route.minutes * 60);
      if (this.progress >= 1) this.progress = 0.04;
      this.#emit();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this._raf);
  }

  stop() {
    this.pause();
  }
}
