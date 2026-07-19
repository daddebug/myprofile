# Game Jam Case Draft Persistence

DO NOT DELETE OR RESET THE GAME JAM CASE DRAFT DURING LAYOUT OR FEATURE REFACTORS.

USER-AUTHORED LOCAL CONTENT MUST TAKE PRIORITY OVER DEFAULT COPY.

THE CROSS-PLATFORM CASE DRAFT AND ITS INDEXEDDB ASSETS MUST REMAIN UNTOUCHED.

## Storage Identifiers

Text and image-slot metadata use this stable localStorage key:

```text
dilida-portfolio:from-theme-to-playable-rule:draft:v1
```

Local image blobs use a separate native IndexedDB database:

```text
Database: dilida-portfolio-game-jam-draft-assets
Object store: images
```

Do not rename these identifiers, bump the draft version, clear the database, or replace the Game Jam draft with another project's state.

## Draft Merge

The `GameJamDraft` schema and defaults live in `src/pages/GameJamDraftPage.tsx`. The version-1 draft contains the editable title, subtitle, framing question, nine section bodies, complete thinking map, nine image-slot metadata records, and `updatedAt`.

On load, the page reads the stable key and merges the stored draft over `defaultGameJamDraft`. Existing strings, map node text, public paths, and `localImageId` values win. Defaults fill only missing fields and missing fixed nodes. Invalid JSON falls back safely without deleting the stored value. Autosave uses an approximately 400 ms debounce.

THINKING MAP NODE CONTENT IS USER-AUTHORED DRAFT DATA.

The stable map node IDs are:

```text
theme
first-interpretation
early-idea
friction
mechanic-question
rule-shift
prototype
reflection
```

Do not rename these IDs or move map copy back into hard-coded render markup during visual refactors.

## Image Drafts

Each image slot stores metadata in the localStorage draft:

```ts
type DraftImageSlot = {
  publicPath: string;
  localImageId?: string;
};
```

Local image records store the blob, stable ID, original file name, MIME type, size, and timestamp in the Game Jam IndexedDB database. PNG, JPEG, WebP, and AVIF files up to 20 MB are accepted.

Image priority is:

1. Existing local blob referenced by `localImageId`.
2. The slot's `publicPath`.
3. The quiet placeholder.

Removing a local image deletes only that Game Jam blob and clears only that slot's `localImageId`. It preserves `publicPath`. Missing local records fall back without crashing.

LOCAL GAME JAM IMAGE BLOBS ARE USER-AUTHORED DRAFT ASSETS.

DO NOT DELETE, CLEAR, RENAME, OR RECREATE THE GAME JAM DRAFT INDEXEDDB DATABASE DURING LAYOUT OR FEATURE REFACTORS.

The separate cross-platform database `dilida-portfolio-cross-platform-draft-assets` and its `images` store must never be changed by this workflow.

## Export And Import

Export creates:

```text
from-theme-to-playable-rule-draft.json
```

The JSON includes all draft metadata, including map content and image references. It does not include IndexedDB blobs. Edit mode states that local images remain in the current browser.

Import accepts version-1 objects, merges missing fields from defaults, and writes only to the Game Jam localStorage key. Invalid imports do not replace the current state and imports never delete IndexedDB data.

## Published And Local Titles

The published title lives in `src/data/projects.ts` and is reused by Home, Work, and other shared project metadata surfaces. The local editable `draft.title` may differ while writing. Edit mode normalises whitespace and reports either `TITLE SYNCED` or `TITLE DIFFERS FROM SITE`; it does not provide a fake publishing action or modify source files.
