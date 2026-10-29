(function () {
  "use strict";
  if (window.FreeIslandPrivacy) return;

  var STORAGE_KEY = "fi_privacy_consent_v1";
  var ACCEPTED = "analytics";
  var ESSENTIAL = "essential";
  var scriptNode = document.currentScript || document.querySelector('script[src*="privacy-consent.js"]');
  var scriptBase = scriptNode && scriptNode.src ? scriptNode.src : new URL("privacy-consent.js", window.location.href).toString();
  var memoryChoice = "";
  var loading = {};
  var attempts = {};
  var retryTimer = null;
  var scriptStates = {};

  function readChoice() {
    if (memoryChoice) return memoryChoice;
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === ACCEPTED || value === ESSENTIAL ? value : memoryChoice;
    } catch (error) {
      return memoryChoice;
    }
  }

  function saveChoice(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {}
  }

  function clearOptionalIdentifiers() {
    try {
      ["fi_visitor", "fi_session", "fi_session_ts"].forEach(function (key) {
        window.localStorage.removeItem(key);
      });
    } catch (error) {}
    ["_fbp", "_fbc"].forEach(function (name) {
      document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax";
      [window.location.hostname, "." + window.location.hostname].forEach(function (domain) {
        document.cookie = name + "=; Max-Age=0; path=/; domain=" + domain + "; SameSite=Lax";
      });
    });
  }

  function loadScript(relativePath) {
    if (loading[relativePath]) return loading[relativePath];
    scriptStates[relativePath] = "loading";
    loading[relativePath] = new Promise(function (resolve, reject) {
      var source = new URL(relativePath, scriptBase).toString();
      var node = document.createElement("script");
      node.src = source;
      node.async = true;
      node.dataset.privacySource = relativePath;
      node.addEventListener("load", function () { scriptStates[relativePath] = "loaded"; resolve(); }, { once: true });
      node.addEventListener("error", function () { scriptStates[relativePath] = "blocked_or_failed"; node.remove(); reject(new Error("optional_script_unavailable")); }, { once: true });
      document.head.appendChild(node);
    }).catch(function (error) {
      delete loading[relativePath];
      throw error;
    });
    return loading[relativePath];
  }

  function enableOptionalAnalytics() {
    if (readChoice() !== ACCEPTED) return;
    ["fi.js?v=20261029_2", "meta-events.js?v=20261029_1"].forEach(function (source) {
      if (loading[source] || (attempts[source] || 0) >= 2) return;
      attempts[source] = (attempts[source] || 0) + 1;
      loadScript(source).catch(function () {
        if (readChoice() === ACCEPTED && !retryTimer) {
          retryTimer = window.setTimeout(function () { retryTimer = null; enableOptionalAnalytics(); }, 1500);
        }
      });
    });
  }

  function removeBanner() {
    var banner = document.getElementById("fi-consent-banner");
    if (banner) banner.remove();
  }

  function choose(value) {
    memoryChoice = value;
    saveChoice(value);
    removeBanner();
    document.dispatchEvent(new CustomEvent("freeisland:privacy-choice", { detail: { choice: value } }));
    if (value === ACCEPTED) {
      attempts = {};
      enableOptionalAnalytics();
      if (window.FreeIslandMetaEvents) window.FreeIslandMetaEvents.retry();
    } else {
      if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = null; }
      clearOptionalIdentifiers();
    }
  }

  function privacyUrl() {
    return new URL("privacidade.html", scriptBase).toString();
  }

  function showBanner() {
    if (document.getElementById("fi-consent-banner")) return;
    var banner = document.createElement("section");
    banner.id = "fi-consent-banner";
    banner.className = "consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-modal", "false");
    banner.setAttribute("aria-labelledby", "fi-consent-title");
    banner.innerHTML =
      '<div class="consent-copy"><strong id="fi-consent-title">Sua privacidade vem primeiro</strong>' +
      '<p>Usamos apenas recursos essenciais por padrão. Com sua escolha, podemos ativar métricas próprias e o Meta Pixel para entender o uso do site.</p>' +
      '<a href="' + privacyUrl() + '">Ler a política de privacidade</a></div>' +
      '<div class="consent-actions"><button type="button" data-consent-essential>Somente essenciais</button>' +
      '<button type="button" class="consent-accept" data-consent-accept>Aceitar métricas</button></div>';
    banner.querySelector("[data-consent-essential]").addEventListener("click", function () {
      choose(ESSENTIAL);
    });
    banner.querySelector("[data-consent-accept]").addEventListener("click", function () {
      choose(ACCEPTED);
    });
    document.body.appendChild(banner);
  }

  function openSettings() {
    showBanner();
  }

  function init() {
    if (new URLSearchParams(window.location.search).get("debugMeta") === "true") {
      loadScript("meta-diagnostics.js?v=20261029_2").catch(function () {});
    }
    document.querySelectorAll("[data-consent-settings]").forEach(function (button) {
      button.addEventListener("click", openSettings);
    });
    var choice = readChoice();
    if (choice === ACCEPTED) enableOptionalAnalytics();
    else if (choice === ESSENTIAL) clearOptionalIdentifiers();
    else showBanner();
  }

  window.FreeIslandPrivacy = {
    accept: function () { choose(ACCEPTED); },
    essentialOnly: function () { choose(ESSENTIAL); },
    getChoice: readChoice,
    getStatus: function () { return { choice: readChoice(), scripts: Object.assign({}, scriptStates) }; },
    retry: function () { attempts = {}; enableOptionalAnalytics(); },
    open: openSettings
  };

  window.addEventListener("online", function () { attempts = {}; enableOptionalAnalytics(); });
  window.addEventListener("storage", function (event) {
    if (event.key !== STORAGE_KEY) return;
    memoryChoice = event.newValue === ACCEPTED || event.newValue === ESSENTIAL ? event.newValue : "";
    document.dispatchEvent(new CustomEvent("freeisland:privacy-choice", { detail: { choice: memoryChoice } }));
    if (memoryChoice === ACCEPTED) enableOptionalAnalytics();
    else clearOptionalIdentifiers();
    if (memoryChoice) removeBanner();
    else showBanner();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
