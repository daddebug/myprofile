import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Braces, Copy, X } from "lucide-react";
import { validateContentAgainstSchema, validateContentAgainstSchemaIssues, validateImageRowOptions } from "./TemplateInstancesSection";
import { backupDynamicProjectCode } from "../lib/portfolioContentClient";
import type { ProjectPublicMetaOverride, ResolvedProjectMetadata } from "../lib/projectMetadata";
import { createInstanceId, type TemplateInstance, type TemplateInstanceLayoutSettings } from "../lib/projectTemplateInstances";
import {
  normalizeProjectCodeTemplateContent,
  projectCodeAllowedNewTemplateIds,
  projectCodeTemplateRulesForPrompt,
  validateProjectCodeTemplateContent,
  type ProjectCodeValidationIssue,
} from "../lib/projectCodeTemplateContracts";
import { getRegisteredTemplates, type TemplateContentValue } from "../lib/templateLibrary";

type ProjectCodeDocument = {
  version: 1;
  projectId: string;
  projectTitle: { zh: string; en: string };
  metadata: {
    summaryZh: string;
    summaryEn: string;
    categoryZh: string;
    categoryEn: string;
    tagsZh: string[];
    tagsEn: string[];
    duration: string;
    year: string;
    role: string;
    collaborators: string[];
    tools: string[];
  };
  templateInstances: TemplateInstance[];
  imageReferences: SafeImageReference[];
};

type SafeImageReference = {
  instanceId: string;
  templateId: string;
  order: number;
  assetId?: string;
  publicReference?: string;
  aspectRatio?: string;
  caption?: unknown;
  title?: unknown;
  description?: unknown;
  placeholder: string;
};

export type ProjectCodeDiffItem = {
  instanceId: string;
  templateName: string;
  position: string;
  title: string;
  nextTitle: string;
  bodyChanged: boolean;
  layoutChanged: boolean;
  hasPlaceholder: boolean;
};

export type ProjectCodeDiff = {
  textChanges: number;
  orderChanges: number;
  addedTemplates: number;
  deletedTemplates: number;
  layoutChanges: number;
  preservedImages: number;
  placeholderSuggestions: number;
  addedByTemplate: Array<{
    templateId: string;
    nameZh: string;
    nameEn: string;
    count: number;
    emptyImageSlots: number;
  }>;
  items: ProjectCodeDiffItem[];
};

type ValidatedChange = {
  code: ProjectCodeDocument;
  diff: ProjectCodeDiff;
  metadataPatch: Partial<ProjectPublicMetaOverride>;
};

const forbiddenKeyPattern = /^(blob|binary|base64|sha256|commitToken|sourceRelativePath|publicRelativePath)$/i;
const imagePathKeys = new Set(["publicPath", "publicUrl"]);
const allowedNewTemplateIds = new Set<string>(projectCodeAllowedNewTemplateIds);
const forbiddenPathPattern = /(^|[\\/])(backups|appdata|temp)([\\/]|$)/i;
const windowsAbsolutePathPattern = /^[a-z]:[\\/]/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeExportValue);
  if (!isRecord(value)) {
    if (typeof value === "string" && (windowsAbsolutePathPattern.test(value) || forbiddenPathPattern.test(value))) {
      return "[local path omitted]";
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !forbiddenKeyPattern.test(key))
      .map(([key, child]) => [key, safeExportValue(child)]),
  );
}

function localizedText(value: unknown) {
  if (!isRecord(value)) return "";
  const zh = typeof value.zh === "string" ? value.zh : "";
  const en = typeof value.en === "string" ? value.en : "";
  return zh || en;
}

function referenceDescription(record: Record<string, unknown>, index: number) {
  const title = localizedText(record.title) || localizedText(record.caption) || localizedText(record.description);
  const ratio = typeof record.aspectRatio === "string" ? record.aspectRatio : "比例未标注";
  return `[图片 ${String(index + 1).padStart(2, "0")}：${ratio}${title ? `，${title}` : ""}]`;
}

function collectImageReferences(instances: TemplateInstance[]) {
  const references: SafeImageReference[] = [];
  for (const instance of instances) {
    let order = 0;
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!isRecord(value)) return;
      const assetId = typeof value.assetId === "string"
        ? value.assetId
        : typeof value.localImageId === "string" ? value.localImageId : undefined;
      const publicReference = typeof value.publicUrl === "string"
        ? value.publicUrl
        : typeof value.publicPath === "string" ? value.publicPath : undefined;
      if (assetId || publicReference) {
        references.push({
          instanceId: instance.instanceId,
          templateId: instance.templateId,
          order,
          ...(assetId ? { assetId } : {}),
          ...(publicReference ? { publicReference } : {}),
          ...(typeof value.aspectRatio === "string" ? { aspectRatio: value.aspectRatio } : {}),
          ...(value.caption !== undefined ? { caption: safeExportValue(value.caption) } : {}),
          ...(value.title !== undefined ? { title: safeExportValue(value.title) } : {}),
          ...(value.description !== undefined ? { description: safeExportValue(value.description) } : {}),
          placeholder: referenceDescription(value, order),
        });
        order += 1;
      }
      Object.values(value).forEach(visit);
    };
    visit(instance.content);
  }
  return references;
}

