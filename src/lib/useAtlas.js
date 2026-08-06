import { useEffect, useRef, useState } from 'react';
import { loadAtlas } from '../engine/atlas.js';

/**
 * Load the offline pack, once, when it is first actually needed.
 *
 * Deliberately not loaded at boot. It is a megabyte, and a visitor who reads
 * the page and leaves should never pay for it. It starts downloading when the
 * demo comes within a screen of the viewport, which in practice means it has
 * arrived by the time anyone scrolls to it.
 *
 * Progress is surfaced rather than hidden, because watching the entire world
 * arrive as a single small file is the most direct argument the product has.
 */
export function useAtlas(trigger = true) {
  const [atlas, setAtlas] = useState(null);
  const [progress, setProgress] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [error, setError] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (!trigger || started.current) return;
    started.current = true;

    let alive = true;
    loadAtlas('/pack/world.json', (p, got) => {
      if (!alive) return;
      if (p !== null) setProgress(p);
      setBytes(got);
    })
      .then((a) => alive && setAtlas(a))
      .catch((e) => alive && setError(e.message || 'could not load the pack'));

    return () => {
      alive = false;
    };
  }, [trigger]);

  return { atlas, progress, bytes, error };
}

/** True once `ref` has come within `margin` of the viewport, and stays true. */
export function useNearViewport(ref, margin = '100% 0px') {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') return setNear(true);

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near, margin]);

  return near;
}
