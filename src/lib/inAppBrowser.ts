/**
 * Detects whether the page is currently running inside a social app's
 * built-in "in-app browser" (Facebook, Messenger, Instagram, etc.) rather
 * than a real browser (Chrome, Safari, Firefox...).
 *
 * Why this matters: Google's OAuth 2.0 policy
 * (https://developers.google.com/identity/protocols/oauth2/policies#browsers)
 * disallows routing an OAuth request through an "embedded user-agent under
 * the developer's control" - a native app that embeds its own WebView and
 * loads Google's sign-in page inside it. That's not what's happening here:
 * this site never embeds a WebView itself. The embedded browser is
 * Messenger/Instagram/Facebook's own, chosen by *their* app when a visitor
 * taps a link shared inside them - entirely outside this site's control.
 * Google still detects and blocks sign-in there by user-agent regardless of
 * whose "fault" the WebView is, so the only thing a website itself can do
 * is detect it and tell the visitor how to escape it (there is no
 * programmatic way to force Messenger to hand the page to Chrome).
 *
 * Privacy note: this reads `navigator.userAgent`, a standard, always-
 * available browser property already sent in the User-Agent HTTP header on
 * every request regardless - it is not personal data, not a persistent
 * identifier, and nothing here is written to storage or sent anywhere.
 * Checking it client-side has no consent/cookie-law implications under
 * GDPR/ePrivacy (Art. 5(3) only concerns storing or reading something
 * *stored* on the user's device, which this never does).
 */

// Deliberately only the well-documented, low-false-positive-risk in-app
// browser signatures for the platforms this site is actually shared
// through (Facebook/Messenger/Instagram) plus a couple of other very
// common ones (WeChat, Twitter/X) - narrow enough that a real Chrome/
// Safari visitor should never be misidentified and shown this unnecessarily.
const IN_APP_BROWSER_PATTERNS = [
  /FBAN/i, // Facebook app's in-app browser
  /FBAV/i, // Facebook app's in-app browser (version marker)
  /FB_IAB/i, // Facebook's own explicit "in-app browser" marker
  /Instagram/i,
  /MicroMessenger/i, // WeChat
  /Twitter/i
];

export const isInAppBrowser = (): boolean => {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  const ua = navigator.userAgent;
  return IN_APP_BROWSER_PATTERNS.some((pattern) => pattern.test(ua));
};
