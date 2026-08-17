const DELIVERABLES_BRIDGE = "http://127.0.0.1:51823/portfolio-deliverables";

export type DeliverableDirection = {
  id: string;
  label: string;
  active: boolean;
};

export type DeliverableArtifact = {
  artifactId: string;
  slotKey: string;
  directionId?: string;
  artifactType: "portfolio-pdf" | "portfolio-html" | "complete-offline-html";
  absolutePath: string;
  fileName: string;
  fileExists: boolean;
  createdAt: string;
  updatedAt: string;
};

export class DeliverablesBridgeError extends Error {
  constructor(message: string, readonly slotOccupied = false) {
    super(message);
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) {
    const message = body.error || `DILIDA DESK bridge returned HTTP ${response.status}.`;
    throw new DeliverablesBridgeError(message, message.startsWith("SLOT_OCCUPIED:"));
  }
  return body;
}

export async function loadDeliverableDirections() {
  const response = await fetch(`${DELIVERABLES_BRIDGE}/directions`);
  return (await readResponse<{ directions: DeliverableDirection[] }>(response)).directions;
}

export async function registerDeliverablePath(input: {
  directionId: string;
  artifactType: "portfolio-pdf";
  sourcePath: string;
  replace: boolean;
}) {
  const response = await fetch(`${DELIVERABLES_BRIDGE}/register-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await readResponse<{ artifact: DeliverableArtifact }>(response)).artifact;
}

export async function registerDeliverableHtml(input: {
  directionId?: string;
  artifactType: "portfolio-html" | "complete-offline-html";
  fileName: string;
  html: string;
  replace: boolean;
}) {
  const response = await fetch(`${DELIVERABLES_BRIDGE}/register-content`, {
    method: "POST",
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "X-Deliverable-Direction": encodeURIComponent(input.directionId ?? ""),
      "X-Deliverable-Type": encodeURIComponent(input.artifactType),
      "X-Deliverable-Filename": encodeURIComponent(input.fileName),
      "X-Deliverable-Replace": input.replace ? "true" : "false",
    },
    body: input.html,
  });
  return (await readResponse<{ artifact: DeliverableArtifact }>(response)).artifact;
}

export async function runDeliverableAction(
  artifactId: string,
  action: "preview" | "open" | "reveal",
) {
  const response = await fetch(`${DELIVERABLES_BRIDGE}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactId, action }),
  });
  await readResponse<{ status: string }>(response);
}

export function deliverableFolderPath(absolutePath: string) {
  const separator = Math.max(absolutePath.lastIndexOf("\\"), absolutePath.lastIndexOf("/"));
  return separator >= 0 ? absolutePath.slice(0, separator) : "";
}
