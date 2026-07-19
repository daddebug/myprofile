import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { list, put } from "@vercel/blob";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(projectRoot, "public/games/afterwarm/Build");
const stagingRoot = resolve(projectRoot, ".unity-upload/afterwarm/0.1.0");
const resultPath = resolve(projectRoot, ".unity-upload-result.env");
const prefix = "unity/afterwarm/0.1.0";
const confirmed = process.argv.includes("--confirm");

const payloads = [
  {
    env: "VITE_UNITY_DATA_URL",
    source: "tem.data.br",
    output: "tem.data",
    contentType: "application/octet-stream",
  },
  {
    env: "VITE_UNITY_FRAMEWORK_URL",
    source: "tem.framework.js.br",
    output: "tem.framework.js",
    contentType: "application/javascript",
  },
  {
    env: "VITE_UNITY_WASM_URL",
    source: "tem.wasm.br",
    output: "tem.wasm",
    contentType: "application/wasm",
  },
];

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

async function inspectSources() {
  const inspected = [];
  for (const payload of payloads) {
    const sourcePath = resolve(sourceRoot, payload.source);
    const sourceStat = await stat(sourcePath).catch(() => null);
    if (!sourceStat?.isFile()) {
      throw new Error(`Required Unity payload is missing: ${sourcePath}`);
    }
    inspected.push({ ...payload, sourcePath, sourceStat });
  }
  return inspected;
}

async function preparePayload(payload) {
  await mkdir(stagingRoot, { recursive: true });
  const outputPath = resolve(stagingRoot, payload.output);
  const temporaryPath = `${outputPath}.partial`;
  const outputStat = await stat(outputPath).catch(() => null);

  if (outputStat?.isFile() && outputStat.mtimeMs >= payload.sourceStat.mtimeMs) {
    return { ...payload, outputPath, outputStat };
  }

  await unlink(temporaryPath).catch(() => undefined);
  console.log(`Decompressing ${payload.source} -> ${payload.output}`);
  await pipeline(
    createReadStream(payload.sourcePath),
    createBrotliDecompress(),
    createWriteStream(temporaryPath),
  );
  await rename(temporaryPath, outputPath);
  return { ...payload, outputPath, outputStat: await stat(outputPath) };
}

async function main() {
  const inspected = await inspectSources();
  console.log("Unity payload source inventory:");
  for (const payload of inspected) {
    console.log(`  ${payload.source}: ${formatBytes(payload.sourceStat.size)}`);
  }

  if (!confirmed) {
    console.log("\nDry run only. No files were decompressed or uploaded.");
    console.log("Create a Vercel Blob store, set BLOB_READ_WRITE_TOKEN, then run:");
    console.log("  pnpm upload:unity -- --confirm");
    return;
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  const storeId = process.env.BLOB_STORE_ID;
  if (!token && !(oidcToken && storeId)) {
    throw new Error(
      "Set BLOB_READ_WRITE_TOKEN, or provide both VERCEL_OIDC_TOKEN and BLOB_STORE_ID, when --confirm is used.",
    );
  }
  const authentication = token ? { token } : { oidcToken, storeId };

  const prepared = [];
  for (const payload of inspected) prepared.push(await preparePayload(payload));

  const existing = await list({ prefix: `${prefix}/`, ...authentication, limit: 1000 });
  const existingByPath = new Map(existing.blobs.map((blob) => [blob.pathname, blob]));
  const urls = new Map();

  for (const payload of prepared) {
    const pathname = `${prefix}/${payload.output}`;
    const existingBlob = existingByPath.get(pathname);
    if (existingBlob?.size === payload.outputStat.size) {
      console.log(`Unchanged, skipping ${pathname} (${formatBytes(payload.outputStat.size)})`);
      urls.set(payload.env, existingBlob.url);
      continue;
    }

    console.log(`Uploading ${pathname} (${formatBytes(payload.outputStat.size)})`);
    let lastPercent = -10;
    const blob = await put(pathname, createReadStream(payload.outputPath), {
      access: "public",
      ...authentication,
      multipart: payload.outputStat.size > 100 * 1024 * 1024,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: payload.contentType,
      cacheControlMaxAge: 31536000,
      onUploadProgress({ percentage }) {
        const rounded = Math.floor(percentage / 10) * 10;
        if (rounded >= lastPercent + 10) {
          lastPercent = rounded;
          console.log(`  ${Math.min(rounded, 100)}%`);
        }
      },
    });
    urls.set(payload.env, blob.url);
  }

  const envText = [
    ...payloads.map((payload) => `${payload.env}=${urls.get(payload.env) ?? ""}`),
    "VITE_UNITY_STREAMING_ASSETS_URL=",
    "",
  ].join("\n");
  await writeFile(resultPath, envText, "utf8");
  console.log(`\nPublic read URLs written to ${resultPath}`);
  console.log("Copy these four VITE_ values into the Vercel project environment settings.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
