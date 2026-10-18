// Light/dark theme.
// Loaded in <head> without defer so data-theme is set before the first paint.
// Follows the device setting until the visitor picks a theme; their pick is remembered.
(function () {
  var KEY = "cn-theme";
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var btn = document.querySelector("[data-theme-toggle]");
    if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    var meta = document.querySelectorAll('meta[name="theme-color"]');
    meta.forEach(function (m) { m.setAttribute("content", theme === "dark" ? "#0F1E2A" : "#F5F2EC"); });
  }

  apply(saved() || (media.matches ? "dark" : "light"));

  media.addEventListener("change", function (e) {
    if (!saved()) apply(e.matches ? "dark" : "light");
  });

  document.addEventListener("DOMContentLoaded", function () {
    apply(root.getAttribute("data-theme"));
    var btn = document.querySelector("[data-theme-toggle]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
    });
  });
})();
