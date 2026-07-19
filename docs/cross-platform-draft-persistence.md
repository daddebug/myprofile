# Cross-Platform Case Draft Persistence

DO NOT DELETE OR RESET THE CROSS-PLATFORM CASE DRAFT DURING LAYOUT OR FEATURE REFACTORS.

USER-AUTHORED CONTENT IN LOCALSTORAGE MUST TAKE PRIORITY OVER DEFAULT COPY.

中文模板只能在用户点击 `USE CHINESE TEMPLATE` 并确认后应用。

不得在页面加载、视觉重构或默认内容更新时自动覆盖用户本地草稿。

## Storage Key

The stable localStorage key is:

```text
dilida-portfolio:cross-platform-game-ux:draft:v1
```

Do not rename this key during normal layout, styling, or component refactors. Renaming it will make the browser stop finding the user's locally authored case-study text.

## Published Title And Draft Title

The published site title for `cross-platform-game-ux` lives in the shared project metadata:

```text
src/data/projects.ts
```

Home featured work, the Work archive, and other shared project metadata displays must derive the published title from that project record. They must not maintain separate Home-only or listing-only title strings.

The editable workspace title is different data: `draft.title` is user-authored content stored in the version-1 local draft. It may intentionally differ from the published title while the case study is being written. Edit mode compares the two titles, normalising only whitespace, and surfaces either `TITLE SYNCED` or `TITLE DIFFERS FROM SITE`. A mismatch is informational and does not modify either value.

THE DRAFT TITLE MAY DIFFER WHILE AUTHORING.

EDIT MODE MUST SURFACE TITLE MISMATCHES SO THEY DO NOT SILENTLY DRIFT APART.

DO NOT RESET draft.title DURING TITLE-SYNC OR LAYOUT REFACTORS.

## Project Duration

`projectDuration` is user-authored version-1 draft data. The case hero reads and edits `draft.projectDuration`, and the existing autosave, import, and export flows preserve it with the rest of the draft.

The published fallback is `projects[].duration` for `cross-platform-game-ux` in `src/data/projects.ts`. The Home featured card uses a valid local draft duration when available in the current browser and otherwise uses this published metadata value, so deployed visitors do not depend on localStorage.

PROJECT DURATION IS USER-AUTHORED DRAFT DATA.

DO NOT RESET projectDuration DURING HERO OR HOME CARD REFACTORS.

## Competitor Breakdown

`competitorBreakdown` is user-authored version-1 draft data. It stores the editable `researchRationale` title/body, ordered competitors, each competitor's `name`, `role`, `focus`, branch ids, editable branch labels, branch detail lines, the legacy `competitorRoles` record, exactly three editable `distilledTakeaways`, and the preserved `summaryTags` list. Normal mode starts with two compact competitor cards. Selecting a card opens one focused overlay analysis panel; clicking its backdrop, using the close control, or pressing Escape returns to the selector. Competitor and branch selection remain local UI state and do not persist. Edit mode continues to expose the stored rationale and updates all persisted fields through text inputs and newline-based textareas.

Older version-1 drafts may not contain `researchRationale`, `competitorRoles`, competitor-level `role` / `focus`, or `distilledTakeaways`. Loading adds only missing defaults while preserving all existing competitor names, branch labels, detail notes, summary tags, and legacy competitor ids. When `focus` is missing, an existing legacy `competitorRoles[competitorId]` value is preserved as its migration fallback. The three distilled takeaways are stored independently, so the earlier summary tag data is not deleted. The draft version and storage key do not change.

The earlier three short default circle sentences are migrated once to the fuller takeaway copy. Any `distilledTakeaways` array that differs from those exact former defaults is treated as user-authored and preserved unchanged.

The bundled parsed-XMind structure is stored in `src/data/competitor-xmind-extracted.json` and is used as the default template only. Existing local `competitorBreakdown` content always takes priority when the page loads, including drafts that still use the earlier `fingertip-warriors` competitor id. In edit mode, `USE PARSED XMIND DATA` replaces only `competitorBreakdown` after an explicit confirmation; cancelling leaves the draft unchanged. This action enters the existing autosave flow and does not replace intervention image slots or remove IndexedDB image blobs.

