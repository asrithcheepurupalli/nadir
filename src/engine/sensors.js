/**
 * Reading the aircraft, and the phone, from a window seat.
 *
 * The central decision in this file is what to believe. A phone has a
 * magnetometer and it is tempting to use it, because it hands you a compass
 * bearing for free. Do not. Inside an aluminium tube, beside a seat-back
 * screen, a power bus and three hundred other phones, the magnetometer is not
 * a sensor, it is a rumour. Fifteen degrees of error is normal, and fifteen
 * degrees at a 300 km slant range is a hundred kilometres of ground.
 *
 * So heading comes from somewhere else entirely: differentiate consecutive GPS
 * fixes and you get the aircraft's course over ground to a fraction of a
 * degree, with no magnetic interference at all. An airliner in cruise flies a
 * very straight line very fast, which is the ideal case for that measurement.
 *
 * That gives the aircraft's heading. Turning it into the phone's heading needs
 * one known relationship between the two, and the cabin supplies it for free:
 * a window is perpendicular to the direction of flight. Hold the phone flat
 * against the glass, tap once, and the offset is solved.
 *
 * Depression is the easy half. It comes from the gravity vector, which is
 * absolute, needs no calibration, and does not care about magnetism.
 */

import { bearingTo, haversineKm, norm360, toRad, toDeg } from './geo.js';

/* ----------------------------------------------------------- orientation */

/**
 * World-frame direction the back camera is pointing, from the device's
 * orientation angles.
 *
 * Device frame: x right of the screen, y to the top, z out through the screen
 * towards the viewer. The back camera therefore looks along -z. The W3C
 * ordering is intrinsic Z-X'-Y'' (alpha, beta, gamma), which is the same
 * rotation three.js calls 'ZXY'.
 *
 * World frame here: x east, y north, z up.
 */
export function cameraVector(alphaDeg, betaDeg, gammaDeg) {
  const z = toRad(alphaDeg || 0);
  const x = toRad(betaDeg || 0);
  const y = toRad(gammaDeg || 0);

  const cX = Math.cos(x);
  const sX = Math.sin(x);
  const cY = Math.cos(y);
  const sY = Math.sin(y);
  const cZ = Math.cos(z);
  const sZ = Math.sin(z);

  // Third column of the ZXY rotation matrix is where device +z lands in the
  // world. The camera looks the other way, hence the negation.
  const m13 = cY * sZ * sX + cZ * sY;
  const m23 = sZ * sY - cZ * cY * sX;
  const m33 = cX * cY;

  return { east: -m13, north: -m23, up: -m33 };
}

/**
 * Degrees below the horizontal that the back camera is aimed.
 *
 * Derived from gravity alone, so it is trustworthy in a way the compass never
 * is. Held flat on a table with the screen up, this reads 90 (straight down).
 * Held upright like a photograph, it reads 0 (the horizon).
 */
export function depressionFrom(alphaDeg, betaDeg, gammaDeg) {
  const v = cameraVector(alphaDeg, betaDeg, gammaDeg);
  const len = Math.hypot(v.east, v.north, v.up) || 1;
  return toDeg(Math.asin(Math.min(1, Math.max(-1, -v.up / len))));
}

/**
 * The camera's azimuth in the device's own reference frame. Absolute only up
 * to whatever zero the magnetometer chose, which is exactly why it is never
 * used as a bearing directly. Its *changes* are gyro-driven and good, so it
 * carries rotation between calibrations.
 */
export function relativeAzimuthFrom(alphaDeg, betaDeg, gammaDeg) {
  const v = cameraVector(alphaDeg, betaDeg, gammaDeg);
  return norm360(toDeg(Math.atan2(v.east, v.north)));
}

/* ------------------------------------------------------------ GPS track */

/**
 * Course over ground from a short history of fixes.
 *
 * Not two fixes: two fixes at 900 km/h are 250 m apart per second and each
 * carries about 10 m of noise, which is 2 degrees of jitter. Taking the
 * bearing across a several-second baseline puts the noise a long way below the
 * signal. In cruise the aircraft is not turning, so the longer baseline costs
 * nothing in accuracy and buys a great deal in stability.
 */
export function trackFrom(history, minBaselineKm = 1.5) {
  if (history.length < 2) return null;

  const last = history[history.length - 1];
  for (let i = history.length - 2; i >= 0; i--) {
    const d = haversineKm(history[i].lat, history[i].lon, last.lat, last.lon);
    if (d >= minBaselineKm) {
      return {
        track: bearingTo(history[i].lat, history[i].lon, last.lat, last.lon),
        baselineKm: d,
        seconds: (last.t - history[i].t) / 1000,
      };
    }
  }
  return null;
}

/**
 * Is the aircraft turning?
 *
 * It matters more than it looks. In a coordinated turn the accelerometer reads
 * perpendicular to the wings rather than towards the centre of the earth, so
 * "down" is wrong by the bank angle and every depression measurement is
 * quietly corrupted. Rather than report a confident wrong answer, the app
 * should decline until the wings are level.
 */
export function turnRate(history) {
  if (history.length < 4) return 0;
  const n = history.length;
  const recent = trackFrom(history.slice(Math.floor(n / 2)), 0.5);
  const older = trackFrom(history.slice(0, Math.ceil(n / 2)), 0.5);
  if (!recent || !older) return 0;
  const dt = (history[n - 1].t - history[0].t) / 1000;
  if (dt <= 0) return 0;
  let d = recent.track - older.track;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return Math.abs(d / dt); // degrees per second
}

