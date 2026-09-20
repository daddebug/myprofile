import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ResolvedProjectMetadata } from "../lib/projectMetadata";
import { useProjectCover } from "../hooks/useProjectCover";
import { loadSeenOtherProjectIds, saveSeenOtherProjectIds } from "../lib/otherProjectsSeenHistory";
import {
  loadSiteConnectConfig,
  saveSiteConnectConfig,
  type ConnectItem,
  type ConnectItemType,
} from "../lib/siteConnectConfig";
import { addCvAsset, deleteCvAsset, getAllCvAssets, getCvAsset, type CvAssetRecord } from "../lib/cvLibraryDb";
import { getPublishedSelectedCvPublicPath } from "../lib/publishedPortfolio";

const CONNECT_TYPE_LABELS: Record<ConnectItemType, string> = {
  email: "Email",
  cv: "CV",
  linkedin: "LinkedIn",
  github: "GitHub",
  xiaohongshu: "Xiaohongshu",
};

const OTHER_PROJECTS_CARD_COUNT = 3;

// Auto-populated recommendation pool -- no more manually-bound slots. Sorted
// by the same canonical archiveOrder WorkPage's own archive uses, current
// project excluded, a route-less project (e.g. an unfinished coming-soon
// entry) excluded too since it would be a dead-end card, and any project
// with an open DELETE dirty intent excluded -- it already looks gone in
// Project Archive (WorkPage.tsx filters it the same way), so it must not
// keep surfacing here as a live, clickable recommendation just because its
// local data hasn't been purged yet (two-phase deletion, Publishing
// Architecture V2). Pool membership IS click-eligibility now: owner/DEV
// sees every real, non-pending-delete project (draft included, so it can be
// previewed before publishing), a real visitor or any production build only
// ever sees visibility==="public" && publicationState==="published" --
// never widened by draft/private projects to pad out a short pool. This is
// the one and only gate standing between a draft project and public
// exposure here, so it must never be loosened to "isOwner also allows draft
// in production" (production always resolves isOwner to false regardless,
// per useOwnerMode's own DEV hard-gate, but the filter is written
// explicitly here too rather than trusting that alone).
function buildOtherProjectsPool(
  projects: ResolvedProjectMetadata[],
  currentProjectId: string,
  isOwner: boolean,
): ResolvedProjectMetadata[] {
  const candidates = projects.filter(
    (project) => project.id !== currentProjectId && Boolean(project.route),
  );
  const eligible = isOwner
    ? candidates
    : candidates.filter((project) => project.visibility === "public" && project.publicationState === "published");
  return [...eligible].sort((left, right) => left.archiveOrder - right.archiveOrder);
}

// Picks the group of cards to show for one page visit, preferring projects
// not yet in seenIds (this round). When there aren't enough unseen left to
// fill a full group, shows every remaining unseen project first (completing
// the OLD round on screen) then pads the rest from a fresh pass over the
// whole pool (excluding whatever this same group already picked, so a
// single group never repeats a project against itself) -- those unseen
// items already exhaust the old round, so nextSeenIds for that case must
// contain ONLY the fresh filler ids that start the NEW round, not the
// old-round unseen ids that were just shown to complete it (they belong to
// a round that is over, not to the round now beginning). Pure and
// side-effect free: the caller decides when (if ever) nextSeenIds actually
// gets persisted.
function pickOtherProjectsGroup(
  pool: ResolvedProjectMetadata[],
  seenIds: ReadonlySet<string>,
  maxCount: number,
): { picked: ResolvedProjectMetadata[]; nextSeenIds: Set<string> } {
  if (pool.length === 0) return { picked: [], nextSeenIds: new Set(seenIds) };
  const count = Math.min(maxCount, pool.length);
  const unseen = pool.filter((project) => !seenIds.has(project.id));

  if (unseen.length >= count) {
    const picked = unseen.slice(0, count);
    const nextSeenIds = new Set(seenIds);
    for (const project of picked) nextSeenIds.add(project.id);
    return { picked, nextSeenIds };
  }

  const oldRoundRemainder = unseen;
  const oldRoundRemainderIds = new Set(oldRoundRemainder.map((project) => project.id));
  const needed = count - oldRoundRemainder.length;
  const fresh = needed > 0 ? pool.filter((project) => !oldRoundRemainderIds.has(project.id)).slice(0, needed) : [];
  const picked = [...oldRoundRemainder, ...fresh];
  return { picked, nextSeenIds: new Set(fresh.map((project) => project.id)) };
}

