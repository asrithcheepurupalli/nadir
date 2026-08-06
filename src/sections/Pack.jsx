import { PACK } from '../data/pack-stats.js';

const n = (v) => (v ?? 0).toLocaleString();

// Counts come straight from the generated pack stats, so this list cannot
// quietly start lying the next time the layers change.
const LAYERS = [
  { k: 'towns and cities', c: PACK.counts.city, note: 'with population, so the resolver knows how big each one is' },
  { k: 'named summits', c: PACK.counts.peak, note: 'the one thing easier to identify from above than below' },
  { k: 'river segments', c: PACK.counts.river, note: 'the most recognisable thing in the world from a window' },
  { k: 'coastline runs', c: PACK.counts.coast, note: 'unnamed, and never offered as an answer' },
  { k: 'mountain ranges', c: PACK.counts.range, note: 'as polygons, because you are over them, not near them' },
  { k: 'seas, bays and gulfs', c: PACK.counts.marine, note: 'usually the only honest answer over water' },
  { k: 'states and provinces', c: PACK.counts.admin1, note: 'what it falls back to when it cannot be specific' },
  { k: 'lakes', c: PACK.counts.lake, note: `and ${PACK.counts.plateau} plateaus, ${PACK.counts.desert} deserts, ${PACK.counts.delta} deltas` },
];

export default function Pack() {
  return (
    <section className="pack" id="pack" data-tone="light">
      <div className="wrap">
        <header className="sec-head" data-reveal>
          <span className="panel-id">05 / OFFLINE</span>
          <h2 className="title t-xl">
            The whole world, <span className="serif-italic">{PACK.gzipMB} MB</span>
          </h2>
          <p className="lede narrow">
            There is no signal at cruise, and the wifi you paid for is not going
            to carry map tiles. So nothing is fetched. The entire atlas is on
            the device before you board, and it is smaller than one photograph.
          </p>
        </header>

        <div className="pack-grid">
          <ul className="pack-layers" data-reveal>
            {LAYERS.map((l) => (
              <li key={l.k}>
                <strong className="num">{n(l.c)}</strong>
                <span className="pack-layers-k">{l.k}</span>
                <span className="pack-layers-note">{l.note}</span>
              </li>
            ))}
          </ul>

          <div className="pack-aside" data-reveal data-delay="1">
            <div className="pack-stat">
              <span className="anno">Compressed</span>
              <strong className="num t-l">{PACK.gzipMB} MB</strong>
            </div>
            <div className="pack-stat">
              <span className="anno">Named features</span>
              <strong className="num t-l">{n(PACK.total)}</strong>
            </div>
            <div className="pack-stat">
              <span className="anno">Requests made in flight</span>
              <strong className="num t-l">0</strong>
            </div>

            <div className="pack-copy body-copy">
              <p>
                The data is Natural Earth, which is public domain, simplified
                with Douglas-Peucker and rounded to about a hundred metres.
                Nothing on board needs more precision than that, because the
                sensors are the limit long before the map is.
              </p>
              <p>
                Because it is all local, there is no account, no telemetry and
                nothing to leak. Your position never leaves the phone for the
                simple reason that there is nowhere for it to go.
              </p>
            </div>
          </div>
        </div>

        <p className="pack-caveat anno" data-reveal>
          Honest limits · state boundaries currently cover nine countries ·
          the gazetteer is Natural Earth rather than a full GeoNames extract ·
          both are pack upgrades, not engine changes
        </p>
      </div>
    </section>
  );
}
