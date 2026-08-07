# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Dilida Duman's personal Game UX / Interaction Design portfolio. React 19 + TypeScript + Vite + Tailwind + Framer Motion + react-router-dom, deployed to Vercel from `origin/main`. See [DAILY_WORKFLOW.md](DAILY_WORKFLOW.md) and [DEPLOYMENT.md](DEPLOYMENT.md) for the full editing/publishing pipeline.

Content lives in two tiers:

- **Source-controlled**: `src/data/projects.ts`, `src/data/publishedPortfolio.json`, `src/content/projects/translations.ts` — what production actually renders.
- **Browser-only owner drafts**: `localStorage` (versioned keys, e.g. `...:v1`) and several IndexedDB databases (project covers, project body assets, game covers, cross-platform/3D-character/game-jam draft images). These hold unpublished edits and image blobs and are never touched directly by git. They move to source control only via the `EXPORT FOR PUBLISH` bundle → `pnpm portfolio:import` pipeline, which is dry-run by default and backs up existing published files before overwriting.

Editing UI (`CaseStudyEditor`, `ProjectCoverEditor`, `ProductionExportDock`, management panels) is gated by `import.meta.env.DEV` and must not appear in production builds.

## Permanent rules

- **Never clear localStorage, IndexedDB, image blobs, drafts, or canonical project data.** This includes via browser devtools instructions, "reset" scripts, or as a side effect of debugging.
- **Never reset storage keys** (e.g. bumping an IndexedDB/localStorage version to force a clean slate). Storage schemas must evolve in place.
- **Never overwrite user-created project content.** Treat everything in `src/data/publishedPortfolio.json`, `src/data/projects.ts`, and browser-stored drafts as authored content, not scaffolding.
- **Prefer non-destructive migrations.** When a data shape changes, write a migration that reads old shapes and upgrades them in memory/on write, rather than dropping and recreating stores or files.
- **Preserve existing routes and stable project IDs.** Project `slug`s, IndexedDB record IDs, and localStorage keys are referenced across drafts, exports, and the published JSON — do not rename or renumber them without an explicit migration path.
- **Before editing, inspect the relevant files and explain the likely cause** of the bug or the reasoning for the change before writing code.
- **Make the smallest scoped change** that addresses the request. Don't refactor, rename, or restructure beyond what's needed.
- **Run `pnpm typecheck` and `pnpm build` after code changes**, and report the result.
- **Do not publish, deploy, commit, or push unless explicitly requested.** No `git add`/`commit`/`push`, no `pnpm portfolio:publish`/`portfolio:import -- --confirm`/`upload:unity`, no Vercel actions, without the user asking for that specific step.
- **For code changes, report**: files changed, behavior changed, checks passed (typecheck/build output), and explicit data-safety confirmation (what storage/content was and wasn't touched).
- **The portfolio should feel authored by a game UX designer, not a generic AI-generated SaaS website.** Favor the project's existing voice, motion, and visual language (see `src/styles.css`, `tailwind.config.ts`, existing components) over generic dashboard/marketing-site patterns.

## Task skills

Before changing code, identify the relevant task skill and read its `SKILL.md`. Rules in the relevant skill are mandatory for that task. If several skills apply, read all relevant ones. Do not automatically read every skill for every task.

Available skills:

- `skills/safe-project-editing/SKILL.md` — default rules for normal bug fixes, features, and layout/visual work.
- `skills/portfolio-collection/SKILL.md` — the `/export` Portfolio Collection PDF pipeline.
- `skills/project-deletion/SKILL.md` — permanently removing one exact project.
- `skills/publish-portfolio/SKILL.md` — moving browser drafts to source control and deploying.

## Project memory files

- `PROJECT_STATUS.md` — current architecture, current state, active issues, and constraints. Update sections in place; do not turn it into a history log.
- `CHANGELOG.md` — dated entries for work that was actually completed and verified (a completion report alone is not verification). Never record an unverified or no-visible-effect fix as done.
- `TASKS.md` — unresolved tasks, work in progress, pending verification, and intentionally deferred work. Never delete an unresolved task just because a new conversation started.

**Read `CLAUDE.md`, the relevant skill, `PROJECT_STATUS.md`, and `TASKS.md` before starting project work.** After a meaningful task, update `PROJECT_STATUS.md` if the state changed, update `CHANGELOG.md` only for verified results, and update `TASKS.md` by completing, adding, or clarifying the relevant item.

## Continuous rule updates

When the user strongly emphasizes a requirement, repeats a correction, or becomes frustrated because an instruction was missed, treat that as a signal that a reusable rule may be missing:

1. Resolve the immediate issue first. User frustration is not permission to make unrelated changes.
2. Identify the exact failure or misunderstood requirement.
3. Decide whether it is a permanent project-wide rule, a task-specific reusable rule, or only a one-time preference.
4. Add permanent project-wide rules to this file (`CLAUDE.md`); add task-specific rules to the relevant `skills/*/SKILL.md`.
5. Do not add one-time details, temporary IDs, emotional wording, conversation history, or duplicate rules — keep the new rule short, concrete, and directly actionable.
6. Tell the user which file was updated and quote the exact new rule.
7. Do not wait for the same mistake to happen again before documenting it.
