/**
 * Runs `scrollAction` after `delayMs`, but skips it entirely if the visitor
 * starts scrolling manually (wheel or touch) before it fires. Without this,
 * a delayed smooth-scroll fires mid-scroll and yanks the page/element back
 * to its target - fighting the visitor's own scroll input hard enough to
 * feel like scrolling "stopped working" or the page "got stuck", since their
 * scroll progress visibly reverses out from under them.
 *
 * Returns a cleanup function that cancels the pending scroll and removes the
 * listeners - call it from a useEffect cleanup.
 */
export const scheduleScrollUnlessUserIntervenes = (scrollAction: () => void, delayMs: number): (() => void) => {
  let userTookControl = false;
  const markUserTookControl = () => {
    userTookControl = true;
  };
  window.addEventListener('wheel', markUserTookControl, { passive: true, once: true });
  window.addEventListener('touchmove', markUserTookControl, { passive: true, once: true });

  const timeoutId = window.setTimeout(() => {
    window.removeEventListener('wheel', markUserTookControl);
    window.removeEventListener('touchmove', markUserTookControl);
    if (!userTookControl) {
      scrollAction();
    }
  }, delayMs);

  return () => {
    window.clearTimeout(timeoutId);
    window.removeEventListener('wheel', markUserTookControl);
    window.removeEventListener('touchmove', markUserTookControl);
  };
};
