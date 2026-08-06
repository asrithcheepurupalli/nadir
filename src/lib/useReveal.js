import { useEffect } from 'react';

/**
 * Reveal-on-scroll for anything carrying [data-reveal].
 *
 * One observer for the whole page, and each element is unobserved the moment
 * it fires. A section that has already been read should cost nothing.
 */
export function useReveal(deps = []) {
  useEffect(() => {
    const nodes = document.querySelectorAll('[data-reveal]:not(.is-in)');
    if (!nodes.length) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );

    nodes.forEach((n) => {
      // Anything already at or above the viewport on load is shown outright
      // rather than observed. The browser restores scroll position on reload
      // and a hash link jumps straight down the page, and in both cases the
      // content above never intersects again, so it would stay invisible for
      // the whole session. Reveal is an entrance, not a gate.
      if (n.getBoundingClientRect().top < window.innerHeight * 0.9) {
        n.classList.add('is-in');
        return;
      }
      io.observe(n);
    });

    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
