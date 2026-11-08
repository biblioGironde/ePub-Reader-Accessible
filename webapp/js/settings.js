/* Réglages d'affichage et profils d'accessibilité. */
(function () {
  "use strict";

  const DEFAULTS = {
    theme: "clair",
    font: "editeur",
    fontSize: 100,          // %
    lineHeight: 1.5,
    letterSpacing: 0,       // em
    wordSpacing: 0,         // em
    bold: false,
    alignLeft: false,
    noItalic: false,
    noHyphens: false,
    ruler: "off",           // off | regle | masque
    altWords: false,
    bdpq: false,
    flow: "paginated",      // paginated | scrolled
    maxWidth: 70,           // caractères environ par ligne
    spread: false,
    captions: false,
    ttsCaption: false,
    visualAlerts: false,
    ttsAutoBar: false,
    uiScale: 1,
    strongFocus: false,
    reduceMotion: false
  };

  /* Chaque profil ne touche qu'à ses propres réglages ; ils se combinent. */
  const PROFILES = {
    malvoyant: {
      label: "Malvoyants",
      values: { theme: "contraste-jaune", font: "atkinson", fontSize: 170, lineHeight: 1.6, bold: true, alignLeft: true, noHyphens: true, maxWidth: 55, uiScale: 1.3, strongFocus: true, reduceMotion: true, spread: false, ttsAutoBar: true }
    },
    malentendant: {
      label: "Malentendants",
      values: { captions: true, ttsCaption: true, visualAlerts: true }
    },
    dys: {
      label: "Dys",
      values: { theme: "creme", font: "opendyslexic", fontSize: 120, lineHeight: 1.9, letterSpacing: 0.04, wordSpacing: 0.12, alignLeft: true, noItalic: true, noHyphens: true, ruler: "regle", maxWidth: 55, spread: false, ttsCaption: true }
    }
  };

  const FONT_STACKS = {
    editeur: null,
    atkinson: '"Atkinson Hyperlegible", Verdana, Arial, sans-serif',
    lexend: '"Lexend", Verdana, Arial, sans-serif',
    opendyslexic: '"OpenDyslexic", "Comic Sans MS", Verdana, sans-serif',
    sans: 'Verdana, "DejaVu Sans", Arial, Helvetica, sans-serif',
    serif: 'Georgia, "Times New Roman", serif'
  };

  const KEY = "liseuse.settings.v1";
  const state = LPrefs.get(KEY, { profiles: [], overrides: {} });
  if (!Array.isArray(state.profiles)) state.profiles = [];
  if (!state.overrides || typeof state.overrides !== "object") state.overrides = {};

  /* Préférences système au premier lancement */
  if (!LPrefs.get(KEY, null)) {
    try {
      if (matchMedia("(prefers-contrast: more)").matches) state.overrides.theme = "contraste-blanc";
      else if (matchMedia("(prefers-color-scheme: dark)").matches) state.overrides.theme = "sombre";
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) state.overrides.reduceMotion = true;
    } catch (e) { /* ignoré */ }
  }

  const listeners = new Set();

  function effective() {
    const out = Object.assign({}, DEFAULTS);
    for (const p of ["malentendant", "dys", "malvoyant"]) { // malvoyant en dernier : priorité au contraste/taille
      if (state.profiles.includes(p)) Object.assign(out, PROFILES[p].values);
    }
    return Object.assign(out, state.overrides);
  }

  function emit(changedKeys) {
    LPrefs.set(KEY, state);
    const eff = effective();
    listeners.forEach(fn => { try { fn(eff, changedKeys); } catch (e) { console.error(e); } });
  }

  const Settings = {
    DEFAULTS, PROFILES, FONT_STACKS,
    get: effective,
    profiles: () => state.profiles.slice(),
    set(key, value) {
      state.overrides[key] = value;
      emit([key]);
    },
    toggleProfile(name) {
      const on = !state.profiles.includes(name);
      const keys = Object.keys(PROFILES[name].values);
      if (on) state.profiles.push(name);
      else state.profiles = state.profiles.filter(p => p !== name);
      keys.forEach(k => delete state.overrides[k]); // le profil reprend la main sur ses réglages
      emit(keys);
      return on;
    },
    reset() {
      state.profiles = []; state.overrides = {};
      emit(Object.keys(DEFAULTS));
    },
    onChange(fn) { listeners.add(fn); },

    /** CSS injecté dans chaque page du livre (iframe). */
    bookCSS(s, fontsHref) {
      const fam = FONT_STACKS[s.font];
      const css = [];
      css.push(`@import url("${fontsHref}");`);
      css.push(`html, body { background: var(--l-bg) !important; color: var(--l-fg) !important; }`);
      css.push(`:root { --l-bg: ${themeColor(s.theme, "bg")}; --l-fg: ${themeColor(s.theme, "fg")}; }`);
      const inherit = "p, div, span, li, dd, dt, blockquote, td, th, figcaption, section, article, aside, h1, h2, h3, h4, h5, h6, a, em, i, strong, b, small, cite, q";
      if (s.theme !== "clair" && s.theme !== "creme" && s.theme !== "sepia") {
        css.push(`${inherit} { color: inherit !important; background-color: transparent !important; }`);
        css.push(`a, a * { color: ${themeColor(s.theme, "link")} !important; }`);
      } else if (s.theme !== "clair") {
        css.push(`${inherit} { background-color: transparent !important; }`);
      }
      if (s.theme.startsWith("contraste")) {
        css.push(`img, svg, video { filter: none; background: #fff; }`);
        css.push(`hr { border-color: currentColor !important; }`);
      }
      if (fam) css.push(`body, ${inherit} { font-family: ${fam} !important; }`);
      css.push(`body { line-height: ${s.lineHeight} !important; }`);
      css.push(`p, li, dd, dt, blockquote, td, th, figcaption, div, span { line-height: inherit !important; }`);
      if (s.letterSpacing > 0 || s.wordSpacing > 0) {
        css.push(`body, ${inherit} { letter-spacing: ${s.letterSpacing}em !important; word-spacing: ${s.wordSpacing}em !important; }`);
      }
      if (s.bold) css.push(`body, ${inherit} { font-weight: 700 !important; }`);
      if (s.alignLeft) css.push(`body, p, div, li, blockquote, dd { text-align: left !important; text-align-last: auto !important; }`);
      if (s.noItalic) css.push(`i, em, cite, var, dfn, [style*="italic"], .italic { font-style: normal !important; font-weight: 700 !important; }`);
      if (s.noHyphens) css.push(`body, ${inherit} { hyphens: manual !important; -webkit-hyphens: manual !important; }`);
      if (s.lineHeight >= 1.8) css.push(`p { margin-bottom: .9em !important; }`);
      css.push(`video::cue { font-size: 1.1em; background: rgba(0,0,0,.85); color: #fff; }`);
      css.push(`::highlight(l-tts) { background-color: ${themeColor(s.theme, "hl")}; color: #000; }`);
      css.push(`::highlight(l-word) { background-color: ${themeColor(s.theme, "word")}; color: #000; text-decoration: underline; }`);
      css.push(`::highlight(l-alt) { color: ${themeColor(s.theme, "c2")}; }`);
      css.push(`::highlight(l-b) { color: ${themeColor(s.theme, "b")}; } ::highlight(l-d) { color: ${themeColor(s.theme, "d")}; } ::highlight(l-p) { color: ${themeColor(s.theme, "p")}; } ::highlight(l-q) { color: ${themeColor(s.theme, "q")}; }`);
      css.push(`::selection { background: ${themeColor(s.theme, "hl")}; color: #000; }`);
      css.push(`.l-audio-flag { display: inline-block; font: 700 .8em sans-serif; padding: .1em .4em; border: 2px solid currentColor; border-radius: .3em; margin: .2em 0; }`);
      return css.join("\n");
    }
  };

  const PALETTE = {
    "clair":           { bg: "#ffffff", fg: "#1a1a1a", link: "#0b4f9c", hl: "#ffe066", word: "#ffb347", c2: "#a3330c", b: "#c0392b", d: "#1f6fb2", p: "#1e7d32", q: "#8e44ad" },
    "creme":           { bg: "#fbf5e6", fg: "#222222", link: "#0b4f9c", hl: "#ffd54f", word: "#ffab40", c2: "#9b2c0c", b: "#c0392b", d: "#1f6fb2", p: "#1e7d32", q: "#8e44ad" },
    "sepia":           { bg: "#f4ecd8", fg: "#3b2f1e", link: "#7a3b05", hl: "#ffd54f", word: "#ffab40", c2: "#0b4f9c", b: "#b03020", d: "#1a5f9a", p: "#1b6d2c", q: "#7d3a9a" },
    "sombre":          { bg: "#1c1d20", fg: "#e8e6e3", link: "#9cc4ff", hl: "#ffe066", word: "#ffb347", c2: "#ffb38a", b: "#ff8a7a", d: "#7cc0ff", p: "#7ddc8a", q: "#d9a6ff" },
    "contraste-jaune": { bg: "#000000", fg: "#ffff00", link: "#00ffff", hl: "#ffffff", word: "#00ffff", c2: "#00ffff", b: "#ff8080", d: "#80d0ff", p: "#80ff80", q: "#ffa0ff" },
    "contraste-blanc": { bg: "#000000", fg: "#ffffff", link: "#ffff00", hl: "#ffff00", word: "#00ffff", c2: "#ffff00", b: "#ff8080", d: "#80d0ff", p: "#80ff80", q: "#ffa0ff" }
  };
  function themeColor(theme, k) { return (PALETTE[theme] || PALETTE.clair)[k]; }
  Settings.themeColor = themeColor;

  window.LSettings = Settings;
})();
