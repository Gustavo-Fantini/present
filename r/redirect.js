(function () {
  var SUPABASE_URL = "https://jdeszhiykkviymtkdbit.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZXN6aGl5a2t2aXltdGtkYml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTU4ODUsImV4cCI6MjA5NTAzMTg4NX0.lH674hCA5Bp62m08eV03DqmZauMY_VNlkhGi6vlX33U";
  var REDIRECT_DELAY_MS = 450;
  var REQUEST_TIMEOUT_MS = 5000;
  var FALLBACK_HOME = "/";
  var AWIN_PUBLISHER_ID = "2802012";
  var AWIN_ADVERTISERS = {
    "17729": ["kabum.com.br"],
    "18879": ["aliexpress.com"],
    "79926": ["adidas.com.br"]
  };

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
    var url = buildUrl("/rest/v1/rpc/resolve_short_link", {});
    var payload = {
      p_slug: slug,
      p_referrer: document.referrer || null,
      p_page_url: window.location.href,
      p_user_agent: navigator.userAgent || null
    };

    debugLog("buscando slug", { slug: slug });

    return fetchWithTimeout(url, {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
    })
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
      var advertiserId = parsed.searchParams.get("awinmid") || "";
      var publisherId = parsed.searchParams.get("awinaffid") || "";
      var destinationValue = parsed.searchParams.get("ued") || "";
      var allowedDomains = AWIN_ADVERTISERS[advertiserId] || [];
      var destination = new URL(destinationValue);
      var destinationHost = destination.hostname.toLowerCase();

      return parsed.protocol === "https:"
        && parsed.hostname.toLowerCase() === "www.awin1.com"
        && parsed.pathname === "/cread.php"
        && !parsed.username
        && !parsed.password
        && publisherId === AWIN_PUBLISHER_ID
        && destination.protocol === "https:"
        && !destination.username
        && !destination.password
        && allowedDomains.some(function (domain) {
          return destinationHost === domain || destinationHost.endsWith("." + domain);
        });
    } catch (e) {
      return false;
    }
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
