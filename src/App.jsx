import Nav from './components/Nav.jsx';
import Hero from './sections/Hero.jsx';
import Demo from './sections/Demo.jsx';
import Honesty from './sections/Honesty.jsx';
import Proof from './sections/Proof.jsx';
import Geometry from './sections/Geometry.jsx';
import Pack from './sections/Pack.jsx';
import Get from './sections/Get.jsx';
import Close from './sections/Close.jsx';
import { useEffect } from 'react';
import { useReveal } from './lib/useReveal.js';
import { useLenis } from './lib/useLenis.js';

/**
 * Honour a hash that was in the URL at load.
 *
 * The browser looks for the anchor while the document is still an empty root
 * div, finds nothing, and gives up. By the time React has rendered the section
 * the moment has passed, so someone opening a shared link to /#pack lands at
 * the top of the page instead.
 */
function useHashLanding() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const go = () => document.getElementById(id)?.scrollIntoView({ behavior: 'auto' });
    // Two frames: one for the commit, one for layout to settle underneath it.
    const raf = requestAnimationFrame(() => requestAnimationFrame(go));
    return () => cancelAnimationFrame(raf);
  }, []);
}

export default function App() {
  useLenis();
  useReveal();
  useHashLanding();

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <Nav />
      <main>
        <Hero />
        <Demo />
        <Honesty />
        <Proof />
        <Geometry />
        <Pack />
        <Get />
      </main>
      <Close />
    </>
  );
}
