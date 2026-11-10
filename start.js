// start.html: make a board (POST /flat/create), then hand over the settings link, which holds the
// owner key. We don't keep the key, so this page is the one chance to save it. The board link and
// the QR code hold the board key, which only shows the board.
"use strict";
(function () {
  const LS = window.LS, W = LS.words;
  const form = document.getElementById("make");
  const err = document.getElementById("make-error");
  const go = form.querySelector('button[type="submit"]');
  if (!LS.api) { document.getElementById("not-live").hidden = false; go.disabled = true; return; }

  let boardLang = LS.lang;
  const seg = document.getElementById("board-lang");
  seg.querySelectorAll("button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.lang === boardLang));
    b.addEventListener("click", () => {
      boardLang = b.dataset.lang;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    });
  });
  const email = form.elements.email, updates = document.getElementById("updates-row");
  const syncUpdates = () => { updates.hidden = !email.value.trim(); };
  email.addEventListener("input", syncUpdates);
  syncUpdates();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    const name = form.elements.name.value.replace(/\s+/g, " ").trim();
    if (!name) { err.textContent = W.errName; form.elements.name.focus(); return; }
    if (!form.elements.accept.checked) { err.textContent = W.errAccept; form.elements.accept.focus(); return; }
    go.disabled = true; go.textContent = W.making;
    const r = await LS.call("POST", "/flat/create", {
      name, lang: boardLang, email: email.value.trim() || null, updates: form.elements.updates.checked,
      accept: true, website: form.elements.website.value,
    });
    go.disabled = false; go.textContent = W.make;
    if (r.status === 201 && r.body.owner_key && r.body.board_key) return done(r.body);
    const m = String(r.body.error || "");
    err.textContent = r.status === 0 ? W.errNetwork : r.status === 429 ? W.errMany : r.status === 503 ? W.errPaused
      : /^name/.test(m) ? W.errName : /e-mail/.test(m) ? W.errEmail : LS.fmt(W.errOther, { e: m || "HTTP " + r.status });
  });

  function done(b) {
    LS.remember(b.owner_key, b.flat.name);
    // built here from this site's own address (the pages know the API), so they're short and work
    // before SITE_URL is set on the server
    const settings = LS.root + (b.flat.lang === "en" ? "en/" : "") + "flat.html#k=" + b.owner_key;
    const board = LS.root + "app.html#k=" + b.board_key;
    const qr = LS.root + "app.html#join&k=" + b.board_key;
    document.getElementById("intro").hidden = true;
    form.hidden = true;
    const out = document.getElementById("done");
    out.hidden = false;
    out.querySelector("[data-flat]").textContent = b.flat.name;
    out.querySelector("[data-settings]").textContent = settings;
    out.querySelector("[data-copy-settings]").addEventListener("click", (e) => LS.copy(settings, e.currentTarget));
    const share = out.querySelector("[data-share-settings]");
    if (navigator.share) share.addEventListener("click", () => navigator.share({ title: "Lowscore: " + b.flat.name, url: settings }).catch(() => {}));
    else share.hidden = true;
    out.querySelector("[data-open-qr]").href = qr;
    out.querySelector("[data-open-board]").href = board;
    out.querySelector("[data-copy-board]").addEventListener("click", (e) => LS.copy(board, e.currentTarget));
    out.querySelector("[data-open-settings]").href = settings;
    out.querySelector("[data-until]").textContent = b.plan?.until ? LS.date(b.plan.until) : "";
    out.querySelector("[data-trial]").hidden = !b.plan?.until;
    window.scrollTo(0, 0);
    out.querySelector("h1").focus();
  }
})();
