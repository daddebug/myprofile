import type { TemplateFieldDefinition } from "./templateLibrary";

export const projectCodeAllowedNewTemplateIds = [
  "statement-longform",
  "supporting-note",
  "process-flow",
  "decision-table",
  "phase-milestones",
  "circle-summary",
  "image-row",
  "figma-prototype",
  "playable-game",
  "direction-compare",
] as const;

export type ProjectCodeTemplateId = typeof projectCodeAllowedNewTemplateIds[number];

export type ProjectCodeValidationIssue = {
  path: string;
  problem: string;
  expected: string;
  actual?: string;
  suggestion?: string;
};

type ProjectCodeTemplateContract = {
  rendererFields?: readonly string[];
  semantic: string;
  unsupported: string;
};

const templateContracts: Record<ProjectCodeTemplateId, ProjectCodeTemplateContract> = {
  "statement-longform": {
    semantic: "Chapter narrative and emphasized long-form argument. Split the composition across sectionNumber, leftTitle, statement, and body.",
    unsupported: "No generic heading or title. Put the chapter label into leftTitle and the core claim into statement.",
  },
  "supporting-note": {
    semantic: "Untitled supporting context, constraint, caveat, or transition. The only native content field is body.",
    unsupported: "No heading or title. If a title is essential, choose a template that natively supports one or rewrite this as an untitled note.",
  },
  "process-flow": {
    semantic: "A fixed six-step working process using items in the designed path composition.",
    unsupported: "No steps field and no variable step count.",
  },
  "decision-table": {
    semantic: "Structured comparison, trade-off, responsibility split, or validation plan.",
    unsupported: "No arbitrary table layout, CSS, or cells outside the declared column IDs.",
  },
  "phase-milestones": {
    semantic: "Three to twelve ordered milestones or phase outcomes.",
    unsupported: "Not a free-position timeline and not a general process-flow replacement.",
  },
  "circle-summary": {
    semantic: "Three to five parallel judgments or summary conclusions.",
    unsupported: "No arbitrary nodes, coordinates, icons, or extra item fields.",
  },
  "image-row": {
    rendererFields: ["columns", "rowAlignment"],
    semantic: "One to twelve empty result-image slots; real images are added later through the editor.",
    unsupported: "No real image references, free layout CSS, coordinates, spans, or invented asset fields.",
  },
  "figma-prototype": {
    semantic: "A Figma prototype presentation. A new AI-created instance must remain resource-empty for later editor binding.",
    unsupported: "No invented Figma URL, fallback image, external resource, or additional presentation fields.",
  },
  "playable-game": {
    rendererFields: ["aspectRatio"],
    semantic: "A playable build presentation. A new AI-created instance is an empty shell for later binding to a saved game.",
    unsupported: "No invented game, cover, gameId, entryPublicPath, coverId, publicUrl, or file metadata.",
  },
  "direction-compare": {
    semantic: "A two-sided before/after, direction A/B, platform, or design trade-off comparison with one image and concise copy per side.",
    unsupported: "No extra columns, arbitrary layout fields, third comparison side, or invented image resources.",
  },
};

const localized = (value: unknown) => {
  if (typeof value === "string") return { zh: value, en: "" };
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const describe = (value: unknown) => {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "string") return value.length ? "string" : "empty string";
  return typeof value;
};

function normalizeLocalizedFields(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    if (record[field] !== undefined) record[field] = localized(record[field]);
  }
}

function normalizeLocalizedItems(
  value: unknown,
  fields: string[],
) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (isRecord(item)) normalizeLocalizedFields(item, fields);
  }
}

/**
 * Only lossless text-shape compatibility belongs here. Resource references,
 * paths, IDs, and missing content are never invented during normalization.
 */
