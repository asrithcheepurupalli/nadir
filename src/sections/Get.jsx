import { useState } from 'react';

export default function Get() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    // No backend yet by design. This records intent locally and the form is
    // wired to a real list before launch rather than pretending now.
    try {
      localStorage.setItem('nadir.waitlist', email);
    } catch {
      /* private browsing, and it does not matter */
    }
    setSent(true);
  };

  return (
    <section className="get" id="get" data-tone="dark">
      <div className="wrap">
        <div className="get-grid">
          <div data-reveal>
            <span className="panel-id">05 / GET IT</span>
            <h2 className="title t-xl get-h2">
              Five dollars. <span className="serif-italic">Once.</span>
            </h2>

            <div className="get-copy body-copy">
              <p>
                There is no server, so there is nothing to charge you rent for.
                No subscription, no account, no advertising and no analytics.
                You buy it, it works on every flight you ever take, and it never
                asks you for anything again.
              </p>
              <p>
                The web demo above is the real engine and it is free to use
                forever. The app is what you want in seat 21A: a barometer for
                altitude instead of GPS, proper sensor fusion, and packs that
                are still there a fortnight after you downloaded them.
              </p>
            </div>

            <ul className="get-list">
              <li>Works in aeroplane mode, on iPhone and Android</li>
              <li>Every pack, worldwide, included</li>
              <li>No account and no network access at all</li>
              <li>The geometry engine is open source, so the error maths can be checked</li>
            </ul>
          </div>

          <div className="get-card" data-reveal data-delay="1">
            <span className="anno">Not shipped yet</span>
            <p className="get-card-lede">
              It is being built. Leave an address and you will hear once, on the
              day it is on the store.
            </p>

            {sent ? (
              <p className="get-done">
                <span className="anno anno-amber">Noted</span>
                One email, on launch day. Nothing else.
              </p>
            ) : (
              <form className="get-form" onSubmit={submit}>
                <label className="sr-only" htmlFor="get-email">
                  Email address
                </label>
                <input
                  id="get-email"
                  type="email"
                  required
                  placeholder="you@somewhere"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button className="btn btn-primary" type="submit">
                  <span>Tell me</span>
                </button>
              </form>
            )}

            <p className="get-card-note">
              Built by <a href="https://made-by-ac.com">made. by ac</a>. If you
              would rather just read how it works, the case study is below.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
