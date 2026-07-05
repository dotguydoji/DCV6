import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

const isIOSDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIOSUA = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Android/.test(ua);
  return isIOSUA && isSafari;
};

const isStandaloneMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as NavigatorWithStandalone;
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
};

const DISMISSED_KEY = 'pwa-install-dismissed';

const wasDismissedThisSession = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

export const useInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isStandaloneMode);
  const [isIOS] = useState(isIOSDevice);
  const [dismissed, setDismissed] = useState(wasDismissedThisSession);

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
    } else {
      setDismissed(true);
      try {
        sessionStorage.setItem(DISMISSED_KEY, '1');
      } catch {}
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const hasNativePrompt = deferredPrompt !== null;
  const canInstall = !isInstalled && !dismissed && (hasNativePrompt || isIOS);

  return { canInstall, isIOS, isInstalled, hasNativePrompt, promptInstall };
};
