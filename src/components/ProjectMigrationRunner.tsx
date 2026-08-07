import { Suspense, lazy, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Eye, RefreshCw, ShieldAlert } from "lucide-react";
import { ManagementOverlay } from "./ProjectManagementPanels";
import { applyMigration, buildBackup, downloadBackup, migrationAdapters, runDryRun, type DryRunReport, type MigrationAdapter, type ManifestEntry } from "../lib/migrations/migrationRunner";

const MigrationPreview = lazy(() => import("./MigrationPreview").then((m) => ({ default: m.MigrationPreview })));

type ManifestFilter = "all" | "exact" | "transformed" | "preserved-hidden" | "intentionally-obsolete" | "missing" | "undocumented" | "order-mismatch" | "asset-mismatch" | "link-mismatch" | "missing-images";

/**
 * Owner-only, in-browser migration tool. Everything here reads and writes
 * the current browser's real localStorage / IndexedDB — there is no
 * simulated or fabricated data. A dry run always runs first and blocks the
 * actual migration when it finds missing images, dropped text, or a
 * document that fails the app's own save-path validator.
 */
export function ProjectMigrationRunner({ projectId, onClose, onMigrated }: { projectId: string; onClose: () => void; onMigrated: () => void }) {
  const adapter = migrationAdapters.find((item) => item.projectId === projectId);
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState("");
  const [manifestFilter, setManifestFilter] = useState<ManifestFilter>("missing");
  const [showPreview, setShowPreview] = useState(false);

  const runDry = (target: MigrationAdapter) => {
    setLoading(true);
    setError("");
    runDryRun(target)
      .then((next) => setReport(next))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to read the source draft."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (adapter) runDry(adapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!adapter) {
    return <ManagementOverlay title="MIGRATE TO UNIFIED EDITOR" onClose={onClose}><p className="mt-4 text-sm text-peach">No migration is defined for project id "{projectId}".</p></ManagementOverlay>;
  }

  const downloadNow = () => {
    buildBackup(adapter, report ?? undefined).then((backup) => downloadBackup(backup));
  };

  const apply = async () => {
    if (!report) return;
    if (!window.confirm(`Migrate "${adapter.labelZh}" to the unified editor now? This writes a new ProjectDocument and copies referenced image blobs. The original draft and images are not deleted or modified.`)) return;
    setApplying(true);
    setResult(null);
    const outcome = await applyMigration(report);
    setApplying(false);
    if (outcome.success) {
      setResult({ success: true, message: outcome.verified ? "Migration applied and verified — the saved document matches the dry run." : "Migration applied, but re-reading the saved document did not exactly match the dry run. Review before trusting this fully." });
      onMigrated();
    } else {
      setResult({ success: false, message: outcome.error });
    }
  };

  return (
    <ManagementOverlay title="MIGRATE TO UNIFIED EDITOR" onClose={onClose}>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-softWhite/58">
        This reads the real draft and images currently stored in this browser for <strong className="text-softWhite">{adapter.labelZh}</strong>, and — only after you confirm — writes a unified ProjectDocument. Nothing is deleted; the original bespoke draft stays exactly where it is.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="editor-action" onClick={downloadNow}><Download className="h-4 w-4" />Download backup + manifest (JSON)</button>
        <button type="button" className="editor-action" onClick={() => runDry(adapter)} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Re-run dry run</button>
        {report ? <button type="button" className="editor-action" onClick={() => setShowPreview(true)}><Eye className="h-4 w-4" />Preview: legacy vs migrated</button> : null}
      </div>

      {error ? <p className="mt-4 text-sm text-peach" role="alert">{error}</p> : null}
      {loading ? <p className="mt-6 text-sm text-softWhite/50">Reading the current draft…</p> : null}

      {report && !loading ? (
        <div className="mt-6 grid gap-5">
          <div className="grid gap-3 rounded-[12px] border border-softWhite/10 bg-archiveBlue/14 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Resulting sections" value={report.resultingSectionCount} />
            <Stat label="Resulting blocks" value={report.resultingBlockCount} />
            <Stat label="Hidden sections" value={report.hiddenSectionCount} hint="Includes the owner-only unplaced-content section, if any." />
            <Stat label="Hidden blocks" value={report.hiddenBlockCount} hint="Content that was hidden in the legacy page stays hidden here — never made visible as a side effect of migrating." />
            <Stat label="Source text fields" value={report.sourceTextFieldCount} hint="Raw string fields found in the source draft (structural/id fields excluded). Not directly comparable 1:1 to the bilingual counts below — treat as a magnitude check." />
            <Stat label="Document valid" value={report.documentValid ? "Yes" : "No"} tone={report.documentValid ? "good" : "bad"} />
            <Stat label="Chinese fields migrated" value={report.migratedTextFieldCountZh} />
            <Stat label="English fields migrated" value={report.migratedTextFieldCountEn} />
            <Stat label="Image IDs found" value={report.imageIdsFound.length} />
            <Stat label="Image IDs missing" value={report.imageIdsMissing.length} tone={report.imageIdsMissing.length ? "bad" : "good"} />
            <Stat label="Manifest: exact" value={report.manifestExactCount} tone="good" hint="Recorded by the migration itself as a direct, unmodified source-to-destination mapping." />
            <Stat label="Manifest: transformed" value={report.manifestTransformedCount} hint="Recorded with a named, registered transformation rule explaining the structural change." />
            <Stat label="Manifest: preserved hidden" value={report.manifestPreservedHiddenCount} hint="Migrated into a real, hidden block — stays hidden from public view exactly as before." />
            <Stat label="Manifest: intentionally obsolete" value={report.manifestIntentionallyObsoleteCount} hint="Confirmed non-content technical metadata (ids, slot keys) with a recorded reason — never rendered, never authored copy." />
            <Stat label="Manifest: missing" value={report.manifestMissingCount} tone={report.manifestMissingCount ? "bad" : "good"} hint="Source fields the migration itself could not place anywhere. Blocks Apply when non-zero." />
            <Stat label="Order mismatches" value={report.orderMismatches.length} tone={report.orderMismatches.length ? "bad" : "good"} hint="Dropped, duplicated, or reordered items within a repeated/array group. Blocks Apply when non-zero." />
            <Stat label="Asset mismatches" value={report.assetMismatches.length} tone={report.assetMismatches.length ? "bad" : "good"} hint="An image ID was recorded in the manifest but never attached to any media in the finished document. Blocks Apply when non-zero." />
            <Stat label="Link mismatches" value={report.linkMismatches.length} tone={report.linkMismatches.length ? "bad" : "good"} hint="A URL present in the source draft that does not appear anywhere in the migrated document. Blocks Apply when non-zero." />
            <Stat label="Undocumented transformations" value={report.undocumentedTransformations.length} tone={report.undocumentedTransformations.length ? "bad" : "good"} hint={`A manifest entry marked "transformed" without a valid, registered transformation rule. Blocks Apply when non-zero.`} />
          </div>

          {report.links.length ? (
            <Section title={`Links found (${report.links.length})`}>
              <ul className="grid gap-1 text-xs text-softWhite/56">{report.links.map((link) => <li key={link} className="break-all">{link}</li>)}</ul>
            </Section>
          ) : null}

          {report.imageIdsMissing.length ? (
            <Section title="Missing image IDs" tone="bad">
              <ul className="grid gap-1 text-xs text-peach">{report.imageIdsMissing.map((id) => <li key={id}>{id}</li>)}</ul>
            </Section>
          ) : null}

          <Section title={`Field-level manifest (${report.manifest.length} source fields tracked)`}>
            <p className="mb-3 text-xs leading-5 text-softWhite/44">Migration-authored provenance: each migration function records its own source-to-destination mapping as it builds the document — this is not discovered afterward by matching text. Order/asset/link mismatches are independent self-consistency checks computed on top of that authored manifest.</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {([
                ["missing", `Missing (${report.manifestMissingCount})`],
                ["transformed", `Transformed (${report.manifestTransformedCount})`],
                ["exact", `Exact (${report.manifestExactCount})`],
                ["preserved-hidden", `Preserved hidden (${report.manifestPreservedHiddenCount})`],
                ["intentionally-obsolete", `Intentionally obsolete (${report.manifestIntentionallyObsoleteCount})`],
                ["order-mismatch", `Order mismatch (${report.orderMismatches.length})`],
                ["asset-mismatch", `Asset mismatch (${report.assetMismatches.length})`],
                ["link-mismatch", `Link mismatch (${report.linkMismatches.length})`],
                ["undocumented", `Undocumented transformation (${report.undocumentedTransformations.length})`],
                ["missing-images", `Missing images (${report.imageIdsMissing.length})`],
                ["all", `All (${report.manifest.length})`],
              ] as Array<[ManifestFilter, string]>).map(([value, label]) => (
                <button key={value} type="button" className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${manifestFilter === value ? "border-acidGreen text-acidGreen" : "border-softWhite/16 text-softWhite/56 hover:text-softWhite/80"}`} onClick={() => setManifestFilter(value)}>{label}</button>
              ))}
            </div>
            <ManifestTable
              filter={manifestFilter}
              manifest={report.manifest}
              imageIdsMissing={report.imageIdsMissing}
              orderMismatches={report.orderMismatches}
              assetMismatches={report.assetMismatches}
              linkMismatches={report.linkMismatches}
              undocumentedTransformations={report.undocumentedTransformations}
            />
          </Section>

          {report.unmappedFields.length ? (
            <Section title={`Genuinely unmappable fields (${report.unmappedFields.length})`} tone="bad">
              <p className="mb-2 text-xs text-softWhite/44">No destination exists anywhere in the migrated document for these — not even the hidden "Unplaced migrated content" section. See the migration file's header comment for why. Nothing is deleted; this data stays in the original draft.</p>
              <ul className="grid gap-1 text-xs text-softWhite/56">{report.unmappedFields.map((field) => <li key={field}>{field}</li>)}</ul>
            </Section>
          ) : null}

          {report.warnings.length ? (
            <Section title={`Warnings (${report.warnings.length})`}>
              <ul className="grid gap-2 text-xs leading-5 text-softWhite/56">{report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
            </Section>
          ) : null}

          {report.blockingReasons.length ? (
            <div className="rounded-[12px] border border-peach/40 bg-peach/[0.06] p-4">
              <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-peach"><ShieldAlert className="h-4 w-4" />Migration is blocked</p>
              <ul className="mt-2 grid gap-1 text-sm text-peach/90">{report.blockingReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
            </div>
          ) : (
            <div className="rounded-[12px] border border-acidGreen/35 bg-acidGreen/[0.05] p-4">
              <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.1em] text-acidGreen"><CheckCircle2 className="h-4 w-4" />Dry run passed — no blocking issues found</p>
            </div>
          )}

          {result ? (
            <p className={`flex items-center gap-2 text-sm ${result.success ? "text-acidGreen" : "text-peach"}`}>
              {result.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {result.message}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 border-t border-softWhite/10 pt-5">
            <button type="button" className="editor-action" onClick={onClose}>Close</button>
            <button
              type="button"
              className="editor-action border-acidGreen bg-acidGreen text-deepIndigo disabled:cursor-not-allowed disabled:opacity-40"
              disabled={report.blockingReasons.length > 0 || applying}
              onClick={apply}
            >
              {applying ? "Applying…" : "Apply migration"}
            </button>
          </div>
        </div>
      ) : null}
      {showPreview && report ? (
        <Suspense fallback={null}>
          <MigrationPreview
            projectId={adapter.projectId}
            document={report.document}
            onClose={() => setShowPreview(false)}
            diffStats={{
              hiddenSections: report.hiddenSectionCount,
              hiddenBlocks: report.hiddenBlockCount,
              sourceTextFields: report.sourceTextFieldCount,
              migratedZh: report.migratedTextFieldCountZh,
              migratedEn: report.migratedTextFieldCountEn,
              imagesFound: report.imageIdsFound.length,
              imagesMissing: report.imageIdsMissing.length,
            }}
          />
        </Suspense>
      ) : null}
    </ManagementOverlay>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string | number; tone?: "good" | "bad"; hint?: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-softWhite/40">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${tone === "bad" ? "text-peach" : tone === "good" ? "text-acidGreen" : "text-softWhite"}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-softWhite/34">{hint}</p> : null}
    </div>
  );
}

function ManifestTable({ filter, manifest, imageIdsMissing, orderMismatches, assetMismatches, linkMismatches, undocumentedTransformations }: {
  filter: ManifestFilter; manifest: ManifestEntry[]; imageIdsMissing: string[];
  orderMismatches: Array<{ group: string; detail: string }>;
  assetMismatches: Array<{ assetId: string; detail: string }>;
  linkMismatches: string[];
  undocumentedTransformations: ManifestEntry[];
}) {
  if (filter === "missing-images") {
    if (!imageIdsMissing.length) return <p className="text-xs text-softWhite/40">No missing image references.</p>;
    return <ul className="grid max-h-72 gap-1 overflow-y-auto text-xs text-peach">{imageIdsMissing.map((id) => <li key={id} className="break-all">{id}</li>)}</ul>;
  }
  if (filter === "order-mismatch") {
    if (!orderMismatches.length) return <p className="text-xs text-softWhite/40">No order mismatches.</p>;
    return <ul className="grid max-h-72 gap-1.5 overflow-y-auto text-xs text-peach">{orderMismatches.map((m, i) => <li key={i} className="break-all"><span className="text-softWhite/50">[{m.group}]</span> {m.detail}</li>)}</ul>;
  }
  if (filter === "asset-mismatch") {
    if (!assetMismatches.length) return <p className="text-xs text-softWhite/40">No asset mismatches.</p>;
    return <ul className="grid max-h-72 gap-1.5 overflow-y-auto text-xs text-peach">{assetMismatches.map((m, i) => <li key={i} className="break-all"><span className="text-softWhite/50">[{m.assetId}]</span> {m.detail}</li>)}</ul>;
  }
  if (filter === "link-mismatch") {
    if (!linkMismatches.length) return <p className="text-xs text-softWhite/40">No link mismatches.</p>;
    return <ul className="grid max-h-72 gap-1 overflow-y-auto text-xs text-peach">{linkMismatches.map((link) => <li key={link} className="break-all">{link}</li>)}</ul>;
  }
  const rows = filter === "undocumented" ? undocumentedTransformations : manifest.filter((entry) => filter === "all" || entry.status === filter);
  if (!rows.length) return <p className="text-xs text-softWhite/40">No entries in this filter.</p>;
  return (
    <div className="max-h-96 overflow-y-auto rounded-[8px] border border-softWhite/10">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-[#151542]"><tr>
          <th className="px-3 py-2 font-mono text-[10px] uppercase text-softWhite/40">Source path</th>
          <th className="px-3 py-2 font-mono text-[10px] uppercase text-softWhite/40">Value</th>
          <th className="px-3 py-2 font-mono text-[10px] uppercase text-softWhite/40">Lang</th>
          <th className="px-3 py-2 font-mono text-[10px] uppercase text-softWhite/40">Status</th>
          <th className="px-3 py-2 font-mono text-[10px] uppercase text-softWhite/40">Rule</th>
          <th className="px-3 py-2 font-mono text-[10px] uppercase text-softWhite/40">Destination</th>
        </tr></thead>
        <tbody>
          {rows.map((entry, i) => <tr key={`${entry.sourcePath}-${entry.destinationPath}-${i}`} className="border-t border-softWhite/10 align-top">
            <td className="break-all px-3 py-2 text-softWhite/70">{entry.sourcePath}</td>
            <td className="break-all px-3 py-2 text-softWhite/56">{(entry.sourceValue || entry.destinationValue).slice(0, 80)}</td>
            <td className="px-3 py-2 text-softWhite/44">{entry.language}</td>
            <td className={`px-3 py-2 font-semibold ${entry.status === "missing" ? "text-peach" : entry.status === "transformed" ? "text-[#d8bb72]" : "text-acidGreen"}`}>{entry.status}{entry.visibility === "hidden" ? " · hidden" : ""}</td>
            <td className="break-all px-3 py-2 text-softWhite/44">{entry.transformationRuleId ?? entry.reason ?? "—"}</td>
            <td className="break-all px-3 py-2 text-softWhite/44">{entry.destinationPath || "—"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "bad" }) {
  return (
    <div className={`rounded-[12px] border p-4 ${tone === "bad" ? "border-peach/30 bg-peach/[0.04]" : "border-softWhite/10 bg-archiveBlue/10"}`}>
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-softWhite/44">{title}</p>
      {children}
    </div>
  );
}
