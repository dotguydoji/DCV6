/**
 * All the real-device bugs that led to forcing pdf.js's main-thread
 * fallback (see PdfViewer.tsx) were reported and reproduced only on
 * Safari on iOS/iPadOS - Android and Windows/desktop browsers never
 * showed any of them. Scoping that workaround to iOS keeps every other
 * platform on pdf.js's normal, better-performing dedicated Worker.
 *
 * iPadOS 13+ reports a desktop-class user-agent string indistinguishable
 * from real macOS Safari ("Macintosh; Intel Mac OS X..."), so a plain
 * `/iPad|iPhone|iPod/` check alone misses modern iPads entirely - the
 * standard workaround is pairing that with the one thing a touch iPad
 * has that a real Mac never does: `navigator.maxTouchPoints > 1` while
 * still reporting as `MacIntel`.
 */
export const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
};
