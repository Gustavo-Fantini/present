/*
  Free Island tracking (static site).

  Sends events to Supabase via REST using ONLY the anon key (public).
  Includes:
  - page_view
  - click + whatsapp_click
  - engagement (on pagehide/beforeunload): duration/visible/scroll
  - heartbeats (15s/30s/60s while visible) for time-on-screen even if user never closes the tab

  Debug:
  - Add ?debug=1 to the URL (or set localStorage fi_debug=1) to show an on-page overlay
    with last request status and event counters.
*/

const ANALYTICS_CONFIG = {
  enabled: true,
  supabaseUrl: "https://qpzwinntrphqaabatoaf.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwendpbm50cnBocWFhYmF0b2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODY5MTksImV4cCI6MjA5MDU2MjkxOX0.je1E_QKNABd-U18tSCcJd4JoTjVX8DZM5ejc_9IDaX0",
  table: "events",
};

// Marks that the JS file itself was loaded/executed.
globalThis.__FI_SCRIPT_LOADED = true;

function isDebugEnabled() {
  try {
    const url = new URL(location.href);
    if (url.searchParams.get("debug") === "1") return true;
    return localStorage.getItem("fi_debug") === "1";
  } catch {
    return false;
  }
}

function createDebugOverlay() {
  const el = document.createElement("div");
  el.setAttribute("data-fi-debug", "1");
  el.style.position = "fixed";
  el.style.left = "10px";
  el.style.right = "10px";
  el.style.top = "10px";
  el.style.zIndex = "99999";
  el.style.background = "rgba(9, 52, 29, 0.92)";
  el.style.color = "#f8fff9";
  el.style.border = "1px solid rgba(223, 242, 226, 0.18)";
  el.style.borderRadius = "16px";
  el.style.padding = "10px 12px";
  el.style.font = "12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace";
  el.style.backdropFilter = "blur(12px)";
  el.style.webkitBackdropFilter = "blur(12px)";
  el.style.boxShadow = "0 18px 34px rgba(11, 45, 26, 0.28)";
  el.innerHTML =
    "<div style=\"display:flex;justify-content:space-between;gap:10px;align-items:center;\">" +
    "<strong>FI Debug</strong>" +
    "<button type=\"button\" style=\"border:0;background:rgba(255,255,255,0.12);color:#fff;border-radius:999px;padding:6px 10px;font:inherit;\">Fechar</button>" +
    "</div>" +
    "<div data-fi-debug-body style=\"margin-top:8px;opacity:0.95;\">Iniciando...</div>";

  const btn = el.querySelector("button");
  btn.addEventListener("click", () => el.remove());
  document.body.appendChild(el);
  return el;
}

function setOverlayText(overlay, text) {
  if (!overlay) return;
  const body = overlay.querySelector("[data-fi-debug-body]");
  if (!body) return;
  body.textContent = text;
}

function getOrCreateId(storageKey) {
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing && existing.length > 8) return existing;
    const value =
      (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      `id_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
    localStorage.setItem(storageKey, value);
    return value;
  } catch {
    return `id_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }
}

