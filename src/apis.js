const BASE = (process.env.BYPASS_API_URL || "https://api.bananaone.dpdns.org").replace(/\/+$/, "");
const TIMEOUT = Number(process.env.BYPASS_API_TIMEOUT || 20000);
const WARMUP_TIMEOUT = Number(process.env.BYPASS_API_WARMUP_TIMEOUT || 10000);

const PLATFORMS = [
  { id: "platoboost", name: "Platoboost / PlatoRelay", example: "https://auth.platorelay.com/?d=TICKET", domains: ["auth.platorelay.com", "platorelay.com", "auth.platoboost.com", "gateway.platoboost.com", "platoboost.com"] },
  { id: "lootlabs", name: "LootLabs", example: "https://links.lootlabs.gg/XXXXX", domains: ["links.lootlabs.gg", "lootlabs.gg", "lootdest.com", "lootdest.org", "lootdest.info"] },
  { id: "lootlink", name: "loot.link", example: "https://loot.link/XXXXX", domains: ["loot.link", "loot-link.com", "loot-links.com", "lootlink.org"] },
  { id: "workink", name: "work.ink", example: "https://work.ink/XXXX/...", domains: ["work.ink", "workink.net"] },
  { id: "boostink", name: "boost.ink", example: "https://boost.ink/XXXXX", domains: ["boost.ink", "mboost.me", "bst.gg"] },
  { id: "linkvertise", name: "Linkvertise", example: "https://linkvertise.com/...", domains: ["linkvertise.com", "link-to.net", "link-target.net", "link-center.net", "link-hub.net", "direct-link.net"] },
  { id: "madium", name: "Madium", example: "https://getmadium.xyz/", domains: ["getmadium.xyz", "auth.getmadium.xyz", "madium.xyz"] },
];

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function domainMatch(host, list) {
  return list.some((d) => host === d || host.endsWith("." + d));
}

function allDomains() {
  return [...new Set(PLATFORMS.flatMap((p) => p.domains))].sort();
}

function platformFor(url) {
  const host = hostOf(url);
  if (!host) return null;
  return PLATFORMS.find((p) => domainMatch(host, p.domains)) || null;
}

function isSupportedRemotely(url) {
  return !!platformFor(url);
}

const PROVIDERS = [{ id: "private-backend", name: "Zentra Bypass API", base: BASE }];

function providersFor(url) {
  return isSupportedRemotely(url) ? PROVIDERS : [];
}

async function request(path, { method = "GET", body, timeout = TIMEOUT } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        "user-agent": "ZentraBot/4.1",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function normalise(res) {
  const data = res.json;

  if (!data || typeof data !== "object") {
    return { success: false, result: res.text ? String(res.text).slice(0, 500) : `HTTP ${res.status}` };
  }

  if (String(data.status || "").toLowerCase() === "success") {
    const value = data.result || data.url || data.key || "";
    return {
      success: !!value,
      result: value || "backend returned no result",
      platform: data.platform || null,
      logs: Array.isArray(data.logs) ? data.logs : [],
      tookMs: data.elapsed || data.tookMs,
    };
  }

  if (data.success) {
    const value = data.key || data.url || data.result || "";
    return {
      success: !!value,
      result: value || "backend returned no key",
      platform: data.platform || null,
      logs: Array.isArray(data.logs) ? data.logs : [],
      tookMs: data.tookMs,
    };
  }

  return {
    success: false,
    result: data.error || data.message || data.result || `HTTP ${res.status}`,
    platform: data.platform || null,
    logs: Array.isArray(data.logs) ? data.logs : [],
    tookMs: data.elapsed || data.tookMs,
  };
}

async function bypassWithApis(url, onStep = () => {}) {
  const platform = platformFor(url);
  if (!platform) {
    return { success: false, result: "this domain is not supported by the backend", provider: null };
  }

  onStep(`Platform: ${platform.name}`);
  onStep("Sending the link to Zentra...");

  try {
    const res = await request(`/api?url=${encodeURIComponent(url)}`, { method: "GET" });
    const result = normalise(res);

    if (result.success) {
      return { ...result, provider: "Zentra" };
    }

    const post = await request(`/api`, { method: "POST", body: { url } });
    const postResult = normalise(post);

    if (postResult.success) {
      return { ...postResult, provider: "Zentra" };
    }

    return { success: false, result: [result.result, postResult.result].filter(Boolean).join("\n"), provider: null };
  } catch (err) {
    return { success: false, result: err.name === "AbortError" ? "timeout" : err.message || "network error", provider: null };
  }
}

async function madiumKey(steps) {
  try {
    return normalise(await request("/api/madium/key", { method: "POST", body: { steps } }));
  } catch (err) {
    return { success: false, result: err.name === "AbortError" ? "timeout" : err.message };
  }
}

async function apiStatus() {
  try {
    const res = await request("/health", { method: "GET", timeout: 10000 });
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  }
}

const HEALTH_CHECKS = [
  {
    id: "zentra-api",
    name: "Zentra (/api)",
    kind: "api",
    run: () => request(`/api?url=${encodeURIComponent("https://link-to.net/xxx")}`, { method: "GET", timeout: 15000 }),
  },
];

async function probeOne(check) {
  const started = Date.now();
  try {
    const res = await check.run();
    const ms = Date.now() - started;
    const ok = res.status > 0 && res.status < 400;
    const degraded = !ok && [400, 401, 402, 403, 422, 429].includes(res.status);
    return { id: check.id, name: check.name, kind: check.kind, ok, degraded, ms, detail: `HTTP ${res.status}${degraded ? " (limited)" : ""}` };
  } catch (err) {
    return { id: check.id, name: check.name, kind: check.kind, ok: false, degraded: false, ms: Date.now() - started, detail: err.name === "AbortError" ? "timeout" : err.message || "network error" };
  }
}

async function testApis() {
  return Promise.all(HEALTH_CHECKS.map(probeOne));
}

async function warmup() {
  try {
    await request("/health", { method: "GET", timeout: WARMUP_TIMEOUT });
  } catch {}
}

module.exports = {
  BASE,
  PLATFORMS,
  PROVIDERS,
  HEALTH_CHECKS,
  allDomains,
  domainMatch,
  hostOf,
  platformFor,
  isSupportedRemotely,
  providersFor,
  bypassWithApis,
  madiumKey,
  apiStatus,
  testApis,
  probeOne,
  warmup,
};
