import { toRad } from '../engine/geo.js';
import { useCanvasPainter } from '../lib/useCanvasPainter.js';

/**
 * The moving map, drawn as a sectional.
 *
 * Track-up rather than north-up, which is how every moving map in a cockpit
 * is oriented, because the thing a passenger wants is "that is out of my left
 * window" and not "that is at 284 degrees true".
 *
 * The chart draws the atlas directly. There are no tiles, no raster, no
 * network. It is the same 1.09 MB of vectors the resolver is reading, which is
 * the honest demonstration that the pack really is the whole atlas.
 *
 * The one element that is not cartography is the error ellipse: a long thin
 * shape lying along the line of sight, showing the region the answer is
 * actually drawn from. It is the whole argument of the product rendered as a
 * shape, and it is deliberately never a pin.
 */

const KM_PER_DEG_LAT = 110.574;

const CSS = (v) =>
  getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export default function ChartMap({
  atlas,
  observer, // { lat, lon, track, bearing }
  fix, // { lat, lon, groundKm, ellipse } or null
  result, // resolver output or null
  spanKm = 420,
  className = '',
}) {
  const palette = {
      paper: CSS('--paper') || '#efe9db',
      paper2: CSS('--paper-2') || '#e7e0cf',
      ink: CSS('--ink') || '#191b19',
      ink3: CSS('--ink-3') || '#6b6d64',
      ink4: CSS('--ink-4') || '#9a9a8d',
    cyan: CSS('--cyan') || '#1a6f8a',
    amber: CSS('--amber') || '#b8510e',
    tan: CSS('--tan') || '#9c7440',
    green: CSS('--green') || '#4a6b3f',
  };

  const { ref } = useCanvasPainter((ctx, { w, h }) => {
      ctx.fillStyle = palette.paper;
      ctx.fillRect(0, 0, w, h);

      if (!atlas || !observer || observer.lat == null) return;

      const { lat: lat0, lon: lon0 } = observer;
      const kmPerDegLon = 111.32 * Math.cos(toRad(lat0));

      // The aircraft sits low on the chart, because everything of interest is
      // ahead of and beside it rather than behind.
      const originX = w / 2;
      const originY = h * 0.62;

      const pxPerKm = Math.min(w, h) / spanKm;
      const rot = -toRad(observer.track ?? 0); // track-up

      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      /** lat/lon to canvas pixels, track-up. */
      const project = (lat, lon) => {
        let dx = (lon - lon0) * kmPerDegLon * pxPerKm;
        let dy = -(lat - lat0) * KM_PER_DEG_LAT * pxPerKm;
        return [originX + dx * cosR - dy * sinR, originY + dx * sinR + dy * cosR];
      };

      // Query a generous box: rotation means the corners reach further than
      // the nominal span.
      const reachKm = (spanKm * 0.85) + Math.hypot(w, h) / pxPerKm / 2;
      const dLat = reachKm / KM_PER_DEG_LAT;
      const dLon = reachKm / Math.max(1, kmPerDegLon);
      const view = atlas.viewport(lon0 - dLon, lat0 - dLat, lon0 + dLon, lat0 + dLat, {
        maxPoints: 60,
      });

      const path = (rings, close) => {
        ctx.beginPath();
        for (const ring of rings) {
          for (let i = 0; i < ring.length; i++) {
            const [x, y] = project(ring[i][1], ring[i][0]);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          if (close) ctx.closePath();
        }
      };

      /* --- water bodies, the cyan plate ---------------------------------- */

      ctx.save();
      for (const p of view.polys) {
        if (p.k !== 'marine' && p.k !== 'lake') continue;
        path(p.g, true);
        ctx.fillStyle = palette.cyan;
        ctx.globalAlpha = p.k === 'lake' ? 0.24 : 0.13;
        ctx.fill();
      }
      ctx.restore();

      /* --- physical regions, the terrain plate --------------------------- */

      const TERRAIN = new Set(['desert', 'plateau', 'range', 'basin', 'delta', 'plain']);
      ctx.save();
      for (const p of view.polys) {
        if (!TERRAIN.has(p.k)) continue;
        path(p.g, true);
        ctx.fillStyle = p.k === 'range' ? palette.tan : palette.green;
        ctx.globalAlpha = p.k === 'range' ? 0.14 : 0.07;
        ctx.fill();
      }
      ctx.restore();

      /* --- administrative boundaries, dashed ----------------------------- */

      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.ink;
      ctx.globalAlpha = 0.22;
      for (const p of view.polys) {
        if (p.k !== 'admin1') continue;
        path(p.g, true);
        ctx.stroke();
      }
      ctx.restore();

      /* --- coastline and rivers ------------------------------------------ */

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const l of view.lines) {
        const isCoast = l.k === 'coast';
        ctx.beginPath();
        for (let i = 0; i < l.g.length; i++) {
          const [x, y] = project(l.g[i][1], l.g[i][0]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = palette.cyan;
        ctx.globalAlpha = isCoast ? 0.85 : 0.5;
        ctx.lineWidth = isCoast ? 1.5 : 0.9;
        ctx.stroke();
      }
      ctx.restore();

      /* --- places -------------------------------------------------------- */

      ctx.save();
      ctx.font = `500 10px ${CSS('--mono') || 'monospace'}`;
      ctx.textBaseline = 'middle';
      const placed = [];
      for (const p of view.points) {
        if (p.k !== 'city' && p.k !== 'peak') continue;
        const [x, y] = project(p.y, p.x);
        if (x < -40 || x > w + 40 || y < -20 || y > h + 20) continue;

        // Cheap label collision: skip anything landing on top of something
        // already drawn. A chart with overlapping type is not a chart.
        if (placed.some((q) => Math.abs(q[0] - x) < 62 && Math.abs(q[1] - y) < 13)) continue;
        placed.push([x, y]);

        ctx.globalAlpha = 0.85;
        if (p.k === 'peak') {
          ctx.beginPath();
          ctx.moveTo(x, y - 3.5);
          ctx.lineTo(x + 3.5, y + 2.5);
          ctx.lineTo(x - 3.5, y + 2.5);
          ctx.closePath();
          ctx.fillStyle = palette.tan;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, p.p > 1e6 ? 3 : 2, 0, Math.PI * 2);
          ctx.fillStyle = palette.ink;
          ctx.fill();
        }

        ctx.globalAlpha = 0.6;
        ctx.fillStyle = palette.ink3;
        ctx.fillText(p.n.toUpperCase(), x + 7, y);
      }
      ctx.restore();

      /* --- the error ellipse --------------------------------------------- */

      if (fix && fix.ellipse) {
        const [fx, fy] = project(fix.lat, fix.lon);
        const along = Number.isFinite(fix.ellipse.alongKm)
          ? fix.ellipse.alongKm
          : spanKm;
        const cross = fix.ellipse.crossKm;

        // Oriented along the line of sight, which is the axis the along-track
        // error acts on. On screen that is the look bearing minus the track,
        // because the chart is already rotated track-up.
        const theta = toRad((observer.bearing ?? 0) - (observer.track ?? 0)) - Math.PI / 2;

        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(theta);
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          Math.max(3, along * pxPerKm),
          Math.max(2, cross * pxPerKm),
          0,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = palette.amber;
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.amber;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.restore();

        /* --- the line of sight ------------------------------------------- */

        const [ax, ay] = project(observer.lat, observer.lon);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(fx, fy);
        ctx.strokeStyle = palette.amber;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1.25;
        ctx.stroke();

        // The resolved point itself
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fillStyle = palette.amber;
        ctx.fill();

        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fx - 9, fy);
        ctx.lineTo(fx - 4, fy);
        ctx.moveTo(fx + 4, fy);
        ctx.lineTo(fx + 9, fy);
        ctx.moveTo(fx, fy - 9);
        ctx.lineTo(fx, fy - 4);
        ctx.moveTo(fx, fy + 4);
        ctx.lineTo(fx, fy + 9);
        ctx.stroke();
        ctx.restore();

        // The answer, set beside the point it belongs to
        if (result?.primary) {
          ctx.save();
          ctx.font = `600 11px ${CSS('--mono') || 'monospace'}`;
          ctx.textBaseline = 'middle';
          const label = result.primary.name.toUpperCase();
          const tw = ctx.measureText(label).width;
          const lx = fx + 14 + tw > w ? fx - 14 - tw : fx + 14;
          ctx.fillStyle = palette.paper;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(lx - 4, fy - 8, tw + 8, 16);
          ctx.globalAlpha = 1;
          ctx.fillStyle = palette.amber;
          ctx.fillText(label, lx, fy);
          ctx.restore();
        }
      }

      /* --- the aircraft -------------------------------------------------- */

      {
        const [ax, ay] = project(observer.lat, observer.lon);
        ctx.save();
        ctx.translate(ax, ay);
        // Always points up, because the chart is track-up.
        ctx.strokeStyle = palette.ink;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(0, 7);
        ctx.moveTo(-8, 1);
        ctx.lineTo(0, -3);
        ctx.lineTo(8, 1);
        ctx.moveTo(-4, 8);
        ctx.lineTo(0, 6);
        ctx.lineTo(4, 8);
        ctx.stroke();
        ctx.restore();
      }

      /* --- scale bar ----------------------------------------------------- */

      {
        const nice = [10, 25, 50, 100, 200, 400];
        const target = spanKm / 4;
        const barKm = nice.reduce((a, b) =>
          Math.abs(b - target) < Math.abs(a - target) ? b : a
        );
        const barPx = barKm * pxPerKm;
        const bx = 16;
        const by = h - 20;
        ctx.save();
        ctx.strokeStyle = palette.ink;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx, by - 4);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + barPx, by);
        ctx.lineTo(bx + barPx, by - 4);
        ctx.stroke();
        ctx.font = `500 9px ${CSS('--mono') || 'monospace'}`;
        ctx.fillStyle = palette.ink3;
        ctx.globalAlpha = 0.8;
        ctx.fillText(`${barKm} KM`, bx + barPx + 6, by - 1);
        ctx.restore();
      }

  });

  return <canvas ref={ref} className={`chartmap ${className}`} aria-hidden="true" />;
}
