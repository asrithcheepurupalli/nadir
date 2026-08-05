import Nav from './components/Nav.jsx';
import Hero from './sections/Hero.jsx';
import { useReveal } from './lib/useReveal.js';
import { useLenis } from './lib/useLenis.js';

export default function App() {
  useLenis();
  useReveal();

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <Nav />
      <main>
        <Hero />
      </main>
    </>
  );
}
