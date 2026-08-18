import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { finalizePublishReport } from "./publishing-report-lib.mjs";
import { compareLocalAssetsToProduction, findDeploymentForSha } from "./publishing/deploymentStatus.mjs";
import { emitOutcome, emitProgress } from "./publishing/syncProgress.mjs";
import { decideAfterChangeDetection, decideAfterDeploymentCheck, decideAfterPreflight, SYNC_OUTCOME } from "./publishing/syncStateMachine.mjs";

const OFFICIAL_ROOT = path.resolve("D:/myprofilegit/myprofile");
const PRODUCTION_URL = "https://myprofile-teal.vercel.app";
const VERCEL_DASHBOARD = "https://vercel.com/myprofile2/myprofile";
const GITHUB_OWNER = "daddebug";
const GITHUB_REPO = "myprofile";
const LARGE_FILE_LIMIT = 50 * 1024 * 1024;
const command = process.argv[2] ?? "check";
const bundleArgument = process.argv.slice(3).find((argument) => argument !== "--");
const bundlePath = bundleArgument ? path.resolve(bundleArgument) : "";
const canonicalPublishOutputs = [
  "src/data/publishedPortfolio.json",
  "src/data/uiPracticeMetadata.json",
];
const canonicalWebsiteRootFiles = new Set([
  ".gitignore",
  "CHANGELOG.md",
  "CLAUDE.md",
  "DAILY_WORKFLOW.md",
  "DEPLOYMENT.md",
  "PROJECT_STATUS.md",
  "TASKS.md",
  "index.html",
  "package.json",
  "pnpm-lock.yaml",
  "postcss.config.js",
  "tailwind.config.ts",
  "tsconfig.app.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vercel.json",
  "vite.config.ts",
]);
const canonicalWebsitePrefixes = ["docs/", "scripts/", "skills/", "src/"];

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  if (command === "launcher-preflight" || command === "launcher-publish" || command === "launcher-recheck-deployment") throw new Error(message);
  process.exit(1);
}

function run(program, args, options = {}) {
  const runPackageManagerThroughNode = program === "pnpm" && Boolean(process.env.npm_execpath);
  const executable = runPackageManagerThroughNode ? process.execPath : program;
  const packageManagerIsPnpm = /pnpm/i.test(path.basename(process.env.npm_execpath ?? ""));
  const commandArgs = runPackageManagerThroughNode
    ? [process.env.npm_execpath, ...(packageManagerIsPnpm ? args : ["run", ...args])]
    : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: OFFICIAL_ROOT,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
  if (result.error) fail(`${program} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${program} ${args.join(" ")} failed. Nothing was committed or pushed.`);
}

// Non-throwing sibling of run() -- returns the real exit status instead of
// calling fail()/throwing, so the launcher sync pipeline can attribute a
// failure to its own specific stage (Section 9: one message per layer)
// instead of every failure unwinding through the same generic catch.
function runCapturingStatus(program, args) {
  const runPackageManagerThroughNode = program === "pnpm" && Boolean(process.env.npm_execpath);
  const executable = runPackageManagerThroughNode ? process.execPath : program;
  const packageManagerIsPnpm = /pnpm/i.test(path.basename(process.env.npm_execpath ?? ""));
  const commandArgs = runPackageManagerThroughNode
    ? [process.env.npm_execpath, ...(packageManagerIsPnpm ? args : ["run", ...args])]
    : args;
  const result = spawnSync(executable, commandArgs, { cwd: OFFICIAL_ROOT, encoding: "utf8", stdio: "inherit" });
  return result.status ?? 1;
}

function capture(program, args) {
  try {
    return execFileSync(program, args, { cwd: OFFICIAL_ROOT, encoding: "utf8" }).trim();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function assertOfficialDirectory() {
  const cwd = path.resolve(process.cwd());
  if (cwd.toLowerCase() !== OFFICIAL_ROOT.toLowerCase()) {
    fail(`Run this command from ${OFFICIAL_ROOT}. Current directory: ${cwd}`);
  }
  const branch = capture("git", ["branch", "--show-current"]);
  if (branch !== "main") fail(`Daily publishing is restricted to main. Current branch: ${branch || "detached HEAD"}`);
}

function changedFiles() {
  const output = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: OFFICIAL_ROOT, encoding: "utf8" }).trimEnd();
  if (!output) return [];
  return output.split(/\r?\n/).map((line) => line.slice(3).trim()).filter(Boolean);
}

