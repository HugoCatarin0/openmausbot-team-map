"use strict";
// Apply the saved display mode before CSS/first paint to avoid a gray flash.
(() => {
  const key = 'openmausbot-team-map-display-mode-v1';
  let mode = 'dark';
  try { if (localStorage.getItem(key) === 'oled') mode = 'oled'; } catch {}
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  function apply() {
    root.dataset.displayMode = mode;
    if (themeColor) themeColor.content = mode === 'oled' ? '#000000' : '#101113';
    const toggle = document.getElementById('oled-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(mode === 'oled'));
      toggle.title = mode === 'oled' ? 'OLED mode on — switch to the original dark theme' : 'Use pure black backgrounds for OLED screens';
    }
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('oled-toggle').addEventListener('click', () => {
      mode = mode === 'oled' ? 'dark' : 'oled';
      apply();
      try { localStorage.setItem(key, mode); } catch {}
    });
  });
})();
