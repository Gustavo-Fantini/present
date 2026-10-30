(function () {
  "use strict";
  if (window.FreeIslandAnonymousPageViews) return;
  var BASE = "https://qpzwinntrphqaabatoaf.supabase.co";
  // Public anon key, matching fi.js. Privileged keys must never be used here.
  var PUBLIC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwendpbm50cnBocWFhYmF0b2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODY5MTksImV4cCI6MjA5MDU2MjkxOX0.je1E_QKNABd-U18tSCcJd4JoTjVX8DZM5ejc_9IDaX0";
  var allowedPaths = ["/", "/guias.html", "/ofertas.html", "/sobre.html", "/politica-editorial.html",
    "/privacidade.html", "/termos.html", "/contato.html",
    "/guias/checklist-compra-online.html", "/guias/como-identificar-preco-real.html",
    "/guias/como-validar-cupom.html", "/guias/comparar-placa-de-video.html", "/guias/comparar-ssd.html",
    "/guias/escolher-monitor.html", "/guias/escolher-perifericos.html", "/guias/escolher-processador.html",
    "/guias/montar-pc-equilibrado.html", "/guias/vendedor-garantia-marketplace.html"];
  var path = location.pathname === "/index.html" ? "/" : location.pathname;
  var state = { table: "page_view_daily", state: "idle", page_path: path, last_http_status: null, error: null };
  window.FreeIslandAnonymousPageViews = { getStatus: function () { return Object.assign({}, state); } };
  if (allowedPaths.indexOf(path) === -1) { state.state = "excluded_path"; return; }
  if (typeof window.fetch !== "function") { state.state = "unavailable"; state.error = "fetch_unavailable"; return; }
  state.state = "sending";
  // Exactly one attempt per document, including after a history restore. Retrying
  // an ambiguous response could increment twice without an identifying token.
  window.fetch(BASE + "/rest/v1/rpc/freeisland_record_page_view", {
    method: "POST", credentials: "omit", referrerPolicy: "no-referrer", keepalive: true, cache: "no-store",
    headers: { apikey: PUBLIC_KEY, Authorization: "Bearer " + PUBLIC_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_page_path: path })
  }).then(function (response) {
    state.last_http_status = response.status;
    state.state = response.ok ? "recorded" : "error";
    if (!response.ok) state.error = "anonymous_counter_http_" + response.status;
  }).catch(function () { state.state = "error"; state.error = "anonymous_counter_network_error"; });
})();
