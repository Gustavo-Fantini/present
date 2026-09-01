(function () {
  "use strict";

  var STORAGE_KEY = "fi_privacy_consent_v1";
  var ACCEPTED = "analytics";
  var ESSENTIAL = "essential";
  var scriptNode = document.currentScript || document.querySelector('script[src*="privacy-consent.js"]');
  var scriptBase = scriptNode && scriptNode.src ? scriptNode.src : new URL("privacy-consent.js", window.location.href).toString();
  var loaded = false;

  function readChoice() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === ACCEPTED || value === ESSENTIAL ? value : "";
    } catch (error) {
      return "";
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
    });
  }

  function loadScript(relativePath) {
    return new Promise(function (resolve, reject) {
      var source = new URL(relativePath, scriptBase).toString();
      var existing = document.querySelector('script[data-privacy-source="' + relativePath + '"]');
      if (existing) {
        resolve();
        return;
      }
      var node = document.createElement("script");
      node.src = source;
      node.async = true;
      node.dataset.privacySource = relativePath;
      node.addEventListener("load", resolve, { once: true });
      node.addEventListener("error", reject, { once: true });
      document.head.appendChild(node);
    });
  }

  function enableOptionalAnalytics() {
    if (loaded) return;
    loaded = true;
    loadScript("fi.js?v=20260831_2").catch(function () {});
    loadScript("meta-events.js?v=20260831_2").catch(function () {});
  }

  function removeBanner() {
    var banner = document.getElementById("fi-consent-banner");
    if (banner) banner.remove();
  }

  function choose(value) {
    saveChoice(value);
    removeBanner();
    if (value === ACCEPTED) enableOptionalAnalytics();
    else clearOptionalIdentifiers();
    document.dispatchEvent(new CustomEvent("freeisland:privacy-choice", { detail: { choice: value } }));
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
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {}
    showBanner();
  }

  function init() {
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
    open: openSettings
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
