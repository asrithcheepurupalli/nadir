import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChartMap from '../components/ChartMap.jsx';
import WindowView from '../components/WindowView.jsx';
import { Replay, ROUTES } from '../engine/replay.js';
import { Sensors } from '../engine/sensors.js';
import { computeFix, SIGMA } from '../engine/uncertainty.js';
import { formatLatLon, horizonDip } from '../engine/geo.js';
import { useAtlas, useNearViewport } from '../lib/useAtlas.js';

/**
 * The demo.
 *
 * Two ways in, one engine behind them. On a phone at 11 km the sensors are
 * real. On a laptop the position and heading come from a scripted flight. In
 * both cases the ray-cast, the error propagation and the resolver are the same
 * code, so the replay is a demonstration rather than a mock-up.
 *
 * The layout follows the pattern every good scanning interface uses: the live
 * frame is never covered by its own result. The answer rises underneath it.
 */

const fmtBytes = (n) =>
  n > 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${Math.round(n / 1e3)} KB`;

export default function Demo() {
  const sectionRef = useRef(null);
  const near = useNearViewport(sectionRef);
  const { atlas, progress, bytes, error: packError } = useAtlas(near);

  const [mode, setMode] = useState('replay');
  const [routeId, setRouteId] = useState('blr-del');
  const [observer, setObserver] = useState(null);
  const [side, setSide] = useState('left');
  const [playing, setPlaying] = useState(false);
  const [liveState, setLiveState] = useState('idle'); // idle | asking | running | denied
  const [liveError, setLiveError] = useState(null);

  const replayRef = useRef(null);
  const sensorsRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  /* ------------------------------------------------------------- replay */

  useEffect(() => {
    if (mode !== 'replay') return;
    const r = new Replay(routeId, setObserver);
    r.setSide(side);
    replayRef.current = r;
    setObserver(r.sample());
    if (playing) r.play();
    return () => {
      r.stop();
      replayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, routeId]);

  useEffect(() => {
    const r = replayRef.current;
    if (!r) return;
    if (playing) r.play();
    else r.pause();
  }, [playing]);

  useEffect(() => {
    replayRef.current?.setSide(side);
    if (mode === 'live') sensorsRef.current?.calibrateAgainstWindow(side);
  }, [side, mode]);

  /* --------------------------------------------------------------- live */

  const startLive = useCallback(async () => {
    setLiveError(null);
    setLiveState('asking');
    try {
      const perm = await Sensors.requestOrientationPermission();
      if (perm === 'denied') {
        setLiveState('denied');
        setLiveError('Motion access was declined, so the look angle cannot be read.');
        return;
      }

      const stream = await Sensors.requestCamera();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const s = new Sensors(setObserver);
      sensorsRef.current = s;
      s.start();
      setLiveState('running');
    } catch (e) {
      setLiveState('denied');
      setLiveError(
        e?.name === 'NotAllowedError'
          ? 'Camera or location access was declined.'
          : e?.message || 'Could not start the sensors.'
      );
    }
  }, []);

  const stopLive = useCallback(() => {
    sensorsRef.current?.stop();
    sensorsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLiveState('idle');
  }, []);

  useEffect(() => () => stopLive(), [stopLive]);

  const switchMode = (next) => {
    if (next === mode) return;
    if (mode === 'live') stopLive();
    if (mode === 'replay') {
      replayRef.current?.pause();
      setPlaying(false);
    }
    setObserver(null);
    setMode(next);
  };

  /* ------------------------------------------------------------- solving */

  const { fix, result } = useMemo(() => {
    if (!observer || observer.lat == null || observer.depression == null) {
      return { fix: null, result: null };
    }
    const f = computeFix(observer, {
      sigmaBearing: observer.calibrated ? SIGMA.trackDerived : SIGMA.compassRaw,
      sigmaPitch: observer.turning ? SIGMA.pitchRough : SIGMA.pitchCalm,
    });
    if (!f || !atlas) return { fix: f, result: null };

    const tol = Math.max(
      Number.isFinite(f.ellipse.alongKm) ? f.ellipse.alongKm : 4000,
      f.ellipse.crossKm
    );
    return { fix: f, result: atlas.resolve(f.lat, f.lon, tol) };
  }, [observer, atlas]);

  /* ----------------------------------------------------------- aiming UI */

  const frameRef = useRef(null);
  const dragRef = useRef(null);

  const onPointerDown = (e) => {
    if (mode !== 'replay') return;
    const r = replayRef.current;
    if (!r) return;
    frameRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      bearing: r.relativeBearing,
      depression: r.depression,
    };
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    const r = replayRef.current;
    if (!d || !r) return;
    const rect = frameRef.current.getBoundingClientRect();
    // Horizontal drag swings the look around the aircraft, vertical drag
    // raises and lowers it. Dragging up tilts towards the horizon, which is
    // where the answer falls apart, and that is the point of letting anyone
    // do it by hand.
    const dx = ((e.clientX - d.x) / rect.width) * 120;
    const dy = ((e.clientY - d.y) / rect.height) * 70;
    r.aim({ relativeBearing: d.bearing + dx, depression: d.depression + dy });
  };

  const onPointerUp = (e) => {
    dragRef.current = null;
    frameRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const dip = observer?.altitude ? horizonDip(observer.altitude) : null;

  return (
    <section className="demo" id="demo" ref={sectionRef} data-tone="light">
      <div className="wrap">
        <header className="sec-head" data-reveal>
          <span className="panel-id">01 / TRY IT</span>
          <h2 className="title t-xl">
            Point it at the <span className="serif-italic">window</span>
          </h2>
          <p className="lede narrow">
            On a phone above ten kilometres, this reads your real position and
            your real look angle. Anywhere else, fly the route instead. The
            engine underneath does not know the difference.
          </p>
        </header>

        <div className="demo-shell neatline" data-reveal>
          {/* ----------------------------------------------------- toolbar */}
          <div className="demo-bar">
            <div className="seg" role="tablist" aria-label="Demo mode">
              <button
                role="tab"
                aria-selected={mode === 'replay'}
                className={mode === 'replay' ? 'is-on' : ''}
                onClick={() => switchMode('replay')}
              >
                Replay
              </button>
              <button
                role="tab"
                aria-selected={mode === 'live'}
                className={mode === 'live' ? 'is-on' : ''}
                onClick={() => switchMode('live')}
              >
                Live camera
              </button>
            </div>

            <div className="demo-bar-right">
              {mode === 'replay' && (
                <select
                  className="demo-select"
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  aria-label="Route"
                >
                  {Object.values(ROUTES).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.from.code} to {r.to.code}
                    </option>
                  ))}
                </select>
              )}
              <div className="seg seg-sm" role="group" aria-label="Which window">
                <button
                  className={side === 'left' ? 'is-on' : ''}
                  onClick={() => setSide('left')}
                >
                  Left
                </button>
                <button
                  className={side === 'right' ? 'is-on' : ''}
                  onClick={() => setSide('right')}
                >
                  Right
                </button>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------- stage */}
          <div className="demo-stage">
            <div
              className="demo-frame"
              ref={frameRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              data-mode={mode}
            >
              {mode === 'live' && (
                <video ref={videoRef} className="demo-video" playsInline muted />
              )}

              {mode === 'replay' && (
                <div className="demo-chartwrap">
                  <WindowView atlas={atlas} observer={observer} fix={fix} result={result} />
                </div>
              )}

              {/* The plan view, inset. A perspective view alone leaves you with
                  no idea where you are; the chart alone is not what the window
                  shows you. Both, and the small one is the map. */}
              <div className="demo-inset">
                <ChartMap
                  atlas={atlas}
                  observer={observer}
                  fix={fix}
                  result={null}
                  // Framed for context rather than for the fix. Zooming to the
                  // resolved point alone gives a technically correct chart with
                  // nothing on it, because a ray landing 28 km away in rural
                  // Maharashtra has no named neighbours that close.
                  spanKm={Math.max(300, Math.min(1100, (fix?.groundKm ?? 60) * 7))}
                />
                <span className="anno demo-inset-tag">Plan</span>
              </div>

              {/* the reticle: corner brackets, never a full box */}
              <div className="reticle" aria-hidden="true">
                <i className="reticle-c reticle-tl" />
                <i className="reticle-c reticle-tr" />
                <i className="reticle-c reticle-bl" />
                <i className="reticle-c reticle-br" />
                <i className="reticle-cross" />
              </div>

              {/* the answer, over the frame but never across the middle */}
              <div className="demo-answer" data-band={fix?.band?.id ?? 'none'}>
                {!atlas && !packError && (
                  <>
                    <span className="anno">Loading the atlas</span>
                    <strong className="demo-answer-name num">
                      {fmtBytes(bytes)}
                      {progress ? ` · ${Math.round(progress * 100)}%` : ''}
                    </strong>
                  </>
                )}
                {packError && (
                  <>
                    <span className="anno">Atlas</span>
                    <strong className="demo-answer-name">{packError}</strong>
                  </>
                )}
                {atlas && mode === 'live' && liveState !== 'running' && (
                  <>
                    <span className="anno">Ready</span>
                    <strong className="demo-answer-name">Grant access to begin</strong>
                  </>
                )}
                {atlas && result?.primary && (
                  <>
                    <span className="anno">
                      {fix.band.label}
                      {result.degraded ? ' · widened' : ''}
                    </span>
                    <strong className="demo-answer-name">{result.primary.name}</strong>
                    <span className="demo-answer-kind">
                      {result.primary.kind}
                      {result.context.length
                        ? ` · ${result.context.map((c) => c.name).join(' · ')}`
                        : ''}
                    </span>
                  </>
                )}
                {atlas && fix && !result?.primary && (
                  <>
                    <span className="anno">Unresolved</span>
                    <strong className="demo-answer-name">Nothing it can honestly name</strong>
                  </>
                )}
                {atlas && observer && !fix && (
                  <>
                    <span className="anno">Above the horizon</span>
                    <strong className="demo-answer-name">Sky</strong>
                    <span className="demo-answer-kind">
                      This line of sight never meets the ground.
                    </span>
                  </>
                )}
              </div>

              {mode === 'replay' && (
                <p className="demo-hint anno" aria-hidden="true">
                  Drag to aim
                </p>
              )}

              {/* live permission priming, over the dead frame */}
              {mode === 'live' && liveState !== 'running' && (
                <div className="demo-prime">
                  <p className="anno">NADIR needs two things</p>
                  <ul className="demo-prime-list">
                    <li>
                      <span className="demo-prime-k">Camera</span>
                      <span>to show you what you are aiming at</span>
                    </li>
                    <li>
                      <span className="demo-prime-k">Location and motion</span>
                      <span>to work out where that is</span>
                    </li>
                  </ul>
                  <button className="btn btn-primary" onClick={startLive}>
                    <span>
                      {liveState === 'asking' ? 'Asking' : 'Allow and start'}
                    </span>
                  </button>
                  <p className="demo-prime-note">
                    Nothing leaves the device. There is no account, no server and
                    no request made after this page has loaded.
                  </p>
                  {liveError && <p className="demo-prime-err">{liveError}</p>}
                </div>
              )}
            </div>

            {/* -------------------------------------------------- readouts */}
            <aside className="demo-side">
              <Readout label="Position">
                {observer?.lat != null ? formatLatLon(observer.lat, observer.lon) : '—'}
              </Readout>
              <Readout label="Altitude">
                {observer?.altitude != null
                  ? `${Math.round(observer.altitude).toLocaleString()} m`
                  : '—'}
              </Readout>
              <Readout label="Track">
                {observer?.track != null ? `${observer.track.toFixed(0)}°` : '—'}
              </Readout>
              <Readout label="Looking">
                {observer?.bearing != null ? `${observer.bearing.toFixed(0)}°` : '—'}
              </Readout>
              <Readout label="Below level">
                {observer?.depression != null ? `${observer.depression.toFixed(1)}°` : '—'}
              </Readout>
              <Readout label="Horizon at">
                {dip != null ? `${dip.toFixed(2)}°` : '—'}
              </Readout>
              <Readout label="Ground range">
                {fix ? `${fix.groundKm.toFixed(1)} km` : '—'}
              </Readout>
              <Readout label="Error, along">
                {fix
                  ? Number.isFinite(fix.ellipse.alongKm)
                    ? `± ${fix.ellipse.alongKm < 10 ? fix.ellipse.alongKm.toFixed(2) : fix.ellipse.alongKm.toFixed(0)} km`
                    : 'unbounded'
                  : '—'}
              </Readout>
              <Readout label="Error, across">
                {fix ? `± ${fix.ellipse.crossKm.toFixed(2)} km` : '—'}
              </Readout>
              <Readout label="Heading from">
                {observer?.source === 'replay'
                  ? 'GPS track'
                  : observer?.calibrated
                    ? 'GPS track'
                    : 'not calibrated'}
              </Readout>
            </aside>
          </div>

          {/* ------------------------------------------------------ footer */}
          {mode === 'replay' && (
            <>
              <div className="demo-foot">
                <button
                  className="demo-play"
                  onClick={() => setPlaying((v) => !v)}
                  aria-label={playing ? 'Pause the flight' : 'Fly the route'}
                >
                  {playing ? '❙❙' : '▶'}
                </button>
                <input
                  className="demo-scrub"
                  type="range"
                  min="0"
                  max="1000"
                  value={Math.round((observer?.progress ?? 0) * 1000)}
                  onChange={(e) => replayRef.current?.seek(Number(e.target.value) / 1000)}
                  aria-label="Position along the route"
                />
                <span className="anno demo-foot-note">
                  {observer?.routeName ?? ''}
                  {observer?.remainingKm != null
                    ? ` · ${observer.remainingKm.toFixed(0)} km to run`
                    : ''}
                </span>
              </div>

              {/* Dragging the frame is the nice way to aim, but it is mouse
                  only. These are the same two controls, reachable from a
                  keyboard, and the look-down slider is the one that matters:
                  push it towards the horizon and watch the error run away. */}
              <div className="demo-aim">
                <label className="demo-aim-ctl">
                  <span className="anno">Look down</span>
                  <input
                    type="range"
                    min="10"
                    max="880"
                    value={Math.round((observer?.depression ?? 22) * 10)}
                    onChange={(e) =>
                      replayRef.current?.aim({ depression: Number(e.target.value) / 10 })
                    }
                    aria-label="Degrees below level"
                  />
                  <span className="num demo-aim-val">
                    {(observer?.depression ?? 0).toFixed(1)}°
                  </span>
                </label>

                <label className="demo-aim-ctl">
                  <span className="anno">Swing</span>
                  <input
                    type="range"
                    min="-160"
                    max="-20"
                    value={Math.round(
                      side === 'left'
                        ? (replayRef.current?.relativeBearing ?? -90)
                        : -(replayRef.current?.relativeBearing ?? 90)
                    )}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      replayRef.current?.aim({
                        relativeBearing: side === 'left' ? v : -v,
                      });
                    }}
                    aria-label="Swing the look around the aircraft"
                  />
                  <span className="num demo-aim-val">
                    {observer?.bearing != null ? `${observer.bearing.toFixed(0)}°` : '—'}
                  </span>
                </label>
              </div>
            </>
          )}

          {mode === 'live' && liveState === 'running' && (
            <div className="demo-foot">
              <button className="btn" onClick={stopLive}>
                <span>Stop</span>
              </button>
              <span className="anno demo-foot-note">
                {observer?.turning
                  ? 'Turning. The gravity vector is banked, so the look angle is unreliable until the wings level.'
                  : observer?.calibrated
                    ? 'Calibrated against the window. Heading is coming from the GPS track.'
                    : 'Hold the phone flat against the window, then tap Left or Right above to calibrate.'}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Readout({ label, children }) {
  return (
    <div className="readout">
      <span className="anno">{label}</span>
      <strong className="num">{children}</strong>
    </div>
  );
}
