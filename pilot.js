// pilot.html (and any page with a [data-signup] form): sign-ups for the pilot, the e-paper board
// and news (POST /site/waitlist). Each form says which list it is: data-signup="pilot|board|updates|trmnl".
"use strict";
(function () {
  const LS = window.LS, W = LS.words;
  for (const form of document.querySelectorAll("form[data-signup]")) {
    const kind = form.dataset.signup;
    const err = form.querySelector(".error"), go = form.querySelector('button[type="submit"]');
    if (!LS.api) { err.textContent = W.notLive; go.disabled = true; continue; }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      const f = form.elements;
      const email = f.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { err.textContent = W.errEmail; f.email.focus(); return; }
      if (!f.consent.checked) { err.textContent = W.errConsent; f.consent.focus(); return; }
      const details = {};
      for (const el of form.querySelectorAll("[data-detail]")) {
        const v = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value.trim();
        if (v !== null && v !== "") details[el.dataset.detail] = v;
      }
      go.disabled = true;
      const r = await LS.call("POST", "/site/waitlist", { email, kind, lang: LS.lang, consent: true, details, website: f.website.value });
      go.disabled = false;
      if (r.status === 200) {
        form.hidden = true;
        const done = document.getElementById(form.dataset.done);
        if (done) { done.hidden = false; done.focus(); }
        return;
      }
      err.textContent = r.status === 0 ? W.errNetwork : r.status === 429 ? W.errMany : r.status === 422 ? W.errEmail : LS.fmt(W.errOther, { e: r.body.error || r.status });
    });
  }
})();
