// Launcher sync UX/state model (narrow-scope launcher orchestration
// refactor). Pure decision functions only -- no process spawning, no
// network calls, no file I/O. This is what makes the 5 required scenarios
// testable without a real Vercel deployment or browser: launcherPublish()
// (portfolio-workflow.mjs) calls into these after each real side-effecting
// step and acts on the returned decision; the decisions themselves are
// fully unit-testable with fixture inputs.
//
// Does NOT touch Publishing Architecture V2's own judgment (buildPublishPlan,
// resolveAsset, dirty-intent rules, writeset semantics) -- this module only
// decides what the LAUNCHER should report once V2's own BLOCKED/writeset
// result is already known.

export const SYNC_STAGES = [
  { id: "prepare", labelZh: "准备发布", labelEn: "Preparing" },
  { id: "check-content", labelZh: "检查发布内容", labelEn: "Checking publish content" },
  { id: "write-data", labelZh: "写入发布数据", labelEn: "Writing publish data" },
  { id: "typecheck", labelZh: "类型检查", labelEn: "Type checking" },
  { id: "build", labelZh: "生产构建", labelEn: "Production build" },
  { id: "git-commit", labelZh: "Git 提交", labelEn: "Git commit" },
  { id: "git-push", labelZh: "推送 GitHub", labelEn: "Pushing to GitHub" },
  { id: "await-deployment", labelZh: "等待线上部署", labelEn: "Waiting for deployment" },
  { id: "verify-production", labelZh: "验证线上版本", labelEn: "Verifying production" },
];

export const STAGE_STATUS = /** @type {const} */ (["pending", "running", "success", "warning", "error"]);

export const SYNC_OUTCOME = {
  PUBLISH_BLOCKED: "PUBLISH_BLOCKED",
  PUBLISH_FAILED: "PUBLISH_FAILED",
  NO_CHANGES: "NO_CHANGES",
  LOCAL_PUBLISH_SUCCESS: "LOCAL_PUBLISH_SUCCESS",
  GIT_PUSH_SUCCESS: "GIT_PUSH_SUCCESS",
  DEPLOYMENT_PENDING: "DEPLOYMENT_PENDING",
  DEPLOYMENT_FAILED: "DEPLOYMENT_FAILED",
  DEPLOYMENT_VERIFIED: "DEPLOYMENT_VERIFIED",
};

// Outcomes that must NEVER be reported as a generic launcher "sync failed" --
// they represent a publish that already succeeded locally and on GitHub, just
// not yet (or not verifiably) live. Section 4 of the launcher UX spec: these
// must render as their own distinct, non-error state.
export const NON_FATAL_OUTCOMES = new Set([
  SYNC_OUTCOME.NO_CHANGES,
  SYNC_OUTCOME.GIT_PUSH_SUCCESS,
  SYNC_OUTCOME.DEPLOYMENT_PENDING,
  SYNC_OUTCOME.DEPLOYMENT_VERIFIED,
]);

/**
 * Section 8 (BLOCKED scenario). Pure: given the already-computed V2 plan
 * verdict (from buildPublishPlan.mjs, consumed exactly as report.items/blocked
 * already are elsewhere -- never re-judged here), decide whether the sync
 * must stop at "check-content" without ever reaching import/build/git/deploy.
 * @param {{ blocked: boolean, blockedItems?: Array<{id: string, projectId?: string, reason?: string}> }} preflight
 */
export function decideAfterPreflight(preflight) {
  if (preflight.blocked) {
    return {
      done: true,
      outcome: SYNC_OUTCOME.PUBLISH_BLOCKED,
      stage: "check-content",
      messageZh: "发布内容检查失败",
      blockedItems: preflight.blockedItems ?? [],
    };
  }
  return { done: false };
}

/**
 * Section 7 (no-changes scenario). Pure: given the canonical website files
 * actually changed after a confirmed import (writeset already resolved by
 * V2), decide whether there is anything left to commit. Never creates an
 * empty commit to "confirm" a state -- if there's nothing to commit, the
 * caller must check deployment status for the current HEAD instead, passed
 * in here as `deploymentCheck` (or `null` if the caller didn't have one to
 * check, e.g. this repo has never been deployed at all).
 * @param {string[]} changedCanonicalFiles
 * @param {{ found: boolean, state?: string } | null} deploymentCheck
 */
