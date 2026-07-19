/**
 * `Promise.withResolvers()` only landed in Safari 17.4 (March 2024) - the
 * installed pdf.js version calls it unconditionally in its internal
 * PDFWorker class (`#capability = Promise.withResolvers()`), with no
 * fallback of its own. On any iPhone/iPad still on an older Safari, that
 * throws the instant a PDF starts loading (before anything renders),
 * bypassing every other safeguard in the viewer and landing on the app's
 * top-level ErrorBoundary - confirmed via a real crash report showing
 * exactly `TypeError: Promise.withResolvers is not a function` thrown from
 * inside the pdf-viewer-lib chunk. This must be imported first, before any
 * other module (see index.tsx), so it's guaranteed to exist before the
 * lazily-loaded PDF viewer code ever runs.
 */
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export {};
