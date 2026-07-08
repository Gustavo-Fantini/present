(function () {
  var LANDING_PAGE = "landing";
  var CLICK_COOLDOWN_MS = 1200;
  var REDIRECT_DELAY_MS = 150;
  var lastClicks = {};
  var scroll50Sent = false;
  var scroll90Sent = false;
  var viewContentSent = false;

  function hasFbq() {
    return typeof window.fbq === "function";
  }

  function trackEvent(method, eventName, params) {
    if (!hasFbq()) return false;

    try {
      window.fbq(method, eventName, params || {});
      return true;
    } catch (e) {
      return false;
    }
  }

  function getButtonText(element) {
    if (!element) return "";

    var label = element.getAttribute("aria-label");
    var text = label || element.innerText || element.textContent || "";

    return String(text).replace(/\s+/g, " ").trim();
  }

  function getSourceSection(element) {
    if (!element) return "unknown";

    var explicit = element.getAttribute("data-section");
    if (explicit) return explicit;

    var section = element.closest("header, main, section, footer, nav");
    if (!section) return "unknown";
    if (section.id) return section.id;
    if (section.className) return String(section.className).split(/\s+/)[0] || "unknown";

    return section.tagName ? section.tagName.toLowerCase() : "unknown";
  }

  function getBaseParams(element) {
    return {
      button_text: getButtonText(element),
      source_section: getSourceSection(element),
      page_url: window.location.href,
      timestamp: Date.now()
    };
  }

  function mergeParams(base, extra) {
    var output = {};
    var key;

    for (key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key)) output[key] = base[key];
    }

    for (key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) output[key] = extra[key];
    }

    return output;
  }

  function closestTrackedElement(target) {
    if (!target || !target.closest) return null;
    return target.closest("[data-meta-event]");
  }

  function shouldIgnoreFastRepeat(element, eventType) {
    var key = [
      eventType,
      getSourceSection(element),
      getButtonText(element),
      element.getAttribute("href") || ""
    ].join("|");
    var now = Date.now();

    if (lastClicks[key] && now - lastClicks[key] < CLICK_COOLDOWN_MS) {
      return true;
    }

    lastClicks[key] = now;
    return false;
  }

  function shouldDelayRedirect(event, element) {
    if (!element || element.tagName !== "A") return false;
    if (!element.href) return false;
    if (element.target && element.target !== "_self") return false;
    if (event.defaultPrevented) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (typeof event.button === "number" && event.button !== 0) return false;

    return true;
  }

  function delayRedirect(event, element) {
    if (!shouldDelayRedirect(event, element)) return;

    event.preventDefault();
    window.setTimeout(function () {
      window.location.href = element.href;
    }, REDIRECT_DELAY_MS);
  }

  function trackClick(event) {
    var element = closestTrackedElement(event.target);
    if (!element) return;

    var eventType = element.getAttribute("data-meta-event");
    if (!eventType || shouldIgnoreFastRepeat(element, eventType)) return;

    if (eventType === "whatsapp") {
      trackEvent("trackCustom", "WhatsAppClick", mergeParams(getBaseParams(element), {
        destination: "whatsapp_group"
      }));

      trackEvent("track", "Lead", {
        content_name: "WhatsApp Group Join",
        content_category: "Free Island",
        destination: "whatsapp"
      });

      delayRedirect(event, element);
      return;
    }

    if (eventType === "telegram") {
      trackEvent("trackCustom", "TelegramClick", mergeParams(getBaseParams(element), {
        destination: "telegram_channel"
      }));

      delayRedirect(event, element);
      return;
    }

    if (eventType === "offers") {
      trackEvent("trackCustom", "OfferClick", mergeParams(getBaseParams(element), {
        destination: "offers",
        affiliate: "amazon"
      }));

      delayRedirect(event, element);
    }
  }

  function getScrollPercent() {
    var doc = document.documentElement;
    var body = document.body;
    var scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
    var scrollHeight = Math.max(
      body.scrollHeight,
      body.offsetHeight,
      doc.clientHeight,
      doc.scrollHeight,
      doc.offsetHeight
    );
    var viewportHeight = window.innerHeight || doc.clientHeight || 0;
    var available = scrollHeight - viewportHeight;

    if (available <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((scrollTop / available) * 100)));
  }

  function trackScrollDepth() {
    var pct = getScrollPercent();

    if (!scroll50Sent && pct >= 50) {
      scroll50Sent = true;
      trackEvent("trackCustom", "Scroll50", {
        page_url: window.location.href,
        scroll_percent: 50,
        timestamp: Date.now()
      });
    }

    if (!scroll90Sent && pct >= 90) {
      scroll90Sent = true;
      trackEvent("trackCustom", "Scroll90", {
        page_url: window.location.href,
        scroll_percent: 90,
        timestamp: Date.now()
      });
    }
  }

  function trackViewContent() {
    var pageType = document.body ? document.body.getAttribute("data-page") : "";
    if (viewContentSent || pageType !== LANDING_PAGE) return;

    viewContentSent = true;
    trackEvent("track", "ViewContent", {
      content_name: "Free Island Landing",
      content_category: "Promocoes Tech",
      page_type: "landing"
    });
  }

  function init() {
    trackViewContent();
    document.addEventListener("click", trackClick, true);
    window.addEventListener("scroll", trackScrollDepth, { passive: true });
    window.addEventListener("resize", trackScrollDepth, { passive: true });
    window.setTimeout(trackScrollDepth, 600);
  }

  window.FreeIslandMetaEvents = {
    trackEvent: trackEvent,
    getButtonText: getButtonText
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
