import { useEffect, useRef, useState } from 'react';

const LINKS = [
  { href: '#demo', label: 'Try it' },
  { href: '#geometry', label: 'How' },
  { href: '#honesty', label: 'Honesty' },
  { href: '#pack', label: 'Offline' },
  { href: '#get', label: 'Get it' },
];

/**
 * Fixed nav.
 *
 * The only thing here worth explaining is the tone flip. A fixed nav that
 * keeps one colour will eventually sit dark-on-dark or light-on-light as the
 * page changes tone underneath it. Sections declare their own tone with
 * data-tone="dark" and the nav watches which one is currently under it.
 */
export default function Nav() {
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const [lifted, setLifted] = useState(false);
  const barRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const sections = [...document.querySelectorAll('[data-tone]')];
    if (!sections.length) return;

    const check = () => {
      const bar = barRef.current;
      if (!bar) return;
      // Sample just below the middle of the bar, which is where the text sits.
      const y = bar.getBoundingClientRect().bottom - 12;
      let tone = 'light';
      for (const s of sections) {
        const r = s.getBoundingClientRect();
        if (r.top <= y && r.bottom >= y) tone = s.dataset.tone;
      }
      setDark(tone === 'dark');
    };

    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  // Close the mobile sheet on escape, and lock the page behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <header
        ref={barRef}
        className={`nav${dark ? ' is-dark' : ''}${lifted ? ' is-lifted' : ''}`}
      >
        <div className="nav-in">
          <a href="#top" className="nav-mark" aria-label="NADIR, home">
            <span className="nav-mark-word">NADIR</span>
            <span className="nav-mark-dot" aria-hidden="true" />
          </a>

          <nav className="nav-links" aria-label="Sections">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>

          <a href="#get" className="nav-cta">
            $5 once
          </a>

          <button
            className="nav-burger"
            aria-expanded={open}
            aria-controls="nav-sheet"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
            <span className={`nav-burger-icon${open ? ' is-open' : ''}`} aria-hidden="true">
              <i />
              <i />
            </span>
          </button>
        </div>
      </header>

      <div
        id="nav-sheet"
        className={`nav-sheet${open ? ' is-open' : ''}`}
        hidden={!open}
        onClick={(e) => e.target.tagName === 'A' && setOpen(false)}
      >
        <nav aria-label="Sections">
          {LINKS.map((l, i) => (
            <a key={l.href} href={l.href} style={{ '--i': i }}>
              <span className="anno">{String(i + 1).padStart(2, '0')}</span>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
