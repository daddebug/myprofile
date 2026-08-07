import { readFile } from "node:fs/promises";
import path from "node:path";

const REGISTRY_PATH = path.join("src", "lib", "pdf", "pdfExportRegistry.json");
const LOCAL_ONLY_REFERENCE = /^(?:blob:|file:|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/)|^[a-zA-Z]:[\\/]|^\/portfolio-assets\/|^\/__portfolio-content\//;

export async function readPdfExportRegistry(root) {
  const registry = JSON.parse(await readFile(path.join(root, REGISTRY_PATH), "utf8"));
  if (registry?.version !== 1 || !Array.isArray(registry.sources) || !Array.isArray(registry.templates)) {
    throw new Error("PDF export registry is invalid.");
  }
  const sourceIds = new Set();
  for (const source of registry.sources) {
    if (!source?.id || sourceIds.has(source.id)) throw new Error(`PDF export registry contains an invalid or duplicate source ID: ${source?.id ?? "<missing>"}`);
    sourceIds.add(source.id);
  }
  const templateIds = new Set();
  for (const template of registry.templates) {
    if (!template?.id || templateIds.has(template.id)) throw new Error(`PDF export registry contains an invalid or duplicate template ID: ${template?.id ?? "<missing>"}`);
    templateIds.add(template.id);
  }
  return registry;
}

function collectTemplateInstances(draft) {
  const instances = Array.isArray(draft?.templateInstances) ? draft.templateInstances : [];
  return instances.filter((instance) => instance && typeof instance.templateId === "string");
}

// Every string field a template instance can use to reference a staged
// image, mirroring the resource-key set the publishing preflight already
// uses for the same draft shape (RESOURCE_KEYS in publishing-preflight-lib.mjs).
const IMAGE_REFERENCE_KEYS = new Set(["imageId", "localImageId", "assetId", "posterAssetId"]);

function collectImageReferences(value, fieldPath, out) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectImageReferences(item, `${fieldPath}[${index}]`, out));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const nextPath = fieldPath ? `${fieldPath}.${key}` : key;
    if (typeof item === "string" && item.trim() && IMAGE_REFERENCE_KEYS.has(key)) out.push({ referenceId: item, fieldPath: nextPath });
    else collectImageReferences(item, nextPath, out);
  }
}

function isUnresolvedLocalReference(value) {
  return typeof value === "string" && LOCAL_ONLY_REFERENCE.test(value);
}

