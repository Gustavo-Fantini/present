(function () {
  var ENDPOINT = "https://hunter.3-15-128-116.sslip.io/api/public/landing";
  var REQUEST_TIMEOUT_MS = 6500;
  var CACHE_MS = 30000;
  var cachedSnapshot = null;
  var cachedAt = 0;
  var activeRequest = null;

  function fetchSnapshot() {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

    return fetch(ENDPOINT, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }).then(function (payload) {
      if (!payload || payload.ok !== true || payload.operation_slug !== "free-island-principal") {
        throw new Error("invalid_public_snapshot");
      }
      cachedSnapshot = payload;
      cachedAt = Date.now();
      return payload;
    }).finally(function () {
      window.clearTimeout(timer);
    });
  }

  function getSnapshot(forceRefresh) {
    if (!forceRefresh && cachedSnapshot && Date.now() - cachedAt < CACHE_MS) {
      return Promise.resolve(cachedSnapshot);
    }
    if (activeRequest) return activeRequest;
    activeRequest = fetchSnapshot().catch(function (error) {
      if (cachedSnapshot) return cachedSnapshot;
      throw error;
    }).finally(function () {
      activeRequest = null;
    });
    return activeRequest;
  }

  window.FreeIslandPublicData = {
    endpoint: ENDPOINT,
    get: getSnapshot
  };
})();