function metadataForExport(metadata: ResolvedProjectMetadata): ProjectCodeDocument["metadata"] {
  return {
    summaryZh: metadata.summaryZh,
    summaryEn: metadata.summaryEn,
    categoryZh: metadata.categoryZh,
    categoryEn: metadata.categoryEn,
    tagsZh: [...metadata.tagsZh],
    tagsEn: [...metadata.tagsEn],
    duration: metadata.duration ?? "",
    year: metadata.year ?? "",
    role: metadata.role ?? "",
    collaborators: [...(metadata.collaborators ?? [])],
    tools: [...(metadata.tools ?? [])],
  };
}

function buildProjectCode(
  projectId: string,
  metadata: ResolvedProjectMetadata,
  instances: TemplateInstance[],
): ProjectCodeDocument {
  const safeInstances = safeExportValue(instances) as TemplateInstance[];
  return {
    version: 1,
    projectId,
    projectTitle: { zh: metadata.titleZh, en: metadata.titleEn },
    metadata: metadataForExport(metadata),
    templateInstances: safeInstances,
    imageReferences: collectImageReferences(instances),
  };
}

function scanForbiddenValues(value: unknown, path = "root"): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const error = scanForbiddenValues(value[index], `${path}[${index}]`);
      if (error) return error;
    }
    return null;
  }
  if (typeof value === "string") {
    if (/^data:/i.test(value) || /base64[,;]/i.test(value)) return `${path} contains Base64 data.`;
    if (windowsAbsolutePathPattern.test(value)) return `${path} contains an absolute Windows path.`;
    if (forbiddenPathPattern.test(value)) return `${path} contains a protected local path.`;
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeyPattern.test(key)) return `${path}.${key} is a protected storage field.`;
    const error = scanForbiddenValues(child, `${path}.${key}`);
    if (error) return error;
  }
  return null;
}

function validateLayoutSettings(value: unknown): TemplateInstanceLayoutSettings | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "horizontalInset")) {
    throw new Error("layoutSettings contains unsupported fields.");
  }
  if (value.horizontalInset === undefined) return undefined;
  if (typeof value.horizontalInset !== "number" || !Number.isFinite(value.horizontalInset) || value.horizontalInset < 0 || value.horizontalInset > 400) {
    throw new Error("layoutSettings.horizontalInset must be between 0 and 400.");
  }
  return { horizontalInset: value.horizontalInset };
}

function collectProtectedImageValues(instances: TemplateInstance[]) {
  const assetReferences: string[] = [];
  const publicReferences: string[] = [];
  const visit = (value: unknown, instanceId: string) => {
    if (Array.isArray(value)) { value.forEach((child) => visit(child, instanceId)); return; }
    if (!isRecord(value)) return;
    if (typeof value.assetId === "string") assetReferences.push(`${instanceId}\u0000${value.assetId}`);
    if (typeof value.localImageId === "string") assetReferences.push(`${instanceId}\u0000${value.localImageId}`);
    if (typeof value.imageId === "string") assetReferences.push(`${instanceId}\u0000${value.imageId}`);
    for (const key of imagePathKeys) {
      if (typeof value[key] === "string") publicReferences.push(`${instanceId}\u0000${value[key] as string}`);
    }
    Object.values(value).forEach((child) => visit(child, instanceId));
  };
  instances.forEach((instance) => visit(instance.content, instance.instanceId));
  return { assetReferences: assetReferences.sort(), publicReferences: publicReferences.sort() };
}

function firstMultisetDifference(expected: string[], actual: string[]) {
  const remaining = [...actual];
  for (const value of expected) {
    const index = remaining.indexOf(value);
    if (index === -1) return value;
    remaining.splice(index, 1);
  }
  return null;
}

function countTextChanges(before: unknown, after: unknown) {
  const beforeStrings: Record<string, string> = {};
  const afterStrings: Record<string, string> = {};
  const collect = (value: unknown, target: Record<string, string>, path: string) => {
    if (Array.isArray(value)) { value.forEach((child, index) => collect(child, target, `${path}[${index}]`)); return; }
    if (typeof value === "string") { target[path] = value; return; }
    if (isRecord(value)) Object.entries(value).forEach(([key, child]) => collect(child, target, `${path}.${key}`));
  };
  collect(before, beforeStrings, "root");
  collect(after, afterStrings, "root");
  return new Set([...Object.keys(beforeStrings), ...Object.keys(afterStrings)])
    .size === 0 ? 0 : [...new Set([...Object.keys(beforeStrings), ...Object.keys(afterStrings)])]
      .filter((key) => beforeStrings[key] !== afterStrings[key]).length;
}

function instanceTitle(instance: TemplateInstance | undefined) {
  if (!instance) return "";
  for (const key of ["title", "heading", "statement", "leftTitle"]) {
    const text = localizedText(instance.content[key]);
    if (text) return text;
  }
  return "";
}

