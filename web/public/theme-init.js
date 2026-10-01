// Applies a forced theme before the app's first paint, so a Nuit user never sees a flash of Jour.
// A separate file, not an inline script, so a strict Content-Security-Policy can allow it.
try {
  var theme = localStorage.getItem("geomap.theme");
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
} catch (e) {
  // Storage blocked: the system theme applies.
}