PARSED XMIND DATA MUST NEVER OVERWRITE LOCAL DRAFT CONTENT AUTOMATICALLY ON PAGE LOAD.

APPLYING PARSED XMIND DATA MUST PRESERVE ALL UPLOADED IMAGES.

The structured summary remains separate from the original evidence assets. `interventions.marketCompetitorAnalysis.imageSlots` continues to store the public paths and `localImageId` references for the complete competitor mind-map screenshots, including the independent `market-competitor-board` and `market-competitor-board-winter` slots. IndexedDB blobs are not embedded in `competitorBreakdown`.

COMPETITOR BREAKDOWN CONTENT IS USER-AUTHORED DRAFT DATA.

DO NOT RESET competitorBreakdown DURING LAYOUT OR VISUAL REFACTORS.

## Draft Schema

The draft model lives in:

```text
src/pages/CrossPlatformDraftPage.tsx
```

The exported type is `CrossPlatformDraft`.

Current shape:

```ts
type CrossPlatformDraft = {
  version: 1;
  title: string;
  projectDuration: string;
  updatedAt: string;
  competitorBreakdown: {
    competitors: Array<{
      id: string;
      name: string;
      branches: Array<{ id: string; label: string; details: string[] }>;
    }>;
    summaryTags: string[];
  };
  sections: {
    heroSubtitle: string;
    projectIntro: string;
    projectContext: string;
    openQuestion: string;
    myEntryPoint: string;
    exploration: string;
    constraints: string;
    iteration: string;
    application: string;
    reflection: string;
  };
  boundaryLists: {
    keep: string;
    change: string;
  };
  imageSlots: {
    portraitApproach: DraftImageSlot;
    miniProgramReferences: DraftImageSlot;
    keepChangeEvidence: DraftImageSlot;
    directionV1: DraftImageSlot;
    directionV2: DraftImageSlot;
    directionV3: DraftImageSlot;
    retainedSystemApplication: DraftImageSlot;
    beforeAfterDetail: DraftImageSlot;
  };
  thinkingMap: {
    eyebrow: string;
    heading: string;
    description: string;
    nodes: ThinkingMapNode[];
  };
};

type DraftImageSlot = {
  publicPath: string;
  localImageId?: string;
};
```

Each thinking-map node has a stable semantic `id`, editable `label`, editable `body`, and its existing visual emphasis. The Exploration node also stores editable `primary` and `secondary` text. The Design Boundary node stores editable KEEP / CHANGE headings and newline-preserving item strings.

## Merge Behavior

Default content is stored in `defaultCrossPlatformDraft`.

On page load:

1. The page looks for the stable localStorage key.
2. If no local draft exists, it uses `defaultCrossPlatformDraft`.
3. If a local draft exists, `mergeCrossPlatformDraft` merges it over the defaults.
4. Existing local user-authored title text, section text, KEEP / CHANGE text, and image slot paths win over default copy.
5. Missing newly added fields fall back to defaults.
6. Newly added `boundaryLists.keep` and `boundaryLists.change` fields are merged the same way: old local drafts keep all existing section text, and only missing KEEP / CHANGE list fields are filled from defaults.
7. Legacy drafts that still contain `selectedTitleId` but do not yet contain `title` are migrated once. The old title id is mapped to the matching title string, saved as `title`, and no future load should overwrite `title` from `selectedTitleId`.
8. Older version-1 drafts without `thinkingMap` receive the default map content without changing their existing title, sections, boundary lists, or image paths.
9. Partially populated `thinkingMap` objects are merged by field and by stable node `id`. Existing node text wins; defaults fill only missing fields and missing fixed nodes.
10. Older version-1 drafts with string image-slot values are migrated to `{ publicPath: existingString }`. The path is preserved exactly.
11. Newer object-form image slots preserve both `publicPath` and `localImageId`. Missing image-slot fields receive defaults without affecting title, section, or thinking-map content.

The optional `legacyDraftBackup` field is a text-only snapshot created when the user explicitly applies the Chinese template. If a backup already exists, applying the template again preserves the earlier snapshot.

The project title is user-authored local case-study content. It is protected by the same rule as the body text:

USER-AUTHORED CONTENT IN LOCALSTORAGE MUST TAKE PRIORITY OVER DEFAULT COPY.

