/* Free Island tracking (ES5 + XHR). */

(function () {
  try {
    window.__FI_SCRIPT_LOADED = true;
  } catch (e) {}

  var CONFIG = {
    enabled: true,
    supabaseUrl: "https://qpzwinntrphqaabatoaf.supabase.co",
    supabaseAnonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwendpbm50cnBocWFhYmF0b2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODY5MTksImV4cCI6MjA5MDU2MjkxOX0.je1E_QKNABd-U18tSCcJd4JoTjVX8DZM5ejc_9IDaX0",
    table: "events",
  };

  function safeText(el, text) {
    try {
      if (el) el.textContent = text;
    } catch (e) {}
  }

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

  var state = {
    total: 0,
    pv: 0,
    click: 0,
    wa: 0,
    eng: 0,
    hb: 0,
    last: "",
    status: "",
    err: "",
  };

  function renderDebug() {
    if (!debugEnabled || !debugBody) return;
    var bits = [];
    bits.push("total=" + state.total);
    bits.push("pv=" + state.pv);
    bits.push("click=" + state.click);
    bits.push("wa=" + state.wa);
    bits.push("eng=" + state.eng);
    bits.push("hb=" + state.hb);
    var line = bits.join(" ") + " | status=" + (state.status || "?") + " | last=" + (state.last || "?");
    if (state.err) line += " | err=" + state.err;
    safeText(debugBody, line);
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

  function base() {
    var utm = getUtm();
    var payload = {
      created_at: new Date().toISOString(),
      page_path: String(location.pathname || ""),
      page_url: String(location.href || ""),
      referrer: (document && document.referrer) ? String(document.referrer) : null,
      page_view_id: window.__FI_PAGE_VIEW_ID || null,
      visitor_id: getOrCreate("fi_visitor"),
      session_id: getSessionId(),
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
      payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch (e) {}
    try {
      payload.screen_w = (screen && screen.width) ? Number(screen.width) : null;
      payload.screen_h = (screen && screen.height) ? Number(screen.height) : null;
    } catch (e) {}
    try {
      payload.viewport_w = Number(window.innerWidth || 0) || null;
      payload.viewport_h = Number(window.innerHeight || 0) || null;
    } catch (e) {}
    return payload;
  }

  function postJson(url, body, cb) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("apikey", CONFIG.supabaseAnonKey);
      xhr.setRequestHeader("Authorization", "Bearer " + CONFIG.supabaseAnonKey);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Prefer", "return=minimal");
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        cb(xhr.status, xhr.responseText || "");
      };
      xhr.send(body);
    } catch (e) {
      cb(0, String(e && e.message ? e.message : e));
    }
  }

  function parseMissingColumnError(text) {
    try {
      var obj = JSON.parse(text);
      if (!obj || obj.code !== "PGRST204") return null;
      // Example: "Could not find the 'page_view_id' column of 'events' in the schema cache"
      var msg = String(obj.message || "");
      var m = /Could not find the '([^']+)' column/i.exec(msg);
      if (!m) return null;
      return m[1];
    } catch (e) {
      return null;
    }
  }

  function sendEvent(type, name, extra) {
    if (!canSend()) return;
    var row = base();
    row.event_type = type;
    row.event_name = name || null;
    row.extra = extra || null;

    state.total += 1;
    state.last = type + ":" + (name || "");
    state.err = "";
    state.status = "sending";
    if (type === "page_view") state.pv += 1;
    else if (type === "click") state.click += 1;
    else if (type === "whatsapp_click") state.wa += 1;
    else if (type === "engagement") state.eng += 1;
    else if (type === "heartbeat") state.hb += 1;
    renderDebug();

    var url =
      CONFIG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + encodeURIComponent(CONFIG.table);
    var body = JSON.stringify(row);

    function handleResponse(status, text, didRetry) {
      state.status = "http_" + String(status);
      if (status < 200 || status >= 300) state.err = (text || "").slice(0, 220);
      renderDebug();

      if (didRetry) return;

      // If schema is missing a column, retry once by moving it into extra and deleting the top-level field.
      if (status === 400 && text) {
        var missing = parseMissingColumnError(text);
        if (missing && row.hasOwnProperty(missing)) {
          state.status = "retry_missing_col_" + missing;
          renderDebug();
          if (!row.extra || typeof row.extra !== "object") row.extra = {};
          if (!row.extra._missing_cols || typeof row.extra._missing_cols !== "object") row.extra._missing_cols = {};
          row.extra._missing_cols[missing] = row[missing];
          try {
            delete row[missing];
          } catch (e) {
            row[missing] = null;
          }
          var body2 = JSON.stringify(row);
          postJson(url, body2, function (status2, text2) {
            handleResponse(status2, text2, true);
          });
        }
      }
    }

    postJson(url, body, function (status, text) {
      handleResponse(status, text, false);
    });
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

        var href = null;
        try {
          if (node.tagName === "A" && node.href) href = String(node.href);
        } catch (e) {}

        var text = null;
        try {
          text = String(node.textContent || "").trim().slice(0, 80) || null;
        } catch (e) {}

        sendEvent("click", track, { href: href, text: text });
        try {
          if (node.getAttribute("data-whatsapp-link") != null) {
            sendEvent("whatsapp_click", track, { href: href });
          }
        } catch (e) {}
      },
      true
    );
  }

  function instrumentEngagement() {
    var startTs = Date.now();
    var visibleStart = Date.now();
    var visibleMs = 0;
    var maxScrollPct = 0;

    function scrollPct() {
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

    function onVis() {
      var now = Date.now();
      if (document.visibilityState === "hidden") {
        visibleMs += Math.max(0, now - visibleStart);
      } else {
        visibleStart = now;
      }
    }

    window.addEventListener("scroll", scrollPct, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    scrollPct();

    function flush(reason) {
      try {
        var now = Date.now();
        if (document.visibilityState !== "hidden") {
          visibleMs += Math.max(0, now - visibleStart);
          visibleStart = now;
        }
        scrollPct();
        sendEvent("engagement", reason, {
          duration_ms: now - startTs,
          visible_ms: visibleMs,
          max_scroll_pct: maxScrollPct,
        });
      } catch (e) {}
    }

    window.addEventListener("pagehide", function () {
      flush("pagehide");
    });
    window.addEventListener("beforeunload", function () {
      flush("beforeunload");
    });
  }

  function instrumentHeartbeats() {
    var schedule = [15000, 30000, 60000];
    var start = Date.now();
    var idx = 0;

    function tick() {
      if (idx >= schedule.length) return;
      var now = Date.now();
      var elapsed = now - start;
      if (elapsed >= schedule[idx]) {
        var seconds = Math.round(schedule[idx] / 1000);
        sendEvent("heartbeat", "t_" + seconds + "s", { elapsed_ms: elapsed });
        idx += 1;
      }
      if (idx < schedule.length) setTimeout(tick, 750);
    }

    setTimeout(tick, 750);
  }

  function init() {
    if (!CONFIG.enabled) return;
    try {
      window.__FI_LOADED = true;
      window.__FI_PAGE_VIEW_ID = randId("pv");
    } catch (e) {}
    sendEvent("page_view", "page_view", null);
    instrumentClicks();
    instrumentEngagement();
    instrumentHeartbeats();
  }

  // Init with fallback for weird webviews.
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
