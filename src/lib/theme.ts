export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

const DARK_META_COLOR = '#17181a';
const LIGHT_META_COLOR = '#ffffff';

/**
 * Keeps the two theme-aware <meta> tags in sync with the active theme.
 * `theme-color` affects the browser chrome/tab color live (Chrome/Safari
 * both watch it); `color-scheme` tells the browser which native form
 * controls/scrollbars to render. The PWA manifest's own theme_color
 * (vite.config.ts) is baked in at build time and only affects the
 * installed-app splash screen - it can't react to this, which is an
 * unavoidable Web App Manifest limitation, not a bug.
 */
export const syncThemeMetaTags = (theme: Theme): void => {
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  themeColorMeta?.setAttribute('content', theme === 'dark' ? DARK_META_COLOR : LIGHT_META_COLOR);

  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
  colorSchemeMeta?.setAttribute('content', theme === 'dark' ? 'dark' : 'light dark');
};
