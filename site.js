// Shared by every page of the Lowscore website: where the API is, calling it, remembering things
// on this device (only what the person asked for), copying, and the anonymous visit count.
// No cookies, no third parties.
"use strict";
(function () {
  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content || "";
  const LS = {
    /** functions base URL, e.g. https://<ref>.supabase.co/functions/v1 ("" until the backend is live) */
    api: meta("ls-api").replace(/\/+$/, ""),
    /** pin the functions to one region (forceFunctionRegion), when the site was built with one */
    region: meta("ls-region"),
    /** the site's root, relative to this page ("./" or "../") */
    root: new URL(meta("ls-root") || "./", location.href).href,
    lang: document.documentElement.lang === "en" ? "en" : "nb",
    words: JSON.parse(document.getElementById("ls-words")?.textContent || "{}"),

    url(path) {
      let u = this.api + path;
      if (this.region) u += (u.includes("?") ? "&" : "?") + "forceFunctionRegion=" + encodeURIComponent(this.region);
      return u;
    },

    /** JSON in, {status, body} out; status 0 when the network failed */
    async call(method, path, body, key) {
      const headers = {};
      if (body !== undefined && body !== null) headers["Content-Type"] = "application/json";
      if (key) headers.Authorization = "Bearer " + key;
      try {
        const res = await fetch(this.url(path), { method, headers, body: body == null ? undefined : JSON.stringify(body) });
        let data = {};
        try { data = await res.json(); } catch { /* not JSON */ }
        return { status: res.status, body: data };
      } catch {
        return { status: 0, body: {} };
      }
    },

    /** localStorage that never throws (private mode, blocked storage) */
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
    set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* not kept */ } },

    /** the flats this device has the settings link for */
    flats() { return (this.get("ls-flats") || []).filter((f) => f && /^[0-9a-f]{32}$/.test(f.key)); },
    remember(key, name) {
      const list = this.flats().filter((f) => f.key !== key);
      list.unshift({ key, name, at: Date.now() });
      this.set("ls-flats", list.slice(0, 8));
    },
    forget(key) { this.set("ls-flats", this.flats().filter((f) => f.key !== key)); },

    copy(text, button, done) {
      const label = button.textContent;
      const ok = () => { button.textContent = done || this.words.copied || "Copied"; setTimeout(() => { button.textContent = label; }, 1800); };
      const fallback = () => {
        const ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
        try { document.execCommand("copy"); ok(); } catch { /* nothing to do */ }
        document.body.removeChild(ta);
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
    },

    el(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    },

    /** "{name}" placeholders in a sentence */
    fmt(s, vars) { return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars ? vars[k] : "")); },

    date(iso) {
      return new Intl.DateTimeFormat(this.lang === "en" ? "en-GB" : "nb-NO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Oslo" })
        .format(new Date(iso));
    },
  };
  window.LS = LS;

  // one anonymous visit: the page and the language, nothing about the visitor (no cookie, no storage)
  const page = document.body.dataset.page;
  if (page && LS.api && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(LS.url("/site/hit"), new Blob([JSON.stringify({ page: page + (LS.lang === "en" ? ".en" : "") })], { type: "text/plain" }));
    } catch { /* counting is optional */ }
  }

  // the language link remembers the choice; the Norwegian front page follows it next time
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("[data-setlang]");
    if (a) LS.set("ls-lang", a.dataset.setlang);
  });
  const bar = document.getElementById("langbar");
  if (bar && LS.lang === "nb") {
    const chosen = LS.get("ls-lang");
    if (chosen === "en" && document.body.dataset.page === "home") location.replace(LS.root + "en/");
    else if (!chosen && !(navigator.languages || [navigator.language]).some((l) => /^(nb|nn|no|da|sv)\b/i.test(l || ""))) bar.hidden = false;
  }
})();
