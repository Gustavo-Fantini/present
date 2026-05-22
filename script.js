const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/JelwkQXy1Mj05NWybBCTQX";

const links = document.querySelectorAll("[data-whatsapp-link]");
const yearTargets = document.querySelectorAll("[data-current-year]");
const placeholderUrl = "https://chat.whatsapp.com/SEU-LINK-AQUI";

function isInAppBrowser() {
  try {
    var ua = String(navigator.userAgent || "");
    // Common in-app browsers that frequently break/limit deep linking.
    if (ua.indexOf("Instagram") !== -1) return true;
    if (ua.indexOf("FBAN") !== -1) return true;
    if (ua.indexOf("FBAV") !== -1) return true;
    if (ua.indexOf("FB_IAB") !== -1) return true;
    return false;
  } catch (e) {
    return false;
  }
}

function isAndroid() {
  try {
    return String(navigator.userAgent || "").indexOf("Android") !== -1;
  } catch (e) {
    return false;
  }
}

function makeAndroidIntent(url) {
  // Best-effort to force open WhatsApp on Android via Intent.
  // Works for many devices/browsers; safe fallback is the normal https URL.
  try {
    var clean = String(url || "").replace(/^https?:\/\//, "");
    return "intent://" + clean + "#Intent;scheme=https;package=com.whatsapp;end";
  } catch (e) {
    return url;
  }
}

function showJoinHelp() {
  try {
    if (document.getElementById("fi-join-help")) return;

    var wrap = document.createElement("div");
    wrap.id = "fi-join-help";
    wrap.style.position = "fixed";
    wrap.style.left = "0";
    wrap.style.right = "0";
    wrap.style.bottom = "0";
    wrap.style.top = "0";
    wrap.style.zIndex = "999999";
    wrap.style.background = "rgba(0,0,0,0.55)";
    wrap.style.backdropFilter = "blur(10px)";
    wrap.style.webkitBackdropFilter = "blur(10px)";
    wrap.style.display = "grid";
    wrap.style.placeItems = "end center";
    wrap.style.padding = "16px";

    var card = document.createElement("div");
    card.style.width = "min(560px, 100%)";
    card.style.borderRadius = "22px";
    card.style.background = "rgba(7,14,28,0.96)";
    card.style.border = "1px solid rgba(255,255,255,0.12)";
    card.style.boxShadow = "0 24px 70px rgba(0,0,0,0.45)";
    card.style.padding = "14px";
    card.style.color = "#f8fbff";

    var title = document.createElement("div");
    title.textContent = "Abrindo o grupo...";
    title.style.fontWeight = "800";
    title.style.fontSize = "16px";
    title.style.marginBottom = "6px";

    var body = document.createElement("div");
    body.textContent =
      "Se o WhatsApp abrir no navegador do Instagram, toque em \"Abrir app\". Se nao funcionar, copie o link e cole no WhatsApp.";
    body.style.opacity = "0.88";
    body.style.lineHeight = "1.45";
    body.style.fontSize = "14px";

    var row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr 1fr";
    row.style.gap = "10px";
    row.style.marginTop = "12px";

    function mkBtn(label) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.minHeight = "48px";
      b.style.borderRadius = "16px";
      b.style.border = "1px solid rgba(255,255,255,0.14)";
      b.style.background = "rgba(255,255,255,0.08)";
      b.style.color = "#fff";
      b.style.fontWeight = "800";
      b.style.cursor = "pointer";
      return b;
    }

    var openBtn = mkBtn("Tentar abrir");
    openBtn.onclick = function () {
      try {
        var target = WHATSAPP_GROUP_URL;
        if (isAndroid()) target = makeAndroidIntent(WHATSAPP_GROUP_URL);
        window.location.href = target;
      } catch (e) {}
    };

    var copyBtn = mkBtn("Copiar link");
    copyBtn.onclick = function () {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(WHATSAPP_GROUP_URL);
        } else {
          var tmp = document.createElement("textarea");
          tmp.value = WHATSAPP_GROUP_URL;
          tmp.style.position = "fixed";
          tmp.style.left = "-9999px";
          document.body.appendChild(tmp);
          tmp.focus();
          tmp.select();
          document.execCommand("copy");
          document.body.removeChild(tmp);
        }
        copyBtn.textContent = "Copiado!";
        setTimeout(function () {
          copyBtn.textContent = "Copiar link";
        }, 1400);
      } catch (e) {}
    };

    row.appendChild(openBtn);
    row.appendChild(copyBtn);

    var close = document.createElement("button");
    close.type = "button";
    close.textContent = "Fechar";
    close.style.marginTop = "10px";
    close.style.width = "100%";
    close.style.minHeight = "44px";
    close.style.borderRadius = "16px";
    close.style.border = "1px solid rgba(255,255,255,0.12)";
    close.style.background = "transparent";
    close.style.color = "rgba(255,255,255,0.82)";
    close.style.fontWeight = "800";
    close.style.cursor = "pointer";
    close.onclick = function () {
      try {
        wrap.remove();
      } catch (e) {}
    };

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(row);
    card.appendChild(close);
    wrap.appendChild(card);
    wrap.addEventListener("click", function (e) {
      if (e && e.target === wrap) close.click();
    });
    document.body.appendChild(wrap);
  } catch (e) {}
}

links.forEach((link) => {
  link.href = WHATSAPP_GROUP_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  // Improve join success inside in-app browsers (Instagram/Facebook) and Android.
  link.addEventListener("click", function () {
    try {
      if (isInAppBrowser()) {
        // Show help without blocking navigation; some browsers ignore preventDefault anyway.
        setTimeout(showJoinHelp, 250);
      }
    } catch (e) {}
  });
});

yearTargets.forEach((target) => {
  target.textContent = new Date().getFullYear();
});

if (WHATSAPP_GROUP_URL === placeholderUrl) {
  links.forEach((link) => {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      window.alert("Atualize o link do grupo em script.js antes de publicar a pagina.");
    });
  });
}
