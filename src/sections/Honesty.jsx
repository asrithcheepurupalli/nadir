import { useMemo, useRef, useState } from 'react';
import { useCanvasPainter } from '../lib/useCanvasPainter.js';
import { computeFix, SIGMA } from '../engine/uncertainty.js';
import { horizonDip } from '../engine/geo.js';
import { useAtlas, useNearViewport } from '../lib/useAtlas.js';

/**
 * The argument, made by hand.
 *
 * One slider. Move the look angle from steeply down towards the horizon and
 * watch three things happen at once: the answer gets further away, the error
 * runs away far faster than the distance does, and the name the engine is
 * willing to give you falls apart from a river to a state to a shrug.
 *
 * Every number here is computed live from a fixed observer over the Krishna
 * delta at FL370. Nothing is scripted, and the names come out of the same
 * offline atlas the demo uses.
 */

// A real position: over coastal Andhra Pradesh, looking inland.
const OBS = { lat: 16.1, lon: 80.95, altitude: 11278, bearing: 300 };
const DIP = horizonDip(OBS.altitude);

const STOPS = [60, 45, 30, 20, 12, 8, 5, 4, 3.5, 3.3];

export default function Honesty() {
  const ref = useRef(null);
  const near = useNearViewport(ref);
  const { atlas } = useAtlas(near);
  const [depression, setDepression] = useState(45);

  const { fix, result } = useMemo(() => {
    const f = computeFix(
      { ...OBS, depression },
      { sigmaBearing: SIGMA.trackDerived, sigmaPitch: SIGMA.pitchCalm }
    );
    if (!f) return { fix: null, result: null };
    if (!atlas) return { fix: f, result: null };
    const tol = Math.max(
      Number.isFinite(f.ellipse.alongKm) ? f.ellipse.alongKm : 4000,
      f.ellipse.crossKm
    );
    return { fix: f, result: atlas.resolve(f.lat, f.lon, tol) };
  }, [depression, atlas]);

  const along = fix
    ? Number.isFinite(fix.ellipse.alongKm)
      ? fix.ellipse.alongKm
      : null
    : null;

  return (
    <section className="honesty" id="honesty" ref={ref} data-tone="dark">
      <div className="wrap">
        <header className="sec-head" data-reveal>
          <span className="panel-id">02 / HONESTY</span>
          <h2 className="title t-xl">
            A pin would be a <span className="serif-italic">lie</span>
          </h2>
          <p className="lede narrow">
            Every other app would drop a marker and let you assume it was right.
            The geometry does not support that. What it supports is an ellipse,
            and the ellipse is a very strange shape.
          </p>
        </header>

        <div className="hon-grid">
          <div className="hon-stage" data-reveal>
            <ErrorBar fix={fix} depression={depression} />

            <div className="hon-slider">
              <label htmlFor="hon-dep" className="anno">
                Look down · horizon at {DIP.toFixed(2)}°
              </label>
              <input
                id="hon-dep"
                type="range"
                min="32"
                max="700"
                value={Math.round(depression * 10)}
                onChange={(e) => setDepression(Number(e.target.value) / 10)}
                aria-label="Degrees below level"
              />
              {/* Outside the label on purpose. A button nested inside a label
                  never receives its own click: the label swallows it and
                  forwards activation to the control it is bound to. */}
              <div className="hon-stops">
                {STOPS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setDepression(s)}
                    aria-label={`Look down ${s} degrees`}
                    className={Math.abs(depression - s) < 0.05 ? 'is-on' : ''}
                  >
                    {s}°
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="hon-read" data-reveal data-delay="1">
            <div className="hon-answer" data-band={fix?.band?.id ?? 'unresolved'}>
              <span className="anno">
                {fix ? fix.band.label : 'Above the horizon'}
              </span>
              <strong className="hon-answer-name">
                {!atlas
                  ? '…'
                  : !fix
                    ? 'Sky'
                    : result?.primary
                      ? result.primary.name
                      : 'Nothing it can name'}
              </strong>
              <span className="hon-answer-note">
                {fix ? fix.band.note : 'This line of sight never meets the ground.'}
              </span>
            </div>

            <dl className="hon-stats">
              <Stat label="Look down" value={`${depression.toFixed(2)}°`} />
              <Stat
                label="Lands at"
                value={fix ? `${fix.groundKm.toFixed(1)} km` : '—'}
              />
              <Stat
                label="Error along the look"
                value={along === null ? 'unbounded' : `± ${along < 10 ? along.toFixed(2) : along.toFixed(0)} km`}
                big
              />
              <Stat
                label="Error across it"
                value={fix ? `± ${fix.ellipse.crossKm.toFixed(2)} km` : '—'}
              />
            </dl>

            <p className="hon-note body-copy">
              <span>
                Notice that the two errors are nothing like each other. Across
                your line of sight the answer stays sharp, because heading taken
                from the GPS track is good to half a degree. Along it, the
                answer smears, because ground distance is savagely sensitive to
                look angle near the horizon.
              </span>
              <span>
                The two are perpendicular and they never mix. That is why the
                shape is a sliver and never a circle, and it is why the app can
                still tell you which river you are over while having no idea how
                far along it you are.
              </span>
            </p>
          </div>
        </div>

        <div className="hon-punch" data-reveal>
          <div className="hon-punch-item">
            <span className="anno">One thousandth of a degree, near the horizon</span>
            <strong className="num">9.9 km</strong>
          </div>
          <div className="hon-punch-x">of ground. The same thousandth, looking steeply down, is worth</div>
          <div className="hon-punch-item">
            <span className="anno">The identical movement, at 60° down</span>
            <strong className="num">0.3 m</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, big }) {
  return (
    <div className={`hon-stat${big ? ' is-big' : ''}`}>
      <dt className="anno">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

/**
 * The ellipse, drawn to scale against the ground.
 *
 * Deliberately plotted on a real distance axis rather than normalised, because
 * the entire point is how violently the shape changes size. A normalised
 * drawing would make a 200 km error look like a 2 km one.
 */
function ErrorBar({ fix, depression }) {
  const css = (v) =>
    getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  const { ref } = useCanvasPainter((ctx, { w, h }) => {

      const MAX = 420; // km, the horizon
      const padL = 8;
      const padR = 8;
      const usable = w - padL - padR;
      const sx = (km) => padL + (km / MAX) * usable;
      const midY = h / 2;

      // ground axis
      ctx.strokeStyle = css('--night-ink') || '#e8e2d4';
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, midY);
      ctx.lineTo(w - padR, midY);
      ctx.stroke();

      ctx.font = `500 9px ${css('--mono') || 'monospace'}`;
      ctx.fillStyle = css('--night-ink') || '#e8e2d4';
      for (const km of [0, 100, 200, 300, 400]) {
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(sx(km), midY - 5);
        ctx.lineTo(sx(km), midY + 5);
        ctx.stroke();
        ctx.globalAlpha = 0.45;
        ctx.fillText(`${km}`, sx(km) + 3, midY + 18);
      }

      if (!fix) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = css('--amber-lit') || '#d97a22';
        ctx.font = `500 11px ${css('--mono') || 'monospace'}`;
        ctx.fillText('ABOVE THE HORIZON', padL, midY - 20);
        return;
      }

      const g = fix.groundKm;
      const along = Number.isFinite(fix.ellipse.alongKm) ? fix.ellipse.alongKm : MAX;
      const cross = fix.ellipse.crossKm;

      const x0 = sx(Math.max(0, g - along));
      const x1 = sx(Math.min(MAX, g + along));
      const halfH = Math.max(2.5, Math.min(midY - 12, cross * (usable / MAX)));

      const amber = css('--amber-lit') || '#d97a22';

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = amber;
      ctx.beginPath();
      ctx.ellipse((x0 + x1) / 2, midY, Math.max(2, (x1 - x0) / 2), halfH, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = amber;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // the nominal answer
      ctx.globalAlpha = 1;
      ctx.fillStyle = amber;
      ctx.beginPath();
      ctx.arc(sx(g), midY, 3.5, 0, Math.PI * 2);
      ctx.fill();
  });

  return (
    <figure className="hon-bar">
      <figcaption className="anno">
        Where the answer actually is, on the ground, in kilometres
      </figcaption>
      <canvas ref={ref} />
    </figure>
  );
}
