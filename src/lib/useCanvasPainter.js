import { useCallback, useEffect, useRef } from 'react';

/**
 * A canvas that redraws when something changes, and not otherwise.
 *
 * The first version of this page ran four independent requestAnimationFrame
 * loops, each repainting unconditionally at 60fps. Two of them re-project
 * several thousand polyline vertices through a camera model on every frame.
 * Together they saturated the main thread badly enough that the renderer stopped
 * responding altogether: no rAF, no IntersectionObserver callbacks, no paint.
 * The canvases sat at their default 300x150 because their draw had never once
 * been reached.
 *
 * The fix is to stop treating a static picture as an animation. A frame is
 * scheduled when the inputs change, when the element resizes, or when it scrolls
 * back into view, and at most one frame is ever queued. Nothing off screen paints
 * at all. When the replay is playing the component re-renders per frame anyway,
 * so continuous motion still works, and it costs exactly what it should.
 *
 * @param {(ctx, size) => void} paint  draws one frame; size is { w, h, dpr }
 * @returns {{ ref, redraw }}          attach ref to the canvas, call redraw to
 *                                     request a frame explicitly
 */
export function useCanvasPainter(paint) {
  const canvasRef = useRef(null);
  const paintRef = useRef(paint);
  paintRef.current = paint;

  const rafRef = useRef(0);
  const visibleRef = useRef(false);

  const redraw = useCallback(() => {
    if (rafRef.current || !visibleRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const canvas = canvasRef.current;
      if (!canvas || !visibleRef.current) return;

      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      paintRef.current?.(ctx, { w, h, dpr });
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const io = new IntersectionObserver(
      ([e]) => {
        visibleRef.current = e.isIntersecting;
        if (e.isIntersecting) redraw();
        else if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    const ro = new ResizeObserver(() => redraw());
    ro.observe(canvas);

    return () => {
      io.disconnect();
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [redraw]);

  // Every render is a potential change of inputs, so ask for a frame. The
  // guards above collapse a burst of renders into a single paint.
  useEffect(() => {
    redraw();
  });

  return { ref: canvasRef, redraw };
}
