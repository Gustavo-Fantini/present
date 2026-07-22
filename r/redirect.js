(function () {
  var SUPABASE_URL = "https://jdeszhiykkviymtkdbit.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZXN6aGl5a2t2aXltdGtkYml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTU4ODUsImV4cCI6MjA5NTAzMTg4NX0.lH674hCA5Bp62m08eV03DqmZauMY_VNlkhGi6vlX33U";
  var REDIRECT_DELAY_MS = 300;
  var REQUEST_TIMEOUT_MS = 5000;
  var FALLBACK_HOME = "/";
  var AMAZON_TAG = "freeislandt0e-20";
  var NETWORKS = ["meli", "amzn", "shopee", "ali", "kabum", "adidas", "terabyte"];
  var AWIN_PUBLISHER_ID = "2802012";
  var AWIN_ADVERTISERS = {
    kabum: { id: "17729", domains: ["kabum.com.br"] },
    ali: { id: "18879", domains: ["aliexpress.com"] },
    adidas: { id: "79926", domains: ["adidas.com.br"] }
  };

  function isDebug() {
    try {
      return new URLSearchParams(window.location.search).get("debugRedirect") === "true";
    } catch (error) {
      return false;
    }
  }

  function debugLog(message, data) {
    if (!isDebug() || !window.console) return;
    if (typeof data === "undefined") console.log("[Free Island Redirect]", message);
    else console.log("[Free Island Redirect]", message, data);
  }

  function normalizeNetwork(value) {
    var network = String(value || "").trim().toLowerCase();
    return NETWORKS.indexOf(network) >= 0 ? network : "";
  }

  function getLinkIdentity() {
    try {
      var params = new URLSearchParams(window.location.search);
      var querySlug = String(params.get("s") || params.get("slug") || "").trim().toLowerCase();
      var pathMatch = window.location.pathname.match(/^\/([a-z0-9][a-z0-9-]{1,79})\/(meli|amzn|shopee|ali|kabum|adidas|terabyte)\/?$/i);
      var network;
      var productId;

      if (pathMatch) {
        productId = pathMatch[1].toLowerCase();
        network = normalizeNetwork(pathMatch[2]);
        return { slug: network + "-" + productId, network: network, productId: productId };
      }

      if (!/^[a-z0-9][a-z0-9-]{1,100}$/.test(querySlug)) return null;
      network = normalizeNetwork((querySlug.match(/^(meli|amzn|shopee|ali|kabum|adidas|terabyte)-/) || [])[1]);
      return { slug: querySlug, network: network, productId: "" };
    } catch (error) {
      return null;
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
    return Object.assign({
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SUPABASE_ANON_KEY
    }, extra || {});
  }

  function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

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

  function getShortLink(identity) {
    var url = new URL("/rest/v1/rpc/resolve_short_link", SUPABASE_URL).toString();
    var payload = {
      p_slug: identity.slug,
      p_referrer: document.referrer || null,
      p_page_url: window.location.href,
      p_user_agent: navigator.userAgent || null
    };

    debugLog("buscando link", identity);
    return fetchWithTimeout(url, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
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

  function hostMatches(host, domains) {
    return domains.some(function (domain) {
      return host === domain || host.endsWith("." + domain);
    });
  }

  function isSafeAwinTarget(parsed, network) {
    var advertiser = AWIN_ADVERTISERS[network];
    var destinationValue;
    var destination;
    if (!advertiser) return false;

    try {
      destinationValue = parsed.searchParams.get("ued") || "";
      destination = new URL(destinationValue);
    } catch (error) {
      return false;
    }

    return parsed.hostname.toLowerCase() === "www.awin1.com"
      && parsed.pathname === "/cread.php"
      && parsed.searchParams.get("awinmid") === advertiser.id
      && parsed.searchParams.get("awinaffid") === AWIN_PUBLISHER_ID
      && destination.protocol === "https:"
      && !destination.username
      && !destination.password
      && hostMatches(destination.hostname.toLowerCase(), advertiser.domains);
  }

  function isSafeTarget(url, network) {
    var parsed;
    var host;
    try {
      parsed = new URL(url);
      host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    } catch (error) {
      return false;
    }

    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    if (network === "kabum" || network === "ali" || network === "adidas") {
      return isSafeAwinTarget(parsed, network);
    }
    if (network === "amzn") {
      return hostMatches(host, ["amazon.com.br", "amazon.com"])
        && /^\/(dp|gp\/product)\/[a-z0-9]{10}(?:[/?#]|$)/i.test(parsed.pathname)
        && parsed.searchParams.get("tag") === AMAZON_TAG;
    }
    if (network === "meli") {
      return hostMatches(host, ["mercadolivre.com.br", "mercadolivre.com", "mercadolibre.com", "meli.la"]);
    }
    if (network === "shopee") {
      return hostMatches(host, ["shopee.com.br", "shope.ee"]);
    }
    if (network === "terabyte") {
      return hostMatches(host, ["terabyteshop.com.br"])
        && /^\/produto\/\d+(?:\/|$)/i.test(parsed.pathname)
        && /^\d{2,20}$/.test(parsed.searchParams.get("p") || "");
    }
    return false;
  }

  function redirectTo(link, identity) {
    var targetUrl = link && link.target_url;
    var network = normalizeNetwork((link && link.network) || identity.network);
    var title = link && link.title ? link.title : "Abrindo oferta";
    var fallback;
    var disclosure;

    if (!network || !isSafeTarget(targetUrl, network)) {
      setError("Destino invalido. Use apenas links oficiais cadastrados.");
      return;
    }

    if (network === "amzn") {
      fallback = document.querySelector("[data-fallback-link]");
      disclosure = document.querySelector("[data-amazon-disclosure]");
      document.body.classList.add("confirmation-state");
      if (disclosure) disclosure.hidden = false;
      if (fallback) {
        fallback.textContent = "Continuar para a Amazon";
        fallback.rel = "sponsored noopener";
        fallback.referrerPolicy = "strict-origin-when-cross-origin";
      }
      debugLog("aguardando confirmacao Amazon", { target: targetUrl });
      setState(title, "Publicidade: confirme para abrir o Link Especial rastreado na Amazon.com.br.", targetUrl);
      return;
    }

    debugLog("redirecionando", { network: network, target: targetUrl });
    setState(title, "Redirecionando com seguranca.", targetUrl);
    window.setTimeout(function () { window.location.replace(targetUrl); }, REDIRECT_DELAY_MS);
  }

  function init() {
    var identity = getLinkIdentity();
    if (!identity) {
      setError("Use um link Free Island valido.");
      return;
    }

    getShortLink(identity)
      .then(function (link) {
        if (!link) {
          setError("Esse link pode ter expirado ou sido removido.");
          return;
        }
        redirectTo(link, identity);
      })
      .catch(function (error) {
        debugLog("erro", error && error.message ? error.message : String(error));
        setError("Nao foi possivel abrir esse link agora.");
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
