# Daily portfolio workflow

## One official working directory

Use only:

```text
D:\myprofilegit\myprofile
```

`D:\profile` is a backup. Do not make independent edits in both directories.

The canonical local URL is:

```text
http://localhost:5173/zh
```

Browser storage belongs to the origin (`http://localhost:5173`), not to the folder on disk. Keeping `localhost` and strict port `5173` preserves access to the existing localStorage and IndexedDB data after changing working directories.

## Start editing

```powershell
cd D:\myprofilegit\myprofile
pnpm portfolio:start
```

If a fresh Windows terminal does not recognize `pnpm`, use `npm run portfolio:start`. The desktop launcher uses this fallback automatically.

The local Vite build retains owner and case-study editing controls. Production builds remove those controls.

## Local save is not online publishing

Saving in the browser can update localStorage and IndexedDB only. It does not change GitHub or Vercel.

| Content | Current editing source | Reaches production after an ordinary Git push? | Publishing path |
| --- | --- | --- | --- |
| Homepage text and project order | `src` data/components | Yes | Commit source changes |
| Homepage covers | IndexedDB `dilida-portfolio-public-project-assets/projectCovers` | No | Export bundle, import, review, commit |
| Public project title/summary/duration overrides | localStorage `dilida-portfolio:project-public-meta:v1` | No | Export bundle, import, review, commit |
| Cross-platform case sections and order | localStorage version-1 draft | No | Export bundle, import, review, commit |
| Cross-platform case images | IndexedDB version-1 image records | No | Export bundle, import to stable public paths |
| 3D-character case sections and order | localStorage version-1 draft | No | Export bundle, import, review, commit |
| 3D-character case images | IndexedDB version-1 image records | No | Export bundle, import to stable public paths |
| Game Jam bilingual/case content | localStorage version-1 draft | No | Export bundle, import, review, commit |
| Game Jam images | IndexedDB version-1 image records | No | Export bundle, import to stable public paths |
| Interaction Agent bilingual content | localStorage version-1 draft | No | Export bundle, import, review, commit |
| UI Personal Practice images | `src/assets/ui-practice` | Yes | Already version controlled |
| UI Personal Practice text/order/deletions | `src/data/uiPracticeMetadata.json` via local dev save | Yes | Review and commit JSON |
| Unity configuration | Vercel environment variables and frozen Blob URLs | No routine change required | Keep frozen |

## Export browser-only content

1. Open the local site at `http://localhost:5173/zh`.
2. Save the browser edits normally.
3. Click the local-only `EXPORT FOR PUBLISH` control at the lower-left.
4. Keep the downloaded `portfolio-production-export-*.json` file outside the repository.
5. Review it with a dry run:

```powershell
cd D:\myprofilegit\myprofile
pnpm portfolio:import -- "C:\path\to\portfolio-production-export.json"
```

6. If the dry run reports no missing image references, explicitly import it:

```powershell
pnpm portfolio:import -- "C:\path\to\portfolio-production-export.json" --confirm
```

The importer:

- never deletes or changes browser storage;
- refuses exports with missing referenced images;
- writes text to `src/data/publishedPortfolio.json`;
- writes referenced images to stable `public/images/published/...` paths;
- records source database/store/image IDs in the manifest;
- creates an ignored backup before overwriting any existing published file;
- never deletes older published files.

## Check before publishing

```powershell
pnpm portfolio:check
```

`npm run portfolio:check` is equivalent when pnpm is not on the terminal PATH.

This command requires the official directory and `main`, shows Git status, rejects private or oversized files, runs typecheck and build, and scans the production build for local URLs, temporary blob/file URLs, Windows paths, and editing controls.

## Publish once per day

```powershell
pnpm portfolio:publish
```

`npm run portfolio:publish` is equivalent when pnpm is not on the terminal PATH.

`pnpm publish:daily` is an alias for the same guarded command. It performs all checks, lists the files, and requires typing `PUBLISH` before it commits and pushes. It never force-pushes and cannot commit after a failed typecheck, build, or safety scan.

The dated commit is pushed to `origin/main`, which triggers the linked Vercel deployment. Check:

```text
https://vercel.com/myprofile2/myprofile
```

After Vercel reports Ready:

```powershell
pnpm portfolio:verify
```

## Unity freeze

Ordinary portfolio publishing does not run `upload:unity`, change Blob URLs, touch the Blob Store, or include the ignored Unity payloads. Unity is a separate, frozen deployment concern.
