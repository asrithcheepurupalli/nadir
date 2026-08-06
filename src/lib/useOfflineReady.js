import { useEffect, useState } from 'react';

/**
 * Is the world atlas actually sitting in Cache Storage yet?
 *
 * The service worker fetches it on install, off the main thread, with no UI
 * of its own. That is invisible, and invisible is exactly wrong for the one
 * fact someone standing at a gate needs to know before the wifi goes away:
 * did it finish. So this polls Cache Storage directly rather than trusting
 * that install ran.
 */
export function useOfflineReady() {
  const [state, setState] = useState('checking'); // checking | pending | ready | unsupported

  useEffect(() => {
    if (!('caches' in window) || !('serviceWorker' in navigator)) {
      setState('unsupported');
      return;
    }

    let alive = true;
    const check = async () => {
      try {
        const keys = await caches.keys();
        const packKey = keys.find((k) => k.startsWith('nadir-') && k.endsWith('-pack'));
        if (!packKey) {
          if (alive) setState('pending');
          return;
        }
        const cache = await caches.open(packKey);
        const hit = await cache.match('/pack/world.json');
        if (alive) setState(hit ? 'ready' : 'pending');
      } catch {
        if (alive) setState('pending');
      }
    };

    check();
    const id = setInterval(check, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return state;
}
