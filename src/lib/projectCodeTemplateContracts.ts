import type { TemplateFieldDefinition } from "./templateLibrary";
import { ACTIVE_P2_TEMPLATE_IDS } from "./projectTemplateInstances";

// One source of truth shared by renderer hydration and AI authoring.
export const projectCodeAllowedNewTemplateIds = ACTIVE_P2_TEMPLATE_IDS;

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
    semantic: "IMPACT -- a restricted final-result statement, not a general-purpose note. Use ONLY when the source content already states an evidenced, already-happened outcome: a quantitative result, a KPI/metric change, conversion/retention/repurchase uplift, a usability-test result, a validated outcome, confirmed production/business impact, an efficiency or user-behaviour improvement, or another confirmed qualitative result. Belongs near the narrative's final phase -- after the solution/validation, at or near the project ending -- never before it, unless the source explicitly describes a result already validated at that earlier point. The only native content field is body.",
    unsupported: "Never for project background, a problem statement, a design goal or rationale, a hypothesis, an expected/anticipated benefit, a future plan, a limitation, an ordinary summary paragraph, or a generic conclusion. Never for an unverified or hoped-for effect (\"I hope...\", \"expected to...\", \"should in theory...\"). If the source content contains no real outcome evidence, do not create this template at all -- even if the project superficially 'should' have a result, never invent or infer one. Use statement-longform (Body) or another semantically matching template instead. No heading or title either way.",
  },
  "image-row": {
    semantic: "Exactly two empty result-image slots shown side by side; real images are added later through the editor. For a single image, video, Figma prototype, or playable build, use universal-media instead.",
    unsupported: "No real image references, manual columns, row alignment, width modes, free layout CSS, coordinates, spans, or invented asset fields.",
  },
  "universal-media": {
    semantic: "A single media presentation whose editor-bound resource may be an image, muted looping video, Figma prototype, or playable game.",
    unsupported: "AI may select a media type but cannot invent resource URLs, image IDs, local paths, Figma URLs, game IDs, or playable build metadata.",
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
  if (!(ACTIVE_P2_TEMPLATE_IDS as readonly string[]).includes(templateId)) return content;

  if (templateId === "statement-longform") {
    normalizeLocalizedFields(content, ["sectionNumber", "leftTitle", "statement", "body"]);
  } else if (templateId === "supporting-note") {
    normalizeLocalizedFields(content, ["body"]);
  } else if (templateId === "image-row") {
    normalizeLocalizedFields(content, ["heading"]);
    normalizeLocalizedItems(content.items, ["alt", "caption", "placeholder"]);
  } else if (templateId === "universal-media") {
    normalizeLocalizedFields(content, ["heading", "caption"]);
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
  if (!(ACTIVE_P2_TEMPLATE_IDS as readonly string[]).includes(templateId)) {
    return [{
      path: "templateId",
      problem: "is retired and cannot enter active Portfolio 2.0 content",
      expected: ACTIVE_P2_TEMPLATE_IDS.join(" | "),
      actual: JSON.stringify(templateId),
    }];
  }
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
  } else if (templateId === "image-row") {
    addLocalizedIssue(issues, content.heading, "heading");
    for (const key of ["className", "style", "css", "grid", "gridColumn", "grid-column", "columns", "rowAlignment"]) {
      if (content[key] !== undefined) issues.push({ path: key, problem: "free layout fields are not supported", expected: "field omitted", actual: describe(content[key]) });
    }
    if (Array.isArray(content.items)) content.items.forEach((item, index) => {
      const path = `items[${index}]`;
      if (!addArrayObjectIssue(issues, item, path)) return;
      const allowedNewKeys = ["id", "alt", "caption", "placeholder", "suggestedAspectRatio", "suggestedImageCount", "imageDisplayMode", "hoverPreviewMode", "image"];
      if (isNew) addUnknownFieldIssues(issues, item, path, allowedNewKeys, "Use an empty native Image Row slot and add the real image later through the editor.");
      for (const field of ["alt", "caption", "placeholder"]) addLocalizedIssue(issues, item[field], `${path}.${field}`);
      addEnumIssue(issues, item.imageDisplayMode, `${path}.imageDisplayMode`, ["cover", "natural"]);
      addEnumIssue(issues, item.imageCropRatio, `${path}.imageCropRatio`, ["16:9", "1:1"]);
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
      if (isNew && item.image !== undefined && item.image !== null) {
        issues.push({ path: `${path}.image`, problem: "new Image Row slots cannot contain real image data", expected: "null or omitted", actual: describe(item.image) });
      }
      if (isNew) {
        for (const key of ["localImageId", "assetId", "publicPath", "publicUrl", "blob", "base64"]) {
          if (item[key] !== undefined) issues.push({ path: `${path}.${key}`, problem: "resource fields cannot be created by AI", expected: "field omitted", actual: describe(item[key]) });
        }
      }
    });
  } else if (templateId === "universal-media") {
    addLocalizedIssue(issues, content.heading, "heading");
    addLocalizedIssue(issues, content.caption, "caption");
    const media = content.media;
    if (!isRecord(media)) {
      issues.push({ path: "media", problem: "must be a discriminated media object", expected: "{ type: image|video|figma|playable-game, ... }", actual: describe(media) });
    } else {
      addEnumIssue(issues, media.type, "media.type", ["image", "video", "figma", "playable-game"]);
      if (media.type === "image") {
        if (!isRecord(media.image)) issues.push({ path: "media.image", problem: "must be an image reference object", expected: "empty object for a new AI-created instance", actual: describe(media.image) });
        if (isNew && isRecord(media.image) && Object.keys(media.image).length > 0) issues.push({ path: "media.image", problem: "AI cannot create a real image reference", expected: "{}", actual: "resource supplied" });
        if (isNew) addUnknownFieldIssues(issues, media, "media", ["type", "image"], "Use only the image discriminator and an empty image object.");
      } else if (media.type === "video") {
        if (!isRecord(media.video) || typeof media.video.src !== "string") issues.push({ path: "media.video", problem: "must contain src text", expected: "{ src: string, poster?: string }", actual: describe(media.video) });
        if (isNew && isRecord(media.video) && (media.video.src || media.video.poster)) issues.push({ path: "media.video", problem: "AI cannot invent video resources", expected: "{ src: '' }", actual: "resource supplied" });
        if (isNew) addUnknownFieldIssues(issues, media, "media", ["type", "video"], "Use only the video discriminator and an empty video reference.");
      } else if (media.type === "figma") {
        if (typeof media.figmaUrl !== "string") issues.push({ path: "media.figmaUrl", problem: "must be text", expected: "string", actual: describe(media.figmaUrl) });
        if (isNew && (media.figmaUrl || media.fallbackImage)) issues.push({ path: "media", problem: "AI cannot invent a Figma or image resource", expected: "empty figmaUrl and no fallbackImage", actual: "resource supplied" });
        if (isNew) addUnknownFieldIssues(issues, media, "media", ["type", "figmaUrl"], "Use only the Figma discriminator and an empty figmaUrl.");
      } else if (media.type === "playable-game") {
        if (isNew && media.game !== undefined && media.game !== null) issues.push({ path: "media.game", problem: "AI cannot create a real game reference", expected: "null or omitted until editor binding", actual: describe(media.game) });
        if (isNew) addUnknownFieldIssues(issues, media, "media", ["type", "game"], "Use only the playable-game discriminator with no real game reference.");
      }
    }
  } else if (templateId === "direction-compare") {
    for (const field of ["heading", "leftLabel", "rightLabel", "leftTitle", "rightTitle", "leftDescription", "rightDescription"]) {
      addLocalizedIssue(issues, content[field], field);
    }
    addEnumIssue(issues, content.direction, "direction", ["left-to-right", "right-to-left", "none"]);
    for (const field of ["leftImage", "rightImage"] as const) {
      const image = content[field];
      if (isRecord(image)) {
        addUnknownFieldIssues(issues, image, field, ["imageId", "publicPath", "hoverPreviewMode", "annotationEnabled", "annotations"], "Only existing editor-managed interaction settings may accompany the preserved stable image reference.");
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
  "supporting-note": [
    "Native field only: body, localized as {zh,en}. This is intentionally untitled -- do not return heading or title.",
    "IMPACT is opt-in by evidence, never a default template. If unsure whether the source content counts as real evidence, do not use supporting-note -- use statement-longform (Body) instead.",
    "Legal content: a stated metric/KPI change, conversion/retention/repurchase uplift, a usability-test result, a validated outcome, confirmed production/business impact, an efficiency or user-behaviour improvement, or another already-confirmed qualitative result.",
    "Forbidden content: background, problem statement, design goal, design rationale, hypothesis, expected/anticipated benefit, future plan, limitation, an ordinary summary paragraph, or a generic conclusion -- including any unverified or hoped-for effect. Route all of these to statement-longform (Body) or another matching template instead.",
    "Never invent or infer a percentage, test result, business uplift, KPI, or success conclusion to justify creating this template -- a project 'should' have a result is not evidence that it does.",
    "Position: only near the narrative's final phase, after the solution/validation, at or near the project ending. Not right after the cover, during context/problem, in the first half of research, or mid-exploration -- unless the source explicitly describes a result already validated at that point.",
  ],
  "image-row": ["New instances require exactly 2 empty slots -- this template is always a single side-by-side image pair; use universal-media for a lone image.", "image must be null or omitted.", "alt, caption, placeholder use {zh:string,en:string}; en may be empty.", "Do not return columns, rowAlignment, imageWidthMode, startNewRow, CSS, grid coordinates, spans, or other manual layout controls.", "imageDisplayMode may be cover|natural; hoverPreviewMode may be none|floating. New empty slots default to hoverPreviewMode:none.", "Never return localImageId, assetId, publicPath, publicUrl, Blob, Base64, CSS, className, style, grid coordinates, or span values."],
  "universal-media": ["Native fields only: heading, media, caption.", "media is a discriminated union with type image|video|figma|playable-game.", "New instances must contain no real resource reference; resources are selected in the editor.", "Never invent URLs, asset IDs, image IDs, game IDs, file paths, or binary data."],
  "direction-compare": ["Native fields only: heading, leftLabel, rightLabel, leftTitle, rightTitle, leftDescription, rightDescription, leftImage, rightImage, direction.", "All seven text fields use localized {zh,en} objects.", "New instances must use leftImage:null and rightImage:null (or omit them).", "Existing leftImage/rightImage may preserve editor-managed hoverPreviewMode, annotationEnabled, and annotations; never create or change their real imageId, publicPath, or annotation evidence resources.", "direction: left-to-right|right-to-left|none.", "Never invent imageId, assetId, localImageId, publicPath, publicUrl, file paths, CSS, className, style, coordinates, columns, or spans."],
};

export function projectCodeTemplateRulesForPrompt(
  schemas: Map<string, TemplateFieldDefinition[]>,
) {
  return [
    "TEMPLATE SELECTION RULES:",
    "- Chapter narrative, background, problem statement, design goal/rationale, hypothesis, expected/future benefit, limitation, or an ordinary summary/conclusion: statement-longform (Body). This is the default for plain narrative text and analysis that is not a verified result.",
    "- IMPACT (supporting-note) is a RESTRICTED final-result template, opt-in by evidence -- not a default and not a general note/summary/transition template. Use it ONLY when the source content already states an evidenced, already-happened outcome (a metric/KPI change, conversion/retention/repurchase uplift, a usability-test result, a validated outcome, confirmed production/business impact, an efficiency or user-behaviour improvement, or another confirmed qualitative result), placed near the narrative's final phase after the solution/validation. Never invent or infer a result to justify using it. If the source has only ordinary text, analysis, judgment, or an unverified conclusion -- or if you are unsure -- use statement-longform (Body) instead, never supporting-note.",
    "- A single image, video, Figma prototype, or playable build: universal-media.",
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