function OtherProjectsCard({ project, pathFor }: { project: ResolvedProjectMetadata; pathFor: (path: string) => string }) {
  // Same fix as HomePage.tsx's HomeProjectCard: ResolvedProjectMetadata.coverImage
  // is only ever the catalog's own static field, empty for most real
  // projects -- the actual published cover lives in publishedPortfolio.json's
  // separate `covers` map, resolved here via the same existing hook every
  // other real cover image in this app already goes through.
  const cover = useProjectCover(project.id, project.coverImage ?? "");
  return (
    <div className="portfolio2-project-card-wrap">
      <Link className="portfolio2-project-card" to={pathFor(`/work/${project.slug}`)}>
        <div className="portfolio2-project-card__image">
          {cover.image ? <img src={cover.image} alt="" loading="lazy" /> : null}
        </div>
        <div className="portfolio2-project-card__copy">
          {project.title ? <h3>{project.title}</h3> : null}
          {project.summary ? <p>{project.summary}</p> : null}
        </div>
      </Link>
    </div>
  );
}

// Static, no autoplay/carousel -- the group is picked exactly once per page
// visit (the lazy useState initializer runs on mount only, never recomputed
// just because `pool` happens to change reference while this page stays
// open) and never changes on its own afterward. "Seen" is recorded only
// once the section is in view after a real user scroll (IntersectionObserver
// + scroll intent, firing at most once per mount, guarded by
// hasCommittedRef) -- never merely because a short/empty project placed the
// section in the initial viewport -- so the NEXT project page's own fresh pick
// prefers whatever wasn't in this group. Committing after render (not
// during) means the currently-displayed group is never affected by its own
// commit, matching "cards do not auto-change over time" exactly.
function OtherProjectsGrid({ pool, pathFor }: { pool: ResolvedProjectMetadata[]; pathFor: (path: string) => string }) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const hasCommittedRef = useRef(false);
  const [group] = useState(() => pickOtherProjectsGroup(pool, loadSeenOtherProjectIds(), OTHER_PROJECTS_CARD_COUNT));

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || group.picked.length === 0 || typeof IntersectionObserver === "undefined") return undefined;
    let isVisible = false;
    let hasUserScrolled = false;
    const commitWhenEligible = () => {
      if (!isVisible || !hasUserScrolled || hasCommittedRef.current) return;
      hasCommittedRef.current = true;
      saveSeenOtherProjectIds(group.nextSeenIds);
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
    };
    const handleScroll = () => {
      hasUserScrolled = true;
      commitWhenEligible();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        commitWhenEligible();
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  if (group.picked.length === 0) return null;

  return (
    <div ref={sectionRef} className="portfolio2-other-projects__grid">
      {group.picked.map((project) => (
        <OtherProjectsCard key={project.id} project={project} pathFor={pathFor} />
      ))}
    </div>
  );
}

