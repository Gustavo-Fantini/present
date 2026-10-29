(function () {
  "use strict";
  if (window.FreeIslandMetaEvents) return;

  var PIXEL_ID = window.__FI_META_PIXEL_ID || "1479287410507022";
  var LIBRARY_URL = "https://connect.facebook.net/en_US/fbevents.js";
  var state = { library: "not_loaded", attempts: 0, initialized: false, granted: false,
    pageView: false, viewContent: false, error: "", lastEvent: "", counts: {} };
  var lastClicks = {};
  var scrollSent = {};
  var retryTimer = null;

  function allowed() {
    return !!(window.FreeIslandPrivacy && window.FreeIslandPrivacy.getChoice() === "analytics");
  }

  function debug(message) {
    if (new URLSearchParams(window.location.search).get("debugMeta") === "true" && window.console) {
      console.log("[Free Island Meta] " + message, status());
    }
  }

  function status() {
    return { pixel_id: PIXEL_ID, consent: allowed() ? "analytics" : "essential",
      library: state.library, initialized: state.initialized, page_view_queued: state.pageView,
      view_content_queued: state.viewContent, last_event: state.lastEvent,
      events_queued: Object.assign({}, state.counts), error: state.error || null };
  }

  function createQueue() {
    if (typeof window.fbq === "function") return;
    var fbq = window.fbq = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
  }

  function loadLibrary() {
    if (!allowed() || state.library === "loading" || state.library === "loaded" || state.attempts >= 2) return;
    if (typeof window.fbq.callMethod === "function") { state.library = "loaded"; return; }
    if (document.querySelector('script[src="' + LIBRARY_URL + '"]')) return;
    state.library = "loading";
    state.attempts += 1;
    var script = document.createElement("script");
    script.async = true;
    script.src = LIBRARY_URL;
    script.onload = function () {
      state.library = "loaded";
      state.error = "";
      window.__FI_META_LIBRARY_LOADED = true;
      window.__FI_META_LIBRARY_ERROR = false;
      debug("Biblioteca carregada; confirme o recebimento em Eventos de teste.");
    };
    script.onerror = function () {
      state.library = "blocked_or_unavailable";
      state.error = "meta_library_unavailable";
      window.__FI_META_LIBRARY_ERROR = true;
      script.remove();
      debug("Biblioteca indisponivel ou bloqueada.");
      if (state.attempts < 2) retryTimer = window.setTimeout(function () { retryTimer = null; loadLibrary(); }, 1500);
    };
    document.head.appendChild(script);
  }

  function eventId() {
    return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() :
      "fi-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function send(method, name, params) {
    if (!allowed()) return false;
    try {
      window.fbq(method, name, params || {}, { eventID: eventId() });
      state.lastEvent = name;
      state.counts[name] = (state.counts[name] || 0) + 1;
      debug(name + " encaminhado ao Pixel.");
      return true;
    } catch (error) {
      state.error = "meta_event_failed";
      debug("Falha ao encaminhar " + name);
      return false;
    }
  }

  function ensurePixel() {
    if (!allowed()) return false;
    createQueue();
    if (!state.granted) { window.fbq("consent", "grant"); state.granted = true; }
    if (!state.initialized) {
      window.fbq("init", PIXEL_ID);
      state.initialized = true;
      window.__FI_META_INIT_SENT = true;
    }
    if (!state.pageView) {
      state.pageView = send("track", "PageView", {});
      window.__FI_META_PAGEVIEW_SENT = state.pageView;
    }
    loadLibrary();
    return true;
  }

  function trackMeta(name, params, options) {
    if (!ensurePixel()) return false;
    return send(options && options.method === "track" ? "track" : "trackCustom", name, params);
  }

  function buttonText(element) {
    return String(element && (element.getAttribute("aria-label") || element.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function paramsFor(element) {
    var section = element && element.closest("header, section, footer, nav, main");
    return { button_text: buttonText(element),
      source_section: element && element.getAttribute("data-section") || section && section.id || "unknown",
      page_url: window.location.origin + window.location.pathname };
  }

  function repeated(element, type) {
    var key = type + "|" + (element && element.getAttribute("data-section") || "") + "|" + buttonText(element);
    var now = Date.now();
    if (lastClicks[key] && now - lastClicks[key] < 1200) return true;
    lastClicks[key] = now;
    return false;
  }

  function trackWhatsApp(element, action) {
    if (!allowed() || repeated(element, "whatsapp")) return;
    var params = Object.assign(paramsFor(element), { destination: "whatsapp_group", action: action || "open",
      conversion_stage: "invite_redirect", membership_confirmed: false });
    trackMeta("WhatsAppClick", params);
    trackMeta("Lead", Object.assign({}, params, { content_name: "WhatsApp Invite Click",
      content_category: "Free Island", destination: "whatsapp" }), { method: "track" });
  }

  function trackClick(event) {
    if (!allowed() || !event.target || !event.target.closest) return;
    var element = event.target.closest("[data-meta-event]");
    if (!element || element.getAttribute("aria-disabled") === "true") return;
    var type = element.getAttribute("data-meta-event");
    if (type === "whatsapp") {
      // Routing reports managed links only after confirming a current invite with space.
      if (element.hasAttribute("data-whatsapp-link")) return;
      if (/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{16,64}\/?$/.test(element.href || "")) trackWhatsApp(element, "open");
      return;
    }
    if ((type !== "telegram" && type !== "offers") || repeated(element, type)) return;
    trackMeta(type === "telegram" ? "TelegramClick" : "OfferClick", Object.assign(paramsFor(element),
      type === "telegram" ? { destination: "telegram_channel" } : { destination: "offers", affiliate: "amazon" }));
    // Tracking never takes over or delays navigation.
  }

  function trackScroll() {
    if (!allowed()) return;
    var doc = document.documentElement;
    var available = Math.max(doc.scrollHeight, document.body.scrollHeight) - (window.innerHeight || doc.clientHeight);
    if (available <= 0) return;
    var pct = Math.min(100, Math.max(0, (window.pageYOffset || doc.scrollTop || 0) / available * 100));
    [50, 90].forEach(function (depth) {
      if (!scrollSent[depth] && pct >= depth) {
        scrollSent[depth] = trackMeta("Scroll" + depth, { page_url: window.location.origin + window.location.pathname, scroll_percent: depth });
      }
    });
  }

  function activate() {
    if (!ensurePixel()) return;
    if (!state.viewContent && document.body.getAttribute("data-page") === "landing") {
      state.viewContent = trackMeta("ViewContent", { content_name: "Free Island Landing",
        content_category: "Promocoes Tech", page_type: "landing" }, { method: "track" });
    }
  }

  function privacyChanged() {
    if (allowed()) { activate(); return; }
    if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = null; }
    if (typeof window.fbq === "function") {
      if (typeof window.fbq.callMethod !== "function" && Array.isArray(window.fbq.queue)) {
        // Do not replay events captured before withdrawal if the SDK arrives later.
        window.fbq.queue.length = 0;
        state.initialized = false;
        state.pageView = false;
        state.viewContent = false;
      }
      window.fbq("consent", "revoke");
    }
    state.granted = false;
    debug("Metricas desativadas.");
  }

  function retry() {
    if (!allowed()) return false;
    state.attempts = 0;
    activate();
    return true;
  }

  window.FreeIslandMetaEvents = { trackMeta: trackMeta, getButtonText: buttonText, getStatus: status, retry: retry };
  document.addEventListener("freeisland:privacy-choice", privacyChanged);
  window.addEventListener("online", retry);
  document.addEventListener("click", trackClick, true);
  document.addEventListener("freeisland:whatsapp-redirect", function (event) {
    var detail = event.detail || {};
    if (detail.element && detail.element.matches("[data-whatsapp-link][data-meta-event='whatsapp']")) {
      trackWhatsApp(detail.element, detail.action);
    }
  });
  window.addEventListener("scroll", trackScroll, { passive: true });
  window.addEventListener("resize", trackScroll, { passive: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", activate, { once: true });
  else activate();
})();
