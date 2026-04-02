/* Free Island session tracking: 1 row per access (page_view_id), ES5 + XHR. */
(function () {
  try {
    window.__FI_SCRIPT_LOADED = true;
  } catch (e) {}

  var CONFIG = {
    enabled: true,
    supabaseUrl: "https://qpzwinntrphqaabatoaf.supabase.co",
    supabaseAnonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwendpbm50cnBocWFhYmF0b2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODY5MTksImV4cCI6MjA5MDU2MjkxOX0.je1E_QKNABd-U18tSCcJd4JoTjVX8DZM5ejc_9IDaX0",
    table: "page_sessions",
    flushAfterMs: 60000,
  };

  function isDebug() {
    try {
      var href = String(location.href || "");
      if (href.indexOf("debug=1") !== -1) return true;
      return localStorage.getItem("fi_debug") === "1";
    } catch (e) {
      return false;
    }
  }

  var debugEnabled = isDebug();
  var debugBody = null;
  try {
    debugBody = document.getElementById("fi-debug-body");
  } catch (e) {}

  function safeText(el, text) {
    try {
      if (el) el.textContent = text;
    } catch (e) {}
  }

  function randId(prefix) {
    var s = String(Math.random()).slice(2) + String(Date.now());
    return (prefix || "id") + "_" + s;
  }

  function getOrCreate(key) {
    try {
      var v = localStorage.getItem(key);
      if (v && v.length > 8) return v;
      v = randId(key);
      localStorage.setItem(key, v);
      return v;
    } catch (e) {
      return randId(key);
    }
  }

  function getSessionId() {
    var now = Date.now();
    var key = "fi_session";
    var tsKey = "fi_session_ts";
    try {
      var ts = Number(localStorage.getItem(tsKey) || "0");
      var v = localStorage.getItem(key);
      if (v && now - ts < 30 * 60 * 1000) {
        localStorage.setItem(tsKey, String(now));
        return v;
      }
      v = randId("s");
      localStorage.setItem(key, v);
      localStorage.setItem(tsKey, String(now));
      return v;
    } catch (e) {
      return randId("s");
    }
  }

  function getUtm() {
    var out = {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
    };
    try {
      var q = String(location.search || "");
      if (!q) return out;
      if (q.charAt(0) === "?") q = q.slice(1);
      var parts = q.split("&");
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split("=");
        var k = decodeURIComponent(kv[0] || "");
        var v = decodeURIComponent((kv[1] || "").replace(/\+/g, " "));
        if (out.hasOwnProperty(k)) out[k] = v || null;
      }
    } catch (e) {}
    return out;
  }

  function canSend() {
    return (
      CONFIG.enabled &&
      typeof CONFIG.supabaseUrl === "string" &&
      CONFIG.supabaseUrl.indexOf("https://") === 0 &&
      typeof CONFIG.supabaseAnonKey === "string" &&
      CONFIG.supabaseAnonKey.length > 30
    );
  }

  function postUpsert(row, cb) {
    try {
      var url =
        CONFIG.supabaseUrl.replace(/\/$/, "") +
        "/rest/v1/" +
        encodeURIComponent(CONFIG.table) +
        "?on_conflict=page_view_id";

      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("apikey", CONFIG.supabaseAnonKey);
      xhr.setRequestHeader("Authorization", "Bearer " + CONFIG.supabaseAnonKey);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Prefer", "resolution=merge-duplicates,return=minimal");
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        cb(xhr.status, xhr.responseText || "");
      };
      xhr.send(JSON.stringify(row));
    } catch (e) {
      cb(0, String(e && e.message ? e.message : e));
    }
  }

  // Aggregated session state (1 row per access)
  var pageViewId = randId("pv");
  try {
    window.__FI_PAGE_VIEW_ID = pageViewId;
    window.__FI_LOADED = true;
  } catch (e) {}

  var utm = getUtm();
  var startTs = Date.now();
  var visibleStart = Date.now();
  var visibleMs = 0;
  var maxScrollPct = 0;
  var clickCounts = {}; // trackName -> count
  var clickAny = false;
  var whatsappClicks = 0;
  var instagramClicks = 0;
  var externalRedirects = 0; // counts clicks that likely navigate away
  var redirectedToWhatsapp = false;
  var redirectedToInstagram = false;
  var flushedOnce = false;
  var lastStatus = "";
  var lastErr = "";
  var flushTimer = null;
  var flushPendingReason = null;
  var lastFlushAt = 0;

  function computeScrollPct() {
    try {
      var doc = document.documentElement;
      var scrollTop = doc.scrollTop || document.body.scrollTop || 0;
      var scrollHeight = doc.scrollHeight || 0;
      var clientHeight = doc.clientHeight || window.innerHeight || 0;
      var denom = Math.max(1, scrollHeight - clientHeight);
      var pct = Math.max(0, Math.min(100, Math.round((scrollTop / denom) * 100)));
      if (pct > maxScrollPct) maxScrollPct = pct;
    } catch (e) {}
  }

  function onVisibilityChange() {
    var now = Date.now();
    if (document.visibilityState === "hidden") {
      visibleMs += Math.max(0, now - visibleStart);
    } else {
      visibleStart = now;
    }
  }

  function baseRow() {
    var row = {
      // Do NOT send created_at from client. Let Supabase default now() be the source of truth.
      page_view_id: pageViewId,
      visitor_id: getOrCreate("fi_visitor"),
      session_id: getSessionId(),
      page_path: String(location.pathname || ""),
      page_url: String(location.href || ""),
      referrer: (document && document.referrer) ? String(document.referrer) : null,
      user_agent: (navigator && navigator.userAgent) ? String(navigator.userAgent) : null,
      language: (navigator && navigator.language) ? String(navigator.language) : null,
      timezone: null,
      screen_w: null,
      screen_h: null,
      viewport_w: null,
      viewport_h: null,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      utm_term: utm.utm_term,
    };
    try {
      row.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch (e) {}
    try {
      row.screen_w = (screen && screen.width) ? Number(screen.width) : null;
      row.screen_h = (screen && screen.height) ? Number(screen.height) : null;
    } catch (e) {}
    try {
      row.viewport_w = Number(window.innerWidth || 0) || null;
      row.viewport_h = Number(window.innerHeight || 0) || null;
    } catch (e) {}
    return row;
  }

  function buildRow(reason) {
    var now = Date.now();
    var dur = now - startTs;
    if (document.visibilityState !== "hidden") {
      visibleMs += Math.max(0, now - visibleStart);
      visibleStart = now;
    }
    computeScrollPct();

    var row = baseRow();
    row.flush_reason = reason || null;
    row.duration_ms = dur;
    row.visible_ms = visibleMs;
    row.max_scroll_pct = maxScrollPct;
    row.click_any = !!clickAny;
    row.click_counts = clickCounts;
    row.whatsapp_clicks = whatsappClicks;
    row.instagram_clicks = instagramClicks;
    row.external_redirects = externalRedirects;
    row.redirected_to_whatsapp = !!redirectedToWhatsapp;
    row.redirected_to_instagram = !!redirectedToInstagram;
    row.closed = reason === "pagehide" || reason === "beforeunload";
    return row;
  }

  function renderDebug() {
    if (!debugEnabled || !debugBody) return;
    var line =
      "pv=" +
      pageViewId +
      " | status=" +
      (lastStatus || "?") +
      " | dur_ms=" +
      String(Date.now() - startTs) +
      " | clicks=" +
      String(clickAny ? 1 : 0) +
      " wa=" +
      String(whatsappClicks) +
      " ig=" +
      String(instagramClicks) +
      " redir=" +
      String(externalRedirects) +
      (lastErr ? " | err=" + lastErr : "");
    safeText(debugBody, line);
  }

  function flush(reason) {
    if (!canSend()) return;
    var row = buildRow(reason);
    flushedOnce = true;
    lastStatus = "sending";
    lastErr = "";
    renderDebug();
    postUpsert(row, function (status, text) {
      lastStatus = "http_" + String(status);
      if (status < 200 || status >= 300) lastErr = (text || "").slice(0, 220);
      renderDebug();
    });
  }

  function scheduleFlush(reason, delayMs) {
    if (!canSend()) return;
    flushPendingReason = reason || flushPendingReason || "scheduled";
    if (flushTimer) return;

    flushTimer = setTimeout(function () {
      flushTimer = null;
      var now = Date.now();
      // Avoid hammering the DB with too many updates.
      if (now - lastFlushAt < 1500) {
        scheduleFlush(flushPendingReason, 1500 - (now - lastFlushAt));
        return;
      }
      lastFlushAt = Date.now();
      flush(flushPendingReason);
      flushPendingReason = null;
    }, typeof delayMs === "number" ? delayMs : 0);
  }

  function closestWithAttr(el, attr) {
    var cur = el;
    while (cur && cur !== document.documentElement) {
      try {
        if (cur.getAttribute && cur.getAttribute(attr) != null) return cur;
      } catch (e) {}
      cur = cur.parentNode;
    }
    return null;
  }

  function instrumentClicks() {
    document.addEventListener(
      "click",
      function (evt) {
        var t = evt && evt.target ? evt.target : null;
        if (!t) return;

        var node = closestWithAttr(t, "data-track");
        if (!node) return;

        var track = null;
        try {
          track = node.getAttribute("data-track");
        } catch (e) {}
        if (!track) return;

        clickAny = true;
        clickCounts[track] = (clickCounts[track] || 0) + 1;

        var href = null;
        try {
          if (node.tagName === "A" && node.href) href = String(node.href);
        } catch (e) {}

        // Basic redirect inference: external navigation or WhatsApp/Instagram targets.
        try {
          var isWhatsapp = node.getAttribute("data-whatsapp-link") != null;
          if (isWhatsapp) {
            whatsappClicks += 1;
            redirectedToWhatsapp = true;
            externalRedirects += 1;
          }
        } catch (e) {}

        try {
          if (href && href.indexOf("instagram.com/") !== -1) {
            instagramClicks += 1;
            redirectedToInstagram = true;
            externalRedirects += 1;
          }
        } catch (e) {}

        renderDebug();

        // Persist quickly after interaction, still within the same row (upsert).
        scheduleFlush("interaction", 800);
      },
      true
    );
  }

  function init() {
    if (!CONFIG.enabled) return;
    window.addEventListener("scroll", computeScrollPct, { passive: true });
    document.addEventListener("visibilitychange", function () {
      onVisibilityChange();
      // When the page goes to background (common in in-app browsers), persist what we have.
      try {
        if (document.visibilityState === "hidden") scheduleFlush("hidden", 0);
      } catch (e) {}
    });
    computeScrollPct();
    instrumentClicks();

    // Initial upsert so you always get at least 1 row per access.
    flush("page_view");

    // Flush at 60s even if user doesn't leave.
    setTimeout(function () {
      flush("t_60s");
    }, CONFIG.flushAfterMs);

    window.addEventListener("pagehide", function () {
      flush("pagehide");
    });
    window.addEventListener("beforeunload", function () {
      flush("beforeunload");
    });

    // In case the user closes super fast, flush once soon.
    setTimeout(function () {
      if (!flushedOnce) flush("t_2s");
    }, 2000);
  }

  var inited = false;
  function safeInit() {
    if (inited) return;
    inited = true;
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeInit, { once: true });
    setTimeout(safeInit, 2000);
  } else {
    safeInit();
  }
})();