export function normalizeProjectCodeTemplateContent(
  templateId: string,
  source: Record<string, unknown>,
) {
  const content = structuredClone(source);

  if (templateId === "statement-longform") {
    normalizeLocalizedFields(content, ["sectionNumber", "leftTitle", "statement", "body"]);
  } else if (templateId === "supporting-note") {
    normalizeLocalizedFields(content, ["body"]);
  } else if (templateId === "process-flow") {
    normalizeLocalizedFields(content, ["heading"]);
    normalizeLocalizedItems(content.items, ["number", "title", "description"]);
  } else if (templateId === "decision-table") {
    normalizeLocalizedFields(content, ["heading"]);
    if (Array.isArray(content.columns)) {
      for (const column of content.columns) {
        if (isRecord(column) && column.title !== undefined) column.title = localized(column.title);
      }
    }
    if (Array.isArray(content.rows)) {
      for (const row of content.rows) {
        if (!isRecord(row) || !isRecord(row.cells)) continue;
        for (const [key, value] of Object.entries(row.cells)) row.cells[key] = localized(value);
      }
    }
  } else if (templateId === "phase-milestones") {
    normalizeLocalizedFields(content, ["heading"]);
    normalizeLocalizedItems(content.items, ["number", "title", "hoverTitle", "hoverText"]);
  } else if (templateId === "circle-summary") {
    normalizeLocalizedFields(content, ["heading"]);
    normalizeLocalizedItems(content.items, ["text"]);
  } else if (templateId === "image-row") {
    normalizeLocalizedFields(content, ["heading"]);
    normalizeLocalizedItems(content.items, ["alt", "caption", "placeholder"]);
  } else if (templateId === "figma-prototype") {
    normalizeLocalizedFields(content, ["heading", "caption"]);
  } else if (templateId === "playable-game") {
    normalizeLocalizedFields(content, ["heading", "description", "versionLabel"]);
    normalizeLocalizedItems(content.controls, ["key", "action"]);
  } else if (templateId === "direction-compare") {
    normalizeLocalizedFields(content, ["heading", "leftLabel", "rightLabel", "leftTitle", "rightTitle", "leftDescription", "rightDescription"]);
  }

  return content;
}

function addLocalizedIssue(
  issues: ProjectCodeValidationIssue[],
  value: unknown,
  path: string,
  optional = true,
) {
  if (value === undefined && optional) return;
  if (!isRecord(value) || typeof value.zh !== "string" || typeof value.en !== "string") {
    issues.push({
      path,
      problem: "must be localized text",
      expected: '{ "zh": "text", "en": "" } (English may be empty)',
      actual: describe(value),
    });
  }
}

function addArrayObjectIssue(
  issues: ProjectCodeValidationIssue[],
  value: unknown,
  path: string,
) {
  if (!isRecord(value)) {
    issues.push({ path, problem: "must be an object", expected: "object", actual: describe(value) });
    return false;
  }
  return true;
}

function addEnumIssue(
  issues: ProjectCodeValidationIssue[],
  value: unknown,
  path: string,
  allowed: readonly unknown[],
) {
  if (value !== undefined && !allowed.includes(value)) {
    issues.push({ path, problem: "has an unsupported value", expected: allowed.join(" | "), actual: JSON.stringify(value) });
  }
}

function addUnknownFieldIssues(
  issues: ProjectCodeValidationIssue[],
  value: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
  suggestion: string,
) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      issues.push({
        path: path ? `${path}.${key}` : key,
        problem: "is not a native field supported by this template",
        expected: allowed.join(" | "),
        actual: "field supplied",
        suggestion,
      });
    }
  }
}

function validateLocalizedArrayItems(
  issues: ProjectCodeValidationIssue[],
  value: unknown,
  path: string,
  fields: string[],
) {
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!addArrayObjectIssue(issues, item, itemPath)) return;
    for (const field of fields) addLocalizedIssue(issues, item[field], `${itemPath}.${field}`);
  });
}

