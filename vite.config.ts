import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { exactWebExportPlugin } from "./scripts/exactWebExportPlugin";
import { portfolioContentPlugin } from "./scripts/portfolioContentPlugin";
import { portfolioCollectionExportPlugin } from "./scripts/portfolioCollectionExportPlugin";
import { templateBuilderPlugin } from "./scripts/templateBuilderPlugin";

const uiPracticeImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const unityPayloadBuildCopies = [
  "dist/games/afterwarm/Build/tem.data.br",
  "dist/games/afterwarm/Build/tem.framework.js.br",
  "dist/games/afterwarm/Build/tem.wasm.br",
];

function excludeUnityPayloadsFromBuild() {
  return {
    name: "exclude-unity-payloads-from-build",
    apply: "build" as const,
    async closeBundle() {
      const loadNodeModule = new Function("name", "return import(name)") as (name: string) => Promise<any>;
      const fs = await loadNodeModule("node:fs/promises");
      const path = await loadNodeModule("node:path");
      const url = await loadNodeModule("node:url");
      const configPath = url.fileURLToPath((import.meta as { url: string }).url);
      const projectRoot = path.dirname(configPath);

      await Promise.all(
        unityPayloadBuildCopies.map((relativePath) =>
          fs.rm(path.resolve(projectRoot, relativePath), { force: true }),
        ),
      );
    },
  };
}

function uiPracticeMetadataWriter() {
  return {
    name: "ui-practice-metadata-writer",
    apply: "serve" as const,
    configureServer(server: { middlewares: { use: (path: string, handler: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use("/__ui-practice-metadata", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        let body = "";

        req.on("data", (chunk: any) => {
          body += chunk.toString();
        });

        req.on("end", async () => {
          try {
            const payload = JSON.parse(body) as { collection?: unknown };

            if (!payload.collection || typeof payload.collection !== "object" || Array.isArray(payload.collection)) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Invalid collection payload." }));
              return;
            }

            const collection = payload.collection as { version?: unknown; items?: unknown; templateInstances?: unknown };
            if (collection.version !== 1 || !Array.isArray(collection.items)) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Invalid version-1 UI Practice collection." }));
              return;
            }

            if (collection.templateInstances !== undefined) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "UI Practice stores every work in its canonical items directory." }));
              return;
            }

            const loadNodeModule = new Function("name", "return import(name)") as (name: string) => Promise<any>;
            const fs = await loadNodeModule("node:fs/promises");
            const path = await loadNodeModule("node:path");
            const url = await loadNodeModule("node:url");
            const configPath = url.fileURLToPath((import.meta as { url: string }).url);
            const projectRoot = path.dirname(configPath);
            const metadataPath = path.join(projectRoot, "src", "data", "uiPracticeMetadata.json");
            const seenIds = new Set<string>();
            const seenFilenames = new Set<string>();

            for (const item of collection.items) {
              if (!item || typeof item !== "object" || Array.isArray(item)) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Invalid item in UI Practice collection." }));
                return;
              }

              const candidate = item as Record<string, unknown>;
              const id = candidate.id;
              const filename = candidate.filename;
              if (typeof id !== "string" || !id || typeof filename !== "string" || !filename) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Every UI Practice item requires a stable ID and filename." }));
                return;
              }

              if (seenIds.has(id) || seenFilenames.has(filename)) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Duplicate UI Practice item ID or filename." }));
                return;
              }

              if (filename.includes("/") || filename.includes("\\") || filename.includes("..") || path.basename(filename) !== filename) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: `Unsafe filename rejected: ${filename}` }));
                return;
              }

              if (!uiPracticeImageExtensions.has(path.extname(filename).toLowerCase())) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: `Unsupported UI Practice image extension: ${filename}` }));
                return;
              }

              if (candidate.image !== undefined) {
                if (!candidate.image || typeof candidate.image !== "object" || Array.isArray(candidate.image)) {
                  res.statusCode = 400;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: `Invalid disk image reference for UI Practice item: ${id}` }));
                  return;
                }
                const image = candidate.image as Record<string, unknown>;
                if (
                  typeof image.imageId !== "string"
                  || !/^image-[0-9a-f-]{36}$/i.test(image.imageId)
                  || typeof image.publicPath !== "string"
                  || !image.publicPath.startsWith("/portfolio-assets/project-images/ui-personal-practice/")
                  || image.publicPath.includes("..")
                  || image.publicPath.includes("\\")
                  || /^https?:/i.test(image.publicPath)
                ) {
                  res.statusCode = 400;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: `Unsafe disk image reference rejected for UI Practice item: ${id}` }));
                  return;
                }
              }

              if (candidate.imageDisplayMode !== undefined && candidate.imageDisplayMode !== "cover" && candidate.imageDisplayMode !== "natural") {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: `Invalid image display mode for UI Practice item: ${id}` }));
                return;
              }
              if (candidate.imageWidthMode !== undefined && !["card", "wide", "full"].includes(candidate.imageWidthMode as string)) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: `Invalid image width mode for UI Practice item: ${id}` }));
                return;
              }
              if (candidate.startNewRow !== undefined && typeof candidate.startNewRow !== "boolean") {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: `Invalid row break for UI Practice item: ${id}` }));
                return;
              }

              seenIds.add(id);
              seenFilenames.add(filename);
            }

            await fs.writeFile(metadataPath, `${JSON.stringify(collection, null, 2)}\n`, "utf8");

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, itemCount: collection.items.length }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : "Unable to write metadata.",
              }),
            );
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), uiPracticeMetadataWriter(), portfolioContentPlugin(), exactWebExportPlugin(), portfolioCollectionExportPlugin(), templateBuilderPlugin(), excludeUnityPayloadsFromBuild()],
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    watch: {
      // Template Builder writes disposable preview copies here (see
      // scripts/templateBuilderPlugin.ts) that always re-export non-component
      // members (layoutControlSchema, templateMeta, ...) alongside the
      // component — Fast Refresh can't hot-apply that shape, so without this
      // every preview write forced a full-page reload, which regenerated the
      // preview file again on remount, looping indefinitely. Excluding the
      // path from the watcher means a write here never reaches Vite's HMR
      // pipeline at all; the file is still served/transformed normally when
      // the Builder's own dynamic import requests it.
      ignored: ["**/src/templates/__TemplatePreview_*.tsx"],
    },
  },
});
