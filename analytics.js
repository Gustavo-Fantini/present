/*
  Lightweight analytics for a static site.
  Sends events to Supabase (optional) and also logs to console in debug mode.

  IMPORTANT:
  - Use ONLY the Supabase anon key here. Never put service_role keys in frontend code.
  - You must create the `public.events` table and an INSERT policy for anon (see README).
*/

const ANALYTICS_CONFIG = {
  enabled: true,

  // Fill these with your Supabase Project settings:
  // Project URL: https://<project-ref>.supabase.co
  // Anon public key: eyJ...
  supabaseUrl: "https://qpzwinntrphqaabatoaf.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwendpbm50cnBocWFhYmF0b2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODY5MTksImV4cCI6MjA5MDU2MjkxOX0.je1E_QKNABd-U18tSCcJd4JoTjVX8DZM5ejc_9IDaX0",

  // Optional: set true to see events in DevTools console.
  debug: false,

  // Table name to insert into (default matches README).
  table: "events",
};

function isDebugEnabled() {
  try {
    const url = new URL(location.href);
    if (url.searchParams.get("debug") === "1") return true;
    return localStorage.getItem("fi_debug") === "1";
  } catch {
    return false;
  }
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
  // 30 min rolling session
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

function sendEvent(eventType, eventName, extra) {
  if (!ANALYTICS_CONFIG.enabled) return;

  const row = toSupabaseRow(eventType, eventName, extra);

  const debug = ANALYTICS_CONFIG.debug || isDebugEnabled();
  if (debug) {
    // eslint-disable-next-line no-console
    console.log("[analytics]", row);
  }

  if (!canSendToSupabase()) return;

  const url = `${ANALYTICS_CONFIG.supabaseUrl.replace(/\\/$/, "")}/rest/v1/${encodeURIComponent(
    ANALYTICS_CONFIG.table
  )}`;

  const body = JSON.stringify(row);
  const headers = {
    apikey: ANALYTICS_CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${ANALYTICS_CONFIG.supabaseAnonKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  // NOTE: We intentionally avoid navigator.sendBeacon here because Supabase REST
  // requires auth headers (apikey/Authorization), which sendBeacon cannot set.
  fetch(url, { method: "POST", headers, body, keepalive: true }).catch((err) => {
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn("[analytics] send failed", err);
    }
  });
}

function instrumentClicks() {
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

function instrumentPageView() {
  sendEvent("page_view", "page_view", null);
}

function instrumentEngagement() {
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

  // pagehide is the most reliable on mobile Safari / in-app browsers.
  window.addEventListener("pagehide", () => flush("pagehide"));
  window.addEventListener("beforeunload", () => flush("beforeunload"));
}

function initAnalytics() {
  if (!ANALYTICS_CONFIG.enabled) return;
  globalThis.__FI_PAGE_VIEW_ID =
    (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `pv_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  instrumentPageView();
  instrumentClicks();
  instrumentEngagement();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAnalytics, { once: true });
} else {
  initAnalytics();
}