function getSessionId() {
  const now = Date.now();
  const key = "fi_session";
  const tsKey = "fi_session_ts";
  try {
    const ts = Number(localStorage.getItem(tsKey) || "0");
    const existing = localStorage.getItem(key);
    if (existing && now - ts < 30 * 60 * 1000) {
      localStorage.setItem(tsKey, String(now));
      return existing;
    }
    const next =
      (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      `s_${Math.random().toString(16).slice(2)}_${now.toString(16)}`;
    localStorage.setItem(key, next);
    localStorage.setItem(tsKey, String(now));
    return next;
  } catch {
    return `s_${Math.random().toString(16).slice(2)}_${now.toString(16)}`;
  }
}

function getUtmParams() {
  const url = new URL(location.href);
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const out = {};
  for (const key of keys) out[key] = url.searchParams.get(key) || null;
  return out;
}

function basePayload() {
  const utm = getUtmParams();
  return {
    created_at: new Date().toISOString(),
    page_path: location.pathname,
    page_url: location.href,
    referrer: document.referrer || null,
    page_view_id: globalThis.__FI_PAGE_VIEW_ID || null,
    visitor_id: getOrCreateId("fi_visitor"),
    session_id: getSessionId(),
    user_agent: navigator.userAgent || null,
    language: navigator.language || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    screen_w: Number(screen.width || 0) || null,
    screen_h: Number(screen.height || 0) || null,
    viewport_w: Number(window.innerWidth || 0) || null,
    viewport_h: Number(window.innerHeight || 0) || null,
    ...utm,
  };
}

function toSupabaseRow(eventType, eventName, extra) {
  return {
    event_type: eventType,
    event_name: eventName || null,
    extra: extra || null,
    ...basePayload(),
  };
}

function canSendToSupabase() {
  return (
    ANALYTICS_CONFIG.enabled &&
    typeof ANALYTICS_CONFIG.supabaseUrl === "string" &&
    ANALYTICS_CONFIG.supabaseUrl.startsWith("https://") &&
    typeof ANALYTICS_CONFIG.supabaseAnonKey === "string" &&
    ANALYTICS_CONFIG.supabaseAnonKey.length > 30
  );
}

function sendEventFactory(debugState) {
  const url = `${ANALYTICS_CONFIG.supabaseUrl.replace(/\\/$/, "")}/rest/v1/${encodeURIComponent(
    ANALYTICS_CONFIG.table
  )}`;

  const headers = {
    apikey: ANALYTICS_CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${ANALYTICS_CONFIG.supabaseAnonKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  return function sendEvent(eventType, eventName, extra) {
    if (!ANALYTICS_CONFIG.enabled) return;
    if (!canSendToSupabase()) return;

    const row = toSupabaseRow(eventType, eventName, extra);
    const body = JSON.stringify(row);

    debugState.counts.total += 1;
    debugState.counts[eventType] = (debugState.counts[eventType] || 0) + 1;
    debugState.lastEvent = `${eventType}:${eventName || ""}`.trim();
    debugState.lastStatus = "sending";
    debugState.lastError = null;
    debugState.render();

    fetch(url, { method: "POST", headers, body, keepalive: true })
      .then(async (res) => {
        debugState.lastStatus = `http_${res.status}`;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          debugState.lastError = text || `HTTP ${res.status}`;
        }
        debugState.render();
      })
      .catch((err) => {
        debugState.lastStatus = "fetch_error";
        debugState.lastError = String(err && err.message ? err.message : err);
        debugState.render();
      });
  };
}

function instrumentClicks(sendEvent) {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const tracked = target.closest("[data-track]");
      if (!tracked) return;

      const trackName = tracked.getAttribute("data-track");
      if (!trackName) return;

      const href = tracked instanceof HTMLAnchorElement ? tracked.href : null;
      sendEvent("click", trackName, {
        href,
        text: (tracked.textContent || "").trim().slice(0, 80) || null,
      });

      if (tracked.hasAttribute("data-whatsapp-link")) {
        sendEvent("whatsapp_click", trackName, { href });
      }
    },
    { capture: true }
  );
}

