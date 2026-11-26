// Apply the saved/system theme before React renders to avoid a flash.
// A separate file (not inline) so the page works under a strict CSP.
// Inside the Telegram Mini App "system" means the Telegram theme.
(function () {
  function telegramScheme() {
    try {
      var hash = new URLSearchParams(location.hash.replace(/^#/, ""));
      var params = hash.get("tgWebAppThemeParams");
      var bg = params ? JSON.parse(params).bg_color : null;
      if (!bg) {
        var launch = JSON.parse(sessionStorage.getItem("oyu.telegram.launch") || "null");
        return launch && launch.colorScheme;
      }
      var m = /^#?([0-9a-f]{6})$/i.exec(bg);
      if (!m) return null;
      var v = parseInt(m[1], 16);
      var r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
      return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b) < 120 ? "dark" : "light";
    } catch (e) {
      return null;
    }
  }
  try {
    var saved = JSON.parse(localStorage.getItem("cargo.client.theme") || "null");
    var mode =
      saved === "light" || saved === "dark"
        ? saved
        : telegramScheme() ||
          (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = mode;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
