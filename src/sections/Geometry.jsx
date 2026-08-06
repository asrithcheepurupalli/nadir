import { castRay, horizonDip, depressionForGroundRange } from '../engine/geo.js';

const H = 11278;
const DIP = horizonDip(H);
const HORIZON = castRay({ lat: 0, lon: 0, altitude: H, bearing: 0, depression: DIP }).groundKm;

/** What a flat earth would claim, against what the sphere actually gives. */
const ROWS = [45, 20, 10, 5, 4].map((dep) => {
  const real = castRay({ lat: 0, lon: 0, altitude: H, bearing: 0, depression: dep, refraction: false });
  const flat = H / Math.tan((dep * Math.PI) / 180) / 1000;
  return { dep, real: real.groundKm, flat };
});

export default function Geometry() {
  return (
    <section className="geometry" id="geometry" data-tone="light">
      <div className="wrap">
        <header className="sec-head" data-reveal>
          <span className="panel-id">04 / HOW</span>
          <h2 className="title t-xl">
            Three degrees of <span className="serif-italic">everything</span>
          </h2>
          <p className="lede narrow">
            At cruise the horizon sits {DIP.toFixed(2)} degrees below level. Not
            thirty. Three. The whole visible world, out to {HORIZON.toFixed(0)}{' '}
            kilometres, is folded into a band of sky thinner than your thumb at
            arm's length.
          </p>
        </header>

        <div className="geo-grid">
          <article className="geo-card" data-reveal>
            <span className="anno">Step one</span>
            <h3 className="title t-m">Where you are</h3>
            <p>
              GPS works with the radio off. The receiver only listens to
              satellites, so aeroplane mode never touches it, and from a window
              seat it fixes the aircraft to about ten metres. That ten metres
              turns out to be the least of the problems.
            </p>
          </article>

          <article className="geo-card" data-reveal data-delay="1">
            <span className="anno">Step two</span>
            <h3 className="title t-m">Which way you are looking</h3>
            <p>
              Not from the compass. Inside an aluminium tube a magnetometer is a
              rumour, off by fifteen degrees or more. Differentiate consecutive
              GPS fixes instead and the aircraft's course over ground falls out
              to half a degree, with no magnetism involved.
            </p>
          </article>

          <article className="geo-card" data-reveal data-delay="2">
            <span className="anno">Step three</span>
            <h3 className="title t-m">How far below level</h3>
            <p>
              From gravity, which needs no calibration and cannot be confused by
              a seat-back screen. The one thing that breaks it is a turn, where
              the aircraft banks and down stops pointing down, so the app
              declines to answer until the wings are level.
            </p>
          </article>

          <article className="geo-card" data-reveal data-delay="3">
            <span className="anno">Step four</span>
            <h3 className="title t-m">Cast the ray</h3>
            <p>
              Then intersect that line of sight with the earth. On a sphere, not
              a plane. The difference is not academic, as the table below makes
              embarrassingly clear.
            </p>
          </article>
        </div>

        <figure className="geo-table" data-reveal>
          <figcaption>
            <span className="anno">Why the sphere matters</span>
            <p>
              The surface curves away beneath the ray, so the ground has dropped
              by the time the ray arrives and it travels further than a flat
              earth would allow. Shallow the look a little and the flat answer
              stops being an approximation and starts being wrong.
            </p>
          </figcaption>

          <table>
            <thead>
              <tr>
                <th>Look down</th>
                <th>Flat earth says</th>
                <th>The sphere says</th>
                <th>Off by</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.dep}>
                  <td className="num">{r.dep}°</td>
                  <td className="num">{r.flat.toFixed(1)} km</td>
                  <td className="num">{r.real.toFixed(1)} km</td>
                  <td className="num geo-err">
                    {(((r.real - r.flat) / r.real) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
              <tr className="geo-row-limit">
                <td className="num">{DIP.toFixed(2)}°</td>
                <td className="num">{(H / Math.tan((DIP * Math.PI) / 180) / 1000).toFixed(0)} km</td>
                <td className="num">{HORIZON.toFixed(0)} km</td>
                <td className="num geo-err">the horizon</td>
              </tr>
            </tbody>
          </table>
        </figure>

        <div className="geo-compress" data-reveal>
          <h3 className="title t-l">
            And the view does not recede evenly
          </h3>
          <p className="narrow">
            This is the fact that decides everything else. Here is how much of
            your window each slice of ground gets.
          </p>
          <ul className="geo-bars">
            {[10, 25, 50, 100, 200, 400].map((km) => {
              const d = depressionForGroundRange(km, H);
              return (
                <li key={km}>
                  <span className="anno">{km} km out</span>
                  <span className="geo-bar" style={{ '--pct': `${(d / 50) * 100}%` }} />
                  <span className="num">{d.toFixed(2)}° below level</span>
                </li>
              );
            })}
          </ul>
          <p className="geo-compress-note narrow">
            The first ten kilometres of ground take up more of your window than
            everything between one hundred and four hundred kilometres put
            together. Aim near the horizon and a hand tremor moves the answer
            across a state.
          </p>
        </div>
      </div>
    </section>
  );
}
