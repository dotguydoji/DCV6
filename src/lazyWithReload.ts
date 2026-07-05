import { lazy, ComponentType } from 'react';

// A stale cached index.html can still reference JS chunk files that a
// newer deploy has since deleted (their hashed filenames changed), which
// 404s and leaves the page blank with no way to recover on its own. This
// wraps lazy() so a failed chunk fetch triggers one automatic reload,
// which re-fetches index.html (always revalidated, see netlify.toml) and
// picks up the current build's real filenames.
const RELOAD_FLAG_KEY = 'chunk-reload-attempted';

export function lazyWithReload<T extends { default: ComponentType<any> }>(
  factory: () => Promise<T>
) {
  return lazy(() =>
    factory()
      .then((module) => {
        sessionStorage.removeItem(RELOAD_FLAG_KEY);
        return module;
      })
      .catch((error) => {
        if (sessionStorage.getItem(RELOAD_FLAG_KEY)) {
          throw error;
        }
        sessionStorage.setItem(RELOAD_FLAG_KEY, '1');
        window.location.reload();
        return new Promise<T>(() => {});
      })
  );
}
