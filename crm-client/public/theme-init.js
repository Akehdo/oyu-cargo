// Apply the saved/system theme before React renders to avoid a flash.
// A separate file (not inline) so the page works under a strict CSP.
(function () {
  try {
    var saved = JSON.parse(localStorage.getItem("cargo.client.theme") || "null");
    var mode =
      saved === "light" || saved === "dark"
        ? saved
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    document.documentElement.dataset.theme = mode;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
