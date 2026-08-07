import { Suspense, lazy, useState } from "react";
import { CheckCircle2, Circle, Wand2 } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { getProjectDocument } from "../lib/projectDocuments";
import { migrationAdapters } from "../lib/migrations/migrationRunner";

const ProjectMigrationRunner = lazy(() => import("../components/ProjectMigrationRunner").then((module) => ({ default: module.ProjectMigrationRunner })));

/**
 * Dev-only maintenance tool. Not linked from any public page or nav — reach
 * it directly at /<locale>/owner-tools/migrations. Ordinary project pages
 * never mention migration; this is the only place it happens.
 */
export function OwnerMigrationToolsPage() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [, forceRefresh] = useState(0);

  return (
    <PageTransition>
      <main className="min-h-screen bg-deepIndigo px-4 py-16 text-softWhite md:px-6 md:py-24">
        <div className="site-container">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">Owner Tools</p>
          <h1 className="mt-3 font-display text-4xl font-semibold md:text-5xl">Content Migration</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-softWhite/56">
            Migrate a bespoke project's real draft and images (stored in this browser) into the unified project-document editor. Each migration runs a dry run first and blocks when it finds a problem — nothing is written until you confirm.
          </p>

          <div className="mt-10 grid gap-3">
            {migrationAdapters.map((adapter) => {
              const migrated = Boolean(getProjectDocument(adapter.projectId));
              return (
                <div key={adapter.projectId} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-softWhite/10 bg-archiveBlue/14 p-4">
                  <div className="flex items-center gap-3">
                    {migrated ? <CheckCircle2 className="h-5 w-5 text-acidGreen" /> : <Circle className="h-5 w-5 text-softWhite/30" />}
                    <div>
                      <p className="font-semibold text-softWhite">{adapter.labelZh}</p>
                      <p className="font-mono text-[11px] text-softWhite/40">{adapter.projectId} — {migrated ? "migrated" : "not migrated"}</p>
                    </div>
                  </div>
                  <button type="button" className="editor-action" onClick={() => setActiveProjectId(adapter.projectId)}><Wand2 className="h-3.5 w-3.5" />{migrated ? "Re-run migration tool" : "Open migration tool"}</button>
                </div>
              );
            })}
          </div>
        </div>

        {activeProjectId ? (
          <Suspense fallback={null}>
            <ProjectMigrationRunner
              projectId={activeProjectId}
              onClose={() => setActiveProjectId(null)}
              onMigrated={() => forceRefresh((value) => value + 1)}
            />
          </Suspense>
        ) : null}
      </main>
    </PageTransition>
  );
}
