import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { finalizePublishReport } from "./publishing-report-lib.mjs";

const OFFICIAL_ROOT = path.resolve("D:/myprofilegit/myprofile");
const PRODUCTION_URL = "https://myprofile-teal.vercel.app";
const VERCEL_DASHBOARD = "https://vercel.com/myprofile2/myprofile";
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
  if (command === "launcher-preflight" || command === "launcher-publish") throw new Error(message);
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
  assertOfficialDirectory();
  requireBundlePath();
  const files = changedFiles();
  assertLauncherHasNoUnrelatedStagedFiles();
  assertLauncherHasOnlyCanonicalWebsiteChanges(files);
  await inspectChangedFiles(files);
  console.log("Running the canonical production import dry run...");
  run("pnpm", ["portfolio:import", "--", bundlePath]);
  console.log("Launcher preflight passed. No production files were changed.");
}

async function launcherPublish() {
  assertOfficialDirectory();
  requireBundlePath();
  const beforeImport = changedFiles();
  assertLauncherHasNoUnrelatedStagedFiles();
  assertLauncherHasOnlyCanonicalWebsiteChanges(beforeImport);
  await inspectChangedFiles(beforeImport);

  console.log("Running the canonical production import dry run...");
  run("pnpm", ["portfolio:import", "--", bundlePath]);
  console.log("Applying the confirmed canonical production import...");
  run("pnpm", ["portfolio:import", "--", bundlePath, "--confirm"]);

  const changedAfterImport = changedFiles();
  assertLauncherHasOnlyCanonicalWebsiteChanges(changedAfterImport);
  const files = changedAfterImport.filter(isCanonicalWebsiteFile);
  assertLauncherHasNoUnrelatedStagedFiles();
  await runChecks();
  if (!files.length) {
    console.log("No canonical publishing output changed. Verifying the current production site.");
    await verifyProduction();
    await finalizePublishReport({ root: OFFICIAL_ROOT, outcome: "published" });
    return;
  }

  console.log("\nCanonical website implementation and publishing files proposed for commit:");
  files.forEach((file) => console.log(`  ${file}`));
  run("git", ["add", "--", ...files]);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
  run("git", ["commit", "-m", `Update portfolio ${date}`]);
  run("git", ["push", "origin", "main"]);
  console.log("\nPush completed. Waiting briefly before production verification...");
  await new Promise((resolve) => setTimeout(resolve, 15000));
  await verifyProduction();
  await finalizePublishReport({ root: OFFICIAL_ROOT, outcome: "published" });
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
    await launcherPublish();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finalizePublishReport({ root: OFFICIAL_ROOT, outcome: "failed", error: message });
    console.error(message);
    process.exitCode = 1;
  }
}
else fail(`Unknown workflow command: ${command}`);
