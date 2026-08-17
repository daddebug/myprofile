# Game Experience AI Import Invariants

The Game Experience AI import is a candidate-data workflow. AI output never writes storage directly.

1. AI import never replaces an existing Game Experience record wholesale.
2. Existing-game input is matched by normalized stable title identity and merged into that canonical record.
3. Missing optional facts remain absent and render no placeholder UI.
4. Quantitative facts are accepted only when explicitly present in the user's notes; the AI must not infer them.
5. Existing covers and all other asset references are outside the AI contract and remain unchanged.
6. New records are created as drafts without covers.
7. Every mutation requires schema validation, a human-readable preview, selection, and explicit confirmation.
8. Internal verification/uncertainty language (transcription artifacts, "待确认"/"需核实"/"TBD" and equivalents) must never reach a content field (title, titleZh, titleEn, playtimeLabel, completionStatus, shortSummary, whyPlayed, strengths, weaknesses, contribution, detail). `parseGame` enforces this deterministically via `contentText`/`localized`, independent of prompt compliance: contaminated optional fields are dropped and the reason is folded into that game's `warnings` (preview-only, never merged into the stored record); a contaminated title fails validation outright, since a corrupted identity cannot be safely matched or displayed.

The deterministic implementation lives in `src/lib/gameExperienceAiImport.ts`. UI code must consume that implementation rather than duplicating matching or merge rules.