// stagedProjects mirrors the exact StagedProjectPayload[] shape the plugin's
// own createCollectionJob/validateStagedProject already consume
// (scripts/portfolioCollectionExportPlugin.ts) — { projectId, publicMetaEntry,
// dynamicDraft, document, images: [{ imageId, dataUrl }] }. This preflight
// re-checks the same data before a job is created; it does not reimplement
// staging or fetch drafts itself.
export async function buildPdfExportPreflight({ root, selection, stagedProjects, uiWorkItems, gameExperienceRecords }) {
  const registry = await readPdfExportRegistry(root);
  const sourceById = new Map(registry.sources.map((source) => [source.id, source]));
  const templateById = new Map(registry.templates.map((template) => [template.id, template]));

  const manifest = {
    version: 1,
    registryVersion: registry.version,
    generatedAt: new Date().toISOString(),
    selectedProjectIds: Array.isArray(selection?.projectIds) ? [...selection.projectIds] : [],
    includedFixedSections: [],
    projects: [],
    referencedImages: [],
    issues: [],
    ok: false,
  };

  if (selection?.includeUiWorks && Array.isArray(selection.selectedUiWorkIds) && selection.selectedUiWorkIds.length) {
    manifest.includedFixedSections.push({ sourceId: "ui-works", expectedPageType: "fixed", expectedWidth: 1440, expectedHeightBehavior: "fixed", itemCount: selection.selectedUiWorkIds.length });
  }
  if (selection?.includeGameExperience && Array.isArray(selection.selectedGameIds) && selection.selectedGameIds.length) {
    manifest.includedFixedSections.push({ sourceId: "game-experience", expectedPageType: "fixed", expectedWidth: 1440, expectedHeightBehavior: "fixed", itemCount: selection.selectedGameIds.length });
  }
  if (selection?.includeContact) {
    manifest.includedFixedSections.push({ sourceId: "contact", expectedPageType: "fixed", expectedWidth: 1440, expectedHeightBehavior: "fixed", itemCount: 1 });
  }
  for (const section of manifest.includedFixedSections) {
    if (!sourceById.has(section.sourceId)) {
      manifest.issues.push({ severity: "error", code: "NO_REGISTERED_EXPORT_RULE", sourcePath: section.sourceId, message: `Fixed section "${section.sourceId}" has no registered row in pdfExportRegistry.json.` });
    }
  }

  const stagedByProjectId = new Map((Array.isArray(stagedProjects) ? stagedProjects : []).map((project) => [project?.projectId, project]));
  for (const projectId of manifest.selectedProjectIds) {
    const staged = stagedByProjectId.get(projectId);
    if (!staged) {
      manifest.issues.push({ severity: "error", code: "PROJECT_DRAFT_UNRESOLVED", sourcePath: projectId, message: `Selected project "${projectId}" could not resolve its real draft.` });
      manifest.projects.push({ projectId, resolved: false, sourceId: null, templateInstances: [] });
      continue;
    }
    const sourceId = projectId === "ui-personal-practice" ? "ui-personal-practice" : "dynamic-project";
    const source = sourceById.get(sourceId);
    if (!source) {
      manifest.issues.push({ severity: "error", code: "NO_REGISTERED_EXPORT_RULE", sourcePath: projectId, message: `Project page type "${sourceId}" has no registered row in pdfExportRegistry.json.` });
    }
    if (!staged.dynamicDraft && !staged.document) {
      manifest.issues.push({ severity: "error", code: "PROJECT_DRAFT_UNRESOLVED", sourcePath: projectId, message: `Selected project "${projectId}" has neither a dynamic draft nor a document to render.` });
    }

    const instances = collectTemplateInstances(staged.dynamicDraft);
    const projectEntry = {
      projectId,
      resolved: Boolean(staged.dynamicDraft || staged.document),
      sourceId,
      expectedWidth: 1440,
      expectedHeightBehavior: "variable",
      templateInstances: instances.map((instance) => ({ instanceId: instance.instanceId, templateId: instance.templateId, registered: templateById.has(instance.templateId) })),
    };
    manifest.projects.push(projectEntry);

    for (const instance of instances) {
      if (!templateById.has(instance.templateId)) {
        manifest.issues.push({ severity: "error", code: "UNSUPPORTED_TEMPLATE_INSTANCE", sourcePath: `${projectId}:${instance.instanceId ?? instance.templateId}`, message: `Template "${instance.templateId}" is not present in pdfExportRegistry.json's templates array.` });
      }
    }

    const references = [];
    collectImageReferences(staged.dynamicDraft, `${projectId}.dynamicDraft`, references);
    const stagedImageIds = new Set((Array.isArray(staged.images) ? staged.images : []).map((image) => image?.imageId));
    for (const reference of references) {
      const resolved = stagedImageIds.has(reference.referenceId);
      manifest.referencedImages.push({ projectId, referenceId: reference.referenceId, fieldPath: reference.fieldPath, resolved });
      if (!resolved) {
        manifest.issues.push({ severity: "error", code: "MISSING_REFERENCED_IMAGE", sourcePath: reference.fieldPath, message: `Image "${reference.referenceId}" referenced by ${projectId} was not staged.` });
      }
    }
    // A staged data: URL is itself the resolved form for capture, but a
    // publicPath that still points at /portfolio-assets/ or a dev-only
    // localhost/blob/file URL means the resolved reference is not actually
    // usable outside this dev server.
    const publicPaths = [];
    (function scanPublicPaths(value, fieldPath) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach((item, index) => scanPublicPaths(item, `${fieldPath}[${index}]`)); return; }
      for (const [key, item] of Object.entries(value)) {
        const nextPath = fieldPath ? `${fieldPath}.${key}` : key;
        if ((key === "publicPath" || key === "publicUrl" || key === "coverPublicPath" || key === "entryPublicPath") && isUnresolvedLocalReference(item)) {
          publicPaths.push({ fieldPath: nextPath, value: item });
        } else scanPublicPaths(item, nextPath);
      }
    })(staged.dynamicDraft, `${projectId}.dynamicDraft`);
    for (const local of publicPaths) {
      manifest.issues.push({ severity: "error", code: "UNRESOLVED_LOCAL_PATH", sourcePath: local.fieldPath, message: `"${local.value}" is a local-only/dev/blob path that will not resolve outside this dev server.` });
    }
  }

  for (const item of Array.isArray(uiWorkItems) ? uiWorkItems : []) {
    if (isUnresolvedLocalReference(item?.src)) {
      manifest.issues.push({ severity: "error", code: "UNRESOLVED_LOCAL_PATH", sourcePath: `ui-works:${item?.id ?? "?"}`, message: `UI Works item "${item?.id ?? "?"}" source is a local-only/dev/blob path.` });
    }
  }
  for (const record of Array.isArray(gameExperienceRecords) ? gameExperienceRecords : []) {
    const coverPath = record?.presentation?.coverPublicPath;
    if (coverPath && isUnresolvedLocalReference(coverPath)) {
      manifest.issues.push({ severity: "error", code: "UNRESOLVED_LOCAL_PATH", sourcePath: `game-experience:${record?.id ?? "?"}`, message: `Game "${record?.id ?? "?"}" cover path is a local-only/dev/blob path.` });
    }
  }

  manifest.ok = !manifest.issues.some((issue) => issue.severity === "error");
  return manifest;
}
