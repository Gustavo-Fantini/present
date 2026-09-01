(function () {
  var FALLBACK_IMAGE = "assets/logo_sem_fundo.png";
  var FALLBACK_MEMBER_COUNT = 620;
  var PROMOTIONS_LIMIT = 5;
  var BR_TIMEZONE = "America/Sao_Paulo";

  function isDebug() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("debugPromos") === "true" || params.get("debugMeta") === "true";
    } catch (error) {
      return false;
    }
  }

  function debugLog(message, data) {
    if (!isDebug() || !window.console) return;
    if (typeof data === "undefined") console.log("[Free Island Promos]", message);
    else console.log("[Free Island Promos]", message, data);
  }

  function formatNumber(value) {
    var count = Number(value);
    if (!Number.isFinite(count) || count < 0) return "0";
    try {
      return new Intl.NumberFormat("pt-BR").format(Math.trunc(count));
    } catch (error) {
      return String(Math.trunc(count));
    }
  }

  function getBRDateKey(date) {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: BR_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(date);
      var values = {};
      parts.forEach(function (part) { values[part.type] = part.value; });
      return [values.year, values.month, values.day].join("-");
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function formatRelativeTime(value) {
    var published = new Date(value);
    var difference = Date.now() - published.getTime();
    if (!value || Number.isNaN(published.getTime())) return "recentemente";
    if (difference < 60000) return "agora";
    var minutes = Math.floor(difference / 60000);
    if (minutes < 60) return "há " + minutes + " min";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return "há " + hours + (hours === 1 ? " hora" : " horas");
    var today = getBRDateKey(new Date());
    var yesterday = getBRDateKey(new Date(Date.now() - 86400000));
    if (getBRDateKey(published) === today) return "hoje";
    if (getBRDateKey(published) === yesterday) return "ontem";
    return "há " + Math.max(1, Math.floor(hours / 24)) + " dias";
  }

  function createElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (typeof text !== "undefined") element.textContent = text;
    return element;
  }

  function createPromotionCard(promotion, index) {
    var card = createElement("article", "promotion-card");
    var media = createElement("div", "promotion-media");
    var image = document.createElement("img");
    var body = createElement("div", "promotion-body");
    var title = createElement("h3", "promotion-title", promotion.product_title || "Publicação recente");
    var time = createElement("div", "promotion-time", "Publicado " + formatRelativeTime(promotion.published_at));
    var cta = createElement("a", "promotion-cta", "Receber novas publicações");

    image.src = promotion.image_public_url || FALLBACK_IMAGE;
    image.alt = "Produto divulgado pela Free Island: " + (promotion.product_title || "tecnologia");
    image.loading = "lazy";
    image.decoding = "async";
    image.onerror = function () {
      if (image.getAttribute("src") !== FALLBACK_IMAGE) image.src = FALLBACK_IMAGE;
    };
    media.appendChild(image);

    if (promotion.store) body.appendChild(createElement("span", "promotion-store", promotion.store));
    body.appendChild(title);
    body.appendChild(time);
    body.appendChild(createElement("p", "promotion-disclaimer", "A publicação completa e as condições vigentes ficam na comunidade."));

    cta.href = "#";
    cta.setAttribute("data-whatsapp-link", "");
    cta.setAttribute("data-meta-event", "whatsapp");
    cta.setAttribute("data-section", "latest_promotions");
    cta.setAttribute("data-track", "cta_latest_promotion");
    cta.setAttribute("aria-label", "Receber publicações da Free Island no WhatsApp, item " + (index + 1));
    body.appendChild(cta);
    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  function renderAudience(section, audience) {
    var target = section.querySelector("[data-activity-members]");
    var total = Number(audience && audience.total_members);
    if (!target) return;
    if (!Number.isFinite(total) || total <= 0) total = FALLBACK_MEMBER_COUNT;
    target.textContent = "👥 " + formatNumber(total) + " pessoas na comunidade";
  }

  function renderSnapshot(section, snapshot) {
    var list = section.querySelector("[data-promotions-list]");
    var fallback = section.querySelector("[data-promotions-fallback]");
    var countTarget = section.querySelector("[data-activity-count]");
    var latestTarget = section.querySelector("[data-activity-latest]");
    var promotions = Array.isArray(snapshot.promotions) ? snapshot.promotions.slice(0, PROMOTIONS_LIMIT) : [];
    if (!list) return;

    renderAudience(section, snapshot.audience || {});
    if (countTarget) countTarget.textContent = "🟢 " + Number(snapshot.today_count || 0) + " publicações hoje";
    if (latestTarget) {
      latestTarget.hidden = !promotions.length;
      if (promotions.length) latestTarget.textContent = "⚡ Última publicação " + formatRelativeTime(promotions[0].published_at);
    }

    if (!promotions.length) {
      list.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }

    list.textContent = "";
    list.hidden = false;
    if (fallback) fallback.hidden = true;
    promotions.forEach(function (promotion, index) {
      list.appendChild(createPromotionCard(promotion, index));
    });
    if (typeof window.FreeIslandApplyWhatsAppLinks === "function") {
      window.FreeIslandApplyWhatsAppLinks(section);
    }
  }

  function showStaticFallback(section, error) {
    var list = section.querySelector("[data-promotions-list]");
    var fallback = section.querySelector("[data-promotions-fallback]");
    if (list) list.hidden = true;
    if (fallback) fallback.hidden = false;
    debugLog("API pública indisponível; mantendo conteúdo estático", error && error.message);
  }

  function init() {
    var section = document.querySelector("[data-promotions-section]");
    if (!section) return;
    if (!window.FreeIslandPublicData || typeof window.FreeIslandPublicData.get !== "function") {
      showStaticFallback(section, new Error("public_data_client_unavailable"));
      return;
    }
    window.FreeIslandPublicData.get(false).then(function (snapshot) {
      renderSnapshot(section, snapshot);
      debugLog("Snapshot público carregado", snapshot);
    }).catch(function (error) {
      showStaticFallback(section, error);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
