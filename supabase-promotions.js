(function () {
  var SUPABASE_URL = "https://jdeszhiykkviymtkdbit.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZXN6aGl5a2t2aXltdGtkYml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTU4ODUsImV4cCI6MjA5NTAzMTg4NX0.lH674hCA5Bp62m08eV03DqmZauMY_VNlkhGi6vlX33U";
  var FALLBACK_MEMBER_COUNT = 620;
  var FALLBACK_IMAGE = "assets/logo_sem_fundo.png";
  var REQUEST_TIMEOUT_MS = 5000;
  var PROMOTIONS_LIMIT = 5;
  var AUDIENCE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  var BR_TIMEZONE = "America/Sao_Paulo";

  function isDebugPromos() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("debugPromos") === "true" || params.get("debugMeta") === "true";
    } catch (e) {
      return false;
    }
  }

  function debugLog(message, data) {
    if (!isDebugPromos() || !window.console) return;

    if (typeof data === "undefined") {
      console.log("[Free Island Promos]", message);
    } else {
      console.log("[Free Island Promos]", message, data);
    }
  }

  function buildSupabaseUrl(path, params) {
    var url = new URL(path, SUPABASE_URL);
    var key;

    for (key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        url.searchParams.set(key, params[key]);
      }
    }

    return url.toString();
  }

  function supabaseHeaders(extra) {
    var headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SUPABASE_ANON_KEY
    };
    var key;

    for (key in extra || {}) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) headers[key] = extra[key];
    }

    return headers;
  }

  function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    return fetch(url, Object.assign({}, options || {}, { signal: controller.signal }))
      .then(function (response) {
        window.clearTimeout(timer);
        return response;
      })
      .catch(function (error) {
        window.clearTimeout(timer);
        throw error;
      });
  }

  function fetchJsonWithRetry(url, options, attempt) {
    return fetchWithTimeout(url, options)
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .catch(function (error) {
        if ((attempt || 0) < 1) {
          debugLog("Supabase promotions: retry", error && error.message ? error.message : String(error));
          return fetchJsonWithRetry(url, options, (attempt || 0) + 1);
        }
        throw error;
      });
  }

  function fetchCountWithRetry(url, attempt) {
    return fetchWithTimeout(url, {
      method: "GET",
      headers: supabaseHeaders({
        Prefer: "count=exact"
      })
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);

        var range = response.headers.get("content-range") || "";
        var match = range.match(/\/(\d+)$/);
        if (match) return Number(match[1]);

        return response.json().then(function (rows) {
          return Array.isArray(rows) ? rows.length : 0;
        });
      })
      .catch(function (error) {
        if ((attempt || 0) < 1) {
          debugLog("Supabase promotions count: retry", error && error.message ? error.message : String(error));
          return fetchCountWithRetry(url, (attempt || 0) + 1);
        }
        throw error;
      });
  }

  function getPromotionsUrl() {
    return buildSupabaseUrl("/rest/v1/posted_promotions", {
      select: "id,published_at,expires_at,product_title,price_text,old_price_text,store,image_public_url,image_url",
      or: "(expires_at.is.null,expires_at.gt.now())",
      order: "published_at.desc",
      limit: String(PROMOTIONS_LIMIT)
    });
  }

  function getLast24hCountUrl() {
    var iso24hAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    return buildSupabaseUrl("/rest/v1/posted_promotions", {
      select: "id",
      published_at: "gte." + iso24hAgo,
      limit: "1"
    });
  }

  function getAudienceStatsUrl() {
    return buildSupabaseUrl("/rest/v1/audience_stats", {
      select: "total_members,whatsapp_members,telegram_members,status,updated_at",
      id: "eq.community",
      limit: "1"
    });
  }

  function formatAudienceNumber(value) {
    var count = Number(value);
    if (!Number.isFinite(count) || count < 0) return "0";
    try {
      return new Intl.NumberFormat("pt-BR").format(Math.trunc(count));
    } catch (error) {
      return String(Math.trunc(count));
    }
  }

  function renderAudienceStats(section, audience) {
    var membersTarget = section.querySelector("[data-activity-members]");
    var totalMembers = Number(audience && audience.total_members);
    var whatsappMembers = Number(audience && audience.whatsapp_members);
    var telegramMembers = Number(audience && audience.telegram_members);
    var updatedAt = audience && audience.updated_at ? new Date(audience.updated_at) : null;

    if (!membersTarget) return;
    if (!Number.isFinite(totalMembers) || totalMembers <= 0) totalMembers = FALLBACK_MEMBER_COUNT;

    membersTarget.textContent = "\uD83D\uDC65 " + formatAudienceNumber(totalMembers) + " pessoas acompanhando as ofertas";
    if (Number.isFinite(whatsappMembers) && Number.isFinite(telegramMembers)) {
      membersTarget.title = "WhatsApp: " + formatAudienceNumber(whatsappMembers) +
        " | Telegram: " + formatAudienceNumber(telegramMembers) +
        (updatedAt && !Number.isNaN(updatedAt.getTime())
          ? " | Atualizado em " + updatedAt.toLocaleString("pt-BR", { timeZone: BR_TIMEZONE })
          : "");
    }
  }

  function refreshAudienceStats(section) {
    return fetchJsonWithRetry(getAudienceStatsUrl(), {
      method: "GET",
      headers: supabaseHeaders()
    })
      .then(function (rows) {
        var audience = Array.isArray(rows) && rows.length ? rows[0] : null;
        renderAudienceStats(section, audience);
        if (audience) debugLog("Supabase audience: contador atualizado", audience);
      })
      .catch(function (error) {
        debugLog("Supabase audience: mantendo valor de seguranca", error && error.message ? error.message : String(error));
        renderAudienceStats(section, null);
      });
  }

  function startAudienceUpdates(section) {
    renderAudienceStats(section, null);
    refreshAudienceStats(section);
    window.setInterval(function () {
      refreshAudienceStats(section);
    }, AUDIENCE_REFRESH_INTERVAL_MS);
  }

  function getBRDateKey(date) {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: BR_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(date);
      var map = {};

      parts.forEach(function (part) {
        map[part.type] = part.value;
      });

      return [map.year, map.month, map.day].join("-");
    } catch (e) {
      return date.toISOString().slice(0, 10);
    }
  }

  function formatRelativeTimeBR(value) {
    var published = new Date(value);
    var diffMs = Date.now() - published.getTime();
    var diffMinutes;
    var diffHours;
    var today;
    var yesterday;

    if (!value || Number.isNaN(published.getTime())) return "recente";
    if (diffMs < 60 * 1000) return "agora mesmo";

    diffMinutes = Math.floor(diffMs / (60 * 1000));
    if (diffMinutes === 1) return "h\u00e1 1 min";
    if (diffMinutes < 60) return "h\u00e1 " + diffMinutes + " min";

    diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return "h\u00e1 1 hora";
    if (diffHours < 24) return "h\u00e1 " + diffHours + " horas";

    today = getBRDateKey(new Date());
    yesterday = getBRDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

    if (getBRDateKey(published) === today) return "hoje";
    if (getBRDateKey(published) === yesterday) return "ontem";

    return "h\u00e1 " + Math.max(1, Math.floor(diffHours / 24)) + " dias";
  }

  function createElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (typeof text !== "undefined") element.textContent = text;
    return element;
  }

  function getPromotionImage(promotion) {
    return promotion.image_public_url || promotion.image_url || FALLBACK_IMAGE;
  }

  function createPromotionCard(promotion, index) {
    var card = createElement("article", "promotion-card");
    var media = createElement("div", "promotion-media");
    var image = document.createElement("img");
    var body = createElement("div", "promotion-body");
    var title = createElement("h3", "promotion-title", promotion.product_title || "Promo\u00e7\u00e3o publicada no grupo");
    var priceRow = createElement("div", "promotion-price-row");
    var time = createElement("div", "promotion-time", "Publicado " + formatRelativeTimeBR(promotion.published_at));
    var cta = createElement("a", "promotion-cta", "Entrar no grupo para ver o link");

    image.src = getPromotionImage(promotion);
    image.alt = "Promo\u00e7\u00e3o: " + (promotion.product_title || "produto publicado no grupo");
    image.loading = "lazy";
    image.decoding = "async";
    image.onerror = function () {
      if (image.src.indexOf(FALLBACK_IMAGE) === -1) image.src = FALLBACK_IMAGE;
    };

    media.appendChild(image);

    if (promotion.store) {
      body.appendChild(createElement("span", "promotion-store", promotion.store));
    }

    body.appendChild(title);

    if (promotion.old_price_text || promotion.price_text) {
      if (promotion.old_price_text) {
        priceRow.appendChild(createElement("span", "promotion-old-price", promotion.old_price_text));
      }
      if (promotion.price_text) {
        priceRow.appendChild(createElement("strong", "promotion-price", promotion.price_text));
      }
      body.appendChild(priceRow);
    }

    body.appendChild(time);

    cta.href = "#";
    cta.setAttribute("data-whatsapp-link", "");
    cta.setAttribute("data-meta-event", "whatsapp");
    cta.setAttribute("data-section", "latest_promotions");
    cta.setAttribute("data-track", "cta_latest_promotion");
    cta.setAttribute("aria-label", "Entrar no grupo para ver o link da promo\u00e7\u00e3o " + (index + 1));
    body.appendChild(cta);

    card.appendChild(media);
    card.appendChild(body);

    return card;
  }

  function updateActivityBar(section, promotions, count24h) {
    var countTarget = section.querySelector("[data-activity-count]");
    var latestTarget = section.querySelector("[data-activity-latest]");
    var latestText = promotions.length ? formatRelativeTimeBR(promotions[0].published_at) : "";

    if (countTarget) {
      countTarget.textContent = "\uD83D\uDFE2 " + count24h + " promo\u00e7\u00f5es nas \u00faltimas 24h";
    }

    if (latestTarget) {
      if (latestText) {
        latestTarget.textContent = "\u26A1 \u00daltima promo\u00e7\u00e3o " + latestText;
        latestTarget.hidden = false;
      } else {
        latestTarget.hidden = true;
      }
    }

    debugLog("Supabase promotions: " + count24h + " promo\u00e7\u00f5es nas \u00faltimas 24h");
    if (latestText) debugLog("Supabase promotions: \u00faltima promo\u00e7\u00e3o " + latestText);
  }

  function renderPromotions(section, promotions, count24h) {
    var list = section.querySelector("[data-promotions-list]");
    if (!list) return;

    if (!promotions.length) {
      section.hidden = true;
      return;
    }

    list.textContent = "";
    promotions.forEach(function (promotion, index) {
      list.appendChild(createPromotionCard(promotion, index));
    });

    updateActivityBar(section, promotions, count24h);

    if (typeof window.FreeIslandApplyWhatsAppLinks === "function") {
      window.FreeIslandApplyWhatsAppLinks(section);
    }
  }

  function hideSection(section) {
    section.hidden = true;
  }

  function initPromotions() {
    var section = document.querySelector("[data-promotions-section]");
    var promotionsUrl;
    var countUrl;

    if (!section || typeof fetch !== "function") return;

    startAudienceUpdates(section);

    promotionsUrl = getPromotionsUrl();
    countUrl = getLast24hCountUrl();

    debugLog("Supabase promotions: request iniciado", {
      promotions_url: promotionsUrl,
      count_url: countUrl
    });

    Promise.all([
      fetchJsonWithRetry(promotionsUrl, {
        method: "GET",
        headers: supabaseHeaders()
      }),
      fetchCountWithRetry(countUrl)
    ])
      .then(function (results) {
        var promotions = Array.isArray(results[0]) ? results[0] : [];
        var count24h = Number.isFinite(results[1]) ? results[1] : 0;

        debugLog("Supabase promotions: " + promotions.length + " promo\u00e7\u00f5es carregadas", promotions);
        renderPromotions(section, promotions, count24h);
      })
      .catch(function (error) {
        debugLog("Supabase promotions: erro", error && error.message ? error.message : String(error));
        hideSection(section);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPromotions);
  } else {
    initPromotions();
  }
})();