function containsPlaceholder(value: unknown): boolean {
  if (typeof value === "string") return /\[(图片|image)\s*\d*/i.test(value);
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (isRecord(value)) {
    if (value.placeholder !== undefined && (
      typeof value.placeholder === "string"
      || (isRecord(value.placeholder) && (value.placeholder.zh || value.placeholder.en))
    )) return true;
    return Object.values(value).some(containsPlaceholder);
  }
  return false;
}

function buildDiff(before: ProjectCodeDocument, after: ProjectCodeDocument): ProjectCodeDiff {
  const templates = new Map(getRegisteredTemplates().map((template) => [template.meta.id, template]));
  const beforeById = new Map(before.templateInstances.map((instance) => [instance.instanceId, instance]));
  const afterById = new Map(after.templateInstances.map((instance) => [instance.instanceId, instance]));
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])];
  const items = ids.map((instanceId) => {
    const previous = beforeById.get(instanceId);
    const next = afterById.get(instanceId);
    const instance = next ?? previous!;
    const template = templates.get(instance.templateId);
    const previousIndex = before.templateInstances.findIndex((item) => item.instanceId === instanceId);
    const nextIndex = after.templateInstances.findIndex((item) => item.instanceId === instanceId);
    return {
      instanceId,
      templateName: template?.meta.nameZh ?? instance.templateId,
      position: `${previousIndex < 0 ? "新增" : previousIndex + 1} → ${nextIndex < 0 ? "删除" : nextIndex + 1}`,
      title: instanceTitle(previous),
      nextTitle: instanceTitle(next),
      bodyChanged: Boolean(previous && next && JSON.stringify(previous.content) !== JSON.stringify(next.content)),
      layoutChanged: JSON.stringify(previous?.layoutSettings ?? null) !== JSON.stringify(next?.layoutSettings ?? null),
      hasPlaceholder: Boolean(next && containsPlaceholder(next.content)),
    };
  });
  const addedInstances = after.templateInstances.filter((instance) => !beforeById.has(instance.instanceId));
  const addedByTemplate = [...new Set(addedInstances.map((instance) => instance.templateId))].map((templateId) => {
    const matching = addedInstances.filter((instance) => instance.templateId === templateId);
    const template = templates.get(templateId);
    return {
      templateId,
      nameZh: template?.meta.nameZh ?? templateId,
      nameEn: template?.meta.nameEn ?? templateId,
      count: matching.length,
      emptyImageSlots: templateId === "image-row"
        ? matching.reduce((total, instance) => total + (Array.isArray(instance.content.items) ? instance.content.items.length : 0), 0)
        : 0,
    };
  });
  return {
    textChanges: countTextChanges(
      { projectTitle: before.projectTitle, metadata: before.metadata, instances: before.templateInstances.map((item) => item.content) },
      { projectTitle: after.projectTitle, metadata: after.metadata, instances: after.templateInstances.map((item) => item.content) },
    ),
    orderChanges: before.templateInstances.filter((instance, index) => after.templateInstances.findIndex((item) => item.instanceId === instance.instanceId) !== index && afterById.has(instance.instanceId)).length,
    addedTemplates: addedInstances.length,
    deletedTemplates: before.templateInstances.filter((instance) => !afterById.has(instance.instanceId)).length,
    layoutChanges: items.filter((item) => item.layoutChanged).length,
    preservedImages: before.imageReferences.filter((reference) => reference.assetId || reference.publicReference).length,
    placeholderSuggestions: after.templateInstances.filter((instance) => containsPlaceholder(instance.content)).length,
    addedByTemplate,
    items,
  };
}

function localizedField(value: unknown, field: string) {
  if (typeof value === "string") return { zh: value, en: "" };
  if (!isRecord(value) || typeof value.zh !== "string" || typeof value.en !== "string") {
    throw new Error(`${field} must contain zh and en text.`);
  }
  return { zh: value.zh, en: value.en };
}

function normalizeNewImageRowContent(content: Record<string, unknown>) {
  const rawItems = content.items;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 12) {
    throw new Error("A new image-row requires 1 to 12 empty image slots.");
  }
  const items = rawItems.map((value, index) => {
    if (!isRecord(value)) throw new Error(`image-row slot ${index + 1} is invalid.`);
    const allowedKeys = new Set(["id", "alt", "caption", "placeholder", "suggestedAspectRatio", "suggestedImageCount", "imageDisplayMode", "imageCropRatio", "imageWidthMode", "hoverPreviewMode", "startNewRow", "image"]);
    const unsupportedKey = Object.keys(value).find((key) => !allowedKeys.has(key));
    if (unsupportedKey) throw new Error(`image-row slot ${index + 1}.${unsupportedKey} is not supported.`);
    if (value.image !== undefined && value.image !== null) {
      throw new Error(`image-row slot ${index + 1} must not contain an image reference.`);
    }
    for (const protectedKey of ["localImageId", "assetId", "publicPath", "publicUrl", "blob", "base64"]) {
      if (value[protectedKey] !== undefined) throw new Error(`image-row slot ${index + 1} must not contain ${protectedKey}.`);
    }
    const suggestedAspectRatio = value.suggestedAspectRatio === undefined
      ? ""
      : stringField(value.suggestedAspectRatio, `image-row slot ${index + 1}.suggestedAspectRatio`);
    const suggestedImageCount = value.suggestedImageCount === undefined
      ? rawItems.length
      : value.suggestedImageCount;
    if (typeof suggestedImageCount !== "number" || !Number.isInteger(suggestedImageCount) || suggestedImageCount < 1 || suggestedImageCount > 12) {
      throw new Error(`image-row slot ${index + 1}.suggestedImageCount must be 1 to 12.`);
    }
    const imageDisplayMode = value.imageDisplayMode;
    if (imageDisplayMode !== undefined && imageDisplayMode !== "cover" && imageDisplayMode !== "natural") {
      throw new Error(`image-row slot ${index + 1}.imageDisplayMode must be cover or natural.`);
    }
    const imageCropRatio = value.imageCropRatio;
    if (imageCropRatio !== undefined && imageCropRatio !== "16:9" && imageCropRatio !== "1:1") {
      throw new Error(`image-row slot ${index + 1}.imageCropRatio must be 16:9 or 1:1.`);
    }
    const imageWidthMode = value.imageWidthMode;
    if (imageWidthMode !== undefined && imageWidthMode !== "card" && imageWidthMode !== "wide" && imageWidthMode !== "full") {
      throw new Error(`image-row slot ${index + 1}.imageWidthMode must be card, wide, or full.`);
    }
    const hoverPreviewMode = value.hoverPreviewMode ?? "none";
    if (hoverPreviewMode !== "none" && hoverPreviewMode !== "floating") {
      throw new Error(`image-row slot ${index + 1}.hoverPreviewMode must be none or floating.`);
    }
    const startNewRow = value.startNewRow;
    if (startNewRow !== undefined && typeof startNewRow !== "boolean") {
      throw new Error(`image-row slot ${index + 1}.startNewRow must be boolean.`);
    }
    return {
      id: createInstanceId("image-row-item"),
      alt: localizedField(value.alt ?? { zh: "", en: "" }, `image-row slot ${index + 1}.alt`),
      caption: localizedField(value.caption ?? { zh: "", en: "" }, `image-row slot ${index + 1}.caption`),
      placeholder: localizedField(value.placeholder ?? { zh: "", en: "" }, `image-row slot ${index + 1}.placeholder`),
      suggestedAspectRatio,
      suggestedImageCount,
      ...(imageDisplayMode ? { imageDisplayMode } : {}),
      ...(imageCropRatio ? { imageCropRatio } : {}),
      ...(imageWidthMode ? { imageWidthMode } : {}),
      hoverPreviewMode,
      ...(startNewRow === true ? { startNewRow: true } : {}),
    };
  });
  return {
    ...content,
    heading: localizedField(content.heading ?? { zh: "", en: "" }, "image-row.heading"),
    items,
  };
}

