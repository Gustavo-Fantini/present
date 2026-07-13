(function () {
  var SUPABASE_URL = "https://jdeszhiykkviymtkdbit.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZXN6aGl5a2t2aXltdGtkYml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTU4ODUsImV4cCI6MjA5NTAzMTg4NX0.lH674hCA5Bp62m08eV03DqmZauMY_VNlkhGi6vlX33U";
  var REDIRECT_DELAY_MS = 450;
  var REQUEST_TIMEOUT_MS = 5000;
  var FALLBACK_HOME = "/";

  function isDebug() {
    try {
      return new URLSearchParams(window.location.search).get("debugRedirect") === "true";
    } catch (e) {
      return false;
    }
  }

  function debugLog(message, data) {
    if (!isDebug() || !window.console) return;

    if (typeof data === "undefined") {
      console.log("[Free Island Redirect]", message);
    } else {
      console.log("[Free Island Redirect]", message, data);
    }
  }

  function getSlug() {
    try {
      var params = new URLSearchParams(window.location.search);
      var slug = params.get("s") || params.get("slug") || "";

      slug = slug.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) return "";

      return slug;
    } catch (e) {
      return "";
    }
  }

  function setState(title, message, targetUrl) {
    var titleNode = document.querySelector("[data-title]");
    var messageNode = document.querySelector("[data-message]");
    var fallback = document.querySelector("[data-fallback-link]");

    if (titleNode) titleNode.textContent = title;
    if (messageNode) messageNode.textContent = message;

    if (fallback && targetUrl) {
      fallback.href = targetUrl;
      fallback.classList.add("is-visible");
    }
  }

  function setError(message) {
    document.body.classList.add("error-state");
    setState("Link nao encontrado", message || "Esse link pode ter expirado ou sido removido.", FALLBACK_HOME);
  }

  function headers(extra) {
    var output = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SUPABASE_ANON_KEY
    };
    var key;

    for (key in extra || {}) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) output[key] = extra[key];
    }

    return output;
  }

  function buildUrl(path, params) {
    var url = new URL(path, SUPABASE_URL);
    var key;

    for (key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        url.searchParams.set(key, params[key]);
      }
    }

    return url.toString();
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

  function getShortLink(slug) {
    var url = buildUrl("/rest/v1/short_links", {
      select: "slug,target_url,title",
      slug: "eq." + slug,
      active: "eq.true",
      or: "(expires_at.is.null,expires_at.gt.now())",
      limit: "1"
    });

    debugLog("buscando slug", { slug: slug, url: url });

    return fetchWithTimeout(url, { method: "GET", headers: headers() })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (rows) {
        return Array.isArray(rows) && rows.length ? rows[0] : null;
      });
  }

  function isSafeTarget(url) {
    try {
      var parsed = new URL(url);
      return parsed.protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  function registerClick(slug) {
    var payload = {
      slug: slug,
      referrer: document.referrer || null,
      page_url: window.location.href,
      user_agent: navigator.userAgent || null
    };

    return fetch(buildUrl("/rest/v1/short_link_clicks", {}), {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      }),
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function (error) {
      debugLog("falha ao registrar clique", error && error.message ? error.message : String(error));
    });
  }

  function redirectTo(link) {
    var targetUrl = link && link.target_url;
    var title = link && link.title ? link.title : "Abrindo oferta";

    if (!isSafeTarget(targetUrl)) {
      setError("Destino invalido. Use apenas links HTTPS cadastrados.");
      return;
    }

    debugLog("redirecionando", link);
    setState(title, "Redirecionando com seguranca.", targetUrl);

    registerClick(link.slug);

    window.setTimeout(function () {
      window.location.replace(targetUrl);
    }, REDIRECT_DELAY_MS);
  }

  function init() {
    var slug = getSlug();

    if (!slug) {
      setError("Use um link no formato /r/?s=slug.");
      return;
    }

    getShortLink(slug)
      .then(function (link) {
        if (!link) {
          setError("Esse link pode ter expirado ou sido removido.");
          return;
        }

        redirectTo(link);
      })
      .catch(function (error) {
        debugLog("erro", error && error.message ? error.message : String(error));
        setError("Nao foi possivel abrir esse link agora.");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