export function validateProjectCodeTemplateContent(
  templateId: string,
  content: Record<string, unknown>,
  isNew: boolean,
  schema: TemplateFieldDefinition[] = [],
) {
  const issues: ProjectCodeValidationIssue[] = [];
  const contract = templateContracts[templateId as ProjectCodeTemplateId];

  if (isNew && contract) {
    const nativeFields = [
      ...schema.map((field) => field.id),
      ...(contract.rendererFields ?? []),
    ];
    const suggestion = templateId === "supporting-note"
      ? "Remove the title, or use an existing template that natively supports a chapter title."
      : templateId === "statement-longform"
        ? "Use sectionNumber, leftTitle, statement, and body instead of adding a generic heading/title."
        : "Remove the field and reorganize the content using this template's native structure.";
    addUnknownFieldIssues(issues, content, "", nativeFields, suggestion);
  }

  if (templateId === "statement-longform") {
    for (const field of ["sectionNumber", "leftTitle", "statement", "body"]) addLocalizedIssue(issues, content[field], field);
  } else if (templateId === "supporting-note") {
    addLocalizedIssue(issues, content.body, "body");
  } else if (templateId === "process-flow") {
    addLocalizedIssue(issues, content.heading, "heading");
    validateLocalizedArrayItems(issues, content.items, "items", ["number", "title", "description"]);
    if (isNew && Array.isArray(content.items)) content.items.forEach((item, index) => {
      if (isRecord(item)) addUnknownFieldIssues(issues, item, `items[${index}]`, ["id", "number", "title", "description"], "Use only the native process step fields.");
    });
  } else if (templateId === "decision-table") {
    addLocalizedIssue(issues, content.heading, "heading");
    const columnIds = new Set<string>();
    if (Array.isArray(content.columns)) content.columns.forEach((column, index) => {
      const path = `columns[${index}]`;
      if (!addArrayObjectIssue(issues, column, path)) return;
      if (typeof column.id !== "string" || !column.id.trim()) {
        issues.push({ path: `${path}.id`, problem: "must be a non-empty string", expected: "stable column ID", actual: describe(column.id) });
      } else if (columnIds.has(column.id)) {
        issues.push({ path: `${path}.id`, problem: "is duplicated", expected: "unique column ID", actual: JSON.stringify(column.id) });
      } else columnIds.add(column.id);
      addLocalizedIssue(issues, column.title, `${path}.title`, false);
      if (isNew) addUnknownFieldIssues(issues, column, path, ["id", "title"], "Use only id and localized title for each column.");
    });
    if (Array.isArray(content.rows)) content.rows.forEach((row, index) => {
      const path = `rows[${index}]`;
      if (!addArrayObjectIssue(issues, row, path)) return;
      if (!isRecord(row.cells)) {
        issues.push({ path: `${path}.cells`, problem: "must be an object keyed by column id", expected: "Record<columnId, localized text>", actual: describe(row.cells) });
        return;
      }
      for (const columnId of columnIds) addLocalizedIssue(issues, row.cells[columnId], `${path}.cells.${columnId}`);
      if (isNew) {
        addUnknownFieldIssues(issues, row, path, ["id", "cells"], "Store row text only inside cells, keyed by a declared column id.");
        addUnknownFieldIssues(issues, row.cells, `${path}.cells`, [...columnIds], "Remove cells that do not correspond to a declared column id.");
      }
    });
  } else if (templateId === "phase-milestones") {
    addLocalizedIssue(issues, content.heading, "heading");
    validateLocalizedArrayItems(issues, content.items, "items", ["number", "title", "hoverTitle", "hoverText"]);
    if (Array.isArray(content.items)) content.items.forEach((item, index) => {
      if (!isRecord(item)) return;
      if (isNew) addUnknownFieldIssues(issues, item, `items[${index}]`, ["id", "number", "title", "hoverTitle", "hoverText", "targetId", "state"], "Use only the native milestone fields.");
      addEnumIssue(issues, item.state, `items[${index}].state`, ["outline", "active"]);
      if (item.targetId !== undefined && typeof item.targetId !== "string") {
        issues.push({ path: `items[${index}].targetId`, problem: "must be text", expected: "string", actual: describe(item.targetId) });
      }
    });
  } else if (templateId === "circle-summary") {
    addLocalizedIssue(issues, content.heading, "heading");
    validateLocalizedArrayItems(issues, content.items, "items", ["text"]);
    if (isNew && Array.isArray(content.items)) content.items.forEach((item, index) => {
      if (isRecord(item)) addUnknownFieldIssues(issues, item, `items[${index}]`, ["id", "text"], "Use only id and localized text for each circle.");
    });
  } else if (templateId === "image-row") {
    addLocalizedIssue(issues, content.heading, "heading");
    addEnumIssue(issues, content.columns, "columns", [1, 2, 3, 4]);
    addEnumIssue(issues, content.rowAlignment, "rowAlignment", ["start", "center"]);
    for (const key of ["className", "style", "css", "grid", "gridColumn", "grid-column"]) {
      if (content[key] !== undefined) issues.push({ path: key, problem: "free layout fields are not supported", expected: "field omitted", actual: describe(content[key]) });
    }
    if (Array.isArray(content.items)) content.items.forEach((item, index) => {
      const path = `items[${index}]`;
      if (!addArrayObjectIssue(issues, item, path)) return;
      const allowedNewKeys = ["id", "alt", "caption", "placeholder", "suggestedAspectRatio", "suggestedImageCount", "imageDisplayMode", "imageCropRatio", "imageWidthMode", "hoverPreviewMode", "startNewRow", "image"];
      if (isNew) addUnknownFieldIssues(issues, item, path, allowedNewKeys, "Use an empty native Image Row slot and add the real image later through the editor.");
      for (const field of ["alt", "caption", "placeholder"]) addLocalizedIssue(issues, item[field], `${path}.${field}`);
      addEnumIssue(issues, item.imageDisplayMode, `${path}.imageDisplayMode`, ["cover", "natural"]);
      addEnumIssue(issues, item.imageCropRatio, `${path}.imageCropRatio`, ["16:9", "1:1"]);
      addEnumIssue(issues, item.imageWidthMode, `${path}.imageWidthMode`, ["card", "wide", "full"]);
      addEnumIssue(issues, item.hoverPreviewMode, `${path}.hoverPreviewMode`, ["none", "floating"]);
      if (item.suggestedAspectRatio !== undefined && typeof item.suggestedAspectRatio !== "string") {
        issues.push({ path: `${path}.suggestedAspectRatio`, problem: "must be text", expected: "string", actual: describe(item.suggestedAspectRatio) });
      }
      if (item.suggestedImageCount !== undefined && (
        typeof item.suggestedImageCount !== "number"
        || !Number.isInteger(item.suggestedImageCount)
        || item.suggestedImageCount < 1
        || item.suggestedImageCount > 12
      )) {
        issues.push({ path: `${path}.suggestedImageCount`, problem: "must be an integer from 1 to 12", expected: "1-12", actual: JSON.stringify(item.suggestedImageCount) });
      }
      if (item.startNewRow !== undefined && typeof item.startNewRow !== "boolean") {
        issues.push({ path: `${path}.startNewRow`, problem: "must be boolean", expected: "true | false", actual: describe(item.startNewRow) });
      }
      if (isNew && item.image !== undefined && item.image !== null) {
        issues.push({ path: `${path}.image`, problem: "new Image Row slots cannot contain real image data", expected: "null or omitted", actual: describe(item.image) });
      }
      if (isNew) {
        for (const key of ["localImageId", "assetId", "publicPath", "publicUrl", "blob", "base64"]) {
          if (item[key] !== undefined) issues.push({ path: `${path}.${key}`, problem: "resource fields cannot be created by AI", expected: "field omitted", actual: describe(item[key]) });
        }
      }
    });
  } else if (templateId === "figma-prototype") {
    for (const field of ["heading", "caption"]) addLocalizedIssue(issues, content[field], field);
    // captionTitle was removed from this template entirely — reject it
    // explicitly (not just via the generic isNew-only unknown-field check
    // below) so an edit to an existing instance that still echoes it back
    // gets the same clear rejection a brand-new instance would.
    if (content.captionTitle !== undefined) {
      issues.push({
        path: "captionTitle",
        problem: "is not a native field supported by this template",
        expected: "caption",
        actual: "field supplied",
        suggestion: "captionTitle has been removed from figma-prototype. Use caption instead.",
      });
    }
    if (content.figmaUrl !== undefined && typeof content.figmaUrl !== "string") {
      issues.push({ path: "figmaUrl", problem: "must be text", expected: "string", actual: describe(content.figmaUrl) });
    }
    if (isNew && ((typeof content.figmaUrl === "string" && content.figmaUrl.trim()) || content.fallbackImage)) {
      issues.push({ path: "figmaUrl/fallbackImage", problem: "new instances cannot invent an external prototype or image", expected: "empty figmaUrl and no fallbackImage", actual: "resource supplied" });
    }
  } else if (templateId === "playable-game") {
    for (const field of ["heading", "description", "versionLabel"]) addLocalizedIssue(issues, content[field], field);
    addEnumIssue(issues, content.status, "status", ["prototype", "in-development", "complete", "archived"]);
    addEnumIssue(issues, content.aspectRatio, "aspectRatio", ["16:9", "4:3", "auto"]);
    validateLocalizedArrayItems(issues, content.controls, "controls", ["key", "action"]);
    if (isNew && Array.isArray(content.controls)) content.controls.forEach((item, index) => {
      if (isRecord(item)) addUnknownFieldIssues(issues, item, `controls[${index}]`, ["id", "key", "action"], "Use only the native control fields.");
    });
    if (isNew && content.game !== undefined && content.game !== null) {
      issues.push({ path: "game", problem: "AI cannot create a real game build reference", expected: "null", actual: describe(content.game) });
    }
    if (isNew && content.cover !== undefined && content.cover !== null) {
      issues.push({ path: "cover", problem: "AI cannot create a real cover reference", expected: "null", actual: describe(content.cover) });
    }
  } else if (templateId === "direction-compare") {
    for (const field of ["heading", "leftLabel", "rightLabel", "leftTitle", "rightTitle", "leftDescription", "rightDescription"]) {
      addLocalizedIssue(issues, content[field], field);
    }
    addEnumIssue(issues, content.direction, "direction", ["left-to-right", "right-to-left", "none"]);
    for (const field of ["leftImage", "rightImage"] as const) {
      const image = content[field];
      if (isRecord(image)) {
        addUnknownFieldIssues(issues, image, field, ["imageId", "publicPath", "hoverPreviewMode"], "Only the hover preview setting may accompany the preserved stable image reference.");
        addEnumIssue(issues, image.hoverPreviewMode, `${field}.hoverPreviewMode`, ["none", "floating"]);
      }
    }
    if (isNew) {
      for (const field of ["leftImage", "rightImage"] as const) {
        if (content[field] !== undefined && content[field] !== null) {
          issues.push({ path: field, problem: "AI cannot create a real image reference", expected: "null or omitted", actual: describe(content[field]) });
        }
      }
    }
  }

  return issues;
}

