import { useEffect, useRef } from 'react';
import { castRay, horizonDip, R_EARTH } from '../engine/geo.js';
import { errorEllipse, bandFor, SIGMA } from '../engine/uncertainty.js';

/**
 * The hero: a cross-section of the problem, sweeping.
 *
 * Not an illustration of the geometry. It calls the same castRay the product
 * calls, so the ground point, the distances and the error band on screen are
 * computed, not drawn. If the engine were wrong, this picture would be wrong.
 *
 * The one liberty taken is vertical exaggeration, which is stated on the
 * drawing the way a geological section states it. Everything else is true:
 * over the 400 km to the horizon the earth's surface really does fall away by
 * about 13 km, which is more than the aircraft's altitude, and that is exactly
 * why the horizon sits only three degrees below level.
 */

const ALT_KM = 11.3;
const X_KM = 470; // horizontal extent of the section

// Datum is sea level directly beneath the aircraft. The surface curves away
// BELOW that datum as range increases, which is the entire point of the
// drawing, so the vertical axis has to run negative. Over the 400 km to the
// horizon the surface drops about 13 km, slightly more than the aircraft's
// own altitude, and that relationship is what puts the horizon three degrees
// below level rather than at eye height.
const Y_MAX = 14;
const Y_MIN = -14;

const VB_W = 1000;
const VB_H = 560;
const PAD_L = 62;
const PAD_R = 34;
const PAD_T = 44;
const PAD_B = 74;

const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

const sx = (km) => PAD_L + (km / X_KM) * PLOT_W;
const sy = (km) => PAD_T + (PLOT_H * (Y_MAX - km)) / (Y_MAX - Y_MIN);

// px per km on each axis, hence the honest exaggeration factor.
const EXAGGERATION = (PLOT_H / (Y_MAX - Y_MIN)) / (PLOT_W / X_KM);

/** How far the surface falls below the datum plane, km, at ground range d. */
const drop = (dKm) => (dKm * dKm) / (2 * (R_EARTH / 1000));

const DIP = horizonDip(ALT_KM * 1000);

/** The curving surface, as an SVG polyline in section coordinates. */
function groundPath() {
  const pts = [];
  for (let d = 0; d <= X_KM; d += 3) pts.push(`${sx(d)},${sy(-drop(d))}`);
  return pts.join(' ');
}

const GROUND = groundPath();
const AC_X = sx(0);
const AC_Y = sy(ALT_KM);

// The tangent ray: the shallowest look that still meets the ground. Drawn
// fixed, so the sweeping ray is visibly travelling inside a cone with a hard
// edge rather than wandering. Everything the window can ever show you lives
// between this line and straight down.
const HORIZON_KM = castRay({
  lat: 0,
  lon: 0,
  altitude: ALT_KM * 1000,
  bearing: 0,
  depression: DIP,
}).groundKm;
const HZ_X = sx(Math.min(HORIZON_KM, X_KM));
const HZ_Y = sy(-drop(Math.min(HORIZON_KM, X_KM)));

