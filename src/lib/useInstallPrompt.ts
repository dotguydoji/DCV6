import { useCallback, useEffect, useState } from 'react';
import { detectInstallPlatform, InstallBrowser, InstallPlatform } from './installPlatform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

const isStandaloneMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as NavigatorWithStandalone;
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
};

export const useInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isStandaloneMode);
  const [{ platform, browser }] = useState<{ platform: InstallPlatform; browser: InstallBrowser }>(
    detectInstallPlatform
  );

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => {
      if (isStandaloneMode()) setIsInstalled(true);
    };

    standaloneQuery.addEventListener('change', handleDisplayModeChange);
    return () => standaloneQuery.removeEventListener('change', handleDisplayModeChange);
  }, []);

  useEffect(() => {
    if (isInstalled) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isInstalled]);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const hasNativePrompt = deferredPrompt !== null;
  // Once truly installed (confirmed via the 'appinstalled' event or the page
  // itself running in standalone display mode), there's nothing left to
  // install - hide the option. Every other case stays visible: unlike the
  // old logic, this isn't gated on a native prompt being available or on a
  // previous dismissal, since the menu entry is now a persistent, deliberate
  // item the visitor navigates to (not a nagging popup) - a platform with no
  // native prompt (iOS, or any browser that never fired beforeinstallprompt)
  // still has a real, working manual guide behind it.
  const canInstall = !isInstalled;

  return { canInstall, isInstalled, hasNativePrompt, promptInstall, platform, browser };
};