function CvEditorPanel({
  selectedCvId,
  onSelectedCvIdChange,
}: {
  selectedCvId: string | null;
  onSelectedCvIdChange: (id: string | null) => void;
}) {
  const [assets, setAssets] = useState<CvAssetRecord[]>([]);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getAllCvAssets().then((next) => { if (!cancelled) setAssets(next); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError("");
    try {
      const id = `cv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await addCvAsset(id, file.name.replace(/\.pdf$/i, ""), file);
      setAssets(await getAllCvAssets());
      onSelectedCvIdChange(id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    }
  }

  async function handleRemove(id: string) {
    await deleteCvAsset(id);
    setAssets(await getAllCvAssets());
    if (selectedCvId === id) onSelectedCvIdChange(null);
  }

  return (
    <div className="portfolio2-cv-editor">
      <div className="portfolio2-cv-editor__list">
        {assets.map((asset) => (
          <label key={asset.id} className="portfolio2-cv-editor__item">
            <input
              type="radio"
              name="selected-cv"
              checked={selectedCvId === asset.id}
              onChange={() => onSelectedCvIdChange(asset.id)}
            />
            <span>{asset.label || asset.fileName}</span>
            <button type="button" className="inline-template-chip inline-template-chip--danger" onClick={() => handleRemove(asset.id)}>
              Remove
            </button>
          </label>
        ))}
        {assets.length === 0 ? <span className="portfolio2-cv-editor__empty">No CV uploaded yet.</span> : null}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(event) => { void handleUpload(event.target.files); event.target.value = ""; }}
      />
      <button type="button" className="inline-template-chip" onClick={() => fileInputRef.current?.click()}>
        + Upload PDF
      </button>
      {error ? <span className="portfolio2-lets-connect-editor__note">{error}</span> : null}
    </div>
  );
}

function LetsConnectEditorRow({
  item,
  index,
  onChange,
  selectedCvId,
  onSelectedCvIdChange,
}: {
  item: ConnectItem;
  index: number;
  onChange: (index: number, patch: Partial<ConnectItem>) => void;
  selectedCvId: string | null;
  onSelectedCvIdChange: (id: string | null) => void;
}) {
  return (
    <div className="portfolio2-lets-connect-editor__row">
      <span className="portfolio2-lets-connect-editor__type">{CONNECT_TYPE_LABELS[item.type]}</span>
      <input
        value={item.label}
        placeholder="label"
        onChange={(event) => onChange(index, { label: event.target.value })}
      />
      {item.type === "cv" ? (
        <CvEditorPanel selectedCvId={selectedCvId} onSelectedCvIdChange={onSelectedCvIdChange} />
      ) : (
        <input
          value={item.url}
          placeholder={item.type === "email" ? "you@example.com" : "https://..."}
          onChange={(event) => onChange(index, { url: event.target.value })}
        />
      )}
      <label className="portfolio2-lets-connect-editor__enabled">
        <input
          type="checkbox"
          checked={item.enabled}
          onChange={(event) => onChange(index, { enabled: event.target.checked })}
        />
        <span>enabled</span>
      </label>
    </div>
  );
}

function useLocalCvDownloadHref(id: string | null) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setHref(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    getCvAsset(id).then((record) => {
      if (cancelled || !record) return;
      objectUrl = URL.createObjectURL(record.blob);
      setHref(objectUrl);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return href;
}

function LetsConnectSection({ isEditingUI }: { isEditingUI: boolean }) {
  const [config, setConfig] = useState(() => loadSiteConnectConfig());
  const publishedCvPath = getPublishedSelectedCvPublicPath();
  // Local blob download is an editor/owner-preview convenience only -- the
  // live site never links to a browser-local blob URL, only to a real
  // published public asset path (publishedCvPath).
  const localCvHref = useLocalCvDownloadHref(isEditingUI ? config.selectedCvId : null);

  function commit(nextItems: ConnectItem[], patch: Partial<typeof config> = {}) {
    const next = { ...config, items: nextItems, ...patch, updatedAt: new Date().toISOString() };
    setConfig(next);
    saveSiteConnectConfig(next);
  }
  function updateItem(index: number, patch: Partial<ConnectItem>) {
    commit(config.items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function setSelectedCvId(id: string | null) {
    commit(config.items, { selectedCvId: id });
  }

  // Figma draws a fixed 5-slot structure (Email/CV/LinkedIn/GitHub/
  // Xiaohongshu) -- that is layout, not content. All 5 labels always
  // render, in this order; a slot's own enabled flag and whether it has a
  // real resource only decide whether IT is clickable, never whether it
  // exists. config.items is already exactly these 5, in this order (see
  // normalizeConnectConfig).
  const slots = config.items.map((item) => {
    const resourceReady = item.type === "cv"
      ? Boolean(publishedCvPath) || Boolean(isEditingUI && localCvHref)
      : Boolean(item.url.trim());
    const clickable = item.enabled && resourceReady;
    const href = !clickable ? null
      : item.type === "email" ? `mailto:${item.url}`
      : item.type === "cv" ? (publishedCvPath || localCvHref)
      : item.url;
    return { item, clickable, href };
  });

  return (
    <section className="portfolio2-lets-connect" data-project-lets-connect>
      <div className="p2-page-rail">
        <h2>Let&apos;s connect</h2>
        <div className="portfolio2-lets-connect__row">
          <span className="portfolio2-lets-connect__line" aria-hidden="true" />
          {slots.map(({ item, clickable, href }) => {
            const external = item.type === "linkedin" || item.type === "github" || item.type === "xiaohongshu";
            return clickable && href ? (
              <a
                key={item.type}
                className="portfolio2-lets-connect__item"
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
                download={item.type === "cv" ? true : undefined}
              >
                {item.label}
              </a>
            ) : (
              <span key={item.type} className="portfolio2-lets-connect__item portfolio2-lets-connect__item--disabled">
                {item.label}
              </span>
            );
          })}
          <span className="portfolio2-lets-connect__line" aria-hidden="true" />
        </div>
      </div>
      {isEditingUI ? (
        <div className="portfolio2-lets-connect-editor p2-page-rail" data-exact-export="hide">
          {config.items.map((item, index) => (
            <LetsConnectEditorRow
              key={item.type}
              item={item}
              index={index}
              onChange={updateItem}
              selectedCvId={config.selectedCvId}
              onSelectedCvIdChange={setSelectedCvId}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ProjectEndSections({
  currentProjectId,
  projects,
  pathFor,
  isOwner,
  isEditingUI,
}: {
  currentProjectId: string;
  projects: ResolvedProjectMetadata[];
  pathFor: (path: string) => string;
  isOwner: boolean;
  isEditingUI: boolean;
}) {
  const pool = useMemo(
    () => buildOtherProjectsPool(projects, currentProjectId, isOwner),
    [projects, currentProjectId, isOwner],
  );

  // Last Update: only a real publish/import run stamps lastPublishedAt (see
  // assemblePublishedOutput.mjs) -- draft autosave and metadata edits never
  // touch it. A project that has never been through that pipeline since
  // this field was added genuinely has no value yet; showing a placeholder
  // dash is honest, showing a guessed year would not be.
  const currentProject = projects.find((project) => project.id === currentProjectId);
  const lastPublishedAt = currentProject?.lastPublishedAt;
  const parsedLastPublishedAt = lastPublishedAt ? new Date(lastPublishedAt) : null;
  const lastUpdateDisplay = parsedLastPublishedAt && !Number.isNaN(parsedLastPublishedAt.getTime())
    ? String(parsedLastPublishedAt.getFullYear())
    : "—";

  return (
    <>
      {pool.length > 0 ? (
        <section className="portfolio2-other-projects" data-project-other-projects>
          <div className="p2-page-rail">
            <h2>OTHER PROJECTS</h2>
            <div className="portfolio2-other-projects__rule" />
            <OtherProjectsGrid pool={pool} pathFor={pathFor} />
          </div>
        </section>
      ) : null}
      <LetsConnectSection isEditingUI={isEditingUI} />
      <footer className="portfolio2-project-footer" data-project-portfolio-footer>
        <div className="portfolio2-project-footer__inner p2-page-rail">
          <span>Designed and built by Delda Duman</span>
          <span>{`Last update:${lastUpdateDisplay}`}</span>
        </div>
      </footer>
    </>
  );
}
