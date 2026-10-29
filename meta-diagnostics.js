(function () {
  "use strict";
  if (new URLSearchParams(location.search).get("debugMeta") !== "true" || document.getElementById("fi-meta-diagnostics")) return;
  var panel = document.createElement("section");
  panel.id = "fi-meta-diagnostics";
  panel.setAttribute("aria-label", "Diagnóstico de métricas");
  panel.style.cssText = "max-width:720px;margin:16px auto;padding:18px;border:2px solid #216544;border-radius:16px;background:#fff;color:#183b2d;font:14px/1.5 system-ui;box-sizing:border-box;overflow-wrap:anywhere";
  panel.innerHTML = '<strong style="font-size:18px">Diagnóstico de métricas</strong>' +
    '<p data-diagnostic-summary role="status" aria-live="polite">Verificando…</p>' +
    '<p data-diagnostic-meta></p><p data-diagnostic-database></p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button type="button" data-diagnostic-accept>Aceitar métricas</button>' +
    '<button type="button" data-diagnostic-retry>Tentar novamente</button>' +
    '<button type="button" data-diagnostic-copy>Copiar diagnóstico</button></div>' +
    '<details style="margin-top:12px"><summary>Detalhes técnicos</summary><pre data-diagnostic-json style="font-size:11px;white-space:pre-wrap;max-height:320px;overflow:auto"></pre></details>' +
    '<p style="font-size:12px">Este painel aparece apenas no link de diagnóstico. Pedidos observados no navegador não comprovam recebimento no Gerenciador de Eventos.</p>';
  document.body.insertBefore(panel, document.body.firstChild);
  panel.querySelectorAll("button").forEach(function (button) {
    button.style.cssText = "border:1px solid #216544;border-radius:10px;padding:10px 14px;background:#f1f7f0;color:#183b2d;font:inherit;cursor:pointer;min-height:44px";
  });

  function collect() {
    var privacy = window.FreeIslandPrivacy ? window.FreeIslandPrivacy.getStatus() : { choice: "", scripts: {} };
    var meta = window.FreeIslandMetaEvents ? window.FreeIslandMetaEvents.getStatus() : null;
    var analytics = window.FreeIslandSessionAnalytics ? window.FreeIslandSessionAnalytics.getStatus() : null;
    var pixels = [];
    try {
      if (typeof window.fbq === "function" && typeof window.fbq.getState === "function") {
        pixels = (window.fbq.getState().pixels || []).map(function (pixel) { return { id: pixel.id, events_processed: pixel.eventCount }; });
      }
    } catch (error) {}
    var requests = [];
    try {
      requests = performance.getEntriesByType("resource").filter(function (entry) {
        return /^https:\/\/([^/]+\.)?facebook\.(com|net)\//.test(entry.name);
      }).slice(-25).map(function (entry) {
        var url = new URL(entry.name);
        return { host: url.hostname, path: url.pathname, event: url.searchParams.get("ev"),
          pixel_id: url.searchParams.get("id"), type: entry.initiatorType,
          response_status: entry.responseStatus || "not_exposed" };
      });
    } catch (error) {}
    return { version: "20261029_2", page: location.origin + location.pathname,
      privacy: privacy, meta: meta, supabase: analytics, sdk_pixels: pixels, meta_resource_entries: requests,
      browser: navigator.userAgent, online: navigator.onLine,
      global_privacy_control: navigator.globalPrivacyControl === true,
      do_not_track: navigator.doNotTrack || null };
  }

  function refresh() {
    var report = collect();
    var summary;
    if (report.privacy.choice !== "analytics") summary = "As métricas ainda não foram autorizadas nesta página.";
    else if (!report.meta) summary = "As métricas foram autorizadas, mas o arquivo de eventos ainda não carregou. Confira os detalhes abaixo.";
    else if (report.meta.error) summary = "A Meta informou uma falha de carregamento ou envio: " + report.meta.error + ".";
    else if (report.meta.library !== "loaded") summary = "As métricas foram autorizadas; aguardando a biblioteca da Meta.";
    else summary = "A biblioteca da Meta carregou. O diagnóstico abaixo separa chamadas locais e gravação no Supabase.";
    panel.querySelector("[data-diagnostic-summary]").textContent = summary;
    var eventCounts = report.meta && report.meta.events_queued || {};
    panel.querySelector("[data-diagnostic-meta]").textContent = "Pixel: " + (report.meta ? report.meta.pixel_id : "1479287410507022") +
      " · Chamadas: " + (Object.keys(eventCounts).map(function (key) { return key + "=" + eventCounts[key]; }).join(", ") || "nenhuma");
    var database = report.supabase;
    panel.querySelector("[data-diagnostic-database]").textContent = !database ? "Supabase: aguardando o coletor da página." :
      database.state === "recorded" ? "Supabase: gravação aceita (HTTP " + database.last_http_status + ") na tabela " + database.table + "." :
      database.state === "error" ? "Supabase: falha na gravação (HTTP " + database.last_http_status + "). " + (database.error || "") :
      database.state === "consent_required" ? "Supabase: coleta desativada pela preferência de métricas." : "Supabase: aguardando resposta da gravação.";
    panel.querySelector("[data-diagnostic-json]").textContent = JSON.stringify(report, null, 2);
    return report;
  }

  panel.querySelector("[data-diagnostic-accept]").addEventListener("click", function () {
    if (window.FreeIslandPrivacy) window.FreeIslandPrivacy.accept();
    refresh();
  });
  panel.querySelector("[data-diagnostic-retry]").addEventListener("click", function () {
    if (window.FreeIslandPrivacy && window.FreeIslandPrivacy.getChoice() === "analytics") {
      window.FreeIslandPrivacy.retry();
      if (window.FreeIslandMetaEvents) window.FreeIslandMetaEvents.retry();
    } else if (window.FreeIslandPrivacy) window.FreeIslandPrivacy.open();
    refresh();
  });
  panel.querySelector("[data-diagnostic-copy]").addEventListener("click", function () {
    var button = this;
    var text = JSON.stringify(refresh(), null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { button.textContent = "Copiado"; }, function () {
        panel.querySelector("details").open = true;
        button.textContent = "Copie os detalhes abaixo";
      });
    } else {
      panel.querySelector("details").open = true;
      button.textContent = "Copie os detalhes abaixo";
    }
  });
  window.FreeIslandMetricsDiagnostics = { getStatus: collect, refresh: refresh };
  refresh();
  var timer = window.setInterval(refresh, 2000);
  window.addEventListener("pagehide", function () { window.clearInterval(timer); });
  window.addEventListener("pageshow", function (event) { if (event.persisted) { timer = window.setInterval(refresh, 2000); refresh(); } });
})();
