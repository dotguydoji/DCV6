import { useEffect } from 'react';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Drives a single shared --scroll-tilt-x CSS variable (read by .tilt-row
 * and .card-tilt in index.css) off scroll direction/velocity: scrolling
 * down nudges it negative, scrolling up nudges it positive, easing back to
 * flat whenever scrolling pauses. Written once on <html> via rAF - not
 * React state - since a scroll-tied value like this ticks on every frame,
 * and re-rendering the component tree for a value only CSS consumes would
 * be wasted work. Every element that wants the effect just references
 * var(--scroll-tilt-x) in its own (small, locally-scoped) transform, which
 * keeps the rotation origin local to each element instead of rotating one
 * huge multi-thousand-pixel-tall container - the latter would fling
 * far-off content wildly off-screen at even a couple of degrees.
 */
export const useGlobalScrollTilt = (maxDegrees = 2.2) => {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const root = document.documentElement;
    let current = 0;
    let target = 0;
    let lastScrollY = window.scrollY;
    let rafId = 0;
    let running = false;

    const tick = () => {
      current += (target - current) * 0.1;
      target *= 0.92;
      root.style.setProperty('--scroll-tilt-x', `${current.toFixed(3)}deg`);

      if (Math.abs(target) > 0.02 || Math.abs(current - target) > 0.02) {
        rafId = requestAnimationFrame(tick);
      } else {
        root.style.setProperty('--scroll-tilt-x', '0deg');
        running = false;
      }
    };

    const onScroll = () => {
      const scrollY = window.scrollY;
      const delta = scrollY - lastScrollY;
      lastScrollY = scrollY;
      target = clamp(target - delta * 0.12, -maxDegrees, maxDegrees);
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
      root.style.removeProperty('--scroll-tilt-x');
    };
  }, [maxDegrees]);
};
