# Safe Project Editing

Applies to normal project changes: bug fixes, feature work, layout/visual fixes, template edits.

## Communication

- The user is not a programmer. Explain the visible cause directly, in plain terms — not in implementation jargon.
- Work on one explicit goal at a time. Don't fold in adjacent fixes unless asked.
- Do not perform broad audits unless requested.

## Scope discipline

- Do not make unrelated changes.
- Do not refactor shared architecture without explicit approval.
- Do not create test projects unless explicitly necessary and authorized.
- Do not leave synthetic projects, test drafts, test assets, or temporary catalog entries behind — clean up anything created for verification before finishing.
- Do not modify normal website visuals to solve an export-only problem. Export-only changes must be query-gated (e.g. `?collectionExport=1`) or isolated to the export compositor — never a bare change to shared component output.

## Data safety

- Never clear localStorage or IndexedDB.
- Never reset storage keys (e.g. bumping a version to force a clean slate) — storage schemas evolve in place.
- Never delete image blobs without exact reference checking (confirm nothing else references the blob before deleting).
- Never overwrite drafts with defaults or recovery candidates.
- Prefer non-destructive migrations: read old shapes and upgrade in memory/on write, rather than dropping and recreating stores or files.

## Git safety

- Never use `git reset`, `git clean`, force push, or a broad `git checkout`.
- Preserve all uncommitted user work.

## Checks

- For normal TypeScript work, run `pnpm typecheck`.
- Run `pnpm build` only when requested, before publishing, or when build-time behavior changed.
- Run `cargo check` only when Rust changed.

## Verification standard

- Screenshots and real browser output are stronger evidence than a written completion report.
- Do not claim visual success without checking the real affected page.

## Final report

State only:

- files changed
- exact result
- checks run
- anything still unresolved
