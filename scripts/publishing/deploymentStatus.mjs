// Read-only GitHub Deployments API check (Launcher sync UX). Real, proven
// root-cause fix for a confirmed false negative in the old verifier: hashed
// Vite asset filenames were being compared as a proxy for "is the pushed
// commit live," but two different builds of the SAME commit (or a build
// produced on a different machine/timing) are not guaranteed to hash
// identically, and the comparison has no way to distinguish "still
// deploying" from "deployed the wrong thing" -- confirmed on 2026-08-17 by a
// real deployment (commit a6fb0bf) that Vercel's own dashboard showed as
// Ready/Production/matching-SHA while the filename comparison still failed.
//
// The reliable signal is the pushed commit's own SHA against what GitHub's
// Deployments API (populated by Vercel's GitHub integration on every real
// deploy) reports as the Production deployment's sha + state. No auth token
// needed for a public repo -- these are public read endpoints.
//
// Asset-hash comparison is NOT removed -- see compareLocalAssetsToProduction
// below -- it remains available as a secondary diagnostic only, and must
// never gate DEPLOYMENT_VERIFIED on its own (Section 2/3 of the launcher UX
// spec).

const GITHUB_API = "https://api.github.com";

/**
 * @param {{ owner: string, repo: string, sha: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<{ found: boolean, sha?: string, state?: string, deploymentId?: number, createdAt?: string, environmentUrl?: string, reason?: string }>}
 */
export async function findDeploymentForSha({ owner, repo, sha, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/deployments?sha=${sha}&per_page=5`, {
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch (error) {
    return { found: false, reason: error instanceof Error ? error.message : String(error) };
  }
  if (!response.ok) return { found: false, reason: `GitHub API returned ${response.status}` };
  const deployments = await response.json();
  if (!Array.isArray(deployments) || !deployments.length) return { found: false };
  const productionDeployment = deployments.find((d) => d.environment === "Production") ?? deployments[0];

  let latestStatus;
  try {
    const statusesResponse = await fetchImpl(productionDeployment.statuses_url, { headers: { Accept: "application/vnd.github+json" } });
    if (statusesResponse.ok) {
      const statuses = await statusesResponse.json();
      latestStatus = Array.isArray(statuses) ? statuses[0] : undefined; // GitHub returns newest first
    }
  } catch {
    // Deployment record exists even if its statuses can't be fetched right now -- report what we have.
  }

  return {
    found: true,
    sha: productionDeployment.sha,
    deploymentId: productionDeployment.id,
    createdAt: productionDeployment.created_at,
    state: latestStatus?.state ?? "queued",
    environmentUrl: latestStatus?.environment_url ?? productionDeployment.environment_url,
  };
}

/**
 * The most recent Production-environment deployment regardless of sha --
 * used only for display ("production is currently serving commit X") when
 * the target sha's own deployment isn't found yet.
 * @param {{ owner: string, repo: string, fetchImpl?: typeof fetch }} options
 */
export async function findLatestProductionDeployment({ owner, repo, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/deployments?per_page=5`, {
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const deployments = await response.json();
  if (!Array.isArray(deployments)) return null;
  return deployments.find((d) => d.environment === "Production") ?? deployments[0] ?? null;
}

/**
 * Secondary diagnostic only (Section 3) -- never used to decide
 * DEPLOYMENT_VERIFIED. Compares the fresh local build's referenced hashed
 * asset filenames against whatever the production URL is currently serving,
 * purely for human-readable troubleshooting detail alongside the real
 * (SHA-based) deployment verdict.
 * @param {{ localIndexHtml: string, productionUrl: string, fetchImpl?: typeof fetch }} options
 */
export async function compareLocalAssetsToProduction({ localIndexHtml, productionUrl, fetchImpl = fetch }) {
  const expectedAssets = [...localIndexHtml.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]).sort();
  let deployedAssets = [];
  try {
    const response = await fetchImpl(`${productionUrl}?deployment-check=${Date.now()}`, { headers: { "cache-control": "no-cache" } });
    if (response.ok) {
      const html = await response.text();
      deployedAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]).sort();
    }
  } catch {
    // Best-effort diagnostic only -- never throws, never gates the real verdict.
  }
  return { expectedAssets, deployedAssets, matches: JSON.stringify(expectedAssets) === JSON.stringify(deployedAssets) };
}
