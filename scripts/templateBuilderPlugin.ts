import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import {
  transformWithEsbuild,
  type Plugin,
  type ViteDevServer,
} from "vite";

const sourceEndpoint = "/__local-templates/source";
const previewEndpoint = "/__local-templates/preview";
const saveEndpoint = "/__local-templates/save";
const maximumRequestBytes = 2 * 1024 * 1024;
const previewFilePrefix = "__TemplatePreview";

function isLocalRequest(req: IncomingMessage) {
  const address = req.socket.remoteAddress ?? "";
  const host = req.headers.host ?? "";
  const origin = req.headers.origin ?? "";
  return (
    (address === "::1"
      || address === "127.0.0.1"
      || address === "::ffff:127.0.0.1")
    && /^localhost:5173$/i.test(host)
    && (origin === "" || origin === "http://localhost:5173")
  );
}

function sendJson(res: ServerResponse, status: number, payload: object) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.length;
    if (total > maximumRequestBytes) {
      throw new Error("Template source exceeds the local size limit.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const FILE_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*Template$/;

function validateFileName(value: unknown) {
  if (typeof value !== "string" || !FILE_NAME_PATTERN.test(value)) {
    throw new Error(
      'Template file name must be PascalCase and end in "Template".',
    );
  }
  return value;
}

function validateCode(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Template code is empty.");
  }
  return value;
}

function validatePreviewKey(value: unknown) {
  if (
    typeof value !== "string"
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  ) {
    throw new Error("Template preview requires a stable kebab-case key.");
  }
  return value;
}

function templatePath(root: string, fileName: string) {
  return path.join(root, "src", "templates", `${fileName}.tsx`);
}

async function validateTsx(code: string, filePath: string) {
  await transformWithEsbuild(code, filePath, {
    loader: "tsx",
    jsx: "automatic",
    sourcemap: false,
  });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function createBackup(root: string, fileName: string, filePath: string) {
  try {
    await fs.access(filePath);
  } catch {
    return undefined;
  }
  const backupDir = path.join(root, ".template-backups", "templates");
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `${fileName}-${timestamp()}.tsx`,
  );
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

async function compileSavedModule(
  server: ViteDevServer,
  fileName: string,
) {
  const requestPath = `/src/templates/${fileName}.tsx?t=${Date.now()}`;
  const result = await server.transformRequest(requestPath);
  if (!result) {
    throw new Error("Vite could not compile the saved template.");
  }
}

export function templateBuilderPlugin(): Plugin {
  let root = process.cwd();

  return {
    name: "local-template-builder",
    apply: "serve",
    configResolved(config) {
      root = config.root;
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(sourceEndpoint, async (req, res, next) => {
        if (req.method !== "GET") return next();
        if (!isLocalRequest(req)) {
          sendJson(res, 403, {
            error: "Template source is available only on localhost:5173.",
          });
          return;
        }
        try {
          const url = new URL(req.url ?? "", "http://localhost:5173");
          const fileName = validateFileName(url.searchParams.get("fileName"));
          const filePath = templatePath(root, fileName);
          const code = await fs.readFile(filePath, "utf8");
          sendJson(res, 200, {
            fileName,
            filePath: path.relative(root, filePath),
            code,
          });
        } catch (error) {
          sendJson(res, 400, {
            error:
              error instanceof Error
                ? error.message
                : "Unable to read template source.",
          });
        }
      });

      server.middlewares.use(previewEndpoint, async (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!isLocalRequest(req)) {
          sendJson(res, 403, {
            error: "Template preview is available only on localhost:5173.",
          });
          return;
        }
        try {
          const payload = await readJsonBody(req);
          const previewKey = validatePreviewKey(
            (payload as { previewKey?: unknown } | null)?.previewKey,
          );
          const code = validateCode(
            (payload as { code?: unknown } | null)?.code,
          );
          const previewFileName =
            `${previewFilePrefix}_${previewKey.replaceAll("-", "_")}`;
          const previewPath = templatePath(root, previewFileName);
          await validateTsx(code, previewPath);
          let existingCode: string | undefined;
          try {
            existingCode = await fs.readFile(previewPath, "utf8");
          } catch {
            existingCode = undefined;
          }
          // previewPath is excluded from Vite's dev-server watcher (see
          // server.watch.ignored in vite.config.ts) — that's what actually
          // stops a write here from ever triggering Fast Refresh's
          // full-reload fallback. This comparison is just to avoid a
          // pointless disk write when the content hasn't actually changed.
          if (existingCode !== code) {
            await fs.writeFile(previewPath, code, "utf8");
          }
          await compileSavedModule(server, previewFileName);
          const revision = String(Date.now());
          sendJson(res, 200, {
            revision,
            moduleUrl:
              `/src/templates/${previewFileName}.tsx?preview=${revision}`,
          });
        } catch (error) {
          sendJson(res, 400, {
            error:
              error instanceof Error
                ? error.message
                : "Unable to compile template preview.",
          });
        }
      });

      server.middlewares.use(saveEndpoint, async (req, res, next) => {
        if (req.method !== "POST") return next();
        if (!isLocalRequest(req)) {
          sendJson(res, 403, {
            error: "Saving templates is available only on localhost:5173.",
          });
          return;
        }

        let filePath = "";
        let backupPath: string | undefined;
        let previousCode: string | undefined;

        try {
          const payload = await readJsonBody(req);
          const candidate = payload as {
            fileName?: unknown;
            code?: unknown;
            saveAs?: unknown;
          };
          const fileName = validateFileName(candidate?.fileName);
          const code = validateCode(candidate?.code);
          const saveAs = candidate?.saveAs === true;
          filePath = templatePath(root, fileName);

          if (saveAs) {
            try {
              await fs.access(filePath);
              throw new Error(
                `${fileName}.tsx already exists. Choose another template ID.`,
              );
            } catch (error) {
              if (
                error instanceof Error
                && !("code" in error && error.code === "ENOENT")
              ) {
                throw error;
              }
            }
          }

          await validateTsx(code, filePath);
          try {
            previousCode = await fs.readFile(filePath, "utf8");
          } catch {
            previousCode = undefined;
          }
          backupPath = await createBackup(root, fileName, filePath);

          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, code, "utf8");

          try {
            await compileSavedModule(server, fileName);
          } catch (error) {
            if (previousCode !== undefined) {
              await fs.writeFile(filePath, previousCode, "utf8");
            } else {
              await fs.rm(filePath, { force: true });
            }
            throw error;
          }

          sendJson(res, 200, {
            fileName,
            filePath: path.relative(root, filePath),
            backupPath: backupPath
              ? path.relative(root, backupPath)
              : undefined,
          });
        } catch (error) {
          sendJson(res, 400, {
            error:
              error instanceof Error
                ? error.message
                : "Unable to save the template.",
            backupPath: backupPath
              ? path.relative(root, backupPath)
              : undefined,
          });
        }
      });
    },
  };
}
