import { createStableId, localized, type ProjectDiagramNode } from "./projectDocuments";

export type XMindConversionStyle = "hierarchy-map" | "horizontal-flow" | "vertical-flow" | "branching-tree" | "user-flow" | "relationship-map";
export type ParsedXMindSheet = { id: string; title: string; nodes: ProjectDiagramNode[] };
export type NormalizedXMindGroup = {
  id: string;
  title: string;
  items: string[];
};
export type NormalizedXMindBranch = {
  id: string;
  title: string;
  groups: NormalizedXMindGroup[];
};
export type NormalizedXMindDocument = {
  fileName: string;
  sheetTitle: string;
  centerTopic: string;
  branches: NormalizedXMindBranch[];
};

function findEndOfCentralDirectory(view: DataView) {
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function inflateRaw(data: Uint8Array) {
  if (!("DecompressionStream" in window)) throw new Error("This browser cannot decompress modern XMind files.");
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  const stream = new Blob([bytes.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntry(file: File, wantedName: string) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const end = findEndOfCentralDirectory(view);
  if (end < 0) throw new Error("This file is not a valid XMind ZIP archive.");
  const entryCount = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("The XMind ZIP directory is invalid.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, fileNameLength));
    if (name === wantedName) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("The XMind ZIP entry is invalid.");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer, dataOffset, compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflateRaw(compressed);
      throw new Error(`Unsupported XMind compression method: ${method}.`);
    }
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return null;
}

function noteText(topic: Record<string, any>) {
  return topic.notes?.plain?.content ?? topic.notes?.html?.content?.replace(/<[^>]+>/g, " ").trim() ?? "";
}

function flattenTopic(topic: Record<string, any>, parentId: string | undefined, order: number, nodes: ProjectDiagramNode[]) {
  const id = typeof topic.id === "string" && topic.id ? `xmind-${topic.id}` : createStableId("node");
  const title = typeof topic.title === "string" && topic.title.trim() ? topic.title.trim() : "Untitled topic";
  nodes.push({
    id, parentId, title: localized(title, ""), description: localized(noteText(topic), ""),
    nodeType: parentId ? "branch" : "root", emphasis: !parentId, order,
  });
  const children = topic.children?.attached;
  if (Array.isArray(children)) children.forEach((child, childIndex) => flattenTopic(child, id, childIndex, nodes));
}

export async function parseXMindFile(file: File): Promise<ParsedXMindSheet[]> {
  if (!file.name.toLowerCase().endsWith(".xmind")) throw new Error("Choose an .xmind file.");
  const content = await readZipEntry(file, "content.json");
  if (!content) {
    const legacy = await readZipEntry(file, "content.xml");
    if (legacy) throw new Error("Legacy content.xml XMind files are not supported yet. Export this map from a modern XMind version first.");
    throw new Error("The XMind archive does not contain content.json.");
  }
  let sheets: unknown;
  try { sheets = JSON.parse(new TextDecoder().decode(content)); } catch { throw new Error("The XMind content.json file is invalid."); }
  if (!Array.isArray(sheets)) throw new Error("The XMind file contains no readable sheets.");
  return sheets.flatMap((sheet, index) => {
    if (!sheet || typeof sheet !== "object" || !(sheet as any).rootTopic) return [];
    const nodes: ProjectDiagramNode[] = [];
    flattenTopic((sheet as any).rootTopic, undefined, 0, nodes);
    return [{ id: String((sheet as any).id ?? index), title: String((sheet as any).title ?? `Sheet ${index + 1}`), nodes }];
  });
}

function localizedText(
  value: ProjectDiagramNode["title"] | ProjectDiagramNode["description"],
) {
  if (!value) return "";
  return value.zh.trim() || value.en.trim();
}

function descendantPoints(
  node: ProjectDiagramNode,
  childrenByParent: Map<string, ProjectDiagramNode[]>,
) {
  const points: string[] = [];
  const description = localizedText(node.description);
  if (description) points.push(description);

  const visit = (parentId: string) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      const title = localizedText(child.title);
      const childDescription = localizedText(child.description);
      if (title) points.push(title);
      if (childDescription) points.push(childDescription);
      visit(child.id);
    }
  };
  visit(node.id);
  return points;
}

export function normalizeParsedXMind(
  fileName: string,
  sheets: ParsedXMindSheet[],
): NormalizedXMindDocument {
  const sheet = sheets[0];
  if (!sheet) throw new Error("The XMind file contains no readable sheet.");

  const orderedNodes = [...sheet.nodes].sort((a, b) => a.order - b.order);
  const root = orderedNodes.find((node) => !node.parentId);
  if (!root) throw new Error("The XMind file contains no center topic.");

  const childrenByParent = new Map<string, ProjectDiagramNode[]>();
  for (const node of orderedNodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.order - b.order);
  }

  const branches = (childrenByParent.get(root.id) ?? []).map((branch) => {
    const directGroups = childrenByParent.get(branch.id) ?? [];
    const groups = directGroups.length
      ? directGroups.map((group) => {
          const items = descendantPoints(group, childrenByParent);
          return {
            id: group.id,
            title: localizedText(group.title),
            items,
          };
        })
      : [{
          id: `${branch.id}-detail`,
          title: localizedText(branch.title),
          items: descendantPoints(branch, childrenByParent),
        }];

    return {
      id: branch.id,
      title: localizedText(branch.title),
      groups,
    };
  });

  return {
    fileName,
    sheetTitle: sheet.title,
    centerTopic: localizedText(root.title),
    branches,
  };
}

export async function importXMindDocument(file: File) {
  return normalizeParsedXMind(file.name, await parseXMindFile(file));
}
