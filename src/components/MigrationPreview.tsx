import { Suspense, useState, type ComponentType } from "react";
import { X } from "lucide-react";
import { CaseStudyEditorProvider } from "./CaseStudyEditor";
import { ProjectDocumentRenderer } from "./ProjectDocumentPage";
import type { ProjectDocument } from "../lib/projectDocuments";

const legacyRegistry: Record<string, ComponentType> = {};

/**
 * Owner-only, maintenance-only comparison: the real legacy bespoke page on
 * the left, the migrated ProjectDocument (still in memory — the dry-run
 * result, not yet saved) rendered through the real unified renderer on the
 * right. Never reachable from a normal project page. Applying the migration
 * is not required to see this.
 */
export function MigrationPreview({ projectId, document, diffStats, onClose }: {
  projectId: string; document: ProjectDocument; onClose: () => void;
  diffStats: { hiddenSections: number; hiddenBlocks: number; sourceTextFields: number; migratedZh: number; migratedEn: number; imagesFound: number; imagesMissing: number };
}) {
  const [locale, setLocale] = useState<"zh" | "en">("zh");
  const Legacy = legacyRegistry[projectId];

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-[#08081e]/94 p-3 md:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-electricBlue/30 bg-[#11113a] p-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-acidGreen">Legacy vs migrated preview</p>
            <p className="mt-1 text-xs text-softWhite/50">Read-only. This is the dry-run document still in memory — nothing has been saved.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-softWhite/16">
              <button type="button" className={`px-3 py-1.5 text-xs font-semibold ${locale === "zh" ? "bg-acidGreen text-deepIndigo" : "text-softWhite/60"}`} onClick={() => setLocale("zh")}>中文</button>
              <button type="button" className={`px-3 py-1.5 text-xs font-semibold ${locale === "en" ? "bg-acidGreen text-deepIndigo" : "text-softWhite/60"}`} onClick={() => setLocale("en")}>EN</button>
            </div>
            <button type="button" className="editor-icon" onClick={onClose}><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 rounded-[12px] border border-softWhite/10 bg-archiveBlue/10 p-4 sm:grid-cols-4 lg:grid-cols-7">
          <MiniStat label="Sections in doc" value={document.sections.length} />
          <MiniStat label="Hidden sections" value={diffStats.hiddenSections} />
          <MiniStat label="Hidden blocks" value={diffStats.hiddenBlocks} />
          <MiniStat label="Source text fields" value={diffStats.sourceTextFields} />
          <MiniStat label="Migrated zh / en" value={`${diffStats.migratedZh} / ${diffStats.migratedEn}`} />
          <MiniStat label="Images found" value={diffStats.imagesFound} />
          <MiniStat label="Images missing" value={diffStats.imagesMissing} tone={diffStats.imagesMissing ? "bad" : undefined} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 overflow-hidden rounded-[12px] border border-softWhite/12">
            <p className="border-b border-softWhite/12 bg-archiveBlue/20 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#9FAAD2]">Legacy bespoke renderer</p>
            <div className="max-h-[80vh] overflow-y-auto bg-deepIndigo">
              {Legacy ? (
                <CaseStudyEditorProvider>
                  <Suspense fallback={<p className="p-6 text-sm text-softWhite/40">Loading…</p>}>
                    <Legacy />
                  </Suspense>
                </CaseStudyEditorProvider>
              ) : <p className="p-6 text-sm text-peach">No legacy renderer registered for "{projectId}".</p>}
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-[12px] border border-acidGreen/25">
            <p className="border-b border-acidGreen/25 bg-acidGreen/[0.05] px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-acidGreen">Migrated unified renderer (dry run, unsaved)</p>
            <div className="max-h-[80vh] overflow-y-auto bg-deepIndigo">
              <ProjectDocumentRenderer
                document={document}
                locale={locale}
                isEditing={false}
                pendingAssets={{}}
                onDocumentChange={() => undefined}
                onPendingAsset={() => undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: "bad" }) {
  return <div><p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-softWhite/40">{label}</p><p className={`mt-1 font-display text-lg font-semibold ${tone === "bad" ? "text-peach" : "text-softWhite"}`}>{value}</p></div>;
}
