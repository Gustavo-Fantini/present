const WHATSAPP_FALLBACK_URL = "https://chat.whatsapp.com/JelwkQXy1Mj05NWybBCTQX";
const FREE_ISLAND_SUPABASE_URL = "https://jdeszhiykkviymtkdbit.supabase.co";
const FREE_ISLAND_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZXN6aGl5a2t2aXltdGtkYml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTU4ODUsImV4cCI6MjA5NTAzMTg4NX0.lH674hCA5Bp62m08eV03DqmZauMY_VNlkhGi6vlX33U";
const FREE_ISLAND_OPERATION_SLUG = "free-island-principal";
const WHATSAPP_ROUTE_CACHE_MS = 30000;
const WHATSAPP_ROUTE_TIMEOUT_MS = 4500;

const yearTargets = document.querySelectorAll("[data-current-year]");
const placeholderUrl = "https://chat.whatsapp.com/SEU-LINK-AQUI";
let activeWhatsAppGroupUrl = WHATSAPP_FALLBACK_URL;
let routeResolvedAt = 0;
let routeRequest = null;
let routeSnapshotLoaded = false;

window.FreeIslandPublicConfig = {
  supabaseUrl: FREE_ISLAND_SUPABASE_URL,
  supabaseAnonKey: FREE_ISLAND_SUPABASE_ANON_KEY,
  operationSlug: FREE_ISLAND_OPERATION_SLUG
};

function normalizeWhatsAppGroupUrl(value) {
  try {
    var url = new URL(String(value || ""));
    var code = url.pathname.replace(/^\/+|\/+$/g, "");
    if (url.protocol !== "https:" || url.hostname !== "chat.whatsapp.com") return "";
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return "";
    return "https://chat.whatsapp.com/" + code;
  } catch (e) {
    return "";
  }
}

function selectAvailableWhatsAppGroup(groups) {
  var configured = (Array.isArray(groups) ? groups : []).filter(function (group) {
    var inviteUrl = normalizeWhatsAppGroupUrl(group && group.invite_url);
    var operationSlug = String(group && group.operation_slug || "");
    return inviteUrl && operationSlug === FREE_ISLAND_OPERATION_SLUG && group.landing_enabled !== false;
  });
  if (!configured.length) throw new Error("whatsapp_routing_not_configured");

  configured.sort(function (left, right) {
    return Number(left.priority || 100) - Number(right.priority || 100) ||
      String(left.destination_id || left.name || "").localeCompare(String(right.destination_id || right.name || ""));
  });

  var available = configured.find(function (group) {
    var members = Number(group.members);
    var capacity = Number(group.capacity_limit || 990);
    return Number.isFinite(members) && Number.isFinite(capacity) && members < capacity && group.status !== "unavailable";
  });
  return available ? normalizeWhatsAppGroupUrl(available.invite_url) : "";
}

function fetchWhatsAppGroupRoute() {
  var params = new URLSearchParams({
    select: "whatsapp_groups,status,updated_at",
    id: "eq.community",
    limit: "1"
  });
  var controller = new AbortController();
  var timer = window.setTimeout(function () { controller.abort(); }, WHATSAPP_ROUTE_TIMEOUT_MS);
  return fetch(FREE_ISLAND_SUPABASE_URL + "/rest/v1/audience_stats?" + params.toString(), {
    method: "GET",
    cache: "no-store",
    signal: controller.signal,
    headers: {
      apikey: FREE_ISLAND_SUPABASE_ANON_KEY,
      Authorization: "Bearer " + FREE_ISLAND_SUPABASE_ANON_KEY,
      "Cache-Control": "no-cache"
    }
  }).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }).then(function (rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error("audience_snapshot_unavailable");
    return selectAvailableWhatsAppGroup(rows[0].whatsapp_groups);
  }).finally(function () {
    window.clearTimeout(timer);
  });
}

