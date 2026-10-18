// Crystal note + Liquid Glass helpers.
//
// 1. Injects the logo sprite inline. It has to live in the page (not an external <use>)
//    so its facets pick up the CSS custom properties of whatever surface they sit on.
// 2. Turns on backdrop refraction where the browser can render it (Chromium).
// 3. Tilts the hero note a few degrees toward the pointer.
(function () {
  var SPRITE_URL = "/assets/logo/clearnote-note-sprite.svg";
  var root = document.documentElement;

  // ---- 1. sprite -----------------------------------------------------------
  fetch(SPRITE_URL)
    .then(function (res) {
      if (!res.ok) throw new Error("Logo sprite returned " + res.status);
      return res.text();
    })
    .then(function (svg) {
      var holder = document.createElement("div");
      holder.innerHTML = svg;
      var el = holder.firstElementChild;
      if (el) document.body.insertBefore(el, document.body.firstChild);
    })
    .catch(function (err) { console.warn(err); });

  // ---- 2. refraction -------------------------------------------------------
  // SVG filters inside backdrop-filter only render in Chromium. Safari and Firefox
  // keep the frosted blur, which is the right fallback.
  var brands = navigator.userAgentData && navigator.userAgentData.brands;
  var isChromium = !!(brands && brands.some(function (b) { return /Chromium/.test(b.brand); }));
  if (isChromium) root.classList.add("can-refract");

  // ---- 3. hero tilt --------------------------------------------------------
  var note = document.querySelector("[data-tilt]");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(pointer: fine)");
  if (note && finePointer.matches && !reduce.matches) {
    var stage = note.parentElement;
    var frame = 0;
    stage.parentElement.addEventListener("pointermove", function (e) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function () {
        var r = stage.getBoundingClientRect();
        var x = (e.clientX - (r.left + r.width / 2)) / r.width;
        var y = (e.clientY - (r.top + r.height / 2)) / r.height;
        note.style.setProperty("--tilt-y", (x * 14).toFixed(2) + "deg");
        note.style.setProperty("--tilt-x", (-y * 10).toFixed(2) + "deg");
      });
    });
    stage.parentElement.addEventListener("pointerleave", function () {
      note.style.setProperty("--tilt-y", "0deg");
      note.style.setProperty("--tilt-x", "0deg");
    });
  }

  // ---- footer year ---------------------------------------------------------
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
