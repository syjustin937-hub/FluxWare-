const apis = require("../apis");

async function runBypass(service, url, onStep = () => {}) {
  if (!service) return { success: false, result: "unsupported service" };
  return apis.bypassWithApis(url, onStep);
}

async function backendStatus() {
  return { apis: await apis.apiStatus() };
}

async function testAll() {
  const started = Date.now();
  const items = await apis.testApis();
  const total = items.length;
  const online = items.filter((x) => x.ok).length;
  const degraded = items.filter((x) => !x.ok && x.degraded).length;
  const offline = total - online - degraded;
  const weighted = online + degraded * 0.5;

  return {
    items,
    total,
    online,
    degraded,
    offline,
    score: total ? Math.round((weighted / total) * 100) : 0,
    seconds: ((Date.now() - started) / 1000).toFixed(2),
  };
}

module.exports = { runBypass, backendStatus, testAll };
