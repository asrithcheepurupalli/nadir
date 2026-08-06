/**
 * It flew.
 *
 * Every other section is the engine explaining itself. This one is what
 * happened when it left the room, on a real Bhubaneswar to Ranchi flight,
 * on someone else's phone. Two things are worth showing: the one number
 * that was checkable against the pilot's own announcement, and the moment
 * the resolver changed its mind as the ground got close enough to name.
 *
 * The quote is real, anonymised. The two readouts are the actual figures
 * from that flight, redrawn in the app's own chart language rather than
 * published as a cropped screenshot.
 */

const STAGES = [
  {
    alt: '3,774 m',
    band: 'coarse',
    bandLabel: 'Coarse',
    name: 'Jharkhand',
    note: 'Cruising in. A state, not a place, and the app said so.',
  },
  {
    alt: '657 m',
    band: 'confident',
    bandLabel: 'Confident',
    name: 'Ranchi',
    note: 'On short final. The ellipse had collapsed to a city.',
  },
];

export default function Proof() {
  return (
    <section className="proof" id="proof" data-tone="light">
      <div className="wrap">
        <header className="sec-head" data-reveal>
          <span className="panel-id">03 / IT FLEW</span>
          <h2 className="title t-xl">
            Checked against a <span className="serif-italic">pilot</span>
          </h2>
          <p className="lede narrow">
            This is not a lab result. It is what the engine said on an actual
            descent into Ranchi, on a phone that was not ours, read against
            what the flight deck was announcing over the cabin speakers.
          </p>
        </header>

        <div className="proof-grid">
          <figure className="proof-quote" data-reveal>
            <span className="anno">Real flight · unprompted</span>
            <blockquote>
              It is actually accurate. I have heard the pilot saying 12,000
              feet and it showed accurately 3,600 metres. The altitude is
              also fun. But the map is super cool.
            </blockquote>
            <cite>A passenger, Bhubaneswar to Ranchi</cite>
          </figure>

          <div className="proof-panel" data-reveal data-delay="1">
            <div className="proof-alt">
              <span className="anno">Called from the flight deck</span>
              <div className="proof-alt-row">
                <div className="proof-alt-item">
                  <strong className="num">12,000 ft</strong>
                  <span className="proof-alt-k">pilot, over the PA</span>
                </div>
                <div className="proof-alt-x">is</div>
                <div className="proof-alt-item">
                  <strong className="num">3,658 m</strong>
                  <span className="proof-alt-k">the same figure, converted</span>
                </div>
              </div>
              <div className="proof-alt-row proof-alt-row-read">
                <div className="proof-alt-item is-amber">
                  <strong className="num">3,600 m</strong>
                  <span className="proof-alt-k">read on screen, mid flight</span>
                </div>
                <span className="proof-alt-diff anno">58 m off, on a barometer nobody calibrated</span>
              </div>
            </div>

            <div className="proof-stages">
              <span className="anno">The resolver changing its mind, on descent</span>
              <div className="proof-stage-row">
                {STAGES.map((s, i) => (
                  <div key={s.name} className="proof-stage" data-band={s.band}>
                    <span className="anno">{s.alt}</span>
                    <strong className="proof-stage-name">{s.name}</strong>
                    <span className="proof-stage-band anno">{s.bandLabel}</span>
                    <p className="proof-stage-note">{s.note}</p>
                    {i === 0 && <span className="proof-stage-arrow" aria-hidden="true" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
