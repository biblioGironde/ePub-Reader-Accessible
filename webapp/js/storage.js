/* Bibliothèque locale (IndexedDB) : les livres restent sur l'appareil. */
(function () {
  "use strict";
  const DB_NAME = "liseuse-accessible";
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("IndexedDB indisponible")); return; }
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("books")) db.createObjectStore("books", { keyPath: "id" });
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const req = fn(s); // fn renvoie toujours une IDBRequest
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  const Store = {
    /** Métadonnées de tous les livres, du plus récemment ouvert au plus ancien. */
    async list() {
      try {
        const all = await tx("books", "readonly", s => s.getAll());
        return (all || []).sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
      } catch (e) { console.warn(e); return []; }
    },
    async get(id) {
      try { return await tx("books", "readonly", s => s.get(id)); } catch (e) { return null; }
    },
    async getFile(id) {
      try { return await tx("files", "readonly", s => s.get(id)); } catch (e) { return null; }
    },
    async save(meta, data) {
      try {
        await tx("books", "readwrite", s => s.put(meta));
        if (data) await tx("files", "readwrite", s => s.put(data, meta.id));
      } catch (e) { console.warn("Enregistrement impossible", e); }
    },
    async update(id, patch) {
      const cur = await Store.get(id);
      if (!cur) return;
      await Store.save(Object.assign(cur, patch));
    },
    async remove(id) {
      try {
        await tx("books", "readwrite", s => s.delete(id));
        await tx("files", "readwrite", s => s.delete(id));
      } catch (e) { console.warn(e); }
    }
  };

  /* Petit stockage clé/valeur tolérant (navigation privée, stockage bloqué…) */
  const Prefs = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignoré */ }
    }
  };

  /** Empreinte stable d'un fichier pour l'identifier dans la bibliothèque. */
  async function fingerprint(buffer) {
    try {
      if (window.crypto && crypto.subtle) {
        const slice = buffer.byteLength > 2e6 ? buffer.slice(0, 2e6) : buffer;
        const h = await crypto.subtle.digest("SHA-1", slice);
        return Array.from(new Uint8Array(h)).slice(0, 10).map(b => b.toString(16).padStart(2, "0")).join("") + "-" + buffer.byteLength;
      }
    } catch (e) { /* contexte non sécurisé */ }
    let h = 2166136261; const v = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 65536));
    for (let i = 0; i < v.length; i++) { h ^= v[i]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16) + "-" + buffer.byteLength;
  }

  window.LStore = Store;
  window.LPrefs = Prefs;
  window.LFingerprint = fingerprint;
})();
