// Machine-parseable progress marker protocol (Launcher sync UX, Section 2).
// A consuming launcher UI (DILIDA DESK -- a separate application, not part
// of this repo) reads this process's stdout line by line and picks out
// lines starting with PROGRESS_MARKER as structured stage events, instead of
// only learning anything after the whole subprocess exits. Every event is
// still followed by a plain human-readable line too, so a bare terminal run
// (`pnpm portfolio:launcher-publish`) stays fully readable without a UI.
import { SYNC_STAGES } from "./syncStateMachine.mjs";

export const PROGRESS_MARKER = "::PORTFOLIO_PROGRESS::";

const STAGE_IDS = new Set(SYNC_STAGES.map((stage) => stage.id));

/**
 * @param {string} stage one of SYNC_STAGES' ids
 * @param {"pending"|"running"|"success"|"warning"|"error"} status
 * @param {string} [messageZh]
 * @param {Record<string, unknown>} [extra] structured detail (commit sha, blocked items, attempts, elapsed, etc.)
 * @param {(line: string) => void} [write] injectable for tests; defaults to console.log
 */
export function emitProgress(stage, status, messageZh = "", extra = {}, write = (line) => console.log(line)) {
  if (!STAGE_IDS.has(stage)) throw new Error(`Unknown sync stage: ${stage}`);
  const event = { stage, status, message: messageZh, ...extra, at: new Date().toISOString() };
  write(`${PROGRESS_MARKER}${JSON.stringify(event)}`);
  if (messageZh) write(messageZh);
}

/**
 * The terminal event for a whole launcher-publish run -- the launcher UI
 * should treat this as authoritative for which of the 8 final states the
 * sync ended in, distinct from any individual stage's own status.
 * @param {{ outcome: string, stage?: string, messageZh?: string } & Record<string, unknown>} result
 */
export function emitOutcome(result, write = (line) => console.log(line)) {
  write(`${PROGRESS_MARKER}${JSON.stringify({ kind: "outcome", ...result, at: new Date().toISOString() })}`);
  if (result.messageZh) write(result.messageZh);
}

export function parseProgressLine(line) {
  if (!line.startsWith(PROGRESS_MARKER)) return null;
  try {
    return JSON.parse(line.slice(PROGRESS_MARKER.length));
  } catch {
    return null;
  }
}
