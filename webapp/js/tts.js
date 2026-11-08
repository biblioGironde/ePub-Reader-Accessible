/* Lecture à voix haute (Web Speech API), phrase par phrase, avec surlignage. */
(function () {
  "use strict";
  const synth = window.speechSynthesis;
  const supported = !!(synth && window.SpeechSynthesisUtterance);

  const BLOCKS = "p,h1,h2,h3,h4,h5,h6,li,blockquote,dd,dt,td,th,figcaption,caption,pre,div,section,article,aside";

  /** Découpe le document d'un chapitre en phrases, chacune avec sa Range DOM. */
  function collectSentences(doc, lang) {
    const items = [];
    const body = doc.body;
    if (!body) return items;
    const seg = (window.Intl && Intl.Segmenter) ? new Intl.Segmenter(lang || "fr", { granularity: "sentence" }) : null;
    // Regroupe les nœuds texte par bloc le plus proche
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || p.closest("script,style,rt,rp,[aria-hidden='true']")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let group = null, groupBlock = null;
    const groups = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const block = n.parentElement.closest(BLOCKS) || body;
      if (block !== groupBlock) { group = []; groups.push(group); groupBlock = block; }
      group.push(n);
    }
    for (const nodes of groups) {
      // Texte concaténé + table de correspondance des positions
      let text = ""; const map = [];
      for (const n of nodes) { map.push([text.length, n]); text += n.nodeValue; }
      const locate = (pos) => {
        let lo = 0, hi = map.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (map[mid][0] <= pos) lo = mid; else hi = mid - 1; }
        const [start, node] = map[lo];
        return [node, Math.min(pos - start, node.nodeValue.length)];
      };
      const pieces = [];
      if (seg) { for (const s of seg.segment(text)) pieces.push([s.index, s.segment]); }
      else {
        const re = /[^.!?…]+(?:[.!?…]+["»”’)]*\s*|$)/g; let m;
        while ((m = re.exec(text)) && m[0]) pieces.push([m.index, m[0]]);
      }
      for (const [idx, s] of pieces) {
        const lead = s.length - s.trimStart().length;
        const clean = s.trim();
        if (!clean || !/[\p{L}\p{N}]/u.test(clean)) continue;
        const a = locate(idx + lead), b = locate(idx + lead + clean.length);
        const r = doc.createRange();
        try { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); } catch (e) { continue; }
        items.push({ text: clean.replace(/\s+/g, " "), range: r });
      }
    }
    return items;
  }

  function pickVoice(lang, wantedName) {
    if (!supported) return null;
    const voices = synth.getVoices();
    if (wantedName) { const v = voices.find(x => x.name === wantedName); if (v) return v; }
    const base = (lang || "fr").slice(0, 2).toLowerCase();
    const same = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(base));
    // Les voix « naturelles / enhanced / premium » sont en général plus agréables
    const nice = same.find(v => /natural|neural|premium|enhanced|amélioré|online/i.test(v.name));
    return nice || same.find(v => v.localService) || same[0] || voices[0] || null;
  }

  /* Les voix se chargent parfois en différé (Chrome, Edge) */
  function waitVoices() {
    return new Promise((resolve) => {
      const v = synth.getVoices();
      if (v.length) { resolve(v); return; }
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(synth.getVoices()); };
      synth.addEventListener ? synth.addEventListener("voiceschanged", finish, { once: true }) : (synth.onvoiceschanged = finish);
      setTimeout(finish, 1500);
    });
  }

  class Reader {
    constructor(adapter, hooks) {
      this.a = adapter; this.h = hooks || {};
      this.items = []; this.i = 0; this.state = "stopped"; // stopped | playing | paused
      this.rate = 0.9; this.voiceName = null; this.lang = "fr-FR";
      this.token = 0;
    }
    get supported() { return supported; }

    async start() {
      if (!supported) { this.h.onError && this.h.onError("La synthèse vocale n'est pas disponible dans ce navigateur."); return; }
      this.stop(true);
      if (!(await waitVoices()).length) {
        this.h.onError && this.h.onError("Aucune voix de synthèse n'est installée sur cet appareil. Ajoutez une voix française dans les réglages de langue ou d'accessibilité du système.");
        this._setState("stopped");
        return;
      }
      this.failures = 0;
      const { items, startIndex } = await this.a.collect(false);
      this.items = items; this.i = startIndex;
      this._setState("playing");
      this._speak();
    }
    toggle() {
      if (this.state === "playing") this.pause();
      else if (this.state === "paused") this.resume();
      else this.start();
    }
    pause() {
      if (this.state !== "playing") return;
      this.token++; synth.cancel();
      this._setState("paused");
    }
    resume() {
      if (this.state !== "paused") return;
      this._setState("playing"); this._speak();
    }
    stop(silent) {
      this.token++;
      if (supported) synth.cancel();
      this.items = []; this.i = 0;
      this.a.highlight(null);
      this.h.onCaption && this.h.onCaption("", -1, 0);
      if (!silent) this._setState("stopped"); else this.state = "stopped";
    }
    skip(delta) {
      if (this.state === "stopped") return;
      this.token++; synth.cancel();
      this.i = Math.max(0, Math.min(this.items.length - 1, this.i + delta));
      if (this.state === "playing") this._speak(); else this._show(this.items[this.i]);
    }
    setRate(r) { this.rate = r; if (this.state === "playing") { this.token++; synth.cancel(); this._speak(); } }
    setVoice(name) { this.voiceName = name; if (this.state === "playing") { this.token++; synth.cancel(); this._speak(); } }

    _setState(s) { this.state = s; this.h.onState && this.h.onState(s); }
    _show(item) {
      if (!item) return;
      this.a.highlight(item.range, null);
      this.a.ensureVisible(item.range);
      this.h.onCaption && this.h.onCaption(item.text, -1, 0);
    }

    async _speak() {
      const my = ++this.token;
      if (this.i >= this.items.length) {
        // Fin du chapitre : on passe au suivant
        const more = await this.a.next();
        if (my !== this.token) return;
        if (!more) { this.stop(); this.h.onEnd && this.h.onEnd(); return; }
        const { items } = await this.a.collect(true);
        if (my !== this.token) return;
        this.items = items; this.i = 0;
        if (!items.length) { this._speak(); return; }
      }
      const item = this.items[this.i];
      this._show(item);
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = this.lang; u.rate = this.rate;
      const v = pickVoice(this.lang, this.voiceName); if (v) { try { u.voice = v; u.lang = v.lang; } catch (e) { /* voix invalide */ } }
      u.onboundary = (e) => {
        if (my !== this.token || e.name === "sentence") return;
        const len = e.charLength || (item.text.slice(e.charIndex).match(/^[\p{L}\p{N}'’-]+/u) || [""])[0].length;
        this.h.onCaption && this.h.onCaption(item.text, e.charIndex, len);
        this.a.highlightWord && this.a.highlightWord(item.range, item.text, e.charIndex, len);
      };
      u.onend = () => { if (my !== this.token) return; this.failures = 0; this.i++; this._speak(); };
      u.onerror = (e) => {
        if (my !== this.token || e.error === "interrupted" || e.error === "canceled") return;
        console.warn("Synthèse vocale :", e.error);
        if (++this.failures >= 3) { this.stop(); this.h.onError && this.h.onError("La synthèse vocale ne répond pas sur cet appareil."); return; }
        this.i++; this._speak();
      };
      synth.speak(u);
      // Contournement Chrome : la synthèse peut se figer en arrière-plan
      if (synth.paused) synth.resume();
    }
  }

  function listVoices() { return supported ? synth.getVoices() : []; }
  function onVoicesChanged(fn) { if (supported) synth.addEventListener ? synth.addEventListener("voiceschanged", fn) : (synth.onvoiceschanged = fn); }

  window.LTTS = { Reader, collectSentences, listVoices, onVoicesChanged, pickVoice, supported };
})();
