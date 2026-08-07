export type TemplateSourceRecord = {
  fileName: string;
  filePath: string;
  code: string;
};

export type LayoutControls = Record<string, string>;

export const templateFilesById: Record<string, string> = {
  "project-header": "ProjectHeaderTemplate",
  "statement-longform": "StatementLongformTemplate",
  "xmind-breakdown": "XMindBreakdownTemplate",
  "supporting-note": "SupportingNoteTemplate",
  "phase-milestones": "PhaseMilestonesTemplate",
  "circle-summary": "CircleSummaryTemplate",
  "decision-table": "DecisionTableTemplate",
  "image-row": "ImageRowTemplate",
  "figma-prototype": "FigmaPrototypeTemplate",
  "process-flow": "ProcessFlowTemplate",
};

async function readJson<T>(response: Response): Promise<T> {
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok || result.error) {
    throw new Error(result.error ?? "Template request failed.");
  }
  return result;
}

export async function loadTemplateSource(
  fileName: string,
): Promise<TemplateSourceRecord> {
  const response = await fetch(
    `/__local-templates/source?fileName=${encodeURIComponent(fileName)}`,
  );
  return readJson<TemplateSourceRecord>(response);
}

export async function prepareTemplatePreview(
  code: string,
  previewKey: string,
) {
  const response = await fetch("/__local-templates/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, previewKey }),
  });
  return readJson<{ moduleUrl: string; revision: string }>(response);
}

export async function saveTemplateSource(input: {
  fileName: string;
  code: string;
  saveAs?: boolean;
}) {
  const response = await fetch("/__local-templates/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<{
    fileName: string;
    filePath: string;
    backupPath?: string;
  }>(response);
}

export function parseLayoutControls(
  code: string,
  keys: string[],
): LayoutControls | null {
  if (!keys.length) return null;
  const result: LayoutControls = {};
  for (const key of keys) {
    const match = code.match(
      new RegExp(`${key}:\\s*["']([^"']*)["']`),
    );
    if (!match) return null;
    result[key] = match[1];
  }
  return result;
}

export function updateLayoutControl(
  code: string,
  key: string,
  value: string,
) {
  const pattern = new RegExp(`(${key}:\\s*)["'][^"']*["']`);
  if (!pattern.test(code)) return code;
  return code.replace(pattern, `$1${JSON.stringify(value)}`);
}

export function sourceForSaveAs(
  code: string,
  nextId: string,
  nextComponentName: string,
) {
  return code
    .replace(
      /(export const templateMeta[\s\S]*?\bid:\s*)["'][^"']+["']/,
      `$1${JSON.stringify(nextId)}`,
    )
    .replace(
      /export default function\s+[A-Za-z0-9_]+/,
      `export default function ${nextComponentName}`,
    );
}
