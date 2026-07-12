import { InstallBrowser, InstallPlatform } from './installPlatform';

export interface InstallGuide {
  /** Used as both the nav item label and the modal title. */
  label: string;
  /** Optional callout shown above the steps (e.g. "switch to Safari first"). */
  intro?: string;
  steps: string[];
  /** Whether to show a real "Install Now" button wired to the native browser prompt. */
  showNativeButton: boolean;
}

const browserLabel = (browser: InstallBrowser): string => {
  switch (browser) {
    case 'chrome':
      return 'Chrome';
    case 'firefox':
      return 'Firefox';
    case 'edge':
      return 'Edge';
    case 'samsung':
      return 'Samsung Internet';
    default:
      return 'this browser';
  }
};

/**
 * Returns accurate, platform-specific install steps. iOS never gets a
 * native browser prompt (Apple doesn't expose one in any iOS browser), so
 * that branch is always the manual Share-sheet walkthrough - "showNativeButton"
 * only ever applies to platforms where a real one-click browser install
 * exists (Android/Windows/Mac, all Chromium-based browsers).
 */
export const getInstallGuide = (
  platform: InstallPlatform,
  browser: InstallBrowser,
  hasNativePrompt: boolean
): InstallGuide => {
  switch (platform) {
    case 'ios': {
      const intro =
        browser === 'safari'
          ? undefined
          : `You're currently browsing in ${browserLabel(browser)}. Installing to your Home Screen only works from Safari on iOS - open this page in Safari first, then follow the steps below.`;

      return {
        label: 'Install on iOS devices',
        intro,
        steps: [
          "Tap the Share icon (a square with an arrow pointing up) in Safari's toolbar.",
          'Scroll down in the menu that appears and tap "Add to Home Screen".',
          'Tap "Add" in the top-right corner to confirm.',
          "Doji's Library now appears on your Home Screen - tap it anytime to open the app, no browser needed."
        ],
        showNativeButton: false
      };
    }

    case 'android': {
      return {
        label: 'Install on Android devices',
        steps: hasNativePrompt
          ? ['Tap "Install Now" below and confirm the install prompt that appears.']
          : [
              'Tap the three-dot menu (⋮) in the top-right corner of your browser.',
              'Tap "Install app" (or "Add to Home screen").',
              'Tap "Install" to confirm.',
              "Find Doji's Library on your Home Screen or in your app drawer."
            ],
        showNativeButton: hasNativePrompt
      };
    }

    case 'windows': {
      return {
        label: 'Install on Windows',
        steps: hasNativePrompt
          ? ['Click "Install Now" below and confirm the install prompt that appears.']
          : [
              'Click the install icon in your browser\'s address bar (or open the ⋮ menu → "Apps" → "Install this site as an app").',
              'Click "Install" in the popup that appears.',
              "Doji's Library opens in its own window and is added to your Start Menu and Taskbar."
            ],
        showNativeButton: hasNativePrompt
      };
    }

    case 'mac': {
      if (browser === 'safari') {
        return {
          label: 'Install on Mac',
          intro:
            'Requires macOS Sonoma (14) or later. If you don\'t see "Add to Dock" in Safari\'s File menu, your macOS version doesn\'t support this yet - bookmark the page instead (Cmd+D).',
          steps: [
            'Click "File" in the menu bar at the top of your screen (not inside the Safari window itself).',
            'Click "Add to Dock…".',
            'Confirm the name, then click "Add".',
            "Doji's Library now appears in your Dock like a native app."
          ],
          showNativeButton: false
        };
      }

      return {
        label: 'Install on Mac',
        steps: hasNativePrompt
          ? ['Click "Install Now" below and confirm the install prompt that appears.']
          : [
              "Click the install icon in your browser's address bar (look for a small monitor or \"+\" icon).",
              'Click "Install" in the popup that appears.',
              "Doji's Library opens in its own window and is added to your Applications."
            ],
        showNativeButton: hasNativePrompt
      };
    }

    default: {
      return {
        label: 'Install App',
        steps: hasNativePrompt
          ? ['Tap "Install Now" below and confirm the install prompt that appears.']
          : [
              'Look for an "Install" or "Add to Home Screen" option in your browser\'s menu.',
              'For the best experience, try opening this page in Chrome, Edge, or Safari.'
            ],
        showNativeButton: hasNativePrompt
      };
    }
  }
};
