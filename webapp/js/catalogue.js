/* =========================================================
   Catalogue en ligne : EPUB des dépôts GitHub de biblio.gironde
   - liste des fichiers : API GitHub (arbre du dépôt), mise en cache avec ETag
   - titres, auteurs, années : catalogue.csv du dépôt
   - téléchargement : raw.githubusercontent.com
   La liste suit donc automatiquement chaque ajout ou retrait dans les dépôts.
   ========================================================= */
(function () {
  "use strict";

  const SOURCES = {
    classiques: {
      nom: "Classiques en numérique",
      depot: "biblioGironde/Kit-Liseuses-Les-Classiques-En-Numerique",
      branche: "main",
      cle: "siecle",
      groupes: {
        "15": "XVe siècle — fin du Moyen Âge",
        "16": "XVIe siècle — Renaissance",
        "17": "XVIIe siècle — classicisme",
        "18": "XVIIIe siècle — Lumières",
        "19": "XIXe siècle",
        "20": "XXe siècle"
      }
    },
    bac: {
      nom: "Classiques au bac",
      depot: "biblioGironde/Kit-Liseuses-Classiques-au-bac",
      branche: "main",
      cle: "groupe",
      groupes: {
        poesie: "Poésie — du XIXe au XXIe siècle",
        idees: "Littérature d'idées — du XVIe au XVIIIe siècle",
        roman: "Roman et récit — du Moyen Âge au XXIe siècle",
        theatre: "Théâtre — du XVIIe au XXIe siècle"
      }
    }
  };
  const MAX_AGE = 10 * 60 * 1000; // actualisation automatique au-delà de 10 minutes

  const $ = (s) => document.querySelector(s);
  const L = () => window.__liseuse;
  const ui = { list: $("#cat-list"), status: $("#cat-status"), filter: $("#cat-filter"), refresh: $("#cat-refresh"),
    bac: $("#cat-bac"), session: $("#cat-session"), voie: $("#cat-voie") };
  const bacPrefs = LPrefs.get("liseuse.cat.bac", { session: null, voie: "" });
  let current = LPrefs.get("liseuse.cat.source", "classiques");
  if (!SOURCES[current]) current = "classiques";
  const data = {};          // id -> { livres, maj, horsLigne }
  let localRemotes = new Set();

  /* ---------- Outils ---------- */
  // Même règle que scripts/commun.py des dépôts (noms de fichiers sans accents)
  function sansAccents(t) {
    t = String(t || "").replace(/œ/g, "oe").replace(/Œ/g, "Oe").replace(/æ/g, "ae").replace(/[’‘'`]/g, " ");
    t = t.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7F]/g, "");
    return t.replace(/[^A-Za-z0-9 \-]/g, "").replace(/\s+/g, " ").trim();
  }
  function parseCSV(text) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    const head = rows.shift() || [];
    return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || "").trim()])));
  }
  const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rawUrl = (src, path) => `https://raw.githubusercontent.com/${src.depot}/${src.branche}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const taille = (o) => o ? (o > 1048576 ? (o / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(o / 1024)) + " Ko") : "";

  /* Colonne « bac » des dépôts : années de session, « 2027 » ou « 2023-2026 » (bornes comprises) */
  function sessionsOf(v) {
    const m = String(v || "").match(/(\d{4})(?:\s*[-–]\s*(\d{4}))?/);
    if (!m) return [];
    const a = +m[1], b = m[2] ? +m[2] : a, out = [];
    for (let y = a; y <= b && out.length < 30; y++) out.push(y);
    return out;
  }
  function voieLabel(v) { return v === "G" ? "voie générale" : v === "T" ? "voie technologique" : "voies générale et technologique"; }
  // Session du bac de l'année scolaire en cours (de septembre à août)
  function currentSession() { const d = new Date(); return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear(); }

  function fillSessions(livres) {
    const all = [...new Set(livres.flatMap(l => l.sessions))].sort((a, b) => b - a);
    let want = bacPrefs.session;
    if (want == null) want = all.includes(currentSession()) ? String(currentSession()) : "";
    const opts = ['<option value="">Toutes les années</option>'].concat(all.map(y =>
      `<option value="${y}">Bac ${y} — année scolaire ${y - 1}-${y}${y === currentSession() ? " (en cours)" : ""}</option>`));
    const html = opts.join("");
    if (ui.session.innerHTML !== html) ui.session.innerHTML = html;
    ui.session.value = all.map(String).includes(String(want)) ? String(want) : "";
    ui.voie.value = bacPrefs.voie || "";
  }

  /* ---------- Chargement d'une source ---------- */
  async function loadTree(id, src) {
    const key = "liseuse.cat.tree." + id;
    const cached = LPrefs.get(key, null);
    const headers = { Accept: "application/vnd.github+json" };
    if (cached && cached.etag) headers["If-None-Match"] = cached.etag; // une réponse 304 ne compte pas dans le quota GitHub
    const res = await fetch(`https://api.github.com/repos/${src.depot}/git/trees/${src.branche}?recursive=1`, { headers, cache: "no-store" });
    if (res.status === 304 && cached) return cached.files;
    if (!res.ok) throw new Error("API GitHub " + res.status);
    const json = await res.json();
    const files = (json.tree || [])
      .filter(n => n.type === "blob" && /^epub\/[^/]+\/[^/]+\.epub$/i.test(n.path))
      .map(n => ({ path: n.path, size: n.size }));
    LPrefs.set(key, { etag: res.headers.get("ETag"), files });
    return files;
  }

  async function loadSource(id) {
    const src = SOURCES[id];
    const csvRes = await fetch(rawUrl(src, "catalogue.csv"), { cache: "no-cache" });
    if (!csvRes.ok) throw new Error("catalogue.csv " + csvRes.status);
    const rows = parseCSV(await csvRes.text());
    const byPath = new Map();
    rows.forEach(r => {
      const g = r[src.cle]; if (!g || !r.auteur || !r.titre) return;
      byPath.set(`epub/${g}/${sansAccents(r.auteur)} - ${sansAccents(r.titre)}.epub`, r);
    });
    let files;
    try { files = await loadTree(id, src); }
    catch (e) {
      // Quota de l'API dépassé ou réseau partiel : on se fie au catalogue (statut « ok »)
      console.warn("Liste des fichiers indisponible, repli sur catalogue.csv", e);
      files = [...byPath.entries()].filter(([, r]) => /^ok/i.test(r.statut || "")).map(([path]) => ({ path, size: 0 }));
    }
    const livres = files.map(f => {
      const r = byPath.get(f.path);
      const groupe = f.path.split("/")[1];
      const base = f.path.split("/").pop().replace(/\.epub$/i, "");
      const [a, ...t] = base.split(" - ");
      return {
        remote: src.depot + ":" + f.path,
        url: rawUrl(src, f.path),
        groupe,
        auteur: r ? r.auteur : a,
        titre: r ? r.titre : (t.join(" - ") || base),
        annee: r ? r.annee : "",
        note: r && r.bac ? `Bac ${r.bac}${r.voie ? " · " + voieLabel(r.voie) : ""}${r.programme ? " · " + r.programme : ""}` : "",
        sessions: r ? sessionsOf(r.bac) : [],
        voie: r ? (r.voie || "") : "",
        size: f.size
      };
    });
    const ordre = Object.keys(src.groupes);
    livres.sort((x, y) => {
      const gx = ordre.indexOf(x.groupe), gy = ordre.indexOf(y.groupe);
      return (gx < 0 ? 99 : gx) - (gy < 0 ? 99 : gy) || (parseInt(x.annee) || 9999) - (parseInt(y.annee) || 9999) || x.titre.localeCompare(y.titre, "fr");
    });
    const entry = { livres, maj: Date.now() };
    data[id] = entry;
    LPrefs.set("liseuse.cat.data2." + id, entry);
    return entry;
  }

  async function ensure(id, force) {
    const cached = data[id] || LPrefs.get("liseuse.cat.data2." + id, null);
    if (cached) data[id] = cached;
    const stale = !cached || Date.now() - cached.maj > MAX_AGE;
    if (cached) render();
    if (!force && !stale) return;
    setStatus(cached ? "Vérification des nouveautés…" : "Chargement de la liste des livres…");
    ui.refresh.setAttribute("aria-busy", "true");
    try {
      const before = cached ? cached.livres.length : null;
      await loadSource(id);
      if (id === current) {
        render();
        const n = data[id].livres.length;
        if (before != null && n !== before) L().announce(`La liste a changé : ${n} livres.`);
      }
    } catch (e) {
      console.warn(e);
      if (id === current) {
        if (cached) { data[id].horsLigne = true; render(); }
        else setStatus("La liste des livres n'a pas pu être chargée. Vérifiez la connexion Internet, puis touchez « Actualiser la liste ».");
      }
    } finally { ui.refresh.removeAttribute("aria-busy"); }
  }

  /* ---------- Affichage ---------- */
  function setStatus(t) { ui.status.textContent = t; }

  function render() {
    const src = SOURCES[current]; const d = data[current];
    document.querySelectorAll(".cat-tab").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.source === current)));
    if (!d) { ui.list.innerHTML = ""; return; }
    const isBac = current === "bac";
    ui.bac.hidden = !isBac;
    if (isBac) fillSessions(d.livres);
    const session = isBac ? ui.session.value : "", voie = isBac ? ui.voie.value : "";
    const q = sansAccents(ui.filter.value).toLowerCase();
    const items = d.livres.filter(l =>
      (!q || sansAccents(l.titre + " " + l.auteur).toLowerCase().includes(q)) &&
      (!session || (l.sessions || []).includes(+session)) &&
      (!voie || !l.voie || l.voie.includes(voie)));
    const filtered = !!(q || session || voie);
    const date = new Date(d.maj).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    const crit = session ? ` au programme du bac ${session}` : "";
    setStatus(`${items.length} livre${items.length > 1 ? "s" : ""}${crit}${voie ? ", " + voieLabel(voie) : ""}${filtered && !crit ? " trouvé" + (items.length > 1 ? "s" : "") : ""} · liste vérifiée le ${date}${d.horsLigne ? " (hors connexion : liste enregistrée)" : ""}`);
    const groups = new Map();
    items.forEach(l => { if (!groups.has(l.groupe)) groups.set(l.groupe, []); groups.get(l.groupe).push(l); });
    const open = new Set([...ui.list.querySelectorAll("details[open]")].map(x => x.dataset.g));
    ui.list.innerHTML = [...groups.entries()].map(([g, livres]) => `
      <details data-g="${esc(g)}"${filtered || open.has(g) ? " open" : ""}>
        <summary>${esc(src.groupes[g] || g)} <span class="n">(${livres.length})</span></summary>
        <ul>${livres.map(l => {
          const here = localRemotes.has(l.remote);
          return `<li class="cat-book">
            <span class="info"><span class="t">${esc(l.titre)}</span>
            <span class="a">${esc(l.auteur)}${l.annee ? ", " + esc(l.annee) : ""}${l.note ? " · " + esc(l.note) : ""}${!here && l.size ? " · " + taille(l.size) : ""}</span>${here ? '<span class="local">sur cet appareil</span>' : ""}</span>
            <button type="button" class="big-btn primary" data-remote="${esc(l.remote)}">Lire<span class="sr"> ${esc(l.titre)}, de ${esc(l.auteur)}</span></button>
          </li>`;
        }).join("")}</ul>
      </details>`).join("") || "<p>Aucun livre ne correspond à cette recherche.</p>";
  }

  async function openBook(btn) {
    const d = data[current]; if (!d) return;
    const l = d.livres.find(x => x.remote === btn.dataset.remote); if (!l) return;
    if (btn.getAttribute("aria-busy") === "true") return;
    // Déjà téléchargé : ouverture directe, même hors connexion
    const local = (await LStore.list()).find(b => b.remote === l.remote);
    if (local) {
      const buf = await LStore.getFile(local.id);
      if (buf) { L().openBuffer(buf, l.titre, l.remote); return; }
    }
    btn.setAttribute("aria-busy", "true");
    const label = btn.firstChild.nodeValue; btn.firstChild.nodeValue = "Téléchargement…";
    L().announce(`Téléchargement de ${l.titre}…`);
    try {
      const res = await fetch(l.url);
      if (!res.ok) throw new Error(res.status);
      L().openBuffer(await res.arrayBuffer(), l.titre, l.remote);
    } catch (e) {
      console.warn(e);
      L().errorMsg(`« ${l.titre} » n'a pas pu être téléchargé. Vérifiez la connexion Internet.`);
    } finally {
      btn.removeAttribute("aria-busy"); btn.firstChild.nodeValue = label;
    }
  }

  /* ---------- Événements ---------- */
  document.querySelectorAll(".cat-tab").forEach(b => b.addEventListener("click", () => {
    current = b.dataset.source; LPrefs.set("liseuse.cat.source", current);
    ui.filter.value = ""; render(); ensure(current);
  }));
  ui.filter.addEventListener("input", render);
  ui.session.addEventListener("change", () => { bacPrefs.session = ui.session.value; LPrefs.set("liseuse.cat.bac", bacPrefs); render(); });
  ui.voie.addEventListener("change", () => { bacPrefs.voie = ui.voie.value; LPrefs.set("liseuse.cat.bac", bacPrefs); render(); });
  ui.refresh.addEventListener("click", () => ensure(current, true));
  ui.list.addEventListener("click", (e) => { const b = e.target.closest("button[data-remote]"); if (b) openBook(b); });
  // Retour sur l'onglet : on vérifie les nouveautés si la liste date un peu
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !document.getElementById("home").hidden) ensure(current); });

  window.LCatalogue = {
    markLocal(books) {
      localRemotes = new Set((books || []).map(b => b.remote).filter(Boolean));
      render();
      if (!document.getElementById("home").hidden) ensure(current);
    },
    SOURCES
  };

  LStore.list().then(books => window.LCatalogue.markLocal(books));
})();