function schemaLine(schema: TemplateFieldDefinition[]) {
  return schema.map((field) => {
    const range = field.min !== undefined || field.max !== undefined
      ? ` (${field.min ?? 0}-${field.max ?? "unbounded"} items)`
      : "";
    return `${field.id}:${field.type}${field.required ? " required" : " optional"}${range}`;
  }).join(", ");
}

const specificRules: Record<ProjectCodeTemplateId, string[]> = {
  "statement-longform": ["Native fields only: sectionNumber, leftTitle, statement, body.", "Do not return heading or title. Split a chapter heading into the native leftTitle/statement composition.", "All four text fields are localized {zh,en}."],
  "supporting-note": ["Native field only: body, localized as {zh,en}.", "This is intentionally untitled. Do not return heading or title."],
  "process-flow": ["Use content.items, never content.steps.", "items must contain exactly 6 objects.", "Each item may contain id and localized number, title, description."],
  "decision-table": ["columns: 1 or more { id, title:{zh,en} } objects.", "rows: 1-12 { id?, cells:{ [columnId]:{zh,en} } } objects."],
  "phase-milestones": ["items: 3-12 objects when supplied.", "Item state is outline|active; number/title/hoverTitle/hoverText are localized; targetId is text."],
  "circle-summary": ["items: 3-5 objects with localized text."],
  "image-row": ["New instances require 1-12 empty slots.", "image must be null or omitted.", "alt, caption, placeholder use {zh:string,en:string}; en may be empty.", "columns: 1|2|3|4; rowAlignment: start|center.", "imageDisplayMode: cover|natural; imageCropRatio: 16:9|1:1 (only meaningful when imageDisplayMode is cover; omitted/legacy items default to 16:9); imageWidthMode: card|wide|full; hoverPreviewMode: none|floating; startNewRow: boolean.", "New empty slots default to hoverPreviewMode:none.", "Never return localImageId, assetId, publicPath, publicUrl, Blob, Base64, CSS, className, style, grid coordinates, or span values."],
  "figma-prototype": ["New instances must use an empty figmaUrl and no fallbackImage; real resources are added later in the editor.", "heading and caption are localized.", "captionTitle is not a supported field — it has been removed from this template. Use caption instead."],
  "playable-game": ["New instances must use game:null and cover:null.", "Never invent gameId, entryPublicPath, coverId, publicUrl, or file paths.", "status: prototype|in-development|complete|archived; aspectRatio: 16:9|4:3|auto.", "heading, description, versionLabel and control key/action are localized."],
  "direction-compare": ["Native fields only: heading, leftLabel, rightLabel, leftTitle, rightTitle, leftDescription, rightDescription, leftImage, rightImage, direction.", "All seven text fields use localized {zh,en} objects.", "New instances must use leftImage:null and rightImage:null (or omit them).", "Existing leftImage/rightImage may use hoverPreviewMode:none|floating; never change their real imageId or publicPath.", "direction: left-to-right|right-to-left|none.", "Never invent imageId, assetId, localImageId, publicPath, publicUrl, file paths, CSS, className, style, coordinates, columns, or spans."],
};

