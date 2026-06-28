// Light/Dark theme + accessibility (high contrast, UI zoom) handling.
// All preferences are device-specific (localStorage), not backed up.
const THEME_KEY = 'fs-theme';
const CONTRAST_KEY = 'fs-contrast';
const SCALE_KEY = 'fs-scale';

// Status-bar / PWA theme-color per resolved theme (matches the app background).
const META_COLOR = { light: '#ffffff', dark: '#0b1220' };

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

function resolve(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme = getTheme()) {
  const resolved = resolve(theme);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLOR[resolved]);
  return resolved;
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

// ---- Accessibility: high contrast (normal | high) ----
export function getContrast() {
  return localStorage.getItem(CONTRAST_KEY) || 'normal';
}
export function applyContrast(contrast = getContrast()) {
  document.documentElement.dataset.contrast = contrast;
}
export function setContrast(contrast) {
  localStorage.setItem(CONTRAST_KEY, contrast);
  applyContrast(contrast);
}

// ---- Accessibility: UI zoom (normal | large | xl) ----
export function getScale() {
  return localStorage.getItem(SCALE_KEY) || 'normal';
}
export function applyScale(scale = getScale()) {
  document.documentElement.dataset.scale = scale;
}
export function setScale(scale) {
  localStorage.setItem(SCALE_KEY, scale);
  applyScale(scale);
}

let mediaListener = null;
export function initTheme() {
  applyTheme();
  applyContrast();
  applyScale();
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mediaListener) mq.removeEventListener('change', mediaListener);
  mediaListener = () => {
    if (getTheme() === 'system') applyTheme('system');
  };
  mq.addEventListener('change', mediaListener);
}
