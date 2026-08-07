# Project Deletion

Reusable procedure for permanently removing one exact project from the portfolio.

## Requirements

- Require one exact project ID/slug as the deletion target. Never guess a slug.
- Preserve every project that does not exactly match the target — this includes any project that exists only in browser localStorage/IndexedDB, is marked `isDynamic: true`, or cannot be inspected from an isolated/disposable browser profile.
- Do not require knowing a "replacement" project's slug before proceeding, when the replacement can be protected simply by preserving all dynamic projects and touching only the exact target ID. Do not block the task indefinitely waiting for information the user cannot practically provide.

## Execution order

1. Stop the dev server first, so HMR/autosave cannot rewrite stale data mid-deletion.
2. Search the repository for every exact reference to the target project ID (catalog, routes, export/publish lists, metadata defaults, migration adapters, legacy loaders, compatibility code).
3. Remove exact catalog, route, export, publish, and saved-selection references.
4. Remove only the exact draft/storage records for the target — never clear an entire storage key, database, or store.
5. Before deleting any image blob: read the target's draft, collect its exact referenced asset IDs, and check whether any other project references those same IDs. Delete only assets proven exclusive to the target. Preserve shared or uncertain assets and report them as retained.
6. Remove project-exclusive source files only after a repository-wide search proves no remaining users. Do not remove a shared utility merely because the deleted project used it.
7. Restart the dev server once, after all changes are complete.
8. Verify.

## Do not

- Do not perform migration, normalization, or adapter-building work when deletion was requested — that is a different task.
- Do not write an audit when deletion was requested — investigate only as far as needed to execute safely.
- Do not touch any project other than the exact target.
- Do not commit, push, or publish unless separately requested.

## Verify

- Target is absent from the archive.
- The old route no longer renders the target.
- Target is absent from `/export` project selection.
- Every other project (static and dynamic) still renders/lists normally.
- `pnpm typecheck` and `pnpm build` both pass.

## When browser-side data can't be reached

If real localStorage/IndexedDB records can't be safely accessed from the current environment, do not guess or delete them. Remove every source/catalog/route reference instead, and report the exact browser records (keys, database names, nested JSON paths) that still require deletion in the owner's own browser, with the exact removal snippet.
