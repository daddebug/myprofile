import assert from "node:assert/strict";
import { compareLocalAssetsToProduction, findDeploymentForSha, findLatestProductionDeployment } from "../deploymentStatus.mjs";

// deploymentStatus.mjs -- read-only GitHub Deployments API wrapper.
// fetchImpl is always injected here; no real network call is ever made by
// this test file.

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}
function textResponse(body, ok = true) {
  return { ok, text: async () => body };
}

// A. Deployment found, state success (mirrors the real, confirmed case:
// commit a6fb0bf, Vercel Ready, matching SHA).
await (async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("/deployments?sha=")) {
      return jsonResponse([{ id: 1, sha: "a6fb0bf", environment: "Production", created_at: "2026-08-17T15:38:42Z", statuses_url: "https://api.github.com/deployments/1/statuses", environment_url: "https://myprofile-teal.vercel.app" }]);
    }
    if (url.includes("/statuses")) {
      return jsonResponse([{ state: "success", environment_url: "https://myprofile-teal.vercel.app" }]);
    }
    throw new Error(`unexpected url: ${url}`);
  };
  const result = await findDeploymentForSha({ owner: "daddebug", repo: "myprofile", sha: "a6fb0bf", fetchImpl });
  assert.equal(result.found, true);
  assert.equal(result.state, "success");
  assert.equal(result.sha, "a6fb0bf");
  assert.equal(calls.length, 2);
})();
console.log("A: deployment found, state=success, passed");

// B. No deployment record at all for this sha (the real 14+ minute PENDING
// case observed for a6fb0bf before Vercel had created a record).
await (async () => {
  const fetchImpl = async () => jsonResponse([]);
  const result = await findDeploymentForSha({ owner: "daddebug", repo: "myprofile", sha: "notyetdeployed", fetchImpl });
  assert.equal(result.found, false);
})();
console.log("B: no deployment record found -- found:false, never throws, passed");

// C. GitHub API itself errors (rate limit, network blip) -- must degrade to
// found:false with a reason, never throw uncaught.
await (async () => {
  const fetchImpl = async () => jsonResponse({}, false, 403);
  const result = await findDeploymentForSha({ owner: "daddebug", repo: "myprofile", sha: "x", fetchImpl });
  assert.equal(result.found, false);
  assert.match(result.reason, /403/);
})();
await (async () => {
  const fetchImpl = async () => { throw new Error("network down"); };
  const result = await findDeploymentForSha({ owner: "daddebug", repo: "myprofile", sha: "x", fetchImpl });
  assert.equal(result.found, false);
  assert.match(result.reason, /network down/);
})();
console.log("C: GitHub API error / network failure -- degrades to found:false, never throws, passed");

// D. Deployment found, state failure.
await (async () => {
  const fetchImpl = async (url) => {
    if (url.includes("?sha=")) return jsonResponse([{ id: 2, sha: "deadbeef", environment: "Production", created_at: "t", statuses_url: "https://x/statuses" }]);
    return jsonResponse([{ state: "failure", environment_url: "https://vercel.com/log" }]);
  };
  const result = await findDeploymentForSha({ owner: "daddebug", repo: "myprofile", sha: "deadbeef", fetchImpl });
  assert.equal(result.found, true);
  assert.equal(result.state, "failure");
  assert.equal(result.environmentUrl, "https://vercel.com/log");
})();
console.log("D: deployment found, state=failure, passed");

// E. compareLocalAssetsToProduction is a pure diagnostic -- returns a
// mismatch cleanly without throwing, and its shape carries no "verified"
// verdict of its own (the caller must never treat `matches:false` as a
// deployment failure).
await (async () => {
  const localIndexHtml = `<script src="/assets/index-LOCAL123.js"></script><link href="/assets/index-LOCAL456.css">`;
  const fetchImpl = async () => textResponse(`<script src="/assets/index-DEPLOYEDXXX.js"></script><link href="/assets/index-DEPLOYEDYYY.css">`);
  const result = await compareLocalAssetsToProduction({ localIndexHtml, productionUrl: "https://myprofile-teal.vercel.app/zh", fetchImpl });
  assert.equal(result.matches, false);
  assert.deepEqual(result.expectedAssets, ["/assets/index-LOCAL123.js", "/assets/index-LOCAL456.css"]);
  assert.deepEqual(result.deployedAssets, ["/assets/index-DEPLOYEDXXX.js", "/assets/index-DEPLOYEDYYY.css"]);
})();
console.log("E: compareLocalAssetsToProduction reports a mismatch as pure data, no throw, passed");

// F. findLatestProductionDeployment -- used only for display, tolerates an
// empty list.
await (async () => {
  const fetchImpl = async () => jsonResponse([{ id: 9, sha: "latest", environment: "Production" }]);
  const result = await findLatestProductionDeployment({ owner: "daddebug", repo: "myprofile", fetchImpl });
  assert.equal(result.sha, "latest");
})();
await (async () => {
  const fetchImpl = async () => jsonResponse([]);
  const result = await findLatestProductionDeployment({ owner: "daddebug", repo: "myprofile", fetchImpl });
  assert.equal(result, null);
})();
console.log("F: findLatestProductionDeployment -- real entry and empty-list cases, passed");

console.log("deploymentStatus.mjs tests passed (fetch always injected, no real network call made)");