export function projectCodeTemplateRulesForPrompt(
  schemas: Map<string, TemplateFieldDefinition[]>,
) {
  return [
    "TEMPLATE SELECTION RULES:",
    "- Chapter narrative: statement-longform.",
    "- Untitled supporting constraint or note: supporting-note.",
    "- Exactly six working steps: process-flow.",
    "- Comparison, trade-off, responsibility split, or validation plan: decision-table.",
    "- Phase outcomes: phase-milestones.",
    "- Parallel relationships or conclusions: circle-summary.",
    "- Result images: image-row.",
    "- Figma prototype: figma-prototype.",
    "- Playable build: playable-game.",
    "- Before/after, direction A/B, platform, or two-proposal comparison: direction-compare.",
    "- A piece of content having a title does not permit adding heading/title to an arbitrary template.",
    "- If no existing template natively fits, rewrite the content or omit that module. Never extend template fields.",
    "- Return project JSON only. Never suggest, request, or assume changes to template components, styles, registry, validators, schemas, or underlying code.",
    "",
    "NATIVE TEMPLATE CONTRACTS:",
    ...projectCodeAllowedNewTemplateIds.flatMap((templateId) => {
    const schema = schemas.get(templateId) ?? [];
    const contract = templateContracts[templateId];
    const nativeFields = [...schema.map((field) => field.id), ...(contract.rendererFields ?? [])];
    return [
      `- ${templateId}: native content fields = ${nativeFields.join(", ") || "none"}.`,
      `  - Registry schema: ${schemaLine(schema)}`,
      `  - Use for: ${contract.semantic}`,
      `  - Does not support: ${contract.unsupported}`,
      ...specificRules[templateId].map((rule) => `  - ${rule}`),
    ];
    }),
  ];
}
