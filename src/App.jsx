import Nav from './components/Nav.jsx';
import Hero from './sections/Hero.jsx';
import Demo from './sections/Demo.jsx';
import Honesty from './sections/Honesty.jsx';
import Geometry from './sections/Geometry.jsx';
import Pack from './sections/Pack.jsx';
import Get from './sections/Get.jsx';
import Close from './sections/Close.jsx';
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
        <Demo />
        <Honesty />
        <Geometry />
        <Pack />
        <Get />
      </main>
      <Close />
    </>
  );
}
