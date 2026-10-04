const FREE_ISLAND_OPERATION_SLUG = "free-island-principal";
const WHATSAPP_ROUTE_CACHE_MS = 30000;

const yearTargets = document.querySelectorAll("[data-current-year]");
let activeWhatsAppGroupUrl = "";
let routeResolvedAt = 0;
let routeRequest = null;

function normalizeWhatsAppGroupUrl(value) {
  try {
    var source = String(value || "").trim();
    if (!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{16,64}\/?$/i.test(source)) return "";
    var url = new URL(source);
    var code = url.pathname.replace(/^\/+|\/+$/g, "");
    if (url.protocol !== "https:" || url.hostname !== "chat.whatsapp.com" ||
      url.username || url.password || url.port || url.search || url.hash) return "";
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return "";
    return "https://chat.whatsapp.com/" + code;
  } catch (e) {
    return "";
  }
}

function selectAvailableWhatsAppGroup(groups) {
  if (!Array.isArray(groups)) throw new Error("invalid_whatsapp_routing_snapshot");
  var configured = groups.filter(function (group) {
    var inviteUrl = normalizeWhatsAppGroupUrl(group && group.invite_url);
    var operationSlug = String(group && group.operation_slug || "");
    return inviteUrl && operationSlug === FREE_ISLAND_OPERATION_SLUG && group.landing_enabled !== false;
  });
  if (!configured.length) return "";

  configured.sort(function (left, right) {
    var leftPriority = routingNumber(left.priority);
    var rightPriority = routingNumber(right.priority);
    if (!Number.isFinite(leftPriority)) leftPriority = 100;
    if (!Number.isFinite(rightPriority)) rightPriority = 100;
    return leftPriority - rightPriority ||
      String(left.destination_id || left.name || "").localeCompare(String(right.destination_id || right.name || ""));
  });

  var available = configured.find(function (group) {
    var members = routingNumber(group.members);
    var capacity = routingNumber(group.capacity_limit, 990);
    return Number.isInteger(members) && members >= 0 && Number.isInteger(capacity) &&
      capacity > 0 && capacity <= 1024 && members < capacity && group.status !== "unavailable";
  });
  return available ? normalizeWhatsAppGroupUrl(available.invite_url) : "";
}

function routingNumber(value, defaultValue) {
  if (typeof value === "undefined" && typeof defaultValue === "number") return defaultValue;
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return NaN;
  var number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function fetchWhatsAppGroupRoute() {
  if (!window.FreeIslandPublicData || typeof window.FreeIslandPublicData.get !== "function") {
    return Promise.reject(new Error("public_data_client_unavailable"));
  }
  return window.FreeIslandPublicData.get(true, { allowStale: false }).then(function (snapshot) {
    if (!snapshot || snapshot.ok !== true || snapshot.stale === true ||
      snapshot.operation_slug !== FREE_ISLAND_OPERATION_SLUG) {
      throw new Error("invalid_whatsapp_routing_snapshot");
    }
    var audience = snapshot && snapshot.audience;
    return selectAvailableWhatsAppGroup(audience && audience.whatsapp_groups);
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
      applyWhatsAppLinks(document);
      return url;
    })
    .catch(function () {
      activeWhatsAppGroupUrl = "";
      routeResolvedAt = 0;
      applyWhatsAppLinks(document);
      return activeWhatsAppGroupUrl;
    })
    .finally(function () {
      routeRequest = null;
    });
  return routeRequest;
}

function showWhatsAppUnavailable() {
  var message = "Não foi possível confirmar uma vaga no WhatsApp agora. Tente novamente ou acompanhe pelo Telegram.";
  var status = document.querySelector("[data-whatsapp-status]");
  var help = document.getElementById("fi-join-help");
  if (help) help.remove();
  if (status) {
    status.textContent = message;
    status.hidden = false;
  } else {
    window.alert(message);
  }
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
    if (!activeWhatsAppGroupUrl) return;
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
      resolveWhatsAppGroupUrl(true).then(function (groupUrl) {
        if (!groupUrl) {
          showWhatsAppUnavailable();
          return;
        }
        var target = groupUrl;
        if (isAndroid()) target = makeAndroidIntent(groupUrl);
        window.location.href = target;
      });
    };

    var copyBtn = mkBtn("Copiar link");
    copyBtn.onclick = function () {
      resolveWhatsAppGroupUrl(true).then(function (groupUrl) {
        if (!groupUrl) {
          showWhatsAppUnavailable();
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(groupUrl);
        } else {
          var tmp = document.createElement("textarea");
          tmp.value = groupUrl;
          tmp.style.position = "fixed";
          tmp.style.left = "-9999px";
          document.body.appendChild(tmp);
          tmp.focus();
          tmp.select();
          document.execCommand("copy");
          document.body.removeChild(tmp);
        }
      }).then(function () {
        if (!activeWhatsAppGroupUrl) return;
        copyBtn.textContent = "Copiado!";
        setTimeout(function () {
          copyBtn.textContent = "Copiar link";
        }, 1400);
      }).catch(function () {
        copyBtn.textContent = "Tente copiar novamente";
      });
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
    link.href = activeWhatsAppGroupUrl || "#inicio";
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    if (link.getAttribute("data-whatsapp-ready") === "1") return;
    link.setAttribute("data-whatsapp-ready", "1");

    // Improve join success inside in-app browsers (Instagram/Facebook) and Android.
    link.addEventListener("click", function (event) {
      event.preventDefault();
      var pendingWindow = null;
      if (!isInAppBrowser()) {
        try {
          pendingWindow = window.open("about:blank", "_blank");
          if (pendingWindow) pendingWindow.opener = null;
        } catch (e) {}
      }
      link.setAttribute("aria-busy", "true");
      resolveWhatsAppGroupUrl(true).then(function (groupUrl) {
        if (!groupUrl) {
          if (pendingWindow) pendingWindow.close();
          showWhatsAppUnavailable();
          return;
        }
        var status = document.querySelector("[data-whatsapp-status]");
        if (status) status.hidden = true;
        var target = isAndroid() && isInAppBrowser() ? makeAndroidIntent(groupUrl) : groupUrl;
        if (pendingWindow && !pendingWindow.closed && target === groupUrl) {
          pendingWindow.location.replace(groupUrl);
        } else {
          window.location.href = target;
        }
        if (isInAppBrowser()) window.setTimeout(showJoinHelp, 250);
      }).finally(function () {
        link.removeAttribute("aria-busy");
      });
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
