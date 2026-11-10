// open.html: the business numbers, live from GET /site/stats (counts only; switched on with
// PUBLIC_STATS=1 on the server). Without them the page still tells how Lowscore was made.
"use strict";
(function () {
  const LS = window.LS, W = LS.words;
  const box = document.getElementById("stats"), note = document.getElementById("stats-note");
  if (!LS.api) { note.textContent = W.statsOff; return; }
  (async () => {
    const r = await LS.call("GET", "/site/stats");
    if (r.status !== 200) { note.textContent = r.status === 404 ? W.statsOff : W.errNetwork; return; }
    const s = r.body, nf = new Intl.NumberFormat(LS.lang === "en" ? "en-GB" : "nb-NO");
    const kr = Object.entries(s.revenue_minor || {}).map(([c, n]) => nf.format(Math.round(n / 100)) + (c === "nok" ? " kr" : " " + c.toUpperCase())).join(" + ") || "0 kr";
    const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
    const cells = [
      [nf.format(s.flats ?? 0), W.sFlats], [nf.format(s.flats_active_7d ?? 0), W.sActive], [nf.format(s.players ?? 0), W.sPlayers],
      [nf.format(s.flats_paid_now ?? 0), W.sPaid], [kr, W.sRevenue], [nf.format(s.waitlist?.pilot ?? 0), W.sPilot],
      [nf.format(sum(s.waitlist)), W.sSignups], [nf.format(sum(s.visits_30d)), W.sVisits],
    ];
    box.replaceChildren();
    for (const [n, label] of cells) {
      const d = LS.el("div");
      d.appendChild(LS.el("b", null, n));
      d.appendChild(LS.el("span", null, label));
      box.appendChild(d);
    }
    note.textContent = LS.fmt(W.statsAt, { t: new Intl.DateTimeFormat(LS.lang === "en" ? "en-GB" : "nb-NO", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Oslo" }).format(new Date(s.at || Date.now())) });
  })();
})();