export default function LimbDiagram() {
  const rootRef = useRef(null);
  const rayRef = useRef(null);
  const hitRef = useRef(null);
  const ellipseRef = useRef(null);
  const arcRef = useRef(null);
  const readDep = useRef(null);
  const readDist = useRef(null);
  const readErr = useRef(null);
  const readBand = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let running = false;
    let t0 = 0;

    const paint = (depression) => {
      const fix = castRay({
        lat: 0,
        lon: 0,
        altitude: ALT_KM * 1000,
        bearing: 0,
        depression,
      });
      if (!fix) return;

      const gKm = Math.min(fix.groundKm, X_KM);
      const gx = sx(gKm);
      const gy = sy(-drop(gKm));

      rayRef.current?.setAttribute('x2', gx);
      rayRef.current?.setAttribute('y2', gy);
      hitRef.current?.setAttribute('transform', `translate(${gx} ${gy})`);

      const ell = errorEllipse({
        altitude: ALT_KM * 1000,
        depression,
        groundKm: fix.groundKm,
        sigmaBearing: SIGMA.trackDerived,
        sigmaPitch: SIGMA.pitchCalm,
      });

      // The along-track error is drawn on the ground axis, which is the axis it
      // actually acts on. Near the horizon it runs off the section, which is
      // the honest picture rather than a failure of the drawing.
      const along = Math.min(Number.isFinite(ell.alongKm) ? ell.alongKm : X_KM, X_KM);
      const x1 = sx(Math.max(0, gKm - along));
      const x2 = sx(Math.min(X_KM, gKm + along));
      ellipseRef.current?.setAttribute('x', x1);
      ellipseRef.current?.setAttribute('width', Math.max(2, x2 - x1));
      ellipseRef.current?.setAttribute('y', gy - 9);

      const band = bandFor(ell);
      if (readDep.current) readDep.current.textContent = `${depression.toFixed(2)}°`;
      if (readDist.current) readDist.current.textContent = `${fix.groundKm.toFixed(1)} km`;
      if (readErr.current) {
        readErr.current.textContent = Number.isFinite(ell.alongKm)
          ? `± ${ell.alongKm < 10 ? ell.alongKm.toFixed(2) : ell.alongKm.toFixed(0)} km`
          : 'unbounded';
      }
      if (readBand.current) {
        readBand.current.textContent = band.label;
        readBand.current.dataset.band = band.id;
      }

      // The dip-angle arc at the aircraft, so the sweep is legible as an angle
      // and not just a moving line.
      const r = 46;
      const a = (depression * Math.PI) / 180;
      arcRef.current?.setAttribute(
        'd',
        `M ${AC_X + r} ${AC_Y} A ${r} ${r} 0 0 1 ${AC_X + r * Math.cos(a)} ${AC_Y + r * Math.sin(a)}`
      );
    };

    // Sweep from a steep look down to the horizon, decelerating hard into the
    // limb because that last fraction of a degree is where everything happens.
    const START = 62;
    const depressionAt = (p) => DIP + 0.004 + (START - DIP) * Math.pow(1 - p, 3.4);

    const tick = (now) => {
      if (!t0) t0 = now;
      const period = 11000;
      const p = ((now - t0) % period) / period;
      // Ping-pong so it runs out to the horizon and calmly back again.
      const tri = p < 0.5 ? p * 2 : (1 - p) * 2;
      paint(depressionAt(tri));
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || reduce) return;
      running = true;
      t0 = 0;
      raf = requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // Idle whenever the hero is not on screen. A permanently running rAF here
    // starves the main thread badly enough to make CSS transitions elsewhere
    // on the page stutter.
    const io = new IntersectionObserver(
      ([e]) => (e.isIntersecting ? start() : stop()),
      { threshold: 0.05 }
    );
    io.observe(root);

    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);

    // Reduced motion still gets the picture, held at a representative angle.
    paint(reduce ? 8 : START);

    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, []);

  return (
    <figure className="limb" ref={rootRef}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="limb-svg"
        role="img"
        aria-label={`Cross-section through an aircraft at ${ALT_KM} kilometres. A line of sight sweeps from steeply below the aircraft out towards the horizon, which sits ${DIP.toFixed(2)} degrees below level and about ${(castRay({ lat: 0, lon: 0, altitude: ALT_KM * 1000, bearing: 0, depression: DIP }).groundKm).toFixed(0)} kilometres away.`}
      >
        <defs>
          <linearGradient id="terrain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--tan)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--tan)" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="plot">
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>

        {/* height gridlines, above and below the datum */}
        <g className="limb-grid">
          {[10, 0, -10].map((km) => (
            <g key={km}>
              <line
                x1={PAD_L}
                y1={sy(km)}
                x2={VB_W - PAD_R}
                y2={sy(km)}
                className={km === 0 ? 'is-datum' : undefined}
              />
              <text x={PAD_L - 12} y={sy(km) + 5} textAnchor="end">
                {km === 0 ? '0' : km > 0 ? `+${km}` : km}
              </text>
            </g>
          ))}
        </g>

        {/* ground range ticks */}
        <g className="limb-ticks">
          {[100, 200, 300, 400].map((km) => (
            <g key={km}>
              <line x1={sx(km)} y1={PAD_T + PLOT_H} x2={sx(km)} y2={PAD_T + PLOT_H + 8} />
              <text x={sx(km)} y={PAD_T + PLOT_H + 26} textAnchor="middle">
                {km}
              </text>
            </g>
          ))}
          <text x={sx(X_KM / 2)} y={PAD_T + PLOT_H + 52} textAnchor="middle" className="limb-axis">
            GROUND RANGE, KM
          </text>
          <text
            x={18}
            y={PAD_T + PLOT_H / 2}
            textAnchor="middle"
            className="limb-axis"
            transform={`rotate(-90 18 ${PAD_T + PLOT_H / 2})`}
          >
            HEIGHT ABOVE DATUM, KM
          </text>
        </g>

        <g clipPath="url(#plot)">
          {/* the curving surface, and the terrain tint beneath it */}
          <polygon
            className="limb-fill"
            points={`${sx(0)},${VB_H} ${GROUND} ${sx(X_KM)},${VB_H}`}
            fill="url(#terrain)"
          />
          <polyline className="limb-ground" points={GROUND} />

          {/* level datum through the aircraft: what the dip angle is measured from */}
          <line className="limb-datum" x1={AC_X} y1={AC_Y} x2={VB_W - PAD_R} y2={AC_Y} />

          {/* the tangent ray, and the sliver of sky between it and level */}
          <polygon
            className="limb-cone"
            points={`${AC_X},${AC_Y} ${VB_W - PAD_R},${AC_Y} ${HZ_X},${HZ_Y}`}
          />
          <line className="limb-horizon" x1={AC_X} y1={AC_Y} x2={HZ_X} y2={HZ_Y} />
          <g className="limb-horizon-mark" transform={`translate(${HZ_X} ${HZ_Y})`}>
            <line x1="0" y1="-16" x2="0" y2="16" />
          </g>

          {/* the error bar, on the axis the error actually acts on */}
          <rect ref={ellipseRef} className="limb-ellipse" x={AC_X} y={AC_Y} width="2" height="22" rx="11" />

          {/* the line of sight */}
          <line ref={rayRef} className="limb-ray" x1={AC_X} y1={AC_Y} x2={AC_X} y2={AC_Y} />

          {/* where it lands */}
          <g ref={hitRef} className="limb-hit">
            <circle r="20" className="limb-hit-halo" />
            <circle r="4" className="limb-hit-dot" />
            <line x1="-15" y1="0" x2="-7" y2="0" />
            <line x1="7" y1="0" x2="15" y2="0" />
            <line x1="0" y1="-15" x2="0" y2="-7" />
            <line x1="0" y1="7" x2="0" y2="15" />
          </g>
        </g>

        {/* the dip angle at the aircraft */}
        <path ref={arcRef} className="limb-arc" d="" />

        {/* the aircraft */}
        <g className="limb-ac" transform={`translate(${AC_X} ${AC_Y})`}>
          <path d="M -17 0 L 12 0 M -8 0 L -1 -11 M -8 0 L -1 11 M 9 0 L 15 -5 M 9 0 L 15 5" />
          <circle r="3.4" className="limb-ac-dot" />
        </g>
        <text x={AC_X + 20} y={AC_Y - 14} className="limb-note">
          FL370
        </text>

        <text x={VB_W - PAD_R} y={PAD_T - 16} textAnchor="end" className="limb-note">
          VERTICAL EXAGGERATION ×{EXAGGERATION.toFixed(0)}
        </text>
        <text x={PAD_L} y={PAD_T - 16} className="limb-note">
          SECTION THROUGH THE LINE OF SIGHT
        </text>

        {/* The horizon, labelled, because it is the number nobody guesses right */}
        <text x={HZ_X - 12} y={HZ_Y - 26} textAnchor="end" className="limb-note is-lit">
          HORIZON {DIP.toFixed(2)}° BELOW LEVEL
        </text>
        <text x={HZ_X - 12} y={HZ_Y - 8} textAnchor="end" className="limb-note is-lit">
          {HORIZON_KM.toFixed(0)} KM AWAY
        </text>
      </svg>

      <figcaption className="limb-read">
        <div className="limb-read-item">
          <span className="anno">Look down</span>
          <strong className="num" ref={readDep}>
            62.00°
          </strong>
        </div>
        <div className="limb-read-item">
          <span className="anno">Ground range</span>
          <strong className="num" ref={readDist}>
            0.0 km
          </strong>
        </div>
        <div className="limb-read-item">
          <span className="anno">Along-track error</span>
          <strong className="num" ref={readErr}>
            ± 0.00 km
          </strong>
        </div>
        <div className="limb-read-item">
          <span className="anno">Confidence</span>
          <strong className="num band" ref={readBand} data-band="pinned">
            Pinned
          </strong>
        </div>
      </figcaption>
    </figure>
  );
}
