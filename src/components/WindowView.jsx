import { useEffect, useRef } from 'react';
import { depressionForGroundRange, horizonDip, toRad } from '../engine/geo.js';

/**
 * The view out of the window, drawn from the offline atlas.
 *
 * This is what the camera would be looking at, reconstructed from vectors.
 * Every river, coastline and town here is projected through a real pinhole
 * camera model from the aircraft's actual position, using the inverse of the
 * same ray-cast that resolves the answer.
 *
 * It is worth saying what this makes visible, because no amount of prose does
 * the job as well. The ground does not recede evenly. The first ten kilometres
 * fill about forty degrees of the frame. The last hundred kilometres, out at
 * the limb, fill a seventh of one degree. Everything far away is crushed into
 * a band a few pixels tall just under the horizon, which is precisely why
 * pointing at something near the horizon cannot give you a confident answer,
 * and why the error ellipse grows the way it does.
 *
 * The picture and the maths are the same argument.
 */

const KM_LAT = 110.574;

const CSS = (v) =>
  getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** Unit direction from an azimuth and elevation, in east/north/up. */
function dir(azDeg, elDeg) {
  const a = toRad(azDeg);
  const e = toRad(elDeg);
  const ce = Math.cos(e);
  return [Math.sin(a) * ce, Math.cos(a) * ce, Math.sin(e)];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export default function WindowView({
  atlas,
  observer,
  fix,
  result,
  hfov = 62,
  className = '',
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ atlas, observer, fix, result, hfov });
  stateRef.current = { atlas, observer, fix, result, hfov };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let raf = 0;
    let alive = true;

    const P = {
      paper: CSS('--paper') || '#efe9db',
      ink: CSS('--ink') || '#191b19',
      ink3: CSS('--ink-3') || '#6b6d64',
      ink4: CSS('--ink-4') || '#9a9a8d',
      cyan: CSS('--cyan') || '#1a6f8a',
      amber: CSS('--amber') || '#b8510e',
      tan: CSS('--tan') || '#9c7440',
      green: CSS('--green') || '#4a6b3f',
    };

    const draw = () => {
      if (!alive) return;
      const { atlas, observer, fix, result, hfov } = stateRef.current;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (!observer || observer.lat == null || observer.depression == null) {
        ctx.fillStyle = P.paper;
        ctx.fillRect(0, 0, w, h);
        raf = requestAnimationFrame(draw);
        return;
      }

      const { lat: lat0, lon: lon0, altitude } = observer;
      const lookBearing = observer.bearing ?? 0;
      const lookDep = observer.depression ?? 0;
      const dip = horizonDip(altitude);
      const kmLon = 111.32 * Math.cos(toRad(lat0));

      /* --- camera basis ------------------------------------------------- */

      const F = dir(lookBearing, -lookDep);
      const R = norm(cross(F, [0, 0, 1]));
      const U = cross(R, F);
      const fpx = w / 2 / Math.tan(toRad(hfov) / 2);
      const cx = w / 2;
      const cy = h / 2;

      /** A world azimuth and elevation to screen pixels, or null if behind. */
      const project = (azDeg, elDeg) => {
        const D = dir(azDeg, elDeg);
        const z = dot(D, F);
        if (z <= 0.02) return null;
        return [cx + (dot(D, R) / z) * fpx, cy - (dot(D, U) / z) * fpx];
      };

      /**
       * A ground position to screen. Uses a local tangent-plane approximation
       * for range and bearing, which is well under a percent out at the few
       * hundred kilometres anything is visible from, and far cheaper than a
       * haversine per vertex per frame.
       */
      const groundToScreen = (lat, lon) => {
        const dE = (lon - lon0) * kmLon;
        const dN = (lat - lat0) * KM_LAT;
        const range = Math.hypot(dE, dN);
        if (range > 900) return null;
        const az = (Math.atan2(dE, dN) * 180) / Math.PI;
        const el = -depressionForGroundRange(Math.max(0.05, range), altitude);
        const p = project(az, el);
        return p ? [p[0], p[1], range] : null;
      };

      /* --- sky and ground ----------------------------------------------- */

      // The horizon, sampled across a wide arc so it stays correct when the
      // camera is rolled or aimed off to one side.
      const horizon = [];
      for (let b = -110; b <= 110; b += 2) {
        const p = project(lookBearing + b, -dip);
        if (p) horizon.push(p);
      }

      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, '#b8cbd6');
      skyGrad.addColorStop(1, '#dfe4dd');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      if (horizon.length > 1) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(horizon[0][0], horizon[0][1]);
        for (const p of horizon) ctx.lineTo(p[0], p[1]);
        ctx.lineTo(horizon[horizon.length - 1][0], h + 50);
        ctx.lineTo(horizon[0][0], h + 50);
        ctx.closePath();
        ctx.clip();

        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#cfc7b2');
        g.addColorStop(0.5, '#d8cfb8');
        g.addColorStop(1, '#e4dcc6');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h + 50);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(horizon[0][0], horizon[0][1]);
        for (const p of horizon) ctx.lineTo(p[0], p[1]);
        ctx.strokeStyle = P.ink;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      if (!atlas) {
        raf = requestAnimationFrame(draw);
        return;
      }

      /* --- the atlas, in perspective ------------------------------------ */

      const reach = 6.5;
      const view = atlas.viewport(
        lon0 - reach / Math.max(0.2, Math.cos(toRad(lat0))),
        lat0 - reach,
        lon0 + reach / Math.max(0.2, Math.cos(toRad(lat0))),
        lat0 + reach,
        { maxPoints: 40 }
      );

      /**
       * Atmospheric haze. Physically motivated and visually necessary: without
       * it the crushed band under the horizon becomes an unreadable smear of
       * overlapping ink.
       */
      const haze = (range) => Math.max(0.05, Math.min(1, 1 - range / 420));

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const l of view.lines) {
        const isCoast = l.k === 'coast';
        let started = false;
        let lastRange = 0;
        ctx.beginPath();
        for (const [x, y] of l.g) {
          const p = groundToScreen(y, x);
          if (!p) {
            started = false;
            continue;
          }
          lastRange = p[2];
          if (!started) {
            ctx.moveTo(p[0], p[1]);
            started = true;
          } else ctx.lineTo(p[0], p[1]);
        }
        ctx.strokeStyle = P.cyan;
        ctx.globalAlpha = haze(lastRange) * (isCoast ? 0.9 : 0.55);
        ctx.lineWidth = isCoast ? 1.6 : 1;
        ctx.stroke();
      }
      ctx.restore();

      /* --- range arcs, the chart furniture of a perspective view --------- */

      ctx.save();
      ctx.font = `500 9px ${CSS('--mono') || 'monospace'}`;
      for (const km of [25, 50, 100, 200, 400]) {
        const el = -depressionForGroundRange(km, altitude);
        if (el > -dip) continue;
        const pts = [];
        for (let b = -80; b <= 80; b += 4) {
          const p = project(lookBearing + b, el);
          if (p) pts.push(p);
        }
        if (pts.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts) ctx.lineTo(p[0], p[1]);
        ctx.strokeStyle = P.ink;
        ctx.globalAlpha = 0.14;
        ctx.setLineDash([3, 5]);
        ctx.lineWidth = 1;
        ctx.stroke();

        const mid = pts[Math.floor(pts.length / 2)];
        if (mid && mid[0] > 8 && mid[0] < w - 40) {
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = P.ink3;
          ctx.fillText(`${km} KM`, 10, mid[1] - 3);
        }
      }
      ctx.restore();

      /* --- places -------------------------------------------------------- */

      ctx.save();
      ctx.font = `500 10px ${CSS('--mono') || 'monospace'}`;
      ctx.textBaseline = 'middle';
      const placed = [];
      for (const p of view.points) {
        if (p.k !== 'city' && p.k !== 'peak') continue;
        const s = groundToScreen(p.y, p.x);
        if (!s) continue;
        const [x, y, range] = s;
        if (x < -30 || x > w + 30 || y < -10 || y > h + 10) continue;
        if (placed.some((q) => Math.abs(q[0] - x) < 58 && Math.abs(q[1] - y) < 11)) continue;
        placed.push([x, y]);

        const a = haze(range);
        ctx.globalAlpha = a * 0.9;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = p.k === 'peak' ? P.tan : P.ink;
        ctx.fill();

        ctx.globalAlpha = a * 0.75;
        ctx.fillStyle = P.ink;
        ctx.fillText(p.n.toUpperCase(), x + 6, y - 1);
      }
      ctx.restore();

      /* --- the answer, where the camera is actually pointing ------------- */

      if (fix) {
        const s = groundToScreen(fix.lat, fix.lon);
        if (s) {
          const [x, y] = s;

          // The error ellipse, projected. Along-track error runs away from the
          // camera and therefore collapses vertically on screen, which is the
          // clearest possible statement of why it is the dangerous axis.
          const along = Number.isFinite(fix.ellipse.alongKm) ? fix.ellipse.alongKm : 400;
          const near = groundToScreen(
            fix.lat - ((fix.lat - lat0) / Math.max(0.001, fix.groundKm)) * Math.min(along, fix.groundKm * 0.95),
            fix.lon - ((fix.lon - lon0) / Math.max(0.001, fix.groundKm)) * Math.min(along, fix.groundKm * 0.95)
          );
          const far = groundToScreen(
            fix.lat + ((fix.lat - lat0) / Math.max(0.001, fix.groundKm)) * along,
            fix.lon + ((fix.lon - lon0) / Math.max(0.001, fix.groundKm)) * along
          );

          if (near && far) {
            ctx.save();
            ctx.strokeStyle = P.amber;
            ctx.globalAlpha = 0.5;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(near[0], near[1]);
            ctx.lineTo(far[0], far[1]);
            ctx.stroke();
            ctx.restore();
          }

          ctx.save();
          ctx.strokeStyle = P.amber;
          ctx.fillStyle = P.amber;
          ctx.lineWidth = 1.4;
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, 11, 0, Math.PI * 2);
          ctx.globalAlpha = 0.6;
          ctx.stroke();
          ctx.restore();

          if (result?.primary) {
            ctx.save();
            ctx.font = `600 11px ${CSS('--mono') || 'monospace'}`;
            ctx.textBaseline = 'middle';
            const label = result.primary.name.toUpperCase();
            const tw = ctx.measureText(label).width;
            const lx = Math.min(Math.max(10, x + 18), w - tw - 12);
            const ly = Math.max(14, y - 20);
            ctx.strokeStyle = P.amber;
            ctx.globalAlpha = 0.5;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y - 11);
            ctx.lineTo(lx + tw / 2, ly + 8);
            ctx.stroke();
            ctx.globalAlpha = 0.92;
            ctx.fillStyle = P.paper;
            ctx.fillRect(lx - 5, ly - 8, tw + 10, 17);
            ctx.globalAlpha = 1;
            ctx.fillStyle = P.amber;
            ctx.fillText(label, lx, ly);
            ctx.restore();
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (!raf) raf = requestAnimationFrame(draw);
        } else {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0.02 }
    );
    io.observe(canvas);

    return () => {
      alive = false;
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className={`windowview ${className}`} aria-hidden="true" />;
}
