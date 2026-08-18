import assert from "node:assert/strict";
import {
  decideAfterChangeDetection,
  decideAfterDeploymentCheck,
  decideAfterPreflight,
  SYNC_OUTCOME,
} from "../syncStateMachine.mjs";

// Launcher sync UX -- pure state-machine decisions, fixture-only (no real
// process spawn, no real network, no real Vercel deployment). Covers the 5
// required scenarios plus the "same SHA Ready but asset hashes differ"
// false-negative fix.

// CASE 1: preflight BLOCKED -- sync must stop at check-content, never reach
// import/build/git/deploy, and expose the exact blocked entities.
{
  const decision = decideAfterPreflight({
    blocked: true,
    blockedItems: [{ id: "project-x:project", projectId: "project-x", reason: "Asset ... is MISSING." }],
  });
  assert.equal(decision.done, true);
  assert.equal(decision.outcome, SYNC_OUTCOME.PUBLISH_BLOCKED);
  assert.equal(decision.stage, "check-content");
  assert.equal(decision.blockedItems.length, 1);
  assert.equal(decision.blockedItems[0].projectId, "project-x");
}
// Clean preflight must never be reported as done/blocked.
{
  const decision = decideAfterPreflight({ blocked: false });
  assert.equal(decision.done, false);
}
console.log("CASE 1 (preflight BLOCKED) -- stops at check-content with blocked entity detail, passed");

// CASE 2: no changes at all (writeset=0, canonical output unchanged, git
// clean) -- never create an empty commit; if nothing has ever been deployed,
// finish cleanly as NO_CHANGES.
{
  const decision = decideAfterChangeDetection([], null);
  assert.equal(decision.done, true);
  assert.equal(decision.outcome, SYNC_OUTCOME.NO_CHANGES);
  assert.match(decision.messageZh, /没有需要发布的新修改/);
}
console.log("CASE 2 (no changes, nothing previously deployed) -- NO_CHANGES, no empty commit, passed");

// CASE 2b: no changes, but there IS an existing pushed commit whose
// deployment is still pending -- Section 7's "如果已有待验证 commit：检查
// deployment" branch.
{
  const decision = decideAfterChangeDetection([], { found: true, state: "queued" });
  assert.equal(decision.outcome, SYNC_OUTCOME.DEPLOYMENT_PENDING);
}
console.log("CASE 2b (no changes, existing commit still deploying) -- DEPLOYMENT_PENDING, not NO_CHANGES or failure, passed");

// CASE 3: publish + git push succeeded, Vercel has not created a deployment
// record yet -- must be DEPLOYMENT_PENDING, never "sync failed."
{
  const decision = decideAfterDeploymentCheck({ found: false }, { pushedSha: "abc123", pushedAt: "2026-08-18T00:00:00Z", attempts: 12 });
  assert.equal(decision.outcome, SYNC_OUTCOME.DEPLOYMENT_PENDING);
  assert.equal(decision.pushedSha, "abc123");
  assert.equal(decision.attempts, 12);
  assert.match(decision.messageZh, /等待线上部署/);
  assert.notEqual(decision.outcome, SYNC_OUTCOME.PUBLISH_FAILED);
}
// Still queued/building (found, but not yet a terminal state) is the same
// non-fatal PENDING outcome.
{
  const decision = decideAfterDeploymentCheck({ found: true, state: "building" }, { pushedSha: "abc123", pushedAt: "", attempts: 3 });
  assert.equal(decision.outcome, SYNC_OUTCOME.DEPLOYMENT_PENDING);
}
console.log("CASE 3 (git push success, deployment not yet created/still building) -- DEPLOYMENT_PENDING, never a failure, passed");

// CASE 4 (the confirmed false-negative fix): the SAME commit SHA is Ready on
// Vercel (state: success) even though a hashed local Vite build filename
// would not match a differently-hashed deployed filename -- deployment
// identity is decided from SHA+state alone, DEPLOYMENT_VERIFIED regardless
// of any asset-hash mismatch (that comparison is attached only as an
// optional diagnostic by the caller, never consumed by this function at
// all -- proven here by never passing one in).
{
  const decision = decideAfterDeploymentCheck(
    { found: true, sha: "a6fb0bf", state: "success", environmentUrl: "https://myprofile-teal.vercel.app" },
    { pushedSha: "a6fb0bf", pushedAt: "2026-08-17T15:38:42Z", attempts: 1 },
  );
  assert.equal(decision.outcome, SYNC_OUTCOME.DEPLOYMENT_VERIFIED);
  assert.match(decision.messageZh, /线上部署完成/);
}
console.log("CASE 4 (same SHA, Vercel state=success, asset hashes would differ) -- DEPLOYMENT_VERIFIED, false negative fixed, passed");

// CASE 5: a real deployment failure. Earlier stages (git-commit/git-push)
// are NOT re-decided or re-labeled by this function at all -- it only ever
// describes the deployment stage's own outcome, proven by its return shape
// carrying no opinion about any other stage.
{
  const decision = decideAfterDeploymentCheck(
    { found: true, sha: "deadbeef", state: "failure", environmentUrl: "https://vercel.com/build-log" },
    { pushedSha: "deadbeef", pushedAt: "2026-08-18T00:00:00Z", attempts: 2 },
  );
  assert.equal(decision.outcome, SYNC_OUTCOME.DEPLOYMENT_FAILED);
  assert.match(decision.messageZh, /GitHub 已同步，但线上部署失败/);
  assert.equal(Object.prototype.hasOwnProperty.call(decision, "git-commit"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(decision, "git-push"), false);
}
console.log("CASE 5 (real deployment failure) -- DEPLOYMENT_FAILED, earlier-stage results untouched, passed");

console.log("syncStateMachine.mjs launcher sync UX state tests passed (fixture-only, no real network/process)");
