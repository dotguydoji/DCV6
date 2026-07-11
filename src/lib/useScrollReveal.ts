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

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -80px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return ref;
};
