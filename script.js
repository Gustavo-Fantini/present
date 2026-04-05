const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/JelwkQXy1Mj05NWybBCTQX";

const links = document.querySelectorAll("[data-whatsapp-link]");
const yearTargets = document.querySelectorAll("[data-current-year]");
const placeholderUrl = "https://chat.whatsapp.com/SEU-LINK-AQUI";

links.forEach((link) => {
  link.href = WHATSAPP_GROUP_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
});

yearTargets.forEach((target) => {
  target.textContent = new Date().getFullYear();
});

if (WHATSAPP_GROUP_URL === placeholderUrl) {
  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.alert("Atualize o link do grupo em script.js antes de publicar a pagina.");
    });
  });
}
