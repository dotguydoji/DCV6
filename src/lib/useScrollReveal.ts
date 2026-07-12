import { useEffect, useRef } from 'react';

/**
 * Adds the `is-revealed` class (see .reveal / .reveal-stagger in index.css)
 * to an element the first time it scrolls into view, then stops observing -
 * a one-shot reveal, not a repeating scroll effect. Skips the observer
 * entirely under prefers-reduced-motion so the element is just shown as-is.
 */
export const useScrollReveal = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.classList.add('is-revealed');
      return;
    }

    // Positive bottom margin makes the observer's effective area extend
    // *below* the real viewport, so the reveal fires while the section is
    // still approaching from below instead of waiting until it's already
    // 80px into view - by the time it actually scrolls into sight, the
    // animation has a head start (often already finished on a fast scroll)
    // instead of visibly lagging behind the scroll position.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0, rootMargin: '0px 0px 200px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return ref;
};