/* ------------------------------------------------------------- the rig */

const HISTORY_SECONDS = 20;

/**
 * Live sensor rig. Emits a single observer object of exactly the shape the
 * replay emits, so nothing downstream can tell them apart.
 */
export class Sensors {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.history = [];
    this.state = {
      source: 'live',
      ready: false,
      lat: null,
      lon: null,
      altitude: null,
      accuracyM: null,
      gpsSpeed: null,
      track: null,
      trackQuality: null,
      turning: false,
      depression: null,
      relAzimuth: null,
      bearing: null,
      calibrated: false,
      compassRaw: null,
      error: null,
    };

    this._watchId = null;
    this._onOrient = null;
    // Offset from the phone's own azimuth frame to true bearing, solved once
    // by the window calibration and then held.
    this._azimuthOffset = null;
  }

  #emit() {
    this.onUpdate?.({ ...this.state });
  }

  /* ---------------------------------------------------------- permissions */

  static get supported() {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.geolocation &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof DeviceOrientationEvent !== 'undefined'
    );
  }

  /**
   * iOS gates orientation behind an explicit grant that must happen inside a
   * user gesture. Call this from a click handler, never on load.
   */
  static async requestOrientationPermission() {
    const D = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null;
    if (!D) return 'unsupported';
    if (typeof D.requestPermission !== 'function') return 'granted'; // Android and desktop
    try {
      return await D.requestPermission();
    } catch {
      return 'denied';
    }
  }

  static async requestCamera() {
    // The rear camera, and a resolution the phone will actually sustain while
    // the resolver is also running.
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  }

  /* --------------------------------------------------------------- start */

  start() {
    this.#startGeolocation();
    this.#startOrientation();
  }

  #startGeolocation() {
    if (!navigator.geolocation) {
      this.state.error = 'no geolocation';
      return this.#emit();
    }

    this._watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, altitude, accuracy, speed } = pos.coords;
        const t = pos.timestamp || Date.now();

        this.history.push({ lat: latitude, lon: longitude, t });
        const cutoff = t - HISTORY_SECONDS * 1000;
        while (this.history.length > 2 && this.history[0].t < cutoff) this.history.shift();

        const tr = trackFrom(this.history);
        const rate = turnRate(this.history);

        Object.assign(this.state, {
          lat: latitude,
          lon: longitude,
          // Browsers hand back GPS altitude, which is metres-accurate at best
          // and null on plenty of devices. A native build would read the
          // barometer instead and be an order of magnitude better.
          altitude: altitude ?? this.state.altitude,
          accuracyM: accuracy,
          gpsSpeed: speed,
          track: tr?.track ?? this.state.track,
          trackQuality: tr ? { baselineKm: tr.baselineKm, seconds: tr.seconds } : null,
          // Above about a third of a degree per second the bank angle is
          // corrupting the gravity vector enough to matter.
          turning: rate > 0.3,
          error: null,
        });

        this.#recompute();
      },
      (err) => {
        this.state.error = err.message || 'location unavailable';
        this.#emit();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  }

  #startOrientation() {
    this._onOrient = (e) => {
      const { alpha, beta, gamma } = e;
      if (alpha === null && beta === null && gamma === null) return;

      this.state.depression = depressionFrom(alpha, beta, gamma);
      this.state.relAzimuth = relativeAzimuthFrom(alpha, beta, gamma);
      // Captured for the record, and deliberately never used as the bearing.
      this.state.compassRaw = e.webkitCompassHeading ?? null;

      this.#recompute();
    };

    // absolute first where it exists, since its drift is smaller.
    window.addEventListener('deviceorientationabsolute', this._onOrient, true);
    window.addEventListener('deviceorientation', this._onOrient, true);
  }

  #recompute() {
    const s = this.state;
    if (s.relAzimuth !== null && this._azimuthOffset !== null) {
      s.bearing = norm360(s.relAzimuth + this._azimuthOffset);
      s.calibrated = true;
    }
    s.ready = s.lat !== null && s.depression !== null;
    this.#emit();
  }

  /* ---------------------------------------------------------- calibration */

  /**
   * Solve the phone-to-aircraft offset from the one geometric fact the cabin
   * gives away for free: the window faces directly across the direction of
   * flight. Hold the phone flat to the glass, say which side of the aircraft
   * you are sitting on, and the bearing is pinned to the GPS track from then
   * on without the magnetometer being consulted once.
   */
  calibrateAgainstWindow(side = 'left') {
    const s = this.state;
    if (s.track === null || s.relAzimuth === null) return false;
    const trueBearing = norm360(s.track + (side === 'left' ? -90 : 90));
    this._azimuthOffset = norm360(trueBearing - s.relAzimuth);
    this.#recompute();
    return true;
  }

  /** Fall back to the compass, with the honesty that this is the bad path. */
  calibrateFromCompass() {
    const s = this.state;
    if (s.compassRaw === null || s.relAzimuth === null) return false;
    this._azimuthOffset = norm360(s.compassRaw - s.relAzimuth);
    this.#recompute();
    return true;
  }

  get uncalibrated() {
    return this._azimuthOffset === null;
  }

  stop() {
    if (this._watchId !== null) navigator.geolocation.clearWatch(this._watchId);
    if (this._onOrient) {
      window.removeEventListener('deviceorientationabsolute', this._onOrient, true);
      window.removeEventListener('deviceorientation', this._onOrient, true);
    }
    this._watchId = null;
    this._onOrient = null;
  }
}