export function decideAfterChangeDetection(changedCanonicalFiles, deploymentCheck) {
  if (changedCanonicalFiles.length > 0) return { done: false };
  const base = { done: true, stage: "verify-production", messageZh: "没有需要发布的新修改。" };
  if (!deploymentCheck || !deploymentCheck.found) {
    return { ...base, outcome: SYNC_OUTCOME.NO_CHANGES };
  }
  if (deploymentCheck.state === "success") {
    return { ...base, outcome: SYNC_OUTCOME.DEPLOYMENT_VERIFIED, messageZh: "线上部署完成" };
  }
  if (deploymentCheck.state === "failure" || deploymentCheck.state === "error") {
    return { ...base, outcome: SYNC_OUTCOME.DEPLOYMENT_FAILED, messageZh: "Vercel 部署失败", deploymentCheck };
  }
  return { ...base, outcome: SYNC_OUTCOME.DEPLOYMENT_PENDING, messageZh: "内容已同步到 GitHub，正在等待线上部署。", deploymentCheck };
}

/**
 * Sections 3/4/5. Pure: given one deployment-status check result (from
 * scripts/publishing/deploymentStatus.mjs, network I/O done by the caller,
 * never here) for the commit that was just pushed, decide the sync's final
 * (or still-pending) outcome. A deployment genuinely not found yet, or found
 * but still queued/building, is DEPLOYMENT_PENDING -- never an error, never
 * "sync failed" -- Section 4's explicit requirement.
 * @param {{ found: boolean, state?: string, sha?: string, environmentUrl?: string } | null} deploymentCheck
 * @param {{ pushedSha: string, pushedAt: string, attempts: number }} pushInfo
 */
export function decideAfterDeploymentCheck(deploymentCheck, pushInfo) {
  if (!deploymentCheck || !deploymentCheck.found) {
    return {
      outcome: SYNC_OUTCOME.DEPLOYMENT_PENDING,
      stage: "await-deployment",
      messageZh: "内容已同步到 GitHub，正在等待线上部署。",
      pushedSha: pushInfo.pushedSha,
      pushedAt: pushInfo.pushedAt,
      attempts: pushInfo.attempts,
    };
  }
  if (deploymentCheck.state === "success") {
    return {
      outcome: SYNC_OUTCOME.DEPLOYMENT_VERIFIED,
      stage: "verify-production",
      messageZh: "线上部署完成",
      deploymentCheck,
      pushedSha: pushInfo.pushedSha,
    };
  }
  if (deploymentCheck.state === "failure" || deploymentCheck.state === "error") {
    // Section 12, CASE 5: the earlier stages (through git-push) must stay
    // reported as success -- this function only ever describes the
    // deployment stage's own outcome, it never touches or re-emits earlier
    // stage results, so the caller emitting this outcome cannot retroactively
    // mark git-push as failed.
    return {
      outcome: SYNC_OUTCOME.DEPLOYMENT_FAILED,
      stage: "await-deployment",
      messageZh: "GitHub 已同步，但线上部署失败",
      deploymentCheck,
      pushedSha: pushInfo.pushedSha,
    };
  }
  // queued / building / any other in-flight state
  return {
    outcome: SYNC_OUTCOME.DEPLOYMENT_PENDING,
    stage: "await-deployment",
    messageZh: "内容已同步到 GitHub，正在等待线上部署。",
    deploymentCheck,
    pushedSha: pushInfo.pushedSha,
    pushedAt: pushInfo.pushedAt,
    attempts: pushInfo.attempts,
  };
}

// Section 9: one human-facing message per failure layer, never a single
// generic string for every case.
export const LAYER_ERROR_MESSAGES = {
  "check-content": "发布内容检查失败",
  "write-data": "写入发布数据失败",
  typecheck: "类型检查失败",
  build: "Production build 失败",
  "git-commit": "Git 提交失败",
  "git-push": "GitHub 推送失败",
  "await-deployment": "Vercel 部署失败",
  "verify-production": "线上版本验证失败",
};
