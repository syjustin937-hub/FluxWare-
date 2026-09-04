const BASE = (process.env.BYPASS_API_URL || "https://kys.arashi-x.xyz/api/free/bypass").replace(/\/+$/, "");
const TIMEOUT = Number(process.env.BYPASS_API_TIMEOUT || 30000);
const WARMUP_TIMEOUT = Number(process.env.BYPASS_API_WARMUP_TIMEOUT || 10000);

const SUPPORTED_DOMAINS = [
  "link4sub.com",
  "linkunlocker.com",
  "unlk.link",
  "boostylink.com",
  "cutty.io",
  "cuttty.com",
  "cuty.io",
  "boost.ink",
  "boostink.net",
  "bstshrt.com",
  "bstlar.com",
  "mboost.me",
  "ytsubme.com",
  "socialwolvez.com",
  "1nbz.la",
  "rekonise.com",
  "trigonevo.fun",
  "linkzy.space",
  "linkgate.gg",
  "linkify.ru",
  "link-unlock.com",
  "adfoc.us",
  "pastelua",
  "violated.lol",
  "airflowkey.space",
  "bloxhub.click",
  "neoxsoftworks.eu",
  "relzhub.com",
  "haxscripts",
  "axon",
  "weretools",
  "rinku",
  "tpi.li",
  "pastebin.com",
  "paste-drop.com",
  "airflowscript.com",
  "retrivednods",
];

const PLATFORMS = SUPPORTED_DOMAINS.map((domain) => ({
  id: domain.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
  name: domain,
  example: `https://${domain}/`,
  domains: [domain],
}));

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
  return [...new Set(SUPPORTED_DOMAINS)].sort();
}

function platformFor(url) {
  const host = hostOf(url);
  if (!host) return null;
  return PLATFORMS.find((p) => domainMatch(host, p.domains)) || null;
}

function isSupportedRemotely(url) {
  return !!platformFor(url);
}

const PROVIDERS = [{ id: "arashi-api", name: "Arashi Free Bypass API", base: BASE }];

function providersFor(url) {
  return isSupportedRemotely(url) ? PROVIDERS : [];
}

async function request(path = "", { method = "GET", body, timeout = TIMEOUT } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        "user-agent": "FluxWareBot/1.0",
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
    return {
      success: false,
      result: res.text ? String(res.text).slice(0, 1000) : `HTTP ${res.status}`,
    };
  }

  if (data.success === true) {
    const value = data.result || data.url || data.key || data.link || "";
    return {
      success: !!value,
      result: value || "backend returned no result",
      platform: data.platform || null,
      logs: Array.isArray(data.logs) ? data.logs : [],
      tookMs: data.elapsed || data.tookMs,
    };
  }

  if (String(data.status || "").toLowerCase() === "success") {
    const value = data.result || data.url || data.key || data.link || "";
    return {
      success: !!value,
      result: value || "backend returned no result",
      platform: data.platform || null,
      logs: Array.isArray(data.logs) ? data.logs : [],
      tookMs: data.elapsed || data.tookMs,
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
    return { success: false, result: "This domain is not listed as supported by the API.", provider: null };
  }

  onStep(`Platform: ${platform.name}`);
  onStep("Sending the link to Arashi...");

  try {
    const res = await request(`?url=${encodeURIComponent(url)}`, { method: "GET" });
    const result = normalise(res);

    if (result.success) {
      return { ...result, provider: "Arashi" };
    }

    return { success: false, result: result.result, provider: null };
  } catch (err) {
    return {
      success: false,
      result: err.name === "AbortError" ? "API request timed out." : err.message || "network error",
      provider: null,
    };
  }
}

async function apiStatus() {
  try {
    const res = await request(`?url=${encodeURIComponent("https://link4sub.com/")}`, { method: "GET", timeout: 10000 });
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  }
}

const HEALTH_CHECKS = [
  {
    id: "arashi-api",
    name: "Arashi Free Bypass API",
    kind: "api",
    run: () => request(`?url=${encodeURIComponent("https://link4sub.com/")}`, { method: "GET", timeout: 15000 }),
  },
];

async function probeOne(check) {
  const started = Date.now();
  try {
    const res = await check.run();
    const ms = Date.now() - started;
    const ok = res.status > 0 && res.status < 400;
    const degraded = !ok && [400, 401, 402, 403, 422, 429].includes(res.status);
    return {
      id: check.id,
      name: check.name,
      kind: check.kind,
      ok,
      degraded,
      ms,
      detail: `HTTP ${res.status}${degraded ? " (limited)" : ""}`,
    };
  } catch (err) {
    return {
      id: check.id,
      name: check.name,
      kind: check.kind,
      ok: false,
      degraded: false,
      ms: Date.now() - started,
      detail: err.name === "AbortError" ? "timeout" : err.message || "network error",
    };
  }
}

async function testApis() {
  return Promise.all(HEALTH_CHECKS.map(probeOne));
}

async function warmup() {
  try {
    await request(`?url=${encodeURIComponent("https://link4sub.com/")}`, { method: "GET", timeout: WARMUP_TIMEOUT });
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
  apiStatus,
  testApis,
  probeOne,
  warmup,
};
