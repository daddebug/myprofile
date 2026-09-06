export type GeneratedIconBrief = {
  iconName: string;
  metaphor: "network" | "path" | "gap" | "growth" | "balance" | "focus";
  composition: string;
  keywords: string[];
};

export type GeneratedSvgIcon = {
  title: string;
  description: string;
  svg: string;
  brief: GeneratedIconBrief;
};

export type GeneratedIconLibraryEntry = {
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

export type GenerateIconInput = {
  title: string;
  moduleDescription: string;
  keywords: string;
};

const conceptRules: Array<{ metaphor: GeneratedIconBrief["metaphor"]; pattern: RegExp; name: string; composition: string }> = [
  { metaphor: "network", pattern: /公会|社交|协作|连接|社区|guild|social|network|collabor/i, name: "connected-community", composition: "Three connected nodes held by one open system ring" },
  { metaphor: "gap", pattern: /挑战|问题|风险|割裂|阻力|冲突|challenge|risk|problem|gap|friction/i, name: "bridged-gap", composition: "Two separated structures connected by a deliberate bridge" },
  { metaphor: "growth", pattern: /成长|养成|提升|机会|潜力|growth|progress|opportunity|potential/i, name: "progress-path", composition: "A rising path moving through three measured stages" },
  { metaphor: "balance", pattern: /平衡|取舍|对比|判断|balance|trade.?off|compare|decision/i, name: "balanced-system", composition: "Two equal forces arranged around one stable center" },
  { metaphor: "focus", pattern: /洞察|定位|目标|核心|focus|insight|target|core/i, name: "focused-insight", composition: "A precise focus frame around one central signal" },
];

function normalizedKeywords(input: GenerateIconInput) {
  const values = input.keywords
    .split(/[,，、;；\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)].slice(0, 8);
}

export function createIconBrief(input: GenerateIconInput): GeneratedIconBrief {
  const keywords = normalizedKeywords(input);
  const semanticText = `${input.title} ${input.moduleDescription} ${keywords.join(" ")}`;
  const matched = conceptRules.find((rule) => rule.pattern.test(semanticText)) ?? {
    metaphor: "path" as const,
    name: "structured-direction",
    composition: "A clear route moving from an open origin toward one resolved point",
  };
  return {
    iconName: matched.name,
    metaphor: matched.metaphor,
    composition: matched.composition,
    keywords,
  };
}

const drawings: Record<GeneratedIconBrief["metaphor"], string[]> = {
  network: [
    '<circle cx="32" cy="18" r="6"/><circle cx="18" cy="40" r="6"/><circle cx="46" cy="40" r="6"/><path d="M28.8 23.1 21.2 34.9M35.2 23.1l7.6 11.8M24 40h16"/><path d="M13 52c5.4-4.7 11.7-7 19-7s13.6 2.3 19 7"/>',
    '<circle cx="20" cy="23" r="6"/><circle cx="44" cy="23" r="6"/><circle cx="32" cy="44" r="6"/><path d="m25.5 25.8 4.1 12.4m8.9-12.4-4.1 12.4M26 23h12"/><path d="M12 48c4.8 4 11.5 6 20 6s15.2-2 20-6"/>',
  ],
  path: [
    '<circle cx="14" cy="46" r="4"/><circle cx="32" cy="32" r="4"/><circle cx="50" cy="17" r="4"/><path d="M17.5 43.3 28.5 34.7M35.1 29.4l11.8-9.8"/><path d="M42 14h11v11"/>',
    '<path d="M12 47c9-1 10-14 20-15s11-13 20-15"/><circle cx="12" cy="47" r="4"/><circle cx="32" cy="32" r="4"/><circle cx="52" cy="17" r="4"/><path d="M45 13h11v11"/>',
  ],
  gap: [
    '<path d="M10 18h17v12H17v16h10M54 18H37v12h10v16H37"/><path d="M24 38h16M35 33l5 5-5 5"/>',
    '<path d="M12 17h16v30H12M52 17H36v30h16"/><path d="M24 27h16M24 37h16"/><circle cx="32" cy="32" r="5"/>',
  ],
  growth: [
    '<path d="M13 49h38M17 43l10-10 8 6 14-20"/><path d="M40 19h9v9"/><circle cx="17" cy="43" r="3"/><circle cx="27" cy="33" r="3"/><circle cx="35" cy="39" r="3"/>',
    '<path d="M16 50V38h10v12M27 50V29h10v21M38 50V18h10v32"/><path d="m17 28 12-9 8 4 11-11"/><path d="M41 12h7v7"/>',
  ],
  balance: [
    '<path d="M32 13v38M17 20h30M21 20l-9 17h18l-9-17ZM43 20l-9 17h18l-9-17ZM22 51h20"/>',
    '<circle cx="32" cy="32" r="6"/><path d="M10 32h16M38 32h16M32 10v16M32 38v16"/><circle cx="14" cy="32" r="4"/><circle cx="50" cy="32" r="4"/><circle cx="32" cy="14" r="4"/><circle cx="32" cy="50" r="4"/>',
  ],
  focus: [
    '<path d="M12 25V12h13M39 12h13v13M52 39v13H39M25 52H12V39"/><circle cx="32" cy="32" r="10"/><circle cx="32" cy="32" r="3"/>',
    '<circle cx="29" cy="29" r="15"/><path d="m40 40 12 12M29 20v18M20 29h18"/><circle cx="29" cy="29" r="5"/>',
  ],
};

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function generateSvgIcon(input: GenerateIconInput, variant = 0): GeneratedSvgIcon {
  const brief = createIconBrief(input);
  const alternatives = drawings[brief.metaphor];
  const drawing = alternatives[Math.abs(variant) % alternatives.length];
  const title = input.title.trim() || brief.iconName;
  const description = `${brief.composition}. ${brief.keywords.join(", ")}`.trim();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" role="img"><title>${escapeXml(title)}</title><desc>${escapeXml(description)}</desc>${drawing}</svg>`;
  return { title, description, svg, brief };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok || body.error) throw new Error(body.error ?? "Generated icon request failed.");
  return body;
}

export async function listGeneratedIcons() {
  return readJson<{ icons: GeneratedIconLibraryEntry[] }>(await fetch("/__generated-icons/library"));
}

export async function saveGeneratedIcon(input: {
  icon: GeneratedSvgIcon;
  projectId: string;
  moduleId: string;
  prompt: string;
}) {
  return readJson<{ icon: GeneratedIconLibraryEntry }>(await fetch("/__generated-icons/library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}
