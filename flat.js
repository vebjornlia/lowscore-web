// flat.html: a flat's settings page. The owner key comes from the settings link (#k=…) or from
// this device, and is sent only to our API (GET/POST/DELETE /flat with "Authorization: Bearer
// <key>"). The board key, which the API hands back, only shows the board: the board links on this
// page carry it, never the owner key. Never shows which apps a player used: the API doesn't return it.
"use strict";
(function () {
  const LS = window.LS, W = LS.words;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (hash.get("u") && !LS.api) LS.api = hash.get("u").replace(/\/+$/, "");
  // a display's QR code opens flat.html#add=CODE: the code goes into the form, ready to add with one
  // tap (it always opens the Norwegian page: a phone that isn't set to Norwegian gets the English one)
  const addCode = ((c) => /^[0-9A-Z]{9}$/.test(c) ? c : null)(String(hash.get("add") || "").toUpperCase().replace(/[^0-9A-Z]/g, ""));
  if (addCode) {
    if (LS.lang === "nb" && !/^(nb|nn|no)\b/i.test(navigator.language || "")) { location.replace(LS.root + "en/flat.html" + location.hash); return; }
    hash.delete("add");
    history.replaceState(null, "", location.pathname + location.search + (hash.toString() ? "#" + hash.toString() : ""));
  }
  const norm = (s) => { const k = String(s || "").trim().toLowerCase().replace(/[\s-]/g, ""); return /^[0-9a-f]{32}$/.test(k) ? k : null; };
  let key = norm(hash.get("k"));
  let view = null;
  const paid = new URLSearchParams(location.search).has("paid");
  // back from Stripe: its page sends everyone to one address, so remember which flat and language
  const pay = paid ? LS.get("ls-pay") : null;
  if (pay && pay.lang !== LS.lang) { location.replace(LS.root + (pay.lang === "en" ? "en/" : "") + "flat.html" + location.search + location.hash); return; }
  if (pay && !key) key = norm(pay.key);

  const show = (id) => ["open", "loading", "flat", "gone"].forEach((s) => { $("#" + s).hidden = s !== id; });

  if (!LS.api) { show("open"); $("#open-error").textContent = W.notLive; return; }
  if (!key) { const saved = LS.flats(); if (saved.length === 1) key = saved[0].key; }
  if (key) load(); else openForm();

  // ---- opening a flat ------------------------------------------------------------------------

  function openForm(error) {
    show("open");
    $("#open-error").textContent = error || (addCode ? W.addOpenFirst : "");
    const saved = LS.flats();
    const box = $("#saved-flats");
    box.hidden = !saved.length;
    const ul = $("ul", box);
    ul.replaceChildren();
    for (const f of saved) {
      const li = LS.el("li");
      li.appendChild(LS.el("span", "name", f.name || "Lowscore"));
      const b = LS.el("button", "btn small quiet", W.open);
      b.type = "button";
      b.addEventListener("click", () => { key = f.key; setHash(); load(); });
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  $("#open-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = $("#open-key").value.trim();
    let k = norm(raw);
    if (!k) { try { k = norm(new URLSearchParams(new URL(raw).hash.replace(/^#/, "")).get("k")); } catch { /* not a link */ } }
    if (!k) { $("#open-error").textContent = W.errKeyFormat; return; }
    key = k; setHash(); load();
  });

  function setHash() { history.replaceState(null, "", location.pathname + location.search + "#k=" + key); }

  async function load() {
    show("loading");
    const r = await LS.call("GET", "/flat", null, key);
    if (r.status === 401) { LS.forget(key); key = null; return openForm(W.errKey); }
    if (r.status === 403) { LS.forget(key); key = null; history.replaceState(null, "", location.pathname); return openForm(W.errBoardKey); }
    if (r.status !== 200) { show("loading"); $("#loading p").textContent = r.status === 0 ? W.errNetwork : LS.fmt(W.errOther, { e: r.body.error || "HTTP " + r.status }); return; }
    view = r.body;
    LS.remember(key, view.flat.name);
    render();
    if (paid) waitForPayment();
    if (addCode) {
      const input = $("#display-code");
      input.value = addCode.slice(0, 3) + "-" + addCode.slice(3, 6) + "-" + addCode.slice(6);
      $("[data-display-msg]").textContent = W.addReady;
      input.scrollIntoView({ block: "center" });
      $("#display-form button[type=submit]").focus({ preventScroll: true });
    }
  }

  // ---- the page ------------------------------------------------------------------------------

  const ago = (iso) => {
    if (!iso) return null;
    const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (min < 2) return W.justNow;
    if (min < 60) return LS.fmt(W.minAgo, { n: min });
    if (min < 48 * 60) return LS.fmt(W.hAgo, { n: Math.round(min / 60) });
    return LS.fmt(W.dAgo, { n: Math.round(min / 1440) });
  };
  const hm = (m) => Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0");
  // the page's own price text, in its language (the server's PASS_PRICE is the same number)
  const price = () => W.price;

  function render() {
    show("flat");
    $("[data-name]").textContent = view.flat.name;
    document.title = view.flat.name + " · Lowscore";
    renderPass();
    renderLinks();
    renderPlayers();
    renderDisplays();
    renderRules();
    $("#rename-input").value = view.flat.name;
    $("#email-input").value = view.email || "";
    $("#email-updates").checked = !!view.updates;
  }

  function renderPass() {
    const p = view.plan, box = $("#pass");
    // after a pass has run out the words differ from after the free season
    const lapsed = (p.state === "grace" || p.state === "expired") && !!view.flat.paid_until;
    const d = p.days_left, date = p.until ? LS.date(p.until) : "";
    const lines = {
      founder: [W.stFounder, W.stFounderD],
      trial: [LS.fmt(W.stTrial, { d }), LS.fmt(W.stTrialD, { date, price: price() })],
      early: [LS.fmt(W.stEarly, { d }), LS.fmt(W.stEarlyD, { date, price: price() })],
      paid: [LS.fmt(W.stPaid, { date }), LS.fmt(W.stPaidD, { d })],
      grace: [lapsed ? W.stLapsed : W.stOver, LS.fmt(W.stGraceD, { d })],
      expired: [lapsed ? W.stLapsed : W.stOver, W.stExpiredD],
    }[p.state] || ["", ""];
    $("[data-status]", box).textContent = lines[0];
    $("[data-detail]", box).textContent = lines[1];
    box.classList.toggle("warn", p.state === "grace" || p.state === "expired");
    const buy = $("[data-buy]", box), off = $("[data-pay-off]", box);
    const canBuy = p.state !== "founder";
    buy.hidden = !canBuy || !p.payments;
    off.hidden = !canBuy || p.payments;
    buy.textContent = LS.fmt(p.state === "paid" ? W.buyMore : W.buy, { price: price() });
    // with a pass running, buying another is an option, not the thing to do
    buy.className = p.state === "paid" ? "btn small quiet" : "btn";
    $("[data-confirm]", box).hidden = true;
  }

  $("[data-buy]").addEventListener("click", () => {
    const p = view.plan, c = $("[data-confirm]");
    const start = p.state === "trial" || p.state === "early" ? LS.fmt(W.startAfterFree, { date: LS.date(p.until) })
      : p.state === "paid" ? LS.fmt(W.startAfterPass, { date: LS.date(p.until) }) : W.startNow;
    $("[data-confirm-text]", c).textContent = LS.fmt(W.confirm, { flat: view.flat.name, price: price(), days: p.pass_days }) + " " + start;
    c.hidden = false;
    $("[data-buy]").hidden = true;
    $("[data-go-pay]", c).focus();
  });
  $("[data-cancel-pay]").addEventListener("click", renderPass);
  $("[data-go-pay]").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    const r = await LS.call("POST", "/flat", { action: "checkout" }, key);
    b.disabled = false;
    if (r.status === 200 && r.body.url) { LS.set("ls-pay", { key, lang: LS.lang }); location.href = r.body.url; return; }
    $("[data-pay-error]").textContent = r.status === 503 ? W.payOff : r.status === 0 ? W.errNetwork : LS.fmt(W.errOther, { e: r.body.error || r.status });
  });

  async function waitForPayment() {
    const msg = $("[data-paid-msg]");
    msg.hidden = false;
    msg.textContent = W.paidWait;
    for (let i = 0; i < 10; i++) {
      if (view.plan.state === "paid" && Date.parse(view.plan.until) - Date.now() > 150 * 86400000) break;
      await new Promise((r) => setTimeout(r, 3000));
      const r = await LS.call("GET", "/flat", null, key);
      if (r.status === 200) { view = r.body; renderPass(); }
    }
    const ok = view.plan.state === "paid";
    msg.textContent = ok ? LS.fmt(W.paidOk, { date: LS.date(view.plan.until) }) : W.paidSlow;
    if (ok) LS.set("ls-pay", null);
    $("[data-paid-docs]").hidden = !ok;
    history.replaceState(null, "", location.pathname + location.hash);
  }

  function renderLinks() {
    const bk = view.board_key;
    const warn = $("[data-keys-warning]");
    warn.hidden = !!bk;
    warn.textContent = bk ? "" : W.keysMismatch;
    document.querySelectorAll("[data-board],[data-qr],[data-png],[data-copy-board]").forEach((el) => { el.hidden = !bk; });
    const settings = location.href.split("#")[0].split("?")[0] + "#k=" + key;
    $("[data-copy-settings]").onclick = (e) => LS.copy(settings, e.currentTarget);
    if (!bk) return;
    const board = LS.root + "app.html#k=" + bk;
    $("[data-board]").href = board;
    $("[data-qr]").href = LS.root + "app.html#join&k=" + bk;
    $("[data-png]").href = LS.url("/board?key=" + bk + "&format=png");
    $("[data-copy-board]").onclick = (e) => LS.copy(board, e.currentTarget);
  }

  function twoTap(button, armed, act) {
    let ready = false, t = null;
    const label = button.textContent;
    button.addEventListener("click", async () => {
      if (!ready) { ready = true; button.textContent = armed; t = setTimeout(() => { ready = false; button.textContent = label; }, 6000); return; }
      clearTimeout(t);
      button.disabled = true;
      await act();
      button.disabled = false; ready = false; button.textContent = label;
    });
  }

  function renderPlayers() {
    const ul = $("[data-players]");
    ul.replaceChildren();
    $("[data-no-players]").hidden = view.players.length > 0;
    for (const p of view.players) {
      const li = LS.el("li");
      li.appendChild(LS.el("span", "name", p.name));
      const bits = [p.platform === "android" ? "Android" : "iPhone", p.roast ? W.roastOn : W.roastOff,
        p.par_min ? LS.fmt(W.par, { par: hm(p.par_min) }) : W.findingPar, p.last_heard ? LS.fmt(W.heard, { ago: ago(p.last_heard) }) : W.notHeard];
      li.appendChild(LS.el("span", "meta", bits.join(", ")));
      const b = LS.el("button", "linkish danger", W.remove);
      b.type = "button";
      twoTap(b, LS.fmt(W.removeSure, { name: p.name }), async () => {
        const r = await LS.call("POST", "/flat", { action: "remove-player", player: p.name }, key);
        if (r.status === 200) { view.players = view.players.filter((x) => x.name !== p.name); renderPlayers(); }
        else $("[data-players-error]").textContent = r.status === 0 ? W.errNetwork : LS.fmt(W.errOther, { e: r.body.error || r.status });
      });
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  function renderDisplays() {
    const ul = $("[data-displays]");
    ul.replaceChildren();
    $("[data-no-displays]").hidden = view.displays.length > 0;
    const out = $("[data-display-msg]"), errEl = $("[data-display-error]");
    for (const d of view.displays) {
      const li = LS.el("li");
      li.appendChild(LS.el("span", "name", d.id));
      const bits = [d.last_seen ? LS.fmt(W.seen, { ago: ago(d.last_seen) }) : W.notSeen];
      if (d.battery_v) bits.push(LS.fmt(W.battery, { v: d.battery_v.toFixed(2).replace(".", LS.lang === "nb" ? "," : ".") }));
      li.appendChild(LS.el("span", "meta", bits.join(", ")));
      const b = LS.el("button", "linkish danger", W.remove);
      b.type = "button";
      twoTap(b, LS.fmt(W.removeSure, { name: d.id }), async () => {
        out.textContent = ""; errEl.textContent = "";
        const r = await LS.call("POST", "/flat", { action: "remove-display", id: d.id }, key);
        if (r.status === 200) { view.displays = view.displays.filter((x) => x.id !== d.id); renderDisplays(); out.textContent = W.displayRemoved; }
        else errEl.textContent = r.status === 0 ? W.errNetwork : LS.fmt(W.errOther, { e: r.body.error || r.status });
      });
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  $("#display-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("[data-display-msg]"), errEl = $("[data-display-error]");
    out.textContent = ""; errEl.textContent = "";
    const code = $("#display-code").value.trim();
    const r = await LS.call("POST", "/flat", { action: "add-display", code }, key);
    if (r.status === 200) {
      $("#display-code").value = "";
      view.displays = view.displays.filter((x) => x.id !== r.body.id)
        .concat([{ id: r.body.id, mac: r.body.mac, last_seen: r.body.last_seen, battery_v: r.body.battery_v, keyed: true }]);
      renderDisplays();
      // the same address already here: most likely this display before it was set up again
      const same = r.body.same_mac || [];
      out.textContent = same.length ? LS.fmt(W.displaySameMac, { names: same.join(", ") }) : W.displayAdded;
      return;
    }
    errEl.textContent = r.status === 422 ? W.errCode : r.status === 404 ? W.errCodeUnknown
      : r.status === 409 ? (/address/.test(r.body.error || "") ? W.errDisplaysFullOld : W.errDisplaysFull)
      : r.status === 429 ? W.errTooMany : r.status === 0 ? W.errNetwork : LS.fmt(W.errOther, { e: r.body.error || r.status });
  });

  let rulesLang = "nb";
  function renderRules() {
    rulesLang = view.settings.lang;
    document.querySelectorAll("#rules-lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === rulesLang)));
    $("#rules-forfeit").checked = !!view.settings.forfeit;
    const apps = $("[data-apps]");
    apps.replaceChildren();
    for (const [k, name] of Object.entries(view.known_apps)) {
      const l = LS.el("label", "check");
      const c = LS.el("input");
      c.type = "checkbox"; c.value = k; c.checked = view.settings.tracked.includes(k);
      l.appendChild(c); l.appendChild(LS.el("span", null, name));
      apps.appendChild(l);
    }
  }
  document.querySelectorAll("#rules-lang button").forEach((b) => b.addEventListener("click", () => {
    rulesLang = b.dataset.lang;
    document.querySelectorAll("#rules-lang button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));

  $("#rules-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = $("[data-rules-saved]"), errEl = $("[data-rules-error]");
    ok.textContent = ""; errEl.textContent = "";
    const tracked = [...document.querySelectorAll("[data-apps] input:checked")].map((c) => c.value);
    if (!tracked.length) { errEl.textContent = W.errNoApps; return; }
    const r = await LS.call("POST", "/flat", { action: "settings", settings: { lang: rulesLang, forfeit: $("#rules-forfeit").checked, tracked } }, key);
    if (r.status === 200) { view.settings.lang = rulesLang; view.settings.tracked = tracked; ok.textContent = W.saved; }
    else errEl.textContent = r.status === 0 ? W.errNetwork : LS.fmt(W.errOther, { e: r.body.error || r.status });
  });

  $("#rename-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = $("[data-rename-saved]"), errEl = $("[data-rename-error]");
    ok.textContent = ""; errEl.textContent = "";
    const r = await LS.call("POST", "/flat", { action: "rename", name: $("#rename-input").value }, key);
    if (r.status === 200) { view.flat.name = r.body.name; $("[data-name]").textContent = r.body.name; LS.remember(key, r.body.name); ok.textContent = W.saved; }
    else errEl.textContent = r.status === 422 ? W.errName : r.status === 0 ? W.errNetwork : LS.fmt(W.errOther, { e: r.body.error || r.status });
  });

  $("#email-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = $("[data-email-saved]"), errEl = $("[data-email-error]");
    ok.textContent = ""; errEl.textContent = "";
    const email = $("#email-input").value.trim();
    const r = await LS.call("POST", "/flat", { action: "email", email: email || null, updates: $("#email-updates").checked }, key);
    if (r.status === 200) { view.email = r.body.email; view.updates = r.body.updates; $("#email-updates").checked = r.body.updates; ok.textContent = W.saved; }
    else errEl.textContent = r.status === 422 ? W.errEmail : r.status === 0 ? W.errNetwork : LS.fmt(W.errOther, { e: r.body.error || r.status });
  });

  twoTap($("[data-rotate-invite]"), W.sure, async () => {
    const r = await LS.call("POST", "/flat", { action: "rotate-invite" }, key);
    $("[data-keys-msg]").textContent = r.status === 200 ? W.newInvite : W.errNetwork;
  });

  twoTap($("[data-rotate-key]"), W.sure, async () => {
    const r = await LS.call("POST", "/flat", { action: "rotate-key" }, key);
    if (r.status !== 200 || !r.body.owner_key || !r.body.board_key) { $("[data-keys-msg]").textContent = W.errNetwork; return; }
    LS.forget(key);
    key = r.body.owner_key;
    view.board_key = r.body.board_key;
    LS.remember(key, view.flat.name);
    setHash();
    renderLinks();
    $("[data-keys-msg]").textContent = W.newKey;
  });

  $("#delete-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = $("[data-delete-error]");
    errEl.textContent = "";
    const typed = $("#delete-name").value.replace(/\s+/g, " ").trim().toLowerCase();
    if (typed !== view.flat.name.toLowerCase()) { errEl.textContent = W.errConfirm; return; }
    const r = await LS.call("DELETE", "/flat", { confirm: typed }, key);
    if (r.status !== 200) { errEl.textContent = r.status === 0 ? W.errNetwork : LS.fmt(W.errOther, { e: r.body.error || r.status }); return; }
    LS.forget(key);
    key = null;
    history.replaceState(null, "", location.pathname);
    show("gone");
  });

  $("[data-forget]").addEventListener("click", () => {
    LS.forget(key);
    key = null; view = null;
    history.replaceState(null, "", location.pathname);
    openForm();
  });
})();
