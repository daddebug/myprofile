import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";

const endpoint = "/__generated-icons/library";
const maximumBodyBytes = 96 * 1024;
const allowedElements = new Set(["svg", "title", "desc", "g", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);

type ManifestEntry = {
  id: string;
  name: string;
  title: string;
  description: string;
  keywords: string[];
  projectId: string;
  moduleId: string;
  svgPath: string;
  createdAt: string;
  prompt: string;
};

function sendJson(res: ServerResponse, status: number, value: object) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

function isLocalRequest(req: IncomingMessage) {
  const address = req.socket.remoteAddress ?? "";
  return ["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(address) && req.headers.host === "localhost:5173";
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += value.byteLength;
    if (total > maximumBodyBytes) throw new Error("Generated icon payload is too large.");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function safeText(value: unknown, label: string, maxLength = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function slug(value: string) {
  const result = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return result || "generated-icon";
}

function validateSvg(value: unknown) {
  const svg = safeText(value, "SVG", 48 * 1024);
  if (!/^<svg\b[\s\S]*<\/svg>$/.test(svg)) throw new Error("SVG must be a complete SVG document.");
  if (!/viewBox=["']0 0 64 64["']/.test(svg) || !/fill=["']none["']/.test(svg)) throw new Error("SVG must use the canonical 64 × 64 line-icon geometry.");
  if (!/stroke=["'](?:#ffffff|white|currentColor)["']/i.test(svg)) throw new Error("SVG must use a white or currentColor stroke.");
  if (/<(?:script|foreignObject|image|use|style|a)\b/i.test(svg) || /\bon[a-z]+\s*=|\bhref\s*=|url\s*\(|data:|https?:/i.test(svg)) throw new Error("SVG contains unsafe or external content.");
  for (const match of svg.matchAll(/<\/?([A-Za-z][\w:-]*)\b/g)) {
    if (!allowedElements.has(match[1])) throw new Error(`SVG element <${match[1]}> is not allowed.`);
  }
  return svg;
}

async function readManifest(manifestPath: string): Promise<ManifestEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function generatedIconLibraryPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: "generated-icon-library",
    apply: "serve",
    configResolved(config) { root = config.root; },
    configureServer(server) {
      server.middlewares.use(endpoint, async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "POST") return next();
        if (!isLocalRequest(req)) return sendJson(res, 403, { error: "Generated icon library is local-only." });
        const manifestPath = path.join(root, "src", "data", "generatedIconManifest.json");
        try {
          if (req.method === "GET") return sendJson(res, 200, { icons: await readManifest(manifestPath) });
          const payload = await readBody(req);
          const icon = payload.icon as Record<string, unknown> | undefined;
          const brief = icon?.brief as Record<string, unknown> | undefined;
          const id = randomUUID();
          const name = safeText(brief?.iconName, "Icon name", 80);
          const title = safeText(icon?.title, "Title", 160);
          const description = safeText(icon?.description, "Description", 500);
          const svg = validateSvg(icon?.svg);
          const projectId = safeText(payload.projectId, "Project ID", 120);
          const moduleId = safeText(payload.moduleId, "Module ID", 160);
          const prompt = safeText(payload.prompt, "Prompt", 2000);
          const keywords = Array.isArray(brief?.keywords)
            ? brief.keywords.filter((value): value is string => typeof value === "string").map((value) => value.slice(0, 80)).slice(0, 8)
            : [];
          const fileName = `${slug(name)}-${id.slice(0, 8)}.svg`;
          const directory = path.join(root, "public", "assets", "generated-icons");
          const svgPath = `/assets/generated-icons/${fileName}`;
          const entry: ManifestEntry = { id, name, title, description, keywords, projectId, moduleId, svgPath, createdAt: new Date().toISOString(), prompt };
          const manifest = await readManifest(manifestPath);
          await mkdir(directory, { recursive: true });
          await mkdir(path.dirname(manifestPath), { recursive: true });
          await writeFile(path.join(directory, fileName), `${svg}\n`, { encoding: "utf8", flag: "wx" });
          const temporary = `${manifestPath}.${id}.tmp`;
          await writeFile(temporary, `${JSON.stringify([...manifest, entry], null, 2)}\n`, { encoding: "utf8", flag: "wx" });
          await rename(temporary, manifestPath);
          return sendJson(res, 201, { icon: entry });
        } catch (error) {
          return sendJson(res, 400, { error: error instanceof Error ? error.message : "Unable to save generated icon." });
        }
      });
    },
  };
}
