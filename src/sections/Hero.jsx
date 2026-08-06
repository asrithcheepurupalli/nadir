import LimbDiagram from '../components/LimbDiagram.jsx';
import { horizonDip, castRay } from '../engine/geo.js';
import { PACK } from '../data/pack-stats.js';

const DIP = horizonDip(11300);
const HORIZON = castRay({
  lat: 0,
  lon: 0,
  altitude: 11300,
  bearing: 0,
  depression: DIP,
}).groundKm;

export default function Hero() {
  return (
    <section className="hero" id="top" data-tone="light">
      <div className="graticule" aria-hidden="true" />

      <div className="wrap hero-in">
        <div className="hero-head">
          <p className="hero-eyebrow anno" data-reveal>
            <span className="anno-amber">NADIR</span>
            <span className="hero-eyebrow-def">
              n. the point on the ground directly beneath you
            </span>
          </p>

          <h1 className="title t-xxl hero-h1" data-reveal data-delay="1">
            What <span className="serif-italic">is</span> that?
          </h1>

          <p className="lede hero-lede" data-reveal data-delay="2">
            You have asked it through every window seat you have ever had.
            Thirty centimetres of acrylic, eleven kilometres of air, and a
            river you will never be able to name.
          </p>

          <p className="hero-sub body-copy" data-reveal data-delay="3">
            <span>
              Hold your phone to the window. NADIR reads where you are, which way
              you are looking and how far below level, then works out the point
              on the ground your camera is aimed at and names it.
            </span>
            <span>
              It does all of that with the radio off, because the atlas is
              already on the phone. And when it is not sure, it says so.
            </span>
          </p>

          <div className="hero-cta" data-reveal data-delay="4">
            <a className="btn btn-primary" href="#demo">
              <span>Try it now</span>
            </a>
            <a className="btn" href="#get">
              <span>$5, once</span>
            </a>
          </div>
        </div>

        <div className="hero-figure" data-reveal data-delay="2">
          <LimbDiagram />
        </div>
      </div>

      {/* The fact the whole product hangs off, stated once, at the bottom of
          the first screen, where a sectional prints its panel legend. */}
      <div className="wrap">
        <div className="hero-legend" data-reveal>
          <div className="hero-legend-item">
            <span className="anno">Horizon, at cruise</span>
            <strong className="num t-m">{DIP.toFixed(2)}°</strong>
            <span className="hero-legend-note">
              below level. The entire visible world is folded into about three
              degrees of look-down angle.
            </span>
          </div>
          <div className="hero-legend-item">
            <span className="anno">And it is</span>
            <strong className="num t-m">{HORIZON.toFixed(0)} km</strong>
            <span className="hero-legend-note">
              away. Which is why one degree of error can move the answer into
              the next state.
            </span>
          </div>
          <div className="hero-legend-item">
            <span className="anno">Atlas on the device</span>
            <strong className="num t-m">{PACK.gzipMB} MB</strong>
            <span className="hero-legend-note">
              Coastlines, rivers, ranges, seas and{' '}
              {PACK.total.toLocaleString()} named features. The whole world, no
              signal.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