Layout-only changes must not clear localStorage, rename fields casually, or replace the merge behavior with a hard reset.

Thinking-map content is user-authored persisted draft data. Stable node IDs must not be renamed casually, because they are the identity used to merge existing local node copy across revisions. Map headings, node labels, node bodies, exploration text, and Design Boundary list text must survive layout-only refactors.

THINKING MAP NODE CONTENT IS USER-AUTHORED DRAFT DATA.

DO NOT MOVE MAP COPY BACK INTO HARD-CODED JSX OR RESET IT DURING VISUAL REFACTORS.

## Local Image Assets

Text, thinking-map content, and image-slot metadata live in the stable localStorage draft. Local image blobs are stored separately using native IndexedDB through:

```text
src/lib/crossPlatformImageDraftDb.ts
```

Stable IndexedDB identifiers:

```text
Database: dilida-portfolio-cross-platform-draft-assets
Object store: images
```

## Intervention template

The version-1 draft also contains `interventionTimeline.nodes` and `interventions`. Timeline stages are user-authored ordered data. Each node persists a stable `id`, editable `label`, participant or department `meta`, `isIntervention` state, and optional `targetSectionId`.

Existing nodes are migrated in their saved order. Existing labels always win. Missing fields on known default ids receive the matching default values, while unknown custom nodes are retained with an empty `meta`, `isIntervention: false`, and no target when those fields are missing. The default ids are `business-decision`, `technical-direction`, `system-scope`, `market-competitor-analysis`, `function-hierarchy-optimisation`, `production-guidelines`, `ui-direction-reset`, and `scalable-direction`.

Edit mode may append custom stages with stable `custom-stage-*` ids and may delete stages after confirmation. At least one stage must remain. Deleting a timeline node removes only that ordered timeline entry; it does not delete an intervention section, section text, image-slot metadata, or an IndexedDB image blob. Display numbering (`01`, `02`, and so on) is generated from current array order and is not persisted.

The four linked intervention sections render their large left-side green title from the matching timeline node label. The mapping uses the shared ids `market-competitor-analysis`, `function-hierarchy-optimisation`, `production-guidelines`, and `ui-direction-reset`. Editing a timeline label therefore updates the corresponding main section title without maintaining a second title input. The intervention order number (`01` through `04`) is generated from `interventionMeta.number` and rendered only as a decorative background watermark.

Existing `interventions.*.title` values remain persisted for backward compatibility and provide a safe title fallback when the matching timeline node or a usable label is unavailable. Existing `interventions.*.goal` values remain independent user-authored content and render as the smaller editable right-side subtitle. Neither field is deleted or overwritten by this presentation mapping.

TIMELINE STAGES ARE USER-AUTHORED DRAFT DATA.

DO NOT RESET, REORDER, DELETE, OR REPLACE TIMELINE NODES DURING VISUAL REFACTORS.

CUSTOM TIMELINE NODES MUST BE PRESERVED EVEN IF THEY DO NOT MATCH DEFAULT NODE IDS.

The four authored sections live at `interventions.marketCompetitorAnalysis`, `interventions.functionHierarchyOptimisation`, `interventions.productionGuidelines`, and `interventions.uiDirectionReset`. Each stores `title`, `goal`, `body`, newline-preserving `items`, and semantic `imageSlots` metadata.

Each intervention also has an ordered `blocks` array. It is an additive version-1 field; older drafts migrate to `blocks: []` without changing any existing intervention text or image metadata. Every block has a stable `id` and one of these types: `competitorCards`, `threeCircleTakeaway`, `imageEvidencePair`, `textBlock`, or `beforeAfter`. Image-pair blocks also persist editable per-image captions alongside their image-slot metadata. Edit mode can insert a template into the current intervention, edit its relevant copy and image slots, move it up or down, or remove the block reference.

Removing a content block does not delete its IndexedDB image blobs. This deliberately favors asset preservation; an exported draft retains only the blocks that still exist, while local image files remain untouched unless the user explicitly removes an image through its image-slot control.

The first intervention's earlier evidence grid, `完整脑图证据` heading, and legacy finding cards are retained in `interventions.marketCompetitorAnalysis.imageSlots` and `items` for backward compatibility but are no longer rendered after the three-circle takeaway. This prevents temporary material from appearing between the takeaway and the next intervention while preserving every saved path and local image reference.