function stagedFiles() {
  const output = capture("git", ["diff", "--cached", "--name-only"]);
  return output ? output.split(/\r?\n/).map((file) => file.trim()).filter(Boolean) : [];
}

function isCanonicalPublishOutput(file) {
  const normalized = file.replaceAll("\\", "/");
  return canonicalPublishOutputs.includes(normalized) || normalized.startsWith("public/images/published/");
}

function isCanonicalWebsiteFile(file) {
  const normalized = file.replaceAll("\\", "/");
  return isCanonicalPublishOutput(normalized)
    || canonicalWebsiteRootFiles.has(normalized)
    || canonicalWebsitePrefixes.some((prefix) => normalized.startsWith(prefix));
}

function assertLauncherHasOnlyCanonicalWebsiteChanges(files) {
  const unrelated = files.filter((file) => !isCanonicalWebsiteFile(file));
  if (unrelated.length) {
    fail(`Sync is blocked because these changes are outside the canonical website implementation and publishing output:\n- ${unrelated.join("\n- ")}\nReview them separately before using DILIDA DESK sync.`);
  }
}

function assertLauncherHasNoUnrelatedStagedFiles() {
  const unrelated = stagedFiles().filter((file) => !isCanonicalWebsiteFile(file));
  if (unrelated.length) {
    fail(`Sync is blocked because unrelated files are already staged for commit:\n- ${unrelated.join("\n- ")}\nUnstage or commit those files separately before using DILIDA DESK sync.`);
  }
}

function requireBundlePath() {
  if (!bundlePath) fail("Choose a fresh EXPORT FOR PUBLISH JSON before syncing.");
  try {
    if (!statSync(bundlePath).isFile()) fail(`The selected production export does not exist: ${bundlePath}`);
  } catch {
    fail(`The selected production export does not exist: ${bundlePath}`);
  }
}