function resolveWhatsAppGroupUrl(forceRefresh) {
  if (!forceRefresh && routeResolvedAt && Date.now() - routeResolvedAt < WHATSAPP_ROUTE_CACHE_MS) {
    return Promise.resolve(activeWhatsAppGroupUrl);
  }
  if (routeRequest) return routeRequest;
  routeRequest = fetchWhatsAppGroupRoute()
    .then(function (url) {
      activeWhatsAppGroupUrl = url;
      routeResolvedAt = Date.now();
      routeSnapshotLoaded = true;
      applyWhatsAppLinks(document);
      return url;
    })
    .catch(function () {
      if (!routeSnapshotLoaded) activeWhatsAppGroupUrl = WHATSAPP_FALLBACK_URL;
      return activeWhatsAppGroupUrl;
    })
    .finally(function () {
      routeRequest = null;
    });
  return routeRequest;
}

function isInAppBrowser() {
  try {
    var ua = String(navigator.userAgent || "");
    // Common in-app browsers that frequently break/limit deep linking.
    if (ua.indexOf("Instagram") !== -1) return true;
    if (ua.indexOf("FBAN") !== -1) return true;
    if (ua.indexOf("FBAV") !== -1) return true;
    if (ua.indexOf("FB_IAB") !== -1) return true;
    return false;
  } catch (e) {
    return false;
  }
}

function isAndroid() {
  try {
    return String(navigator.userAgent || "").indexOf("Android") !== -1;
  } catch (e) {
    return false;
  }
}

function makeAndroidIntent(url) {
  // Best-effort to force open WhatsApp on Android via Intent.
  // Works for many devices/browsers; safe fallback is the normal https URL.
  try {
    var clean = String(url || "").replace(/^https?:\/\//, "");
    return "intent://" + clean + "#Intent;scheme=https;package=com.whatsapp;end";
  } catch (e) {
    return url;
  }
}

function showJoinHelp() {
  try {
    if (document.getElementById("fi-join-help")) return;

    var wrap = document.createElement("div");
    wrap.id = "fi-join-help";
    wrap.style.position = "fixed";
    wrap.style.left = "0";
    wrap.style.right = "0";
    wrap.style.bottom = "0";
    wrap.style.top = "0";
    wrap.style.zIndex = "999999";
    wrap.style.background = "rgba(0,0,0,0.55)";
    wrap.style.backdropFilter = "blur(10px)";
    wrap.style.webkitBackdropFilter = "blur(10px)";
    wrap.style.display = "grid";
    wrap.style.placeItems = "end center";
    wrap.style.padding = "16px";

    var card = document.createElement("div");
    card.style.width = "min(560px, 100%)";
    card.style.borderRadius = "22px";
    card.style.background = "rgba(7,14,28,0.96)";
    card.style.border = "1px solid rgba(255,255,255,0.12)";
    card.style.boxShadow = "0 24px 70px rgba(0,0,0,0.45)";
    card.style.padding = "14px";
    card.style.color = "#f8fbff";

    var title = document.createElement("div");
    title.textContent = "Abrindo o grupo...";
    title.style.fontWeight = "800";
    title.style.fontSize = "16px";
    title.style.marginBottom = "6px";

    var body = document.createElement("div");
    body.textContent =
      "Se o WhatsApp abrir no navegador do Instagram, toque em \"Abrir app\". Se nao funcionar, copie o link e cole no WhatsApp.";
    body.style.opacity = "0.88";
    body.style.lineHeight = "1.45";
    body.style.fontSize = "14px";

    var row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr 1fr";
    row.style.gap = "10px";
    row.style.marginTop = "12px";

    function mkBtn(label) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.minHeight = "48px";
      b.style.borderRadius = "16px";
      b.style.border = "1px solid rgba(255,255,255,0.14)";
      b.style.background = "rgba(255,255,255,0.08)";
      b.style.color = "#fff";
      b.style.fontWeight = "800";
      b.style.cursor = "pointer";
      return b;
    }

    var openBtn = mkBtn("Tentar abrir");
    openBtn.onclick = function () {
      try {
        var groupUrl = activeWhatsAppGroupUrl || WHATSAPP_FALLBACK_URL;
        var target = groupUrl;
        if (isAndroid()) target = makeAndroidIntent(groupUrl);
        window.location.href = target;
      } catch (e) {}
    };

    var copyBtn = mkBtn("Copiar link");
    copyBtn.onclick = function () {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(activeWhatsAppGroupUrl || WHATSAPP_FALLBACK_URL);
        } else {
          var tmp = document.createElement("textarea");
          tmp.value = activeWhatsAppGroupUrl || WHATSAPP_FALLBACK_URL;
          tmp.style.position = "fixed";
          tmp.style.left = "-9999px";
          document.body.appendChild(tmp);
          tmp.focus();
          tmp.select();
          document.execCommand("copy");
          document.body.removeChild(tmp);
        }
        copyBtn.textContent = "Copiado!";
        setTimeout(function () {
          copyBtn.textContent = "Copiar link";
        }, 1400);
      } catch (e) {}
    };

    row.appendChild(openBtn);
    row.appendChild(copyBtn);

    var close = document.createElement("button");
    close.type = "button";
    close.textContent = "Fechar";
    close.style.marginTop = "10px";
    close.style.width = "100%";
    close.style.minHeight = "44px";
    close.style.borderRadius = "16px";
    close.style.border = "1px solid rgba(255,255,255,0.12)";
    close.style.background = "transparent";
    close.style.color = "rgba(255,255,255,0.82)";
    close.style.fontWeight = "800";
    close.style.cursor = "pointer";
    close.onclick = function () {
      try {
        wrap.remove();
      } catch (e) {}
    };

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(row);
    card.appendChild(close);
    wrap.appendChild(card);
    wrap.addEventListener("click", function (e) {
      if (e && e.target === wrap) close.click();
    });
    document.body.appendChild(wrap);
  } catch (e) {}
}

