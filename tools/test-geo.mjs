/**
 * Geometry checks for the NADIR ray-caster. `npm run test:geo`.
 *
 * These are the assertions that would have caught a flat-earth shortcut. The
 * two that matter most are the limb cases: a ray aimed above the horizon must
 * return null rather than a number, and a ray aimed exactly at the dip angle
 * must land on the horizon rather than at infinity.
 */
import {
  castRay,
  horizonDip,
  horizonDistance,
  haversineKm,
  bearingTo,
} from '../src/engine/geo.js';

let failed = 0;
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `   ${extra}` : ''}`);
  if (!cond) failed++;
};

const H = 11300; // typical long-haul cruise, metres

console.log('\n-- horizon at 11,300 m --');
const dip = horizonDip(H);
const hd = horizonDistance(H) / 1000;
console.log(`   dip ${dip.toFixed(3)} deg,  distance ${hd.toFixed(1)} km`);
ok(dip > 3.0 && dip < 3.7, 'dip is about 3.4 deg');
ok(hd > 360 && hd < 420, 'horizon lands between 360 and 420 km');

console.log('\n-- nadir --');
const n = castRay({ lat: 16.5, lon: 81.8, altitude: H, bearing: 118, depression: 90 });
ok(Math.abs(n.groundKm) < 1e-6, 'straight down gives zero ground distance');
ok(
  Math.abs(n.lat - 16.5) < 1e-9 && Math.abs(n.lon - 81.8) < 1e-9,
  'nadir point equals the observer position'
);
ok(Math.abs(n.slantKm - H / 1000) < 1e-3, 'slant range equals altitude', `${n.slantKm.toFixed(3)} km`);

console.log('\n-- rays that miss the earth --');
ok(
  castRay({ lat: 0, lon: 0, altitude: H, bearing: 0, depression: dip - 0.05 }) === null,
  'just above the horizon returns null instead of a fabricated point'
);
ok(castRay({ lat: 0, lon: 0, altitude: H, bearing: 0, depression: 0 }) === null, 'level gaze returns null');
ok(castRay({ lat: 0, lon: 0, altitude: H, bearing: 0, depression: -5 }) === null, 'looking up returns null');

console.log('\n-- at the limb --');
const limb = castRay({ lat: 0, lon: 0, altitude: H, bearing: 90, depression: dip });
ok(limb !== null, 'a ray aimed exactly at the dip angle still resolves');
ok(limb && Math.abs(limb.groundKm - hd) < 0.5, 'and it lands on the horizon', `${limb.groundKm.toFixed(1)} vs ${hd.toFixed(1)} km`);

console.log('\n-- sensitivity near the limb (this is the product) --');
// Ground distance goes as the square root of the angle below the dip, because
// asin approaches a vertical tangent at 1. So the last fraction of a degree of
// look-down angle is worth more ground than the preceding eighty.
for (const eps of [0.001, 0.01, 0.1]) {
  const r = castRay({ lat: 0, lon: 0, altitude: H, bearing: 90, depression: dip + eps });
  console.log(`   ${eps.toFixed(3)} deg below the dip  ->  ${r.groundKm.toFixed(1)} km  (${(hd - r.groundKm).toFixed(1)} km short of the horizon)`);
}
const near = castRay({ lat: 0, lon: 0, altitude: H, bearing: 90, depression: dip + 0.001 });
ok(hd - near.groundKm > 3, 'one thousandth of a degree near the limb is worth kilometres', `${(hd - near.groundKm).toFixed(1)} km`);

const steepA = castRay({ lat: 0, lon: 0, altitude: H, bearing: 90, depression: 60 });
const steepB = castRay({ lat: 0, lon: 0, altitude: H, bearing: 90, depression: 60.001 });
ok(
  Math.abs(steepA.groundKm - steepB.groundKm) < 0.01,
  'the same thousandth of a degree looking steeply down is worth metres',
  `${(Math.abs(steepA.groundKm - steepB.groundKm) * 1000).toFixed(1)} m`
);

console.log('\n-- agreement with h/tan where the flat approximation is valid --');
for (const dep of [60, 45, 30]) {
  const r = castRay({ lat: 0, lon: 0, altitude: 500, bearing: 0, depression: dep, refraction: false });
  const flat = 500 / Math.tan((dep * Math.PI) / 180) / 1000;
  const errPct = (Math.abs(r.groundKm - flat) / flat) * 100;
  ok(errPct < 0.5, `${dep} deg at 500 m matches h/tan`, `${errPct.toFixed(3)}% off`);
}

console.log('\n-- curvature dominates at cruise --');
// The surface curves away beneath the ray, so the ground it is aimed at has
// dropped by the time the ray arrives. A spherical cast therefore lands
// further out than h/tan, and the gap widens as the look flattens.
for (const dep of [20, 10, 5]) {
  const r = castRay({ lat: 0, lon: 0, altitude: H, bearing: 0, depression: dep, refraction: false });
  const flat = H / Math.tan((dep * Math.PI) / 180) / 1000;
  console.log(`   ${String(dep).padStart(2)} deg  spherical ${r.groundKm.toFixed(1).padStart(6)} km   flat ${flat.toFixed(1).padStart(6)} km   flat is short by ${(r.groundKm - flat).toFixed(1)} km`);
  ok(r.groundKm > flat, `at ${dep} deg the flat approximation falls short`);
}

console.log('\n-- round trip --');
const p = castRay({ lat: 28.6, lon: 77.2, altitude: H, bearing: 215, depression: 12 });
const back = haversineKm(28.6, 77.2, p.lat, p.lon);
const bb = bearingTo(28.6, 77.2, p.lat, p.lon);
ok(Math.abs(back - p.groundKm) < 0.5, 'measuring back gives the reported distance', `${back.toFixed(3)} vs ${p.groundKm.toFixed(3)} km`);
ok(Math.abs(bb - 215) < 0.01, 'measuring back gives the requested bearing', `${bb.toFixed(4)} deg`);

console.log('\n-- monotonicity --');
let mono = true;
let prev = -1;
for (let d = 89; d > dip + 0.15; d -= 0.25) {
  const r = castRay({ lat: 0, lon: 0, altitude: H, bearing: 0, depression: d });
  if (!r || r.groundKm < prev) mono = false;
  prev = r ? r.groundKm : prev;
}
ok(mono, 'a shallower look always lands further away');

console.log('\n-- refraction --');
ok(
  horizonDistance(H, { refraction: true }) > horizonDistance(H, { refraction: false }),
  'refraction pushes the horizon further out',
  `${(horizonDistance(H, { refraction: true }) / 1000).toFixed(1)} vs ${(horizonDistance(H, { refraction: false }) / 1000).toFixed(1)} km`
);

console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nall geometry checks passed\n');
process.exit(failed ? 1 : 0);
