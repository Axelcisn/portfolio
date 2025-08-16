// lib/theme.js

// ===============================
// THEME ENGINE (NightShift helper)
// ===============================

// ✅ constants
const STORE_KEY = "theme";            // "light" | "dark"
const ATTR_KEY  = "data-theme";       // html[data-theme="dark"]
const CLASS_DARK = "dark";            // Tailwind-style dark mode support

// ✅ derive system preference once (fallback)
function systemPref() {
  try {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

// ✅ read current theme from storage or DOM
export function getTheme() {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {}
  // check DOM
  const html = document.documentElement;
  const attr = html.getAttribute(ATTR_KEY);
  if (attr === "light" || attr === "dark") return attr;
  return systemPref();
}

// ✅ apply theme to <html>, keep both attribute + class in sync
export function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";

  const html = document.documentElement;
  // 🔄 keep attribute in sync
  html.setAttribute(ATTR_KEY, t);
  // 🔄 keep .dark class in sync (Tailwind dark variants)
  if (t === "dark") html.classList.add(CLASS_DARK);
  else html.classList.remove(CLASS_DARK);

  // emit to listeners (optional)
  try {
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: t } }));
  } catch {}
  return t;
}

// ✅ public setter: persists + applies
export function setTheme(theme) {
  const t = applyTheme(theme);
  try { localStorage.setItem(STORE_KEY, t); } catch {}
  return t;
}

// ✅ call once on app bootstrap (layout) to avoid theme flash
export function initTheme() {
  const t = getTheme();
  applyTheme(t);
  return t;
}
