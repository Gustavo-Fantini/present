"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const OPERATION = "free-island-principal";
const FIRST = "https://chat.whatsapp.com/FirstGroupCode0123456789";
const SECOND = "https://chat.whatsapp.com/SecondGroupCode0123456789";
let checks = 0;

class Element {
  constructor(tag, attributes = {}) {
    this.tagName = tag.toUpperCase();
    this.attributes = { ...attributes };
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.listeners = {};
    this.textContent = "";
    this.hidden = false;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  removeChild(node) { this.children = this.children.filter(child => child !== node); node.parentNode = null; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  click() { if (this.onclick) return this.onclick(); return this.listeners.click?.({ preventDefault() {} }); }
  focus() {}
  select() {}
  querySelectorAll(selector) {
    const attribute = selector.match(/^\[([^\]]+)\]$/)?.[1];
    return descendants(this).filter(node => attribute && node.getAttribute(attribute) !== null);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function documentStub() {
  const body = new Element("body");
  return {
    body,
    readyState: "complete",
    createElement: tag => new Element(tag),
    querySelectorAll: selector => body.querySelectorAll(selector),
    querySelector: selector => body.querySelector(selector),
    getElementById: id => descendants(body).find(node => node.id === id) || null,
    addEventListener() {},
    execCommand() { return true; }
  };
}

function group(overrides = {}) {
  return {
    operation_slug: OPERATION,
    invite_url: FIRST,
    destination_id: "first",
    priority: 100,
    members: 960,
    capacity_limit: 990,
    landing_enabled: true,
    status: "fresh",
    ...overrides
  };
}

function snapshot(groups, overrides = {}) {
  return { ok: true, operation_slug: OPERATION, audience: { whatsapp_groups: groups }, ...overrides };
}

function runSource(file, globals) {
  const context = vm.createContext({ URL, Promise, Date, console, ...globals });
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
  return context;
}

function routeHarness(initial = snapshot([group()]), userAgent = "Desktop") {
  const document = documentStub();
  const link = document.body.appendChild(new Element("a", { "data-whatsapp-link": "" }));
  const status = document.body.appendChild(new Element("p", { "data-whatsapp-status": "" }));
  const clipboard = [];
  const alerts = [];
  const timers = [];
  const opened = [];
  let response = initial;
  const window = {
    location: { href: "https://example.test/" },
    FreeIslandPublicData: {
      get(forceRefresh, options) {
        assert.equal(forceRefresh, true);
        assert.equal(options.allowStale, false);
        return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
      }
    },
    setInterval() {},
    setTimeout(callback) { timers.push(callback); },
    alert(message) { alerts.push(message); },
    open() {
      const popup = { opener: window, closed: false, location: { replace(url) { popup.url = url; } }, close() { popup.closed = true; } };
      opened.push(popup);
      return popup;
    }
  };
  const navigator = { userAgent, clipboard: { writeText(url) { clipboard.push(url); return Promise.resolve(); } } };
  const context = runSource("script.js", { window, document, navigator, setTimeout: window.setTimeout });
  return { context, window, document, link, status, clipboard, alerts, timers, opened, setResponse(value) { response = value; } };
}

async function settle() { await new Promise(resolve => setImmediate(resolve)); }
function button(document, label) { return descendants(document.body).find(node => node.tagName === "BUTTON" && node.textContent === label); }

async function routingTests() {
  const harness = routeHarness();
  await settle();
  const select = harness.context.selectAvailableWhatsAppGroup;
  assert.equal(select([group()]), FIRST);
  assert.equal(select([group({ members: 990 }), group({ invite_url: SECOND, destination_id: "second" })]), SECOND);
  assert.equal(select([group({ invite_url: SECOND, priority: 100 }), group({ priority: 0 })]), FIRST);
  assert.equal(select([group({ operation_slug: "moda-cosmesticos" })]), "");
  assert.equal(select([group({ status: "unavailable" })]), "");
  for (const members of [null, "", true, -1, Infinity, 1.5]) assert.equal(select([group({ members })]), "");
  for (const capacity_limit of [null, "", true, 0, -1, 1025, 1.5]) assert.equal(select([group({ capacity_limit })]), "");
  assert.equal(select([group({ members: "12", capacity_limit: "990" })]), FIRST);
  checks += 19;

  const normalize = harness.context.normalizeWhatsAppGroupUrl;
  assert.equal(normalize(FIRST + "/"), FIRST);
  for (const url of [
    "http://chat.whatsapp.com/FirstGroupCode0123456789",
    "https://evil.test/FirstGroupCode0123456789",
    "https://user@chat.whatsapp.com/FirstGroupCode0123456789",
    "https://chat.whatsapp.com:443/FirstGroupCode0123456789",
    "https://chat.whatsapp.com:8443/FirstGroupCode0123456789",
    FIRST + "?ref=anything", FIRST + "?", FIRST + "#", FIRST + "/other", "https://chat.whatsapp.com/short"
  ]) assert.equal(normalize(url), "");
  checks += 11;

  for (const groups of [[], [group({ landing_enabled: false })], [group({ members: 990 })]]) {
    harness.setResponse(snapshot(groups));
    assert.equal(await harness.window.FreeIslandResolveWhatsAppGroup(true), "");
    assert.equal(harness.link.href, "#inicio");
    harness.context.showJoinHelp();
    assert.equal(harness.document.getElementById("fi-join-help"), null);
    harness.setResponse(snapshot([group()]));
    assert.equal(await harness.window.FreeIslandResolveWhatsAppGroup(true), FIRST);
  }
  checks += 12;

  harness.setResponse(new Error("network_down"));
  assert.equal(await harness.window.FreeIslandResolveWhatsAppGroup(true), "");
  assert.equal(harness.link.href, "#inicio");
  harness.link.click();
  await settle();
  assert.equal(harness.opened[0].opener, null);
  assert.equal(harness.opened[0].closed, true);
  assert.equal(harness.status.hidden, false);
  assert.match(harness.status.textContent, /Telegram/);
  assert.equal(harness.alerts.length, 0);
  const cold = routeHarness(new Error("network_down"));
  await settle();
  assert.equal(cold.link.href, "#inicio");
  checks += 8;

  harness.setResponse(snapshot([group({ invite_url: SECOND })]));
  harness.link.click();
  await settle();
  assert.equal(harness.opened[1].url, SECOND);
  assert.equal(harness.opened[1].opener, null);
  assert.equal(harness.link.getAttribute("aria-busy"), null);
  assert.equal(harness.status.hidden, true);
  checks += 4;

  const inApp = routeHarness(snapshot([group()]), "Instagram Android");
  await settle();
  inApp.context.showJoinHelp();
  inApp.setResponse(snapshot([group({ invite_url: SECOND })]));
  button(inApp.document, "Copiar link").click();
  await settle();
  assert.deepEqual(inApp.clipboard, [SECOND]);
  inApp.setResponse(snapshot([]));
  button(inApp.document, "Tentar abrir").click();
  await settle();
  assert.equal(inApp.window.location.href, "https://example.test/");
  assert.equal(inApp.document.getElementById("fi-join-help"), null);
  inApp.setResponse(snapshot([group()]));
  await inApp.window.FreeIslandResolveWhatsAppGroup(true);
  inApp.context.showJoinHelp();
  inApp.setResponse(snapshot([group({ members: 990 })]));
  button(inApp.document, "Copiar link").click();
  await settle();
  assert.deepEqual(inApp.clipboard, [SECOND]);
  assert.equal(inApp.document.getElementById("fi-join-help"), null);
  checks += 5;

  harness.setResponse(snapshot([group()], { operation_slug: "moda-cosmesticos" }));
  assert.equal(await harness.window.FreeIslandResolveWhatsAppGroup(true), "");
  harness.setResponse(snapshot([group()], { audience: {} }));
  assert.equal(await harness.window.FreeIslandResolveWhatsAppGroup(true), "");
  harness.setResponse(snapshot([group()], { stale: true }));
  assert.equal(await harness.window.FreeIslandResolveWhatsAppGroup(true), "");
  checks += 3;
}

function publicDataHarness() {
  const pending = [];
  const window = { setTimeout() { return 1; }, clearTimeout() {} };
  class AbortControllerStub { constructor() { this.signal = {}; } abort() {} }
  runSource("public-data.js", {
    window,
    AbortController: AbortControllerStub,
    fetch() { return new Promise((resolve, reject) => pending.push({ resolve, reject })); }
  });
  return { client: window.FreeIslandPublicData, pending };
}

async function publicDataTests() {
  const harness = publicDataHarness();
  const fresh = snapshot([group()]);
  const initial = harness.client.get(false);
  harness.pending[0].resolve({ ok: true, json: () => Promise.resolve(fresh) });
  assert.deepEqual(await initial, fresh);
  assert.deepEqual(await harness.client.get(false), fresh);
  assert.equal(harness.pending.length, 1);
  checks += 3;

  for (const strictFirst of [true, false]) {
    const strict = () => harness.client.get(true, { allowStale: false });
    const tolerant = () => harness.client.get(true);
    const first = strictFirst ? strict() : tolerant();
    const second = strictFirst ? tolerant() : strict();
    const resultsPromise = Promise.allSettled([first, second]);
    const expectedCount = strictFirst ? 2 : 3;
    assert.equal(harness.pending.length, expectedCount);
    harness.pending.at(-1).reject(new Error("offline"));
    const results = await resultsPromise;
    const strictResult = results[strictFirst ? 0 : 1];
    const tolerantResult = results[strictFirst ? 1 : 0];
    assert.equal(strictResult.status, "rejected");
    assert.equal(tolerantResult.status, "fulfilled");
    assert.equal(tolerantResult.value.stale, true);
    assert.equal(fresh.stale, undefined);
    checks += 5;
  }

  const retry = harness.client.get(true, { allowStale: false });
  harness.pending.at(-1).resolve({ ok: true, json: () => Promise.resolve(snapshot([])) });
  assert.deepEqual((await retry).audience.whatsapp_groups, []);
  const malformed = harness.client.get(true, { allowStale: false });
  const malformedResult = Promise.allSettled([malformed]);
  harness.pending.at(-1).resolve({ ok: true, json: () => Promise.resolve(snapshot([], { operation_slug: "wrong" })) });
  assert.equal((await malformedResult)[0].status, "rejected");
  checks += 2;
}

function promotionsHarness(payload) {
  const document = documentStub();
  const heroMembers = document.body.appendChild(new Element("span", { "data-activity-members": "" }));
  const section = document.body.appendChild(new Element("section", { "data-promotions-section": "" }));
  const members = section.appendChild(new Element("span", { "data-activity-members": "" }));
  const list = section.appendChild(new Element("div", { "data-promotions-list": "" }));
  const fallback = section.appendChild(new Element("div", { "data-promotions-fallback": "" }));
  section.appendChild(new Element("span", { "data-activity-count": "" }));
  section.appendChild(new Element("span", { "data-activity-latest": "" }));
  const window = {
    location: { search: "" },
    FreeIslandPublicData: { get() { return payload instanceof Error ? Promise.reject(payload) : Promise.resolve(payload); } }
  };
  runSource("supabase-promotions.js", { window, document });
  return { document, heroMembers, members, list, fallback };
}

async function promotionTests() {
  const publication = { product_title: "Produto real", store: "KaBuM!", published_at: new Date().toISOString() };
  const harness = promotionsHarness({ audience: { total_members: 1114, status: "fresh" }, promotions: [publication], today_count: 12 });
  await settle();
  assert.equal(harness.heroMembers.hidden, false);
  assert.equal(harness.members.hidden, false);
  assert.match(harness.heroMembers.textContent, /1\.114/);
  assert.equal(harness.members.textContent, harness.heroMembers.textContent);
  const cta = descendants(harness.list).find(node => node.tagName === "A");
  assert.equal(cta.href, "#inicio");
  assert.equal(cta.textContent, "Escolher onde acompanhar");
  assert.equal(cta.getAttribute("data-whatsapp-link"), null);
  assert.equal(cta.getAttribute("data-meta-event"), null);
  assert.equal(cta.getAttribute("data-track"), "cta_latest_promotion");
  checks += 9;

  const zero = promotionsHarness({ audience: { total_members: 0, status: "fresh" }, promotions: [] });
  await settle();
  assert.equal(zero.members.hidden, false);
  assert.match(zero.members.textContent, /0 pessoas/);
  checks += 2;
  for (const audience of [null, {}, { total_members: null }, { total_members: "620" }, { total_members: -1 }, { total_members: 1.5 }, { total_members: 1000, status: "unavailable" }]) {
    const invalid = promotionsHarness({ audience, promotions: [] });
    await settle();
    assert.equal(invalid.heroMembers.hidden, true);
    assert.equal(invalid.members.textContent, "");
    checks += 2;
  }
  const stale = promotionsHarness({ audience: { total_members: 1114 }, promotions: [publication], stale: true });
  const unavailable = promotionsHarness(new Error("network_down"));
  await settle();
  assert.equal(stale.members.hidden, true);
  assert.equal(unavailable.members.hidden, true);
  assert.equal(unavailable.list.hidden, true);
  assert.equal(unavailable.fallback.hidden, false);
  checks += 4;
}

(async () => {
  await routingTests();
  await publicDataTests();
  await promotionTests();
  console.log("Landing routes: " + checks + " checks passed (no network or production writes).");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
