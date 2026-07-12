import { registerSW } from 'virtual:pwa-register';

/**
 * Without this, a returning visitor's browser could keep running an old
 * service worker indefinitely after a new deploy - it would keep serving
 * its own cached index.html (which references JS chunk filenames a newer
 * deploy has already deleted from the server), producing a blank page
 * (just the CSS-only grid background, since the JS never loads to mount
 * anything) until the visitor manually reloaded or cleared their cache.
 * The browser only swaps in a newly-downloaded waiting worker once every
 * open tab for the site is fully closed - "left the tab open in the
 * background, came back later" never satisfies that.
 *
 * registerSW's own `onNeedRefresh` fires the moment a new worker is found
 * waiting; calling updateSW(true) tells it to activate right away and
 * reloads the page once it takes over - automatically, no user action
 * needed. The manual `controllerchange` listener below is a second,
 * independent safety net for the same handoff in case a new worker ever
 * takes control outside that callback (e.g. activated from another tab of
 * the same site) - guarded so it can only ever reload once.
 */
export const registerServiceWorker = (): void => {
  if (!('serviceWorker' in navigator)) return;

  let hasReloaded = false;
  const reloadOnce = () => {
    if (hasReloaded) return;
    hasReloaded = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true).catch(reloadOnce);
    }
  });
};