function instrumentEngagement(sendEvent) {
  const startTs = Date.now();
  const startPerf = typeof performance !== "undefined" ? performance.now() : 0;
  let visibleStartPerf = startPerf;
  let visibleMs = 0;
  let maxScrollPct = 0;

  function computeScrollPct() {
    const doc = document.documentElement;
    const scrollTop = doc.scrollTop || document.body.scrollTop || 0;
    const scrollHeight = doc.scrollHeight || 0;
    const clientHeight = doc.clientHeight || window.innerHeight || 0;
    const denom = Math.max(1, scrollHeight - clientHeight);
    const pct = Math.max(0, Math.min(100, Math.round((scrollTop / denom) * 100)));
    maxScrollPct = Math.max(maxScrollPct, pct);
  }

  function onVisibilityChange() {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (document.visibilityState === "hidden") {
      visibleMs += Math.max(0, now - visibleStartPerf);
    } else {
      visibleStartPerf = now;
    }
  }

  window.addEventListener("scroll", computeScrollPct, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  computeScrollPct();

  function flush(reason) {
    try {
      const nowPerf = typeof performance !== "undefined" ? performance.now() : 0;
      if (document.visibilityState !== "hidden") {
        visibleMs += Math.max(0, nowPerf - visibleStartPerf);
        visibleStartPerf = nowPerf;
      }
      computeScrollPct();

      const durationMs = Date.now() - startTs;
      sendEvent("engagement", reason, {
        duration_ms: durationMs,
        visible_ms: Math.round(visibleMs),
        max_scroll_pct: maxScrollPct,
      });
    } catch {
      // ignore
    }
  }

  window.addEventListener("pagehide", () => flush("pagehide"));
  window.addEventListener("beforeunload", () => flush("beforeunload"));
}

function instrumentHeartbeats(sendEvent) {
  const schedule = [15000, 30000, 60000];
  const start = Date.now();
  let idx = 0;

  function tick() {
    if (idx >= schedule.length) return;
    const now = Date.now();
    const elapsed = now - start;
    if (elapsed >= schedule[idx]) {
      const seconds = Math.round(schedule[idx] / 1000);
      sendEvent("heartbeat", `t_${seconds}s`, { elapsed_ms: elapsed });
      idx += 1;
    }
    if (idx < schedule.length) {
      setTimeout(tick, 750);
    }
  }

  setTimeout(tick, 750);
}

function init() {
  if (!ANALYTICS_CONFIG.enabled) return;
  globalThis.__FI_LOADED = true;

  const debugEnabled = isDebugEnabled();
  let overlay = null;
  // Prefer the inline debug bar (index.html) if present; fall back to overlay.
  const inlineBody = document.getElementById("fi-debug-body");
  if (debugEnabled && !inlineBody) overlay = createDebugOverlay();

  const debugState = {
    overlay,
    counts: { total: 0 },
    lastEvent: null,
    lastStatus: null,
    lastError: null,
    render() {
      const bits = [];
      bits.push(`total=${this.counts.total}`);
      if (this.counts.page_view) bits.push(`pv=${this.counts.page_view}`);
      if (this.counts.click) bits.push(`click=${this.counts.click}`);
      if (this.counts.whatsapp_click) bits.push(`wa=${this.counts.whatsapp_click}`);
      if (this.counts.engagement) bits.push(`eng=${this.counts.engagement}`);
      if (this.counts.heartbeat) bits.push(`hb=${this.counts.heartbeat}`);
      const status = this.lastStatus ? `status=${this.lastStatus}` : "status=?";
      const last = this.lastEvent ? `last=${this.lastEvent}` : "last=?";
      const err = this.lastError ? `err=${this.lastError}` : "";
      const line = `${bits.join(" ")} | ${status} | ${last}${err ? " | " + err : ""}`;
      if (inlineBody && debugEnabled) {
        inlineBody.textContent = line;
        return;
      }
      if (!this.overlay) return;
      setOverlayText(this.overlay, line);
    },
  };

  globalThis.__FI_PAGE_VIEW_ID =
    (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `pv_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

  const sendEvent = sendEventFactory(debugState);

  sendEvent("page_view", "page_view", null);
  instrumentClicks(sendEvent);
  instrumentEngagement(sendEvent);
  instrumentHeartbeats(sendEvent);
}

let __fi_inited = false;
function safeInit() {
  if (__fi_inited) return;
  __fi_inited = true;
  init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", safeInit, { once: true });
  // Fallback in case DOMContentLoaded never fires (some in-app browsers are weird).
  setTimeout(safeInit, 2000);
} else {
  safeInit();
}