async function inspectChangedFiles(files) {
  const unsafePatterns = [
    /(^|\/)\.env(?:\.|$)/i,
    /(^|\/)node_modules(\/|$)/i,
    /(^|\/)dist(\/|$)/i,
    /(^|\/)\.local-backups(\/|$)/i,
    /(^|\/)\.unity-upload(\/|$)/i,
    /public\/games\/afterwarm\/Build\/tem\.(?:data|framework\.js|wasm)\.br$/i,
    /indexeddb.*export/i,
  ];
  const unsafe = files.filter((file) => unsafePatterns.some((pattern) => pattern.test(file.replaceAll("\\", "/"))));
  const oversized = [];
  for (const file of files) {
    try {
      const info = await stat(path.join(OFFICIAL_ROOT, file));
      if (info.isFile() && info.size > LARGE_FILE_LIMIT) oversized.push(`${file} (${(info.size / 1024 / 1024).toFixed(1)} MB)`);
    } catch {
      // Deleted files have no current size and are shown in git status for review.
    }
  }
  if (unsafe.length || oversized.length) {
    fail([
      unsafe.length ? `Unsafe or private paths detected:\n- ${unsafe.join("\n- ")}` : "",
      oversized.length ? `Files over 50 MB detected:\n- ${oversized.join("\n- ")}` : "",
    ].filter(Boolean).join("\n"));
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function scanBuild() {
  const dist = path.join(OFFICIAL_ROOT, "dist");
  const textExtensions = new Set([".html", ".js", ".css", ".json", ".txt", ".svg", ".xml"]);
  const checks = [
    ["canonical local development URL", /https?:\/\/(?:localhost|127\.0\.0\.1):5173/i],
    ["blob URL", /blob:(?:https?:|null|\/)/i],
    ["file URL", /file:\/\//i],
    ["Windows absolute path", /(?:^|["'\s(])[A-Za-z]:\\[^"'\s)]+/m],
    ["production edit control", /EDIT CONTENT|EXPORT FOR PUBLISH/],
  ];
  const findings = [];
  for (const file of await walk(dist)) {
    if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
    const relativeFile = path.relative(OFFICIAL_ROOT, file).replaceAll("\\", "/");
    const text = await readFile(file, "utf8");
    for (const [label, pattern] of checks) {
      if (label === "file URL" && relativeFile.startsWith("dist/games/afterwarm/")) continue;
      if (pattern.test(text)) findings.push(`${label}: ${path.relative(OFFICIAL_ROOT, file)}`);
    }
  }
  if (findings.length) fail(`Production build safety scan failed:\n- ${findings.join("\n- ")}`);
  console.log("Production build scan passed: no local URLs, blob/file URLs, Windows paths, or editing controls detected.");
}

async function runChecks() {
  assertOfficialDirectory();
  const files = changedFiles();
  console.log("\nGit status:");
  console.log(capture("git", ["status", "--short"]) || "  clean");
  await inspectChangedFiles(files);
  console.log("\nRunning typecheck...");
  run("pnpm", ["typecheck"]);
  console.log("\nRunning production build...");
  run("pnpm", ["build"]);
  await scanBuild();
  return files;
}

// Kept for the standalone `pnpm portfolio:verify` / `publish` commands
// (manual, non-launcher use) exactly as before -- hashed-asset-filename
// comparison as the sole gate, with its own throw-on-mismatch/timeout
// behavior. The launcher pipeline (launcherPublish below) no longer uses
// this function to decide success -- see deploymentStatus.mjs's own header
// comment for why (a confirmed false negative: commit a6fb0bf was Ready on
// Vercel, matching SHA, alias correctly pointed at it, and this exact
// comparison still reported failure because two builds of unrelated commits
// can happen to reference differently-hashed filenames with no relationship
// to which commit is actually deployed).
async function verifyProduction() {
  const localIndex = await readFile(path.join(OFFICIAL_ROOT, "dist", "index.html"), "utf8");
  const expectedAssets = [...localIndex.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]).sort();
  if (!expectedAssets.length) fail("The fresh production build does not reference any hashed assets.");

  const deploymentDeadline = Date.now() + 3 * 60 * 1000;
  let deployedAssets = [];
  while (Date.now() < deploymentDeadline) {
    try {
      const response = await fetch(`${PRODUCTION_URL}/zh?deployment-check=${Date.now()}`, {
        redirect: "follow",
        headers: { "cache-control": "no-cache" },
      });
      if (response.ok) {
        const html = await response.text();
        deployedAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]).sort();
        if (JSON.stringify(deployedAssets) === JSON.stringify(expectedAssets)) break;
      }
    } catch {
      // Vercel may briefly be unavailable while the new deployment becomes ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (JSON.stringify(deployedAssets) !== JSON.stringify(expectedAssets)) {
    fail(`Production is not serving the fresh local build.\nExpected assets:\n- ${expectedAssets.join("\n- ")}\nDeployed assets:\n- ${deployedAssets.join("\n- ") || "none"}`);
  }

  const routes = [
    "/zh",
    "/en",
    "/zh/work",
    "/zh/play",
    "/zh/work/from-theme-to-playable-rule",
    "/zh/work/interaction-profile-agent",
  ];
  const failures = [];
  for (const route of routes) {
    try {
      const response = await fetch(`${PRODUCTION_URL}${route}`, { redirect: "follow" });
      if (!response.ok) failures.push(`${route}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) fail(`Production verification failed:\n- ${failures.join("\n- ")}`);
  console.log(`Production serves the fresh build assets and all required routes respond: ${PRODUCTION_URL}`);
  console.log(`Deployment dashboard: ${VERCEL_DASHBOARD}`);
}

async function publish() {
  const files = await runChecks();
  if (!files.length) {
    console.log("\nNo source changes to publish.");
    return;
  }

  console.log("\nFiles proposed for commit:");
  files.forEach((file) => console.log(`  ${file}`));
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("\nCommit these reviewed files and push to origin/main? Type PUBLISH to continue: ");
  prompt.close();
  if (answer.trim() !== "PUBLISH") {
    console.log("Cancelled. No commit or push was performed.");
    return;
  }

  run("git", ["add", "--all"]);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
  run("git", ["commit", "-m", `Update portfolio ${date}`]);
  run("git", ["push", "origin", "main"]);
  console.log("\nPush completed. GitHub has triggered the linked Vercel deployment.");
  console.log(`Deployment dashboard: ${VERCEL_DASHBOARD}`);
  console.log("Run pnpm portfolio:verify after Vercel reports Ready.");
}

async function launcherPreflight() {
  emitProgress("prepare", "running", "准备发布");
  assertOfficialDirectory();
  requireBundlePath();
  const files = changedFiles();
  assertLauncherHasNoUnrelatedStagedFiles();
  assertLauncherHasOnlyCanonicalWebsiteChanges(files);
  await inspectChangedFiles(files);
  emitProgress("prepare", "success", "准备完成");

  emitProgress("check-content", "running", "正在检查发布内容");
  const status = runCapturingStatus("pnpm", ["portfolio:import", "--", bundlePath]);
  const report = await readLauncherReport();
  const decision = decideAfterPreflight({
    blocked: status !== 0 || report?.outcome === "blocked",
    blockedItems: report?.items?.filter((item) => item.status === "BLOCKED") ?? [],
  });
  if (decision.done) {
    emitProgress("check-content", "error", decision.messageZh, { blockedItems: decision.blockedItems });
    emitOutcome(decision);
    return decision;
  }
  emitProgress("check-content", "success", "发布内容检查通过");
  const result = { outcome: SYNC_OUTCOME.LOCAL_PUBLISH_SUCCESS, stage: "check-content", messageZh: "预检查通过，未写入任何生产文件" };
  emitOutcome(result);
  return result;
}

async function readLauncherReport() {
  try {
    return JSON.parse(await readFile(path.join(OFFICIAL_ROOT, "output", "publishing-launcher-report.json"), "utf8"));
  } catch {
    return null;
  }
}

// Bounded poll for the pushed commit's own deployment record -- never an
// unbounded/indefinite wait, and every attempt emits a progress event with
// elapsed time + attempt count + whatever deployment state is currently
// known, so a consuming UI never has to render a black screen while this
// runs (Section 3/6 of the launcher UX spec).
async function pollDeployment(sha, { intervalMs = 10000, maxAttempts = 12 } = {}) {
  let attempts = 0;
  let lastCheck = { found: false };
  while (attempts < maxAttempts) {
    attempts += 1;
    lastCheck = await findDeploymentForSha({ owner: GITHUB_OWNER, repo: GITHUB_REPO, sha });
    emitProgress("await-deployment", "running", "正在等待 Vercel 部署……", {
      pushedSha: sha,
      attempts,
      elapsedSeconds: Math.round((attempts * intervalMs) / 1000),
      deploymentState: lastCheck.found ? lastCheck.state : "not-found",
    });
    if (lastCheck.found && (lastCheck.state === "success" || lastCheck.state === "failure" || lastCheck.state === "error")) break;
    if (attempts < maxAttempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { lastCheck, attempts };
}

async function failStage(stage, messageZh, extra = {}) {
  emitProgress(stage, "error", messageZh);
  const result = { outcome: SYNC_OUTCOME.PUBLISH_FAILED, stage, messageZh, ...extra };
  emitOutcome(result);
  await finalizePublishReport({ root: OFFICIAL_ROOT, outcome: "failed", error: messageZh });
  return result;
}

async function launcherPublish() {
  emitProgress("prepare", "running", "准备发布");
  try {
    assertOfficialDirectory();
    requireBundlePath();
    const beforeImport = changedFiles();
    assertLauncherHasNoUnrelatedStagedFiles();
    assertLauncherHasOnlyCanonicalWebsiteChanges(beforeImport);
    await inspectChangedFiles(beforeImport);
  } catch (error) {
    return failStage("prepare", "准备发布失败", { error: error instanceof Error ? error.message : String(error) });
  }
  emitProgress("prepare", "success", "准备完成");

  emitProgress("check-content", "running", "正在检查发布内容");
  const preflightStatus = runCapturingStatus("pnpm", ["portfolio:import", "--", bundlePath]);
  const preflightReport = await readLauncherReport();
  const preflightDecision = decideAfterPreflight({
    blocked: preflightStatus !== 0 || preflightReport?.outcome === "blocked",
    blockedItems: preflightReport?.items?.filter((item) => item.status === "BLOCKED") ?? [],
  });
  if (preflightDecision.done) {
    emitProgress("check-content", "error", preflightDecision.messageZh, { blockedItems: preflightDecision.blockedItems });
    emitOutcome(preflightDecision);
    await finalizePublishReport({ root: OFFICIAL_ROOT, outcome: "failed", error: "PUBLISH_BLOCKED" });
    return preflightDecision;
  }
  emitProgress("check-content", "success", "发布内容检查通过");

  emitProgress("write-data", "running", "正在写入发布数据");
  if (runCapturingStatus("pnpm", ["portfolio:import", "--", bundlePath, "--confirm"]) !== 0) {
    return failStage("write-data", "写入发布数据失败");
  }
  emitProgress("write-data", "success", "发布数据已写入");

  const changedAfterImport = changedFiles();
  try {
    assertLauncherHasOnlyCanonicalWebsiteChanges(changedAfterImport);
    assertLauncherHasNoUnrelatedStagedFiles();
  } catch (error) {
    return failStage("write-data", "发布数据校验失败", { error: error instanceof Error ? error.message : String(error) });
  }
  const files = changedAfterImport.filter(isCanonicalWebsiteFile);

  emitProgress("typecheck", "running", "正在进行类型检查");
  if (runCapturingStatus("pnpm", ["typecheck"]) !== 0) return failStage("typecheck", "类型检查失败");
  emitProgress("typecheck", "success", "类型检查通过");

  emitProgress("build", "running", "正在进行生产构建");
  if (runCapturingStatus("pnpm", ["build"]) !== 0) return failStage("build", "Production build 失败");
  try {
    await scanBuild();
  } catch (error) {
    return failStage("build", "Production build 安全检查失败", { error: error instanceof Error ? error.message : String(error) });
  }
  emitProgress("build", "success", "生产构建完成");

  // Section 7: writeset was empty / canonical output unchanged -- never
  // fabricate an empty commit to "confirm" a status. Check the already
  // -pushed HEAD's own deployment instead.
  if (!files.length) {
    emitProgress("git-commit", "success", "没有需要发布的新修改");
    emitProgress("git-push", "success", "没有需要发布的新修改");
    const headSha = capture("git", ["rev-parse", "HEAD"]);
    const deploymentCheck = await findDeploymentForSha({ owner: GITHUB_OWNER, repo: GITHUB_REPO, sha: headSha });
    const decision = decideAfterChangeDetection([], deploymentCheck.found ? deploymentCheck : null);
    const status = decision.outcome === SYNC_OUTCOME.DEPLOYMENT_FAILED ? "error" : decision.outcome === SYNC_OUTCOME.DEPLOYMENT_PENDING ? "warning" : "success";
    emitProgress("verify-production", status, decision.messageZh, { deploymentCheck });
    const result = { ...decision, pushedSha: headSha };
    emitOutcome(result);
    await finalizePublishReport({ root: OFFICIAL_ROOT, outcome: "published" });
    return result;
  }

  emitProgress("git-commit", "running", "正在提交");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
  if (runCapturingStatus("git", ["add", "--", ...files]) !== 0 || runCapturingStatus("git", ["commit", "-m", `Update portfolio ${date}`]) !== 0) {
    return failStage("git-commit", "Git 提交失败");
  }
  const commitSha = capture("git", ["rev-parse", "HEAD"]);
  emitProgress("git-commit", "success", "已提交", { commit: commitSha });

  emitProgress("git-push", "running", "正在推送到 GitHub");
  if (runCapturingStatus("git", ["push", "origin", "main"]) !== 0) {
    return failStage("git-push", "GitHub 推送失败", { commit: commitSha });
  }
  const pushedAt = new Date().toISOString();
  emitProgress("git-push", "success", "已同步到 GitHub", { commit: commitSha });

  emitProgress("await-deployment", "running", "正在等待 Vercel 部署……", { pushedSha: commitSha, pushedAt, attempts: 0 });
  const { lastCheck, attempts } = await pollDeployment(commitSha);
  const deploymentDecision = decideAfterDeploymentCheck(lastCheck, { pushedSha: commitSha, pushedAt, attempts });

  if (deploymentDecision.outcome === SYNC_OUTCOME.DEPLOYMENT_PENDING) {
    emitProgress("await-deployment", "warning", deploymentDecision.messageZh, deploymentDecision);
    emitOutcome(deploymentDecision);
    // Publishing + push already succeeded -- this is not a publish failure.
    await finalizePublishReport({ root: OFFICIAL_ROOT, outcome: "published" });
    return deploymentDecision;
  }
  if (deploymentDecision.outcome === SYNC_OUTCOME.DEPLOYMENT_FAILED) {
    emitProgress("await-deployment", "error", deploymentDecision.messageZh, deploymentDecision);
    emitOutcome(deploymentDecision);
    await finalizePublishReport({ root: OFFICIAL_ROOT, outcome: "failed", error: "Vercel deployment failed" });
    return deploymentDecision;
  }

  // DEPLOYMENT_VERIFIED, decided from the GitHub/Vercel deployment SHA+state
  // alone -- asset-hash comparison is fetched purely as an attached
  // diagnostic below, never as part of the verdict above.
  emitProgress("verify-production", "running", "正在验证线上版本");
  let assetDiagnostic = null;
  try {
    const localIndexHtml = await readFile(path.join(OFFICIAL_ROOT, "dist", "index.html"), "utf8");
    assetDiagnostic = await compareLocalAssetsToProduction({ localIndexHtml, productionUrl: `${PRODUCTION_URL}/zh` });
  } catch {
    // Diagnostic only -- never blocks DEPLOYMENT_VERIFIED.
  }
  emitProgress("verify-production", "success", "线上部署完成", { deploymentCheck: lastCheck, assetDiagnostic });
  const result = { ...deploymentDecision, assetDiagnostic };
  emitOutcome(result);
  await finalizePublishReport({ root: OFFICIAL_ROOT, outcome: "published" });
  return result;
}

// Section 6 (retry): purely read-only. Never exports/imports/typechecks/
// builds/commits/pushes -- only re-checks deployment state for an
// already-pushed commit and reports the same outcome vocabulary as
// launcherPublish's own deployment stage.
async function launcherRecheckDeployment() {
  assertOfficialDirectory();
  const sha = bundleArgument || capture("git", ["rev-parse", "HEAD"]);
  emitProgress("await-deployment", "running", "正在重新检查线上状态", { pushedSha: sha });
  const deploymentCheck = await findDeploymentForSha({ owner: GITHUB_OWNER, repo: GITHUB_REPO, sha });
  const decision = decideAfterDeploymentCheck(deploymentCheck, { pushedSha: sha, pushedAt: "", attempts: 1 });
  const status = decision.outcome === SYNC_OUTCOME.DEPLOYMENT_VERIFIED ? "success" : decision.outcome === SYNC_OUTCOME.DEPLOYMENT_FAILED ? "error" : "warning";
  emitProgress("await-deployment", status, decision.messageZh, decision);
  emitOutcome(decision);
  return decision;
}

if (command === "check") await runChecks();
else if (command === "publish") await publish();
else if (command === "verify") await verifyProduction();
else if (command === "launcher-preflight") {
  try {
    await launcherPreflight();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else if (command === "launcher-publish") {
  try {
    const result = await launcherPublish();
    if (result.outcome === SYNC_OUTCOME.PUBLISH_BLOCKED || result.outcome === SYNC_OUTCOME.PUBLISH_FAILED || result.outcome === SYNC_OUTCOME.DEPLOYMENT_FAILED) {
      process.exitCode = 1;
    }
    // NO_CHANGES / DEPLOYMENT_PENDING / DEPLOYMENT_VERIFIED all exit 0 --
    // a pending deployment is not a sync failure (Section 4/5).
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizePublishReport({ root: OFFICIAL_ROOT, outcome: "failed", error: message });
    console.error(message);
    process.exitCode = 1;
  }
} else if (command === "launcher-recheck-deployment") {
  try {
    const result = await launcherRecheckDeployment();
    if (result.outcome === SYNC_OUTCOME.DEPLOYMENT_FAILED) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
else fail(`Unknown workflow command: ${command}`);