Stable intervention image slot ids:

`market-competitor-board`, `market-competitor-loop`, `market-own-loop`, `market-missing-points`, `function-old-popup-structure`, `function-new-hierarchy`, `function-wireframe`, `function-before-after`, `guideline-transparency`, `guideline-background`, `guideline-nine-slice`, `guideline-icons`, `ui-colour-exploration`, `ui-style-reference`, `ui-trial-versions`, and `ui-final-direction`.

Older `sections`, `boundaryLists`, `imageSlots`, and `thinkingMap` fields remain in the same draft. They are not deleted by migration. Edit mode exposes them in `LEGACY DRAFT TEXT BACKUP` until the user confirms they can be removed. New intervention fields are filled only when missing; existing saved values always win.

INTERVENTION SECTION CONTENT IS USER-AUTHORED DRAFT DATA.

DO NOT RESET OR REMOVE IT DURING VISUAL REFACTORS.

LEGACY DRAFT TEXT BACKUP MUST REMAIN ACCESSIBLE UNTIL THE USER CONFIRMS IT CAN BE REMOVED.

## Chinese Template

The Chinese default and template content lives in `defaultCrossPlatformDraft` in:

```text
src/pages/CrossPlatformDraftPage.tsx
```

Loading the page never applies the template to an existing local draft. The template is applied only from edit mode after the user clicks `USE CHINESE TEMPLATE` and accepts the confirmation dialog.

When confirmed:

1. The current title, section text, boundary lists, thinking-map text, timeline labels, and intervention text are captured in `legacyDraftBackup`.
2. Editable text fields are replaced with the Chinese template.
3. Top-level `imageSlots` are copied from the current draft unchanged.
4. Every intervention's `imageSlots`, including `publicPath` and `localImageId`, is copied from the current draft unchanged.
5. The normal 400ms autosave writes the result to the same version-1 localStorage key.
6. No IndexedDB calls are made by the template action, so uploaded image blobs remain untouched.

The current `interventionTimeline` is also copied unchanged when applying the Chinese template so user-edited stages, metadata, intervention state, anchors, and custom nodes are not reset.

Cancelling the confirmation makes no draft change. The backup is visible only in edit mode under `旧版草稿备份` and is presented as a read-only JSON snapshot for copying.

Each image blob record contains a stable `id`, the `Blob`, original file name, MIME type, byte size, and update timestamp. `imageSlots[slotKey].localImageId` links version-1 draft metadata to the matching IndexedDB record.

Local uploads accept PNG, JPEG, WebP, and AVIF files up to 20 MB per image. Unsupported MIME types, empty files, and oversized files are rejected without changing the existing slot image.

Image rendering priority is:

1. Existing IndexedDB image referenced by `localImageId`.
2. The slot's `publicPath` if the local record is missing or no local image is selected.
3. The standard image placeholder.

Removing a local image deletes only its IndexedDB record and clears that slot's `localImageId`. It does not clear or change `publicPath`. Importing JSON never deletes IndexedDB records. If imported metadata references a missing local record, rendering falls back safely to `publicPath` or the placeholder.

LOCAL CASE-STUDY IMAGE BLOBS ARE USER-AUTHORED DRAFT ASSETS.

DO NOT DELETE, CLEAR, RENAME, OR RECREATE THE CROSS-PLATFORM DRAFT INDEXEDDB DATABASE DURING LAYOUT OR FEATURE REFACTORS.

DO NOT RESET localImageId VALUES IN THE VERSION-1 DRAFT.

## Export / Import

Edit mode exposes:

- `EXPORT DRAFT`
- `IMPORT DRAFT`

Export downloads:

```text
cross-platform-game-ux-draft.json
```

Import validates that the file is an object, uses supported `version: 1`, and contains a sections object. Older valid version-1 exports without `thinkingMap` remain importable and receive defaults only for the missing map data. Invalid imports must not overwrite the current draft.

After a valid import, the page saves the imported draft to the stable localStorage key and updates the rendered page immediately.

JSON export includes image-slot `publicPath` and `localImageId` metadata, but it does not contain or back up IndexedDB blobs. Edit mode states this explicitly: local image files remain stored in the current browser.