function normalizeNewPlayableGameContent(content: Record<string, unknown>) {
  const allowedKeys = new Set([
    "heading",
    "description",
    "game",
    "cover",
    "controls",
    "versionLabel",
    "status",
    "aspectRatio",
  ]);
  const unsupportedKey = Object.keys(content).find((key) => !allowedKeys.has(key));
  if (unsupportedKey) throw new Error(`playable-game.${unsupportedKey} is not supported.`);
  if (content.game !== undefined && content.game !== null) {
    throw new Error("A new playable-game must not contain a real game build reference.");
  }
  if (content.cover !== undefined && content.cover !== null) {
    throw new Error("A new playable-game must not contain a real cover reference.");
  }
  const status = content.status ?? "prototype";
  if (status !== "prototype" && status !== "in-development" && status !== "complete" && status !== "archived") {
    throw new Error("playable-game.status is invalid.");
  }
  const aspectRatio = content.aspectRatio ?? "16:9";
  if (aspectRatio !== "16:9" && aspectRatio !== "4:3" && aspectRatio !== "auto") {
    throw new Error("playable-game.aspectRatio is invalid.");
  }
  if (content.controls !== undefined && !Array.isArray(content.controls)) {
    throw new Error("playable-game.controls must be an array.");
  }
  const controls = (content.controls ?? []).map((value, index) => {
    if (!isRecord(value)) throw new Error(`playable-game.controls[${index}] is invalid.`);
    const unsupported = Object.keys(value).find((key) => key !== "id" && key !== "key" && key !== "action");
    if (unsupported) throw new Error(`playable-game.controls[${index}].${unsupported} is not supported.`);
    return {
      id: createInstanceId("playable-game-control"),
      key: localizedField(value.key ?? { zh: "", en: "" }, `playable-game.controls[${index}].key`),
      action: localizedField(value.action ?? { zh: "", en: "" }, `playable-game.controls[${index}].action`),
    };
  });
  return {
    heading: localizedField(content.heading ?? { zh: "", en: "" }, "playable-game.heading"),
    description: localizedField(content.description ?? { zh: "", en: "" }, "playable-game.description"),
    game: null,
    cover: null,
    controls,
    versionLabel: localizedField(content.versionLabel ?? { zh: "", en: "" }, "playable-game.versionLabel"),
    status,
    aspectRatio,
  };
}

function playableGameReference(value: unknown) {
  if (!isRecord(value)) return null;
  if (typeof value.gameId !== "string" || typeof value.entryPublicPath !== "string") return null;
  return value;
}

function stringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${field} must be a text array.`);
  return value as string[];
}

function stringField(value: unknown, field: string) {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  return value;
}

class ProjectCodePreflightError extends Error {
  constructor(public readonly issues: string[]) {
    super([`Project JSON has ${issues.length} validation issue(s):`, ...issues.map((issue, index) => `${index + 1}. ${issue}`)].join("\n"));
    this.name = "ProjectCodePreflightError";
  }
}

function formatTemplateIssue(
  templateId: string,
  identity: string,
  issue: ProjectCodeValidationIssue,
) {
  return `[${templateId}] [${identity}] content.${issue.path}: ${issue.problem}; expected ${issue.expected}${issue.actual ? `; received ${issue.actual}` : ""}${issue.suggestion ? `; suggestion: ${issue.suggestion}` : ""}`;
}

function preflightProjectCode(
  parsed: unknown,
  current: ProjectCodeDocument,
): Record<string, unknown> {
  if (!isRecord(parsed)) throw new ProjectCodePreflightError(["root: expected a JSON object"]);
  const normalized = clone(parsed) as Record<string, unknown>;
  const issues: string[] = [];

  if (normalized.version !== 1) issues.push(`root.version: expected 1; received ${JSON.stringify(normalized.version)}`);
  if (normalized.projectId !== current.projectId) issues.push(`root.projectId: must match ${current.projectId}; received ${JSON.stringify(normalized.projectId)}`);
  if (!isRecord(normalized.projectTitle)) issues.push("root.projectTitle: expected { zh, en }");
  if (!isRecord(normalized.metadata)) issues.push("root.metadata: expected an object");
  if (!Array.isArray(normalized.templateInstances)) issues.push("root.templateInstances: expected an array");

  const registered = new Map(getRegisteredTemplates().map((template) => [template.meta.id, template]));
  const currentById = new Map(current.templateInstances.map((instance) => [instance.instanceId, instance]));
  const seenInstanceIds = new Set<string>();
  const seenNewKeys = new Set<string>();

  if (Array.isArray(normalized.templateInstances)) {
    normalized.templateInstances.forEach((candidate, index) => {
      const basePath = `templateInstances[${index}]`;
      if (!isRecord(candidate)) {
        issues.push(`${basePath}: expected an object; received ${candidate === null ? "null" : typeof candidate}`);
        return;
      }
      const templateId = typeof candidate.templateId === "string" ? candidate.templateId : "(missing templateId)";
      const requestedInstanceId = typeof candidate.instanceId === "string" ? candidate.instanceId : "";
      const newInstanceKey = typeof candidate.newInstanceKey === "string" ? candidate.newInstanceKey : "";
      const identity = requestedInstanceId || newInstanceKey || `new item ${index + 1}`;
      const existing = requestedInstanceId ? currentById.get(requestedInstanceId) : undefined;
      const template = registered.get(templateId);

      if (requestedInstanceId) {
        if (seenInstanceIds.has(requestedInstanceId)) issues.push(`[${templateId}] [${identity}] instanceId: duplicated in returned JSON`);
        seenInstanceIds.add(requestedInstanceId);
      } else if (newInstanceKey) {
        if (seenNewKeys.has(newInstanceKey)) issues.push(`[${templateId}] [${identity}] newInstanceKey: duplicated in returned JSON`);
        seenNewKeys.add(newInstanceKey);
      }

      if (!template) {
        issues.push(`[${templateId}] [${identity}] templateId: unknown template; expected a registered Template Library id`);
        return;
      }
      if (!existing && !allowedNewTemplateIds.has(templateId)) {
        issues.push(`[${templateId}] [${identity}] templateId: this template cannot be added through Project Code`);
      }
      if (existing && existing.templateId !== templateId) {
        issues.push(`[${templateId}] [${identity}] templateId: existing instance uses ${existing.templateId} and cannot be changed`);
      }
      const expectedRegion = "content";
      const expectedAnchor = "__end__";
      if (candidate.regionId !== expectedRegion) issues.push(`[${templateId}] [${identity}] regionId: expected ${expectedRegion}; received ${JSON.stringify(candidate.regionId)}`);
      if (candidate.anchorId !== expectedAnchor) issues.push(`[${templateId}] [${identity}] anchorId: expected ${expectedAnchor}; received ${JSON.stringify(candidate.anchorId)}`);
      if (candidate.layoutSettings !== undefined && candidate.layoutSettings !== null) {
        if (!isRecord(candidate.layoutSettings)) {
          issues.push(`[${templateId}] [${identity}] layoutSettings: expected { horizontalInset?: number } or null`);
        } else {
          const unsupported = Object.keys(candidate.layoutSettings).filter((key) => key !== "horizontalInset");
          unsupported.forEach((key) => issues.push(`[${templateId}] [${identity}] layoutSettings.${key}: unsupported; only horizontalInset is allowed`));
          const inset = candidate.layoutSettings.horizontalInset;
          if (inset !== undefined && (typeof inset !== "number" || !Number.isFinite(inset) || inset < 0 || inset > 400)) {
            issues.push(`[${templateId}] [${identity}] layoutSettings.horizontalInset: expected a number from 0 to 400; received ${JSON.stringify(inset)}`);
          }
        }
      }
      if (!isRecord(candidate.content)) {
        issues.push(`[${templateId}] [${identity}] content: expected an object; received ${candidate.content === null ? "null" : typeof candidate.content}`);
        return;
      }

      const content = normalizeProjectCodeTemplateContent(templateId, candidate.content);
      candidate.content = content;
      for (const issue of validateContentAgainstSchemaIssues(content as Record<string, TemplateContentValue>, template.meta.schema)) {
        issues.push(formatTemplateIssue(templateId, identity, issue));
      }
      for (const issue of validateProjectCodeTemplateContent(templateId, content, !existing, template.meta.schema)) {
        issues.push(formatTemplateIssue(templateId, identity, issue));
      }
    });
  }

  if (issues.length) throw new ProjectCodePreflightError(issues);
  return normalized;
}

function validateProjectCode(
  parsed: unknown,
  current: ProjectCodeDocument,
): ValidatedChange {
  parsed = preflightProjectCode(parsed, current);
  if (!isRecord(parsed) || parsed.version !== 1 || parsed.projectId !== current.projectId) {
    throw new Error("projectId or project-code version does not match the current project.");
  }
  const forbidden = scanForbiddenValues(parsed);
  if (forbidden) throw new Error(forbidden);
  if (!isRecord(parsed.projectTitle) || !isRecord(parsed.metadata) || !Array.isArray(parsed.templateInstances)) {
    throw new Error("The returned project JSON is incomplete.");
  }

  const registered = new Map(getRegisteredTemplates().map((template) => [template.meta.id, template]));
  const currentById = new Map(current.templateInstances.map((instance) => [instance.instanceId, instance]));
  const seenIds = new Set<string>();
  const seenNewKeys = new Set<string>();
  const nextInstances = parsed.templateInstances.map((value, index): TemplateInstance => {
    if (!isRecord(value)) throw new Error(`Template ${index + 1} is invalid.`);
    const templateId = stringField(value.templateId, `templateInstances[${index}].templateId`);
    const requestedInstanceId = typeof value.instanceId === "string" ? value.instanceId : "";
    const existing = requestedInstanceId ? currentById.get(requestedInstanceId) : undefined;
    const newInstanceKey = typeof value.newInstanceKey === "string" ? value.newInstanceKey.trim() : "";
    if (!existing && newInstanceKey) {
      if (seenNewKeys.has(newInstanceKey)) throw new Error(`Duplicate newInstanceKey: ${newInstanceKey}`);
      seenNewKeys.add(newInstanceKey);
    }
    const instanceId = existing ? existing.instanceId : createInstanceId(templateId);
    if (seenIds.has(instanceId)) throw new Error(`Duplicate instanceId: ${instanceId}`);
    seenIds.add(instanceId);
    if (existing && existing.templateId !== templateId) throw new Error(`${instanceId} changed templateId.`);
    const template = registered.get(templateId);
    if (!template) throw new Error(`Unknown templateId: ${templateId}`);
    if (!existing && !allowedNewTemplateIds.has(templateId)) throw new Error(`不允许新增模板：${templateId}`);
    const regionId = existing ? stringField(value.regionId, `templateInstances[${index}].regionId`) : "content";
    const anchorId = existing ? stringField(value.anchorId, `templateInstances[${index}].anchorId`) : "__end__";
    if (regionId !== "content" || anchorId !== "__end__") throw new Error(`${instanceId} has an invalid regionId or anchorId.`);
    if (!isRecord(value.content)) throw new Error(`${instanceId}.content must be an object.`);
    let content = clone(value.content) as Record<string, TemplateContentValue>;
    if (!existing && templateId === "image-row") {
      content = normalizeNewImageRowContent(value.content) as Record<string, TemplateContentValue>;
    }
    if (!existing && templateId === "playable-game") {
      content = normalizeNewPlayableGameContent(value.content) as Record<string, TemplateContentValue>;
    }
    if (!existing && templateId === "figma-prototype") {
      const figmaUrl = content.figmaUrl;
      if ((typeof figmaUrl === "string" && figmaUrl.trim()) || content.fallbackImage) {
        throw new Error("A new figma-prototype must not contain a real URL or fallback image.");
      }
    }
    const schemaError = validateContentAgainstSchema(content, template.meta.schema);
    if (schemaError) throw new Error(`${instanceId}: ${schemaError}`);
    if (templateId === "image-row") {
      const imageRowOptionsError = validateImageRowOptions(content);
      if (imageRowOptionsError) throw new Error(`${instanceId}: ${imageRowOptionsError}`);
    }
    if (existing && templateId === "playable-game") {
      const beforeGame = playableGameReference(existing.content.game);
      const afterGame = playableGameReference(content.game);
      if (beforeGame && JSON.stringify(beforeGame) !== JSON.stringify(afterGame)) {
        throw new Error(`${instanceId}: existing playable game reference must be preserved.`);
      }
      if (!beforeGame && afterGame) {
        throw new Error(`${instanceId}: project code cannot create a real playable game reference.`);
      }
    }
    const layoutSettings = validateLayoutSettings(value.layoutSettings);
    return { instanceId, templateId, regionId, anchorId, content: clone(content), ...(layoutSettings ? { layoutSettings } : {}) };
  });

  const beforeImages = collectProtectedImageValues(current.templateInstances);
  const afterImages = collectProtectedImageValues(nextInstances);
  const missingAsset = firstMultisetDifference(beforeImages.assetReferences, afterImages.assetReferences);
  if (missingAsset) throw new Error(`将导致真实图片引用丢失或改变所属模板：${missingAsset.split("\u0000")[1]}`);
  const addedAsset = firstMultisetDifference(afterImages.assetReferences, beforeImages.assetReferences);
  if (addedAsset) throw new Error(`新增图片只能使用 placeholder，不能伪造 assetId：${addedAsset.split("\u0000")[1]}`);
  const missingPath = firstMultisetDifference(beforeImages.publicReferences, afterImages.publicReferences);
  if (missingPath) throw new Error(`将导致真实图片路径丢失或改变所属模板：${missingPath.split("\u0000")[1]}`);
  const addedPath = firstMultisetDifference(afterImages.publicReferences, beforeImages.publicReferences);
  if (addedPath) throw new Error(`真实图片路径不得新增或修改：${addedPath.split("\u0000")[1]}`);

  const projectTitle = {
    zh: stringField(parsed.projectTitle.zh, "projectTitle.zh"),
    en: stringField(parsed.projectTitle.en, "projectTitle.en"),
  };
  const metadata = parsed.metadata;
  const nextMetadata: ProjectCodeDocument["metadata"] = {
    summaryZh: stringField(metadata.summaryZh, "metadata.summaryZh"),
    summaryEn: stringField(metadata.summaryEn, "metadata.summaryEn"),
    categoryZh: stringField(metadata.categoryZh, "metadata.categoryZh"),
    categoryEn: stringField(metadata.categoryEn, "metadata.categoryEn"),
    tagsZh: stringArray(metadata.tagsZh, "metadata.tagsZh"),
    tagsEn: stringArray(metadata.tagsEn, "metadata.tagsEn"),
    duration: stringField(metadata.duration, "metadata.duration"),
    year: stringField(metadata.year, "metadata.year"),
    role: stringField(metadata.role, "metadata.role"),
    collaborators: stringArray(metadata.collaborators, "metadata.collaborators"),
    tools: stringArray(metadata.tools, "metadata.tools"),
  };
  const code: ProjectCodeDocument = {
    version: 1,
    projectId: current.projectId,
    projectTitle,
    metadata: nextMetadata,
    templateInstances: nextInstances,
    imageReferences: collectImageReferences(nextInstances),
  };
  return {
    code,
    diff: buildDiff(current, code),
    metadataPatch: { ...nextMetadata, titleZh: projectTitle.zh, titleEn: projectTitle.en },
  };
}

function aiRequestFor(code: ProjectCodeDocument) {
  const schemas = new Map(getRegisteredTemplates().map((template) => [template.meta.id, template.meta.schema]));
  const templateRules = projectCodeTemplateRulesForPrompt(schemas);
  return [
    "AUTHORITATIVE TEMPLATE CONTRACTS (generated from the registered template schemas and the same Project Code validators used before import):",
    "All localized text uses {\"zh\":\"...\",\"en\":\"\"}. English may be an empty string. Do not replace localized objects with plain strings in the returned JSON.",
    ...templateRules,
    "These contracts override any abbreviated examples below.",
    "direction-compare is the native two-sided before/after or proposal comparison template. New instances must use a unique newInstanceKey, regionId content, anchorId __end__, leftImage/rightImage null or omitted, and direction left-to-right, right-to-left, or none.",
    "For image-row slots, hoverPreviewMode is optional and only accepts none or floating; new empty slots default to none.",
    "",
    "请基于下面的作品集项目 JSON，帮助我讨论并优化项目叙事、模块顺序、排版逻辑和文字内容。",
    "",
    "你可以：",
    "- 优化项目叙事、标题、说明和正文。",
    "- 调整 templateInstances 顺序。",
    "- 修改合法的 layoutSettings。",
    "- 按内容类型新增已有模板：statement-longform、supporting-note、process-flow、decision-table、phase-milestones、circle-summary、image-row、figma-prototype、playable-game。",
    "- 新实例不要提供最终 instanceId；请提供唯一的 newInstanceKey，regionId 使用 content，anchorId 使用 __end__。",
    "- 工作步骤使用 process-flow；比较和验证计划使用 decision-table；阶段成果使用 phase-milestones；补充限制使用 supporting-note；并列关系使用 circle-summary；成果图使用 image-row；原型使用 figma-prototype；章节叙事使用 statement-longform。",
    "- image-row 只能创建 1–12 个空图片槽。content 可使用 columns（1/2/3/4）与 rowAlignment（start/center）；每个 item 可包含 alt、caption、placeholder、suggestedAspectRatio、suggestedImageCount、imageDisplayMode（cover/natural）、imageCropRatio（16:9/1:1，仅在 imageDisplayMode 为 cover 时生效，省略或旧数据默认按 16:9 处理）、imageWidthMode（card/wide/full）、startNewRow（boolean），image 必须为 null 或省略。",
    "- playable-game 只能新增 game: null、cover: null 的空模板；真实 ZIP 必须稍后通过页面上传。status 仅允许 prototype、in-development、complete、archived，aspectRatio 仅允许 16:9、4:3、auto。",
    "",
    "你不可以：",
    "- 修改 projectId。",
    "- 修改现有 instanceId 或其 templateId。",
    "- 修改或伪造真实 assetId、publicPath、publicUrl。",
    "- 删除任何真实图片引用或图片文件。",
    "- 修改磁盘存储字段，或返回 D 盘、backups、AppData、Temp 路径。",
    "- 返回 Blob、Base64、SHA-256 或 commit token。",
    "- 为新增 image-row 或 figma-prototype 伪造 localImageId、assetId、publicPath、publicUrl、真实文件或外部资源链接。",
    "",
    "请返回完整 JSON，不要使用 Markdown 代码块。",
    "",
    JSON.stringify(code, null, 2),
  ].join("\n");
}

export function DynamicProjectCodePanel({
  projectId,
  metadata,
  instances,
  language,
  onApply,
  onClose,
}: {
  projectId: string;
  metadata: ResolvedProjectMetadata;
  instances: TemplateInstance[];
  language: "zh" | "en";
  onApply: (instances: TemplateInstance[], metadataPatch: Partial<ProjectPublicMetaOverride>, recoveryPath: string) => void;
  onClose: () => void;
}) {
  const currentCode = useMemo(() => buildProjectCode(projectId, metadata, instances), [projectId, metadata, instances]);
  const [tab, setTab] = useState<"copy" | "apply">("copy");
  const [input, setInput] = useState("");
  const [validated, setValidated] = useState<ValidatedChange | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [applying, setApplying] = useState(false);

  const copyRequest = async () => {
    try {
      await navigator.clipboard.writeText(aiRequestFor(currentCode));
      setStatus(language === "zh" ? "完整 AI 请求已复制" : "Complete AI request copied");
      setError("");
    } catch {
      setError(language === "zh" ? "复制失败，请检查浏览器剪贴板权限。" : "Copy failed. Check clipboard permission.");
    }
  };

  const preview = () => {
    try {
      const next = validateProjectCode(JSON.parse(input) as unknown, currentCode);
      setValidated(next);
      setError("");
      setStatus(language === "zh" ? "校验通过，请确认变更摘要。" : "Validation passed. Review the changes.");
    } catch (reason) {
      setValidated(null);
      setStatus("");
      setError(reason instanceof Error ? reason.message : "Invalid project JSON.");
    }
  };

  const confirmApply = async () => {
    if (!validated || applying) return;
    setApplying(true);
    setError("");
    try {
      const recovery = await backupDynamicProjectCode({
        projectId,
        createdAt: new Date().toISOString(),
        metadata: { projectTitle: currentCode.projectTitle, ...currentCode.metadata },
        draft: { version: 1, templateInstances: clone(instances), updatedAt: new Date().toISOString() },
      });
      onApply(clone(validated.code.templateInstances), validated.metadataPatch, recovery.relativePath);
      setStatus(language === "zh" ? `已应用，尚未落盘。恢复文件：${recovery.relativePath}` : `Applied, not saved to disk. Recovery: ${recovery.relativePath}`);
      setValidated(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to back up and apply the project JSON.");
    } finally {
      setApplying(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-deepIndigo/92 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[12px] border border-electricBlue/28 bg-[#12143f]" role="dialog" aria-modal="true" aria-label={language === "zh" ? "项目代码" : "Project code"} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-softWhite/10 px-5 py-4">
          <div><h2 className="font-display text-xl font-semibold">{language === "zh" ? "项目代码" : "Project code"}</h2><p className="mt-1 font-mono text-xs text-softWhite/42">{projectId}</p></div>
          <button type="button" className="editor-icon" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="flex border-b border-softWhite/10 px-5">
          {(["copy", "apply"] as const).map((value) => <button key={value} type="button" className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === value ? "border-acidGreen text-acidGreen" : "border-transparent text-softWhite/52"}`} onClick={() => setTab(value)}>{value === "copy" ? (language === "zh" ? "复制给 AI" : "Copy for AI") : (language === "zh" ? "应用 AI 返回" : "Apply AI response")}</button>)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "copy" ? <>
            <textarea readOnly className="h-[56vh] w-full resize-none border border-softWhite/12 bg-deepIndigo/46 p-4 font-mono text-xs leading-5 text-softWhite/76 outline-none" value={JSON.stringify(currentCode, null, 2)} />
            <button type="button" className="mt-4 inline-flex min-h-10 items-center gap-2 bg-acidGreen px-5 text-sm font-semibold text-deepIndigo" onClick={() => void copyRequest()}><Copy className="h-4 w-4" />{language === "zh" ? "复制完整 AI 请求" : "Copy complete AI request"}</button>
          </> : <>
            <textarea className="h-[42vh] w-full resize-y border border-softWhite/12 bg-deepIndigo/46 p-4 font-mono text-xs leading-5 text-softWhite/82 outline-none focus:border-acidGreen" value={input} placeholder={language === "zh" ? "粘贴 AI 返回的完整 JSON" : "Paste the complete JSON returned by AI"} onChange={(event) => { setInput(event.target.value); setValidated(null); setError(""); setStatus(""); }} />
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="editor-action" onClick={preview}><Braces className="h-4 w-4" />{language === "zh" ? "校验并预览变更" : "Validate and preview"}</button></div>
            {validated ? <div className="mt-5 border-t border-softWhite/10 pt-5">
              <div className="grid gap-2 text-sm text-softWhite/72 sm:grid-cols-2 lg:grid-cols-4">
                <span>文字修改：{validated.diff.textChanges}</span><span>顺序调整：{validated.diff.orderChanges}</span><span>新增模板：{validated.diff.addedTemplates}</span><span>删除模板：{validated.diff.deletedTemplates}</span><span>布局修改：{validated.diff.layoutChanges}</span><span>真实图片引用：{validated.diff.preservedImages}</span><span>图片占位建议：{validated.diff.placeholderSuggestions}</span>
              </div>
              {validated.diff.addedByTemplate.length ? <div className="mt-4 grid gap-2 border-y border-softWhite/10 py-3 text-sm text-softWhite/72">
                {validated.diff.addedByTemplate.map((item) => <p key={item.templateId}>
                  {language === "zh" ? `将新增 ${item.count} 个 ${item.nameZh}` : `Add ${item.count} ${item.nameEn}`}
                  {item.templateId === "image-row" ? (language === "zh" ? ` · ${item.emptyImageSlots} 个空图片槽 · 不包含任何真实图片引用` : ` · ${item.emptyImageSlots} empty image slots · no real image references`) : ""}
                </p>)}
              </div> : null}
              <div className="mt-4 grid gap-2">{validated.diff.items.map((item) => <div key={item.instanceId} className="grid gap-2 border-t border-softWhite/8 py-3 text-xs text-softWhite/62 md:grid-cols-[1.2fr_.7fr_1.5fr_auto]">
                <span><strong className="text-softWhite/88">{item.templateName}</strong><br />{item.instanceId}</span><span>{item.position}</span><span>{item.title || "（无标题）"} → {item.nextTitle || "（无标题）"}</span><span>{[item.bodyChanged ? "正文" : "", item.layoutChanged ? "布局" : "", item.hasPlaceholder ? "图片占位" : ""].filter(Boolean).join(" / ") || "无内容变化"}</span>
              </div>)}</div>
              <button type="button" disabled={applying} className="mt-4 min-h-10 bg-acidGreen px-5 text-sm font-semibold text-deepIndigo disabled:opacity-50" onClick={() => void confirmApply()}>{applying ? (language === "zh" ? "正在备份…" : "Backing up...") : (language === "zh" ? "确认应用" : "Confirm apply")}</button>
            </div> : null}
          </>}
          {error ? <p className="mt-4 whitespace-pre-wrap text-sm text-peach">{error}</p> : null}
          {status ? <p className="mt-4 break-all text-sm text-acidGreen/82">{status}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
