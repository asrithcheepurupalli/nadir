export default function Close() {
  return (
    <footer className="close" data-tone="light">
      <div className="wrap">
        <div className="close-top" data-reveal>
          <p className="title t-l narrow">
            You will still not know what most of it is called. But you will know
            when you <span className="serif-italic">do</span>.
          </p>
        </div>

        <div className="close-grid">
          <div className="close-col">
            <span className="anno">NADIR</span>
            <p>
              n. the point on the ground directly beneath an observer. From the
              Arabic <em>naẓīr</em>, meaning opposite: the point facing the
              zenith.
            </p>
          </div>

          <div className="close-col">
            <span className="anno">Data</span>
            <p>
              Natural Earth, public domain. Coastlines, rivers, physical regions
              and populated places, simplified and packed for the device.
            </p>
          </div>

          <div className="close-col">
            <span className="anno">Elsewhere</span>
            <ul className="close-links">
              <li>
                <a href="https://made-by-ac.com">made. by ac</a>
              </li>
              <li>
                <a href="https://made-by-ac.com/labs">made. labs</a>
              </li>
              <li>
                <a href="#demo">Try the engine</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="close-bar">
          <span className="anno">
            © {new Date().getFullYear()} made. by ac ·{" "}
            <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
          </span>
          <span className="anno">
            Built with the radio off
          </span>
        </div>
      </div>
    </footer>
  );
}
