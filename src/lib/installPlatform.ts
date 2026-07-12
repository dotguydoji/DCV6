export type InstallPlatform = 'ios' | 'android' | 'windows' | 'mac' | 'other';
export type InstallBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'other';

export interface InstallPlatformInfo {
  platform: InstallPlatform;
  browser: InstallBrowser;
}

/**
 * Platform-level iOS detection (any browser), not just Safari - Apple forces
 * every iOS browser to run on WebKit, so Chrome/Firefox/Edge on iPhone still
 * report "Safari/..." in their UA. A previous version of this check required
 * isSafari === true, which meant the install option silently never appeared
 * for the many iPhone users who default to Chrome - the actual cause behind
 * "I don't see an install icon" reports. iPadOS 13+ reports as a desktop Mac
 * UA, so touch capability is what actually distinguishes an iPad from a real
 * Mac here.
 */
const isIOSUserAgent = (ua: string): boolean => {
  const isTouchMac =
    /Macintosh/.test(ua) &&
    typeof document !== 'undefined' &&
    'ontouchend' in document &&
    typeof navigator !== 'undefined' &&
    navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || isTouchMac;
};

/**
 * Order matters: Samsung Internet and Edge UAs both also contain "Chrome/",
 * and Chrome's UA also contains "Safari/" as a legacy compatibility token -
 * each check below has to run before the broader one it would otherwise
 * false-match.
 */
const detectBrowser = (ua: string): InstallBrowser => {
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/EdgiOS|Edg\//.test(ua)) return 'edge';
  if (/CriOS|Chrome\//.test(ua)) return 'chrome';
  if (/FxiOS|Firefox\//.test(ua)) return 'firefox';
  if (/Safari/.test(ua)) return 'safari';
  return 'other';
};

export const detectInstallPlatform = (): InstallPlatformInfo => {
  if (typeof navigator === 'undefined') {
    return { platform: 'other', browser: 'other' };
  }

  const ua = navigator.userAgent;
  const isIOS = isIOSUserAgent(ua);
  const isTouchMac = isIOS && /Macintosh/.test(ua);
  const isAndroid = !isIOS && /Android/.test(ua);
  const isWindows = /Windows/.test(ua);
  const isMac = !isIOS && !isTouchMac && /Macintosh/.test(ua);

  let platform: InstallPlatform = 'other';
  if (isIOS) platform = 'ios';
  else if (isAndroid) platform = 'android';
  else if (isWindows) platform = 'windows';
  else if (isMac) platform = 'mac';

  return { platform, browser: detectBrowser(ua) };
};