function applyWhatsAppLinks(root) {
  var scope = root && root.querySelectorAll ? root : document;
  var links = scope.querySelectorAll("[data-whatsapp-link]");

  links.forEach((link) => {
    link.href = activeWhatsAppGroupUrl || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    if (link.getAttribute("data-whatsapp-ready") === "1") return;
    link.setAttribute("data-whatsapp-ready", "1");

    // Improve join success inside in-app browsers (Instagram/Facebook) and Android.
    link.addEventListener("click", function (event) {
      event.preventDefault();
      var pendingWindow = null;
      if (!isInAppBrowser()) {
        try { pendingWindow = window.open("about:blank", "_blank"); } catch (e) {}
      }
      link.setAttribute("aria-busy", "true");
      resolveWhatsAppGroupUrl(true).then(function (groupUrl) {
        if (!groupUrl) {
          if (pendingWindow) pendingWindow.close();
          window.alert("Os grupos estão momentaneamente lotados. Tente novamente em alguns minutos.");
          return;
        }
        var target = isAndroid() && isInAppBrowser() ? makeAndroidIntent(groupUrl) : groupUrl;
        if (pendingWindow && !pendingWindow.closed && target === groupUrl) {
          pendingWindow.location.replace(groupUrl);
        } else {
          window.location.href = target;
        }
      }).finally(function () {
        link.removeAttribute("aria-busy");
      });
      try {
        if (isInAppBrowser()) {
          // Show help without blocking navigation; some browsers ignore preventDefault anyway.
          setTimeout(showJoinHelp, 250);
        }
      } catch (e) {}
    });
  });
}

window.FreeIslandApplyWhatsAppLinks = applyWhatsAppLinks;
window.FreeIslandResolveWhatsAppGroup = resolveWhatsAppGroupUrl;
applyWhatsAppLinks(document);
resolveWhatsAppGroupUrl(false);
window.setInterval(function () { resolveWhatsAppGroupUrl(true); }, 60000);

yearTargets.forEach((target) => {
  target.textContent = new Date().getFullYear();
});

if (WHATSAPP_FALLBACK_URL === placeholderUrl) {
  document.querySelectorAll("[data-whatsapp-link]").forEach((link) => {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      window.alert("Atualize o link do grupo em script.js antes de publicar a pagina.");
    });
  });
}
