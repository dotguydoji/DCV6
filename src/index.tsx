
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';
import { THEME_STORAGE_KEY } from './lib/theme';
import { registerServiceWorker } from './registerServiceWorker';
import './index.css';

// devOptions.enabled is false (vite.config.ts) - no service worker exists
// in dev at all, so this would be a no-op there anyway, but guarding
// explicitly avoids any console noise from virtual:pwa-register in dev.
if (import.meta.env.PROD) {
  registerServiceWorker();
}

/**
 * Sets [data-theme] on <html> synchronously, before React ever renders -
 * without this, the page would paint with index.css's light-mode default
 * for one frame (until ThemeProvider's own effect runs) even for a visitor
 * who has dark mode saved, producing a visible flash.
 *
 * Dark is the default for every first-time visitor, regardless of their
 * system's light/dark preference - light mode is purely opt-in, chosen via
 * the theme toggle (which is what sets THEME_STORAGE_KEY in the first
 * place). Once a visitor has picked either theme, that saved choice always
 * wins here.
 *
 * This logic would normally live in a blocking inline <script> in
 * index.html (the standard technique for this), but this site's CSP
 * (netlify.toml) is script-src 'self' with no 'unsafe-inline' - an inline
 * script block would be silently blocked by the browser in production.
 * Running it here instead, at the top of this already-'self'-hosted
 * module, achieves the same practical effect without touching CSP at all.
 */
(function applyInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
