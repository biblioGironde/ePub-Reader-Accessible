/* =========================================================
   Liseuse accessible — application principale
   Moteur EPUB : epub.js (BSD-2) — tout fonctionne localement.
   ========================================================= */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const FONTS_HREF = new URL("css/fonts.css", location.href).href;
  const HAS_HL = typeof window.Highlight === "function" && window.CSS && CSS.highlights;
  const isElectron = !!window.liseuse;

  const ui = {
    body: document.body, html: document.documentElement,
    home: $("#home"), reader: $("#reader"), viewer: $("#viewer"), viewerWrap: $("#viewer-wrap"),
    title: $("#book-title"), progress: $("#progress"), loc: $("#loc-label"),
    announcer: $("#announcer"), alert: $("#visual-alert"), ruler: $("#ruler"),
    ttsBar: $("#tts-bar"), ttsCaption: $("#tts-caption"), ttsPlay: $("#tts-play"),
    ttsRate: $("#tts-rate"), ttsVoice: $("#tts-voice"), btnTts: $("#btn-tts"),
    form: $("#a11y-form"), libList: $("#lib-list"), libEmpty: $("#lib-empty"),
    tocList: $("#toc-list"), fileInput: $("#file-input"), dropzone: $("#dropzone")
  };

  const S = {
    book: null, rendition: null, id: null, meta: null, lang: "fr",
    toc: [], locationsReady: false, lastLoc: null, bookmarks: [],
    searchMark: null, ttsMark: null, ttsContents: null, rulerY: null,
    applyTimer: null, saveTimer: null, lastChapter: null, userNav: false
  };

  /* ---------------- Annonces ---------------- */
  let announceTimer = null;
  function announce(msg) {
    clearTimeout(announceTimer);
    ui.announcer.textContent = "";
    announceTimer = setTimeout(() => { ui.announcer.textContent = msg; }, 60);
  }
  let alertTimer = null;
  function visualAlert(msg, force) {
    if (!force && !LSettings.get().visualAlerts) return;
    ui.alert.textContent = msg; ui.alert.hidden = false;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { ui.alert.hidden = true; }, 3500);
  }
  function errorMsg(msg) { visualAlert(msg, true); announce(msg); }

  /* ---------------- Boîtes de dialogue ---------------- */
  let lastTrigger = null;
  function closeToText(id) { lastTrigger = ui.viewer; document.getElementById(id).close(); }
  function openDialog(id, trigger) {
    $$("dialog[open]").forEach(d => d.close());
    const d = document.getElementById(id);
    lastTrigger = trigger || document.activeElement;
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    const first = d.querySelector("[autofocus], input[type=search], .toc a[aria-current='true'], h2");
    if (first && first.tagName === "H2") { first.tabIndex = -1; }
    (first || d).focus();
    if (first && first.scrollIntoView) first.scrollIntoView({ block: "center" });
  }
  $$("dialog").forEach(d => {
    d.addEventListener("close", () => {
      if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
      else ui.viewer.focus();
    });
    d.addEventListener("click", (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    });
    $$("[data-close]", d).forEach(b => b.addEventListener("click", () => d.close()));
  });

  /* =========================================================
     Réglages → interface
     ========================================================= */
  function applyUI(s) {
    ui.html.dataset.theme = s.theme;
    ui.html.style.setProperty("--ui-scale", s.uiScale);
    ui.html.style.setProperty("--fsf", s.fontSize / 100);
    ui.html.style.setProperty("--maxw", s.maxWidth);
    ui.html.classList.toggle("strong-focus", s.strongFocus);
    ui.html.classList.toggle("no-motion", s.reduceMotion);
    ui.body.classList.toggle("spread", s.spread && s.flow === "paginated");
    ui.body.classList.toggle("scrolled", s.flow === "scrolled");
    ui.body.classList.toggle("tts-caption-on", s.ttsCaption);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(ui.html).getPropertyValue("--panel").trim() || "#1d3a5f";

    // Formulaire
    const f = ui.form;
    $$("input[name=theme]", f).forEach(r => { r.checked = r.value === s.theme; });
    for (const el of f.elements) {
      if (!el.name || el.name === "theme") continue;
      if (el.type === "checkbox") el.checked = !!s[el.name];
      else if (el.type === "range" || el.tagName === "SELECT") el.value = s[el.name];
    }
    const out = (n, v) => { const o = f.elements[n + "Out"]; if (o) o.value = v; };
    out("fontSize", s.fontSize + " %");
    out("lineHeight", String(s.lineHeight).replace(".", ","));
    out("letterSpacing", s.letterSpacing ? "+" + Math.round(s.letterSpacing * 100) + " %" : "normal");
    out("wordSpacing", s.wordSpacing ? "+" + Math.round(s.wordSpacing * 100) + " %" : "normal");
    out("maxWidth", "≈ " + s.maxWidth + " caractères");
    out("uiScale", Math.round(s.uiScale * 100) + " %");
    $$("input[type=range]", f).forEach(r => {
      const o = f.elements[r.name + "Out"]; if (o) r.setAttribute("aria-valuetext", o.value);
    });
    $$(".profile").forEach(b => b.setAttribute("aria-pressed", String(LSettings.profiles().includes(b.dataset.profile))));

    // Aperçu
    const p = $("#preview-txt");
    p.style.fontFamily = LSettings.FONT_STACKS[s.font] || "Georgia, serif";
    p.style.fontSize = (s.fontSize / 100) + "rem";
    p.style.lineHeight = s.lineHeight;
    p.style.letterSpacing = s.letterSpacing + "em";
    p.style.wordSpacing = s.wordSpacing + "em";
    p.style.fontWeight = s.bold ? 700 : 400;
    p.style.textAlign = s.alignLeft ? "left" : "justify";

    // Règle de lecture
    ui.ruler.hidden = s.ruler === "off" || !S.book;
    ui.ruler.className = "ruler " + s.ruler;
    const lineH = Math.round(16 * (s.fontSize / 100) * s.lineHeight * 1.35);
    ui.ruler.style.setProperty("--ruler-h", lineH + "px");
    if (S.rulerY == null) S.rulerY = Math.round(ui.viewerWrap.clientHeight * 0.35) || 160;
    ui.ruler.style.setProperty("--ruler-y", S.rulerY + "px");

    // Lecture vocale
    ui.ttsBar.hidden = !(s.ttsAutoBar && S.book) && tts.state === "stopped";
    $("#hl-support").hidden = !!HAS_HL;
  }

  /* =========================================================
     Réglages → livre
     ========================================================= */
  function styleContents(contents, s) {
    const doc = contents.document;
    if (!doc || !doc.head) return;
    let st = doc.getElementById("l-a11y");
    if (!st) { st = doc.createElement("style"); st.id = "l-a11y"; doc.head.appendChild(st); }
    st.textContent = LSettings.bookCSS(s, FONTS_HREF);
    decorate(contents, s);
    prepareMedia(contents, s);
  }

  function applyBook(s, changed) {
    if (!S.rendition) return;
    const needRebuild = changed && (changed.includes("flow"));
    if (needRebuild) { rebuildRendition(); return; }
    S.rendition.themes.fontSize(s.fontSize + "%");
    S.rendition.getContents().forEach(c => styleContents(c, s));
    if (changed && changed.includes("spread")) S.rendition.spread(s.spread ? "auto" : "none", 800);
    // Recalcul de la mise en page en gardant la position de lecture
    clearTimeout(S.applyTimer);
    const cfi = S.lastLoc && S.lastLoc.start && S.lastLoc.start.cfi;
    S.applyTimer = setTimeout(() => {
      try { S.rendition.resize(); } catch (e) { /* ignoré */ }
      if (cfi) S.rendition.display(cfi).catch(() => {});
    }, 180);
  }

  LSettings.onChange((s, changed) => { applyUI(s); applyBook(s, changed); });

  /* Formulaire des réglages */
  ui.form.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.name) return;
    let v;
    if (el.type === "checkbox") v = el.checked;
    else if (el.type === "range") v = parseFloat(el.value);
    else v = el.value;
    LSettings.set(el.name, v);
  });
  $$(".profile").forEach(b => b.addEventListener("click", () => {
    const on = LSettings.toggleProfile(b.dataset.profile);
    const name = LSettings.PROFILES[b.dataset.profile].label;
    announce(`Profil ${name} ${on ? "activé" : "désactivé"}.`);
    if (on && b.dataset.profile === "malentendant") visualAlert("Profil malentendants activé : les sons et vidéos seront signalés à l'écran.");
  }));
  $("#a11y-reset").addEventListener("click", () => { LSettings.reset(); announce("Réglages d'origine rétablis."); });

  /* =========================================================
     Aides visuelles dans le texte (Highlight API, sans toucher au DOM du livre)
     ========================================================= */
  function hlRegistry(doc) {
    const w = doc.defaultView;
    if (w && w.CSS && w.CSS.highlights) return { reg: w.CSS.highlights, H: w.Highlight || window.Highlight };
    return HAS_HL ? null : null;
  }

  function decorate(contents, s) {
    const doc = contents.document; const r = hlRegistry(doc);
    if (!r) return;
    ["l-alt", "l-b", "l-d", "l-p", "l-q"].forEach(n => r.reg.delete(n));
    if (!s.altWords && !s.bdpq) return;
    const alt = [], letters = { b: [], d: [], p: [], q: [] };
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let count = 0, budget = 60000;
    for (let n = walker.nextNode(); n && budget > 0; n = walker.nextNode()) {
      const t = n.nodeValue;
      if (!t.trim()) continue;
      if (s.altWords) {
        const re = /[\p{L}\p{N}'’-]+/gu; let m;
        while ((m = re.exec(t))) {
          if (count++ % 2 === 1) { const rg = doc.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length); alt.push(rg); budget--; }
        }
      }
      if (s.bdpq) {
        const re = /[bdpq]/g; let m;
        while ((m = re.exec(t))) { const rg = doc.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + 1); letters[m[0]].push(rg); budget--; }
      }
    }
    try {
      if (alt.length) r.reg.set("l-alt", new r.H(...alt));
      for (const k in letters) if (letters[k].length) r.reg.set("l-" + k, new r.H(...letters[k]));
    } catch (e) { console.warn("Surlignage indisponible", e); }
  }

  /* Vidéos, sons : contrôles visibles, sous-titres, signalement visuel */
  function prepareMedia(contents, s) {
    const doc = contents.document;
    const media = $$("video, audio", doc);
    let hasSound = false;
    media.forEach(m => {
      m.controls = true;
      m.setAttribute("preload", "metadata");
      if (m.tagName === "AUDIO") { hasSound = true; m.style.outline = s.visualAlerts ? "4px solid currentColor" : ""; }
      if (m.tagName === "VIDEO") {
        hasSound = true;
        const tracks = Array.from(m.textTracks || []);
        if (s.captions && tracks.length) {
          const pref = tracks.find(t => (t.kind === "captions" || t.kind === "subtitles") && (t.language || "").startsWith(S.lang.slice(0, 2)))
            || tracks.find(t => t.kind === "captions" || t.kind === "subtitles") || tracks[0];
          tracks.forEach(t => { t.mode = t === pref ? "showing" : "disabled"; });
        }
        if (s.visualAlerts && !tracks.length) m.setAttribute("title", "Vidéo sans sous-titres");
      }
    });
    if (hasSound && s.visualAlerts) visualAlert("Ce passage contient du son ou de la vidéo.");
  }

  /* =========================================================
     Ouverture d'un livre
     ========================================================= */
  async function openBuffer(buffer, fileName, remote) {
    try {
      closeBook();
      showReader(true);
      ui.title.textContent = "Ouverture…";
      const id = await LFingerprint(buffer);
      const book = ePub(buffer, { openAs: "binary" });
      S.book = book; S.id = id;
      await book.ready;
      const md = book.packaging.metadata || {};
      S.lang = (md.language || "fr").trim() || "fr";
      const title = (md.title || fileName || "Livre sans titre").trim();
      const author = (md.creator || "").trim();
      ui.title.textContent = title + (author ? " — " + author : "");
      $("#reader-h").textContent = title + (author ? ", " + author : "");
      document.title = title + " · Liseuse accessible";

      let meta = await LStore.get(id);
      if (!meta) {
        meta = { id, title, author, lang: S.lang, addedAt: Date.now(), openedAt: Date.now(), lastCfi: null, progress: 0, bookmarks: [], remote: remote || null };
        try {
          const url = await book.coverUrl();
          if (url) meta.cover = await (await fetch(url)).blob();
        } catch (e) { /* pas de couverture */ }
        await LStore.save(meta, buffer);
      } else {
        meta.openedAt = Date.now();
        if (remote && !meta.remote) meta.remote = remote;
        await LStore.save(meta);
      }
      S.meta = meta; S.bookmarks = meta.bookmarks || [];

      buildToc(await book.loaded.navigation);
      renderBookmarks();
      createRendition(meta.lastCfi);
      readBookA11y(book);
      generateLocations(book, meta);
      announce(`Livre ouvert : ${title}${author ? ", de " + author : ""}.`);
    } catch (e) {
      console.error(e);
      showReader(false);
      errorMsg("Ce fichier n'a pas pu être ouvert. Vérifiez qu'il s'agit bien d'un livre EPUB sans protection (DRM).");
    }
  }

  function createRendition(startCfi) {
    const s = LSettings.get();
    ui.viewer.innerHTML = "";
    const scrolled = s.flow === "scrolled";
    const r = S.book.renderTo(ui.viewer, {
      width: "100%", height: "100%",
      flow: scrolled ? "scrolled" : "paginated",
      manager: scrolled ? "continuous" : "default",
      spread: s.spread ? "auto" : "none", minSpreadWidth: 800,
      allowScriptedContent: false
    });
    S.rendition = r;
    r.themes.fontSize(s.fontSize + "%");
    r.hooks.content.register((contents) => onContent(contents));
    r.on("relocated", onRelocated);
    r.on("displayError", (e) => console.warn("Erreur d'affichage", e));
    return r.display(startCfi || undefined).catch(() => r.display());
  }

  function rebuildRendition() {
    const cfi = S.lastLoc && S.lastLoc.start && S.lastLoc.start.cfi;
    tts.stop();
    try { S.rendition.destroy(); } catch (e) { /* ignoré */ }
    createRendition(cfi);
  }

  function closeBook() {
    tts.stop();
    if (S.rendition) { try { S.rendition.destroy(); } catch (e) { /* ignoré */ } }
    if (S.book) { try { S.book.destroy(); } catch (e) { /* ignoré */ } }
    S.book = S.rendition = S.meta = S.lastLoc = null; S.locationsReady = false; S.lastChapter = null;
    ui.progress.disabled = true; ui.progress.value = 0; ui.loc.textContent = "—";
    $("#bookinfo-sec").hidden = true;
  }

  function showReader(on) {
    ui.home.hidden = on; ui.reader.hidden = !on;
    ui.body.classList.toggle("reading", on);
    const skip = $("#skip-link");
    skip.textContent = on ? "Aller au texte du livre" : "Aller au contenu principal";
    skip.setAttribute("href", on ? "#viewer" : "#home-title");
    if (!on) { ui.title.textContent = ""; document.title = "Liseuse accessible"; }
    applyUI(LSettings.get());
  }

  async function generateLocations(book, meta) {
    try {
      if (meta.locations) book.locations.load(meta.locations);
      else {
        await book.locations.generate(1200);
        if (book !== S.book) return;
        meta.locations = book.locations.save();
        LStore.update(meta.id, { locations: meta.locations });
      }
      if (book !== S.book) return;
      S.locationsReady = true; ui.progress.disabled = false;
      if (S.lastLoc) onRelocated(S.lastLoc);
    } catch (e) { console.warn("Positions non calculées", e); }
  }

  /* À chaque chapitre affiché */
  function onContent(contents) {
    const s = LSettings.get();
    const doc = contents.document;
    if (!doc.documentElement.getAttribute("lang") && !doc.documentElement.getAttribute("xml:lang")) doc.documentElement.setAttribute("lang", S.lang);
    try {
      const fr = contents.window.frameElement;
      if (fr) {
        const label = chapterLabel(contents.sectionIndex);
        fr.title = "Texte du livre" + (label ? " : " + label : "");
      }
    } catch (e) { /* ignoré */ }
    styleContents(contents, s);
    doc.addEventListener("keydown", onKey);
    doc.addEventListener("mousemove", (e) => moveRulerFromEvent(e, contents));
    let tx = null, ty = null;
    doc.addEventListener("touchstart", (e) => { const t = e.changedTouches[0]; tx = t.clientX; ty = t.clientY; moveRulerFromEvent(t, contents); }, { passive: true });
    doc.addEventListener("touchend", (e) => {
      if (tx == null) return;
      const t = e.changedTouches[0]; const dx = t.clientX - tx, dy = t.clientY - ty;
      if (LSettings.get().flow === "paginated" && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { dx < 0 ? goNext() : goPrev(); }
      tx = ty = null;
    }, { passive: true });
    // Les liens externes s'ouvrent hors de la liseuse
    $$("a[href^='http']", doc).forEach(a => { a.target = "_blank"; a.rel = "noopener"; });
  }

  function onRelocated(loc) {
    S.lastLoc = loc;
    const chap = chapterLabel(loc.start.index);
    let pct = null;
    if (S.locationsReady) {
      pct = S.book.locations.percentageFromCfi(loc.start.cfi);
      ui.progress.value = (pct * 100).toFixed(1);
      ui.progress.setAttribute("aria-valuetext", Math.round(pct * 100) + " % du livre");
    }
    const page = loc.start.displayed && loc.start.displayed.total > 1 ? `page ${loc.start.displayed.page} sur ${loc.start.displayed.total}` : "";
    const parts = [chap, page, pct != null ? Math.round(pct * 100) + " %" : ""].filter(Boolean);
    ui.loc.textContent = parts.join(" · ") || "—";
    markTocCurrent(loc.start.href);
    if (S.userNav) { announce(parts.join(", ")); S.userNav = false; }
    if (chap && chap !== S.lastChapter) {
      if (S.lastChapter) visualAlert("Nouveau chapitre : " + chap);
      S.lastChapter = chap;
    }
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(() => { if (S.meta) LStore.update(S.meta.id, { lastCfi: loc.start.cfi, progress: pct || 0 }); }, 600);
  }

  /* ---------------- Navigation ---------------- */
  function goNext() { if (S.rendition) { S.userNav = true; S.rendition.next(); } }
  function goPrev() { if (S.rendition) { S.userNav = true; S.rendition.prev(); } }
  $("#btn-next").addEventListener("click", goNext);
  $("#btn-prev").addEventListener("click", goPrev);
  ui.progress.addEventListener("change", () => {
    if (!S.locationsReady) return;
    S.userNav = true;
    S.rendition.display(S.book.locations.cfiFromPercentage(parseFloat(ui.progress.value) / 100));
  });

  /* ---------------- Sommaire ---------------- */
  function normHref(h) { return (h || "").split("#")[0].replace(/^\.?\//, "").split("/").pop(); }
  function buildToc(nav) {
    S.toc = [];
    ui.tocList.innerHTML = "";
    const build = (items, parent) => {
      items.forEach(it => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "#"; a.textContent = (it.label || "").trim() || "Sans titre"; a.dataset.href = it.href;
        a.addEventListener("click", (e) => { e.preventDefault(); closeToText("dlg-toc"); S.userNav = true; S.rendition.display(it.href); });
        li.appendChild(a); parent.appendChild(li);
        S.toc.push({ label: a.textContent, href: it.href, el: a });
        if (it.subitems && it.subitems.length) { const ol = document.createElement("ol"); li.appendChild(ol); build(it.subitems, ol); }
      });
    };
    build((nav && nav.toc) || [], ui.tocList);
    if (!S.toc.length) ui.tocList.innerHTML = "<li>Ce livre n'a pas de sommaire.</li>";
  }
  function chapterLabel(index) {
    if (!S.book) return "";
    const sec = S.book.spine.get(index);
    if (!sec) return "";
    const h = normHref(sec.href);
    const hit = S.toc.find(t => normHref(t.href) === h);
    if (hit) return hit.label;
    // Section sans entrée : on reprend la dernière entrée précédente
    for (let i = index - 1; i >= 0; i--) {
      const prev = S.book.spine.get(i); if (!prev) continue;
      const t = S.toc.find(x => normHref(x.href) === normHref(prev.href));
      if (t) return t.label;
    }
    return "";
  }
  function markTocCurrent(href) {
    const h = normHref(href);
    let found = false;
    S.toc.forEach(t => {
      const cur = !found && normHref(t.href) === h;
      if (cur) found = true;
      t.el.setAttribute("aria-current", cur ? "true" : "false");
    });
  }

  /* ---------------- Recherche ---------------- */
  $("#search-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("#search-q").value.trim();
    const status = $("#search-status"); const list = $("#search-results");
    if (!q || !S.book) return;
    list.innerHTML = ""; status.textContent = "Recherche en cours…";
    const results = [];
    for (const item of S.book.spine.spineItems) {
      try {
        await item.load(S.book.load.bind(S.book));
        const found = item.find(q) || [];
        found.forEach(f => results.push({ cfi: f.cfi, excerpt: f.excerpt, index: item.index }));
      } catch (err) { /* section illisible */ } finally { try { item.unload(); } catch (e2) { /* ignoré */ } }
      if (results.length > 300) break;
    }
    status.textContent = results.length ? `${results.length} résultat${results.length > 1 ? "s" : ""} pour « ${q} ».` : `Aucun résultat pour « ${q} ».`;
    results.forEach(r => {
      const li = document.createElement("li");
      const b = document.createElement("button"); b.type = "button"; b.className = "go";
      const chap = document.createElement("span"); chap.className = "chap"; chap.textContent = chapterLabel(r.index);
      const ex = document.createElement("span");
      ex.innerHTML = escapeHtml(r.excerpt).replace(new RegExp(escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`);
      b.append(chap, ex);
      b.addEventListener("click", () => {
        closeToText("dlg-search");
        S.userNav = true;
        S.rendition.display(r.cfi).then(() => {
          if (S.searchMark) try { S.rendition.annotations.remove(S.searchMark, "highlight"); } catch (e2) { /* ignoré */ }
          S.searchMark = r.cfi;
          S.rendition.annotations.highlight(r.cfi, {}, null, "l-search", { fill: "#ffd400", "fill-opacity": "0.45" });
        });
      });
      li.appendChild(b); list.appendChild(li);
    });
  });
  function escapeHtml(t) { return String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  /* ---------------- Signets ---------------- */
  function renderBookmarks() {
    const list = $("#bm-list"); list.innerHTML = "";
    $("#bm-empty").hidden = S.bookmarks.length > 0;
    S.bookmarks.forEach((bm, i) => {
      const li = document.createElement("li");
      const go = document.createElement("button"); go.type = "button"; go.className = "go";
      go.innerHTML = `<span class="chap">${escapeHtml(bm.chapter || "")}</span>${escapeHtml(bm.excerpt || "Signet " + (i + 1))}`;
      go.addEventListener("click", () => { closeToText("dlg-bookmarks"); S.userNav = true; S.rendition.display(bm.cfi); });
      const del = document.createElement("button"); del.type = "button"; del.className = "del";
      del.innerHTML = `<svg aria-hidden="true"><use href="#i-trash"/></svg><span class="sr">Supprimer le signet ${escapeHtml(bm.excerpt || "")}</span>`;
      del.addEventListener("click", () => { S.bookmarks.splice(i, 1); saveBookmarks(); renderBookmarks(); announce("Signet supprimé."); $("#bm-add").focus(); });
      li.append(go, del); list.appendChild(li);
    });
  }
  function saveBookmarks() { if (S.meta) LStore.update(S.meta.id, { bookmarks: S.bookmarks }); }
  $("#bm-add").addEventListener("click", () => {
    if (!S.lastLoc) return;
    const cfi = S.lastLoc.start.cfi;
    if (S.bookmarks.some(b => b.cfi === cfi)) { announce("Cette page a déjà un signet."); return; }
    let excerpt = "";
    try { const rg = S.rendition.getRange(cfi); excerpt = rg && rg.startContainer ? (rg.startContainer.textContent || "").trim().slice(0, 90) : ""; } catch (e) { /* ignoré */ }
    S.bookmarks.push({ cfi, chapter: chapterLabel(S.lastLoc.start.index), excerpt: excerpt ? excerpt + "…" : "", at: Date.now() });
    saveBookmarks(); renderBookmarks(); announce("Signet ajouté."); visualAlert("Signet ajouté");
  });

  /* =========================================================
     Lecture à voix haute
     ========================================================= */
  const adapter = {
    async collect(fromStart) {
      const loc = S.rendition.currentLocation();
      const idx = loc && loc.start ? loc.start.index : 0;
      const all = S.rendition.getContents();
      const c = all.find(x => x.sectionIndex === idx) || all[0];
      S.ttsContents = c;
      if (!c) return { items: [], startIndex: 0 };
      const items = LTTS.collectSentences(c.document, S.lang);
      let startIndex = 0;
      if (!fromStart && loc && loc.start) {
        try {
          const start = c.range(loc.start.cfi).cloneRange(); start.collapse(true);
          // première phrase qui se termine après le début de la page affichée
          const k = items.findIndex(it => it.range.compareBoundaryPoints(Range.END_TO_END, start) > 0);
          startIndex = k < 0 ? 0 : k;
        } catch (e) { /* début du chapitre */ }
      }
      return { items, startIndex };
    },
    async next() {
      const loc = S.rendition.currentLocation();
      const sec = S.book.spine.get(loc.start.index);
      const nxt = sec && sec.next();
      if (!nxt) return false;
      await S.rendition.display(nxt.href);
      return true;
    },
    highlight(range) {
      const doc = range ? range.startContainer.ownerDocument : null;
      // Efface l'ancien surlignage
      S.rendition && S.rendition.getContents().forEach(c => { const r = hlRegistry(c.document); if (r) { r.reg.delete("l-tts"); r.reg.delete("l-word"); } });
      if (S.ttsMark) { try { S.rendition.annotations.remove(S.ttsMark, "highlight"); } catch (e) { /* ignoré */ } S.ttsMark = null; }
      if (!range) return;
      const r = hlRegistry(doc);
      if (r) { try { r.reg.set("l-tts", new r.H(range)); return; } catch (e) { /* repli ci-dessous */ } }
      try { const cfi = S.ttsContents.cfiFromRange(range); S.ttsMark = cfi; S.rendition.annotations.highlight(cfi, {}, null, "l-tts", { fill: "#ffe066", "fill-opacity": "0.5" }); } catch (e) { /* ignoré */ }
    },
    highlightWord(range, text, charIndex, len) {
      const doc = range.startContainer.ownerDocument; const r = hlRegistry(doc);
      if (!r) return;
      const sub = subRange(range, charIndex, len);
      if (sub) try { r.reg.set("l-word", new r.H(sub)); } catch (e) { /* ignoré */ }
    },
    ensureVisible(range) {
      try {
        const doc = range.startContainer.ownerDocument;
        const fr = doc.defaultView.frameElement.getBoundingClientRect();
        const rr = range.getClientRects()[0] || range.getBoundingClientRect();
        const vr = ui.viewer.getBoundingClientRect();
        const x = fr.left + rr.left, y = fr.top + rr.top;
        if (LSettings.get().flow === "scrolled") {
          if (y < vr.top + 10 || y + rr.height > vr.bottom - 10) {
            const sc = S.rendition.manager && S.rendition.manager.container;
            if (sc) sc.scrollBy({ top: y - vr.top - vr.height / 3, behavior: LSettings.get().reduceMotion ? "auto" : "smooth" });
          }
        } else if (x < vr.left - 2 || x > vr.right - 4) {
          S.rendition.display(S.ttsContents.cfiFromRange(range));
        }
      } catch (e) { /* ignoré */ }
    }
  };

  /* Sous-plage correspondant à un mot (indices sur le texte normalisé) */
  function subRange(range, charIndex, len) {
    const doc = range.startContainer.ownerDocument;
    const walker = doc.createTreeWalker(range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    let norm = 0, prevSpace = true, start = null, end = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!range.intersectsNode(n)) continue;
      const v = n.nodeValue;
      const from = n === range.startContainer ? range.startOffset : 0;
      const to = n === range.endContainer ? range.endOffset : v.length;
      for (let i = from; i < to; i++) {
        const sp = /\s/.test(v[i]);
        if (sp && prevSpace) continue;
        if (norm === charIndex && !start) start = [n, i];
        norm++;
        if (norm === charIndex + len) { end = [n, i + 1]; break; }
        prevSpace = sp;
      }
      if (end) break;
    }
    if (!start || !end) return null;
    const r = doc.createRange(); r.setStart(start[0], start[1]); r.setEnd(end[0], end[1]);
    return r;
  }

  const tts = new LTTS.Reader(adapter, {
    onState(st) {
      const playing = st === "playing";
      ui.btnTts.setAttribute("aria-pressed", String(st !== "stopped"));
      ui.ttsPlay.querySelector("use").setAttribute("href", playing ? "#i-pause" : "#i-play");
      $("#tts-play-lbl").textContent = playing ? "Pause" : "Reprendre la lecture";
      ui.ttsBar.hidden = st === "stopped" && !(LSettings.get().ttsAutoBar && S.book);
      if (st === "stopped") ui.ttsCaption.textContent = "";
      announce(playing ? "Lecture à voix haute." : st === "paused" ? "Lecture en pause." : "Lecture arrêtée.");
    },
    onCaption(text, idx, len) {
      if (idx < 0) { ui.ttsCaption.textContent = text; return; }
      ui.ttsCaption.innerHTML = escapeHtml(text.slice(0, idx)) + '<span class="w">' + escapeHtml(text.slice(idx, idx + len)) + "</span>" + escapeHtml(text.slice(idx + len));
    },
    onError(msg) { errorMsg(msg); },
    onEnd() { visualAlert("Fin du livre.", true); }
  });
  const ttsPrefs = LPrefs.get("liseuse.tts", { rate: 0.9, voice: null });
  tts.rate = ttsPrefs.rate; tts.voiceName = ttsPrefs.voice;
  ui.ttsRate.value = tts.rate; ui.ttsRate.setAttribute("aria-valuetext", String(tts.rate).replace(".", ","));

  function fillVoices() {
    const voices = LTTS.listVoices();
    const base = (S.lang || "fr").slice(0, 2);
    const sorted = voices.slice().sort((a, b) => (b.lang.startsWith(base) - a.lang.startsWith(base)) || a.name.localeCompare(b.name));
    ui.ttsVoice.innerHTML = '<option value="">Automatique</option>' + sorted.map(v => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`).join("");
    ui.ttsVoice.value = tts.voiceName || "";
  }
  LTTS.onVoicesChanged(fillVoices); fillVoices();

  ui.btnTts.addEventListener("click", () => {
    if (!LTTS.supported) { errorMsg("La synthèse vocale n'est pas disponible dans ce navigateur."); return; }
    if (tts.state === "stopped") { tts.lang = S.lang; fillVoices(); tts.start(); } else tts.stop();
  });
  ui.ttsPlay.addEventListener("click", () => { tts.lang = S.lang; tts.toggle(); });
  $("#tts-stop").addEventListener("click", () => { tts.stop(); ui.btnTts.focus(); });
  $("#tts-back").addEventListener("click", () => tts.skip(-1));
  $("#tts-fwd").addEventListener("click", () => tts.skip(1));
  ui.ttsRate.addEventListener("change", () => {
    const v = parseFloat(ui.ttsRate.value); tts.setRate(v);
    ui.ttsRate.setAttribute("aria-valuetext", String(v).replace(".", ","));
    LPrefs.set("liseuse.tts", { rate: v, voice: tts.voiceName });
  });
  ui.ttsVoice.addEventListener("change", () => {
    tts.setVoice(ui.ttsVoice.value || null);
    LPrefs.set("liseuse.tts", { rate: tts.rate, voice: tts.voiceName });
  });

  /* =========================================================
     Règle / masque de lecture
     ========================================================= */
  function setRulerY(y) {
    const max = ui.viewerWrap.clientHeight - 20;
    S.rulerY = Math.max(0, Math.min(max, Math.round(y)));
    ui.ruler.style.setProperty("--ruler-y", S.rulerY + "px");
  }
  function moveRulerFromEvent(e, contents) {
    if (LSettings.get().ruler === "off") return;
    try {
      const fr = contents.window.frameElement.getBoundingClientRect();
      const wr = ui.viewerWrap.getBoundingClientRect();
      const h = parseFloat(getComputedStyle(ui.ruler).getPropertyValue("--ruler-h")) || 40;
      setRulerY(fr.top + e.clientY - wr.top - h / 2);
    } catch (err) { /* ignoré */ }
  }
  ui.viewerWrap.addEventListener("mousemove", (e) => {
    if (LSettings.get().ruler === "off") return;
    const wr = ui.viewerWrap.getBoundingClientRect();
    const h = parseFloat(getComputedStyle(ui.ruler).getPropertyValue("--ruler-h")) || 40;
    setRulerY(e.clientY - wr.top - h / 2);
  });

  /* =========================================================
     Clavier
     ========================================================= */
  function onKey(e) {
    const t = e.target;
    const typing = t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName));
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") { e.preventDefault(); ui.fileInput.click(); return; }
    if (typing || e.ctrlKey || e.metaKey || document.querySelector("dialog[open]")) return;
    const reading = !!S.rendition;
    const s = LSettings.get();
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && s.ruler !== "off") {
      e.preventDefault();
      const h = parseFloat(getComputedStyle(ui.ruler).getPropertyValue("--ruler-h")) || 40;
      setRulerY((S.rulerY || 0) + (e.key === "ArrowDown" ? h * 0.75 : -h * 0.75));
      return;
    }
    if (e.altKey) return;
    switch (e.key) {
      case "ArrowRight": case "PageDown":
        if (reading && (s.flow === "paginated" || e.key === "ArrowRight")) { e.preventDefault(); goNext(); } break;
      case "ArrowLeft": case "PageUp":
        if (reading && (s.flow === "paginated" || e.key === "ArrowLeft")) { e.preventDefault(); goPrev(); } break;
      case " ":
        if (!reading) return;
        if (tts.state !== "stopped") { e.preventDefault(); tts.toggle(); }
        else if (s.flow === "paginated" && (t === ui.viewer || t === document.body || t.ownerDocument !== document)) { e.preventDefault(); e.shiftKey ? goPrev() : goNext(); }
        break;
      case "t": case "T": if (reading) { e.preventDefault(); openDialog("dlg-toc", $("#btn-toc")); } break;
      case "r": case "R": if (reading) { e.preventDefault(); openDialog("dlg-search", $("#btn-search")); } break;
      case "s": case "S": if (reading) { e.preventDefault(); openDialog("dlg-bookmarks", $("#btn-bookmarks")); } break;
      case "l": case "L": if (reading) { e.preventDefault(); ui.btnTts.click(); } break;
      case "a": case "A": e.preventDefault(); openDialog("dlg-a11y", $("#btn-a11y")); break;
      case "b": case "B": if (reading) { e.preventDefault(); goHome(); } break;
      case "?": e.preventDefault(); openDialog("dlg-help", $("#btn-help")); break;
      case "+": case "=": if (reading) { e.preventDefault(); bump(10); } break;
      case "-": case "_": if (reading) { e.preventDefault(); bump(-10); } break;
      default: break;
    }
  }
  document.addEventListener("keydown", onKey);

  function bump(d) {
    const s = LSettings.get();
    const v = Math.max(80, Math.min(300, s.fontSize + d));
    LSettings.set("fontSize", v);
    announce("Taille du texte : " + v + " %");
  }
  $("#btn-bigger").addEventListener("click", () => bump(10));
  $("#btn-smaller").addEventListener("click", () => bump(-10));

  /* ---------------- Boutons de la barre ---------------- */
  $("#btn-toc").addEventListener("click", (e) => openDialog("dlg-toc", e.currentTarget));
  $("#btn-search").addEventListener("click", (e) => openDialog("dlg-search", e.currentTarget));
  $("#btn-bookmarks").addEventListener("click", (e) => openDialog("dlg-bookmarks", e.currentTarget));
  $("#btn-a11y").addEventListener("click", (e) => openDialog("dlg-a11y", e.currentTarget));
  $("#btn-help").addEventListener("click", (e) => openDialog("dlg-help", e.currentTarget));
  $("#btn-home").addEventListener("click", goHome);
  function goHome() {
    closeBook(); showReader(false); renderLibrary();
    $("#home-title").tabIndex = -1; $("#home-title").focus();
  }

  /* =========================================================
     Accessibilité déclarée par le livre (EPUB Accessibility 1.1 / schema.org)
     ========================================================= */
  const A11Y_FR = {
    accessMode: { textual: "Texte", visual: "Images", auditory: "Son", tactile: "Tactile", mathOnVisual: "Mathématiques en image", chartOnVisual: "Graphiques en image", diagramOnVisual: "Schémas en image", textOnVisual: "Texte en image" },
    accessibilityFeature: { alternativeText: "Textes alternatifs des images", structuralNavigation: "Navigation par titres", tableOfContents: "Table des matières", readingOrder: "Ordre de lecture logique", ARIA: "Balisage ARIA", displayTransformability: "Affichage personnalisable", synchronizedAudioText: "Texte synchronisé avec l'audio", captions: "Sous-titres", transcript: "Transcriptions", longDescription: "Descriptions détaillées", MathML: "Formules en MathML", printPageNumbers: "Numéros de pages de l'édition papier", pageBreakMarkers: "Numéros de pages de l'édition papier", pageNavigation: "Navigation par numéros de page", highContrastDisplay: "Fort contraste", largePrint: "Grands caractères", signLanguage: "Langue des signes", describedMath: "Formules décrites", ttsMarkup: "Prononciation pour synthèse vocale", index: "Index", annotations: "Annotations", tactileGraphic: "Graphiques tactiles", none: "Aucune" },
    accessibilityHazard: { none: "Aucun risque signalé", noFlashingHazard: "Pas de clignotement", noMotionSimulationHazard: "Pas de simulation de mouvement", noSoundHazard: "Pas de son gênant", flashing: "Clignotements (risque photosensible)", motionSimulation: "Simulation de mouvement", sound: "Sons pouvant gêner", unknown: "Non renseigné" }
  };
  async function readBookA11y(book) {
    try {
      const path = book.container && book.container.packagePath;
      let xml = null;
      if (book.archive && path) xml = await book.archive.getText("/" + path.replace(/^\//, ""));
      if (!xml) return;
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const get = (prop) => {
        const vals = [];
        $$("meta", doc).forEach(m => {
          const p = m.getAttribute("property") || m.getAttribute("name") || "";
          if (p.replace(/^schema:/, "") === prop) vals.push((m.getAttribute("content") || m.textContent || "").trim());
        });
        return vals.filter(Boolean);
      };
      const rows = [];
      const tr = (k, vals) => vals.map(v => (A11Y_FR[k] && A11Y_FR[k][v]) || v).join(", ");
      const modes = get("accessMode"); if (modes.length) rows.push(["Contenu", tr("accessMode", modes)]);
      const feats = get("accessibilityFeature"); if (feats.length) rows.push(["Fonctions d'accessibilité", tr("accessibilityFeature", feats)]);
      const hz = get("accessibilityHazard"); if (hz.length) rows.push(["Risques", tr("accessibilityHazard", hz)]);
      const sum = get("accessibilitySummary"); if (sum.length) rows.push(["Résumé de l'éditeur", sum.join(" ")]);
      const conf = [];
      $$("link, meta", doc).forEach(m => {
        const p = m.getAttribute("rel") || m.getAttribute("property") || "";
        if (/conformsTo/.test(p)) conf.push((m.getAttribute("href") || m.textContent || "").trim());
      });
      if (conf.length) {
        const labels = conf.map(c => {
          const m = c.match(/wcag[- ]?(2\.\d)?[^a-z]*(?:level\s*)?(aaa|aa|a)\b/i) || c.match(/#wcag-(aaa|aa|a)$/i);
          if (!m) return c;
          const lvl = (m[2] || m[1]).toUpperCase(); const ver = m[2] ? (m[1] || "") : "";
          return "Accessibilité EPUB, WCAG " + (ver ? ver + " " : "") + "niveau " + lvl;
        });
        rows.push(["Conformité", Array.from(new Set(labels)).join(" ; ")]);
      }
      const box = $("#bookinfo");
      if (!rows.length) box.innerHTML = "<p>L'éditeur n'a fourni aucune information d'accessibilité pour ce livre.</p>";
      else box.innerHTML = "<dl>" + rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("") + "</dl>";
      $("#bookinfo-sec").hidden = false;
    } catch (e) { console.warn("Métadonnées d'accessibilité illisibles", e); }
  }

  /* =========================================================
     Bibliothèque, ouverture de fichiers
     ========================================================= */
  async function renderLibrary() {
    const books = await LStore.list();
    ui.libList.innerHTML = "";
    ui.libEmpty.hidden = books.length > 0;
    books.forEach(b => {
      const li = document.createElement("li"); li.className = "lib-item";
      const open = document.createElement("button"); open.type = "button"; open.className = "lib-open";
      const pct = Math.round((b.progress || 0) * 100);
      let cover;
      if (b.cover instanceof Blob) { cover = document.createElement("img"); cover.src = URL.createObjectURL(b.cover); cover.alt = ""; cover.className = "lib-cover"; }
      else { cover = document.createElement("span"); cover.className = "lib-cover"; cover.setAttribute("aria-hidden", "true"); cover.textContent = (b.title || "?").trim().charAt(0).toUpperCase(); }
      const meta = document.createElement("span"); meta.className = "lib-meta";
      meta.innerHTML = `<strong>${escapeHtml(b.title)}</strong><span>${escapeHtml(b.author || "")}</span><span>${pct ? " · lu à " + pct + " %" : " · non commencé"}</span>`;
      open.append(cover, meta);
      open.setAttribute("aria-label", `Ouvrir ${b.title}${b.author ? ", de " + b.author : ""}, ${pct ? "lu à " + pct + " %" : "non commencé"}`);
      open.addEventListener("click", async () => {
        const data = await LStore.getFile(b.id);
        if (data) openBuffer(data, b.title); else errorMsg("Le fichier de ce livre n'est plus disponible sur cet appareil.");
      });
      const del = document.createElement("button"); del.type = "button"; del.className = "lib-del";
      del.innerHTML = `<svg aria-hidden="true"><use href="#i-trash"/></svg> Retirer<span class="sr"> ${escapeHtml(b.title)} de la bibliothèque</span>`;
      del.addEventListener("click", async () => {
        if (!confirm(`Retirer « ${b.title} » de cet appareil ?`)) return;
        await LStore.remove(b.id); announce("Livre retiré."); renderLibrary();
        $("#lib-title").focus();
      });
      li.append(open, del); ui.libList.appendChild(li);
    });
    $("#lib-title").tabIndex = -1;
    if (window.LCatalogue) LCatalogue.markLocal(books);
  }

  async function openFile(file) {
    if (!file) return;
    if (!/\.epub$/i.test(file.name) && file.type !== "application/epub+zip") { errorMsg("Ce fichier n'est pas un livre EPUB."); return; }
    openBuffer(await file.arrayBuffer(), file.name.replace(/\.epub$/i, ""));
  }
  ui.fileInput.addEventListener("change", () => { openFile(ui.fileInput.files[0]); ui.fileInput.value = ""; });
  ["dragenter", "dragover"].forEach(ev => document.addEventListener(ev, (e) => { e.preventDefault(); ui.dropzone.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || e.target === document.documentElement) ui.dropzone.classList.remove("over"); }));
  document.addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) openFile(f); });
  $("#btn-sample").addEventListener("click", async () => {
    try {
      const res = await fetch("exemples/fables-de-la-fontaine.epub");
      if (!res.ok) throw new Error(res.status);
      openBuffer(await res.arrayBuffer(), "Fables choisies");
    } catch (e) { errorMsg("Le livre d'exemple n'a pas pu être chargé."); }
  });

  /* Electron : ouverture par double-clic ou menu Fichier */
  if (isElectron) {
    window.liseuse.onOpenFile((data, name) => openBuffer(data, name));
    window.liseuse.onMenu && window.liseuse.onMenu((cmd) => {
      if (cmd === "open") ui.fileInput.click();
      if (cmd === "a11y") openDialog("dlg-a11y", $("#btn-a11y"));
      if (cmd === "help") openDialog("dlg-help", $("#btn-help"));
      if (cmd === "home") goHome();
    });
    window.liseuse.ready && window.liseuse.ready();
  }

  /* Recalage quand la fenêtre change de taille */
  if ("ResizeObserver" in window) {
    let rt = null;
    new ResizeObserver(() => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (S.rendition) { try { S.rendition.resize(); } catch (e) { /* ignoré */ } } }, 200);
    }).observe(ui.viewer);
  }

  /* Hors ligne (PWA) — pas dans Electron */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !isElectron) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  /* Ouverture via le partage / « Ouvrir avec » (PWA installée, navigateurs compatibles) */
  if ("launchQueue" in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (params.files && params.files.length) openFile(await params.files[0].getFile());
    });
  }

  applyUI(LSettings.get());
  renderLibrary();
  window.__liseuse = { S, tts, openBuffer, announce, errorMsg, renderLibrary }; // catalogue en ligne + tests
})();
