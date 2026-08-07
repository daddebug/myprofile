import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowRight, X } from "lucide-react";
import {
  TemplateContent,
  TemplateSurface,
} from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateLayoutControlDefinition,
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import type { NormalizedXMindDocument } from "../lib/xmindImport";

export const layoutControls = {
  displayMode: "double",
} as const;

export const layoutControlSchema: TemplateLayoutControlDefinition[] = [
  {
    key: "displayMode",
    label: "Display mode",
    type: "select",
    options: [
      { label: "Single", value: "single" },
      { label: "Double", value: "double" },
    ],
  },
];

export const templateMeta: TemplateMeta = {
  id: "xmind-breakdown",
  nameZh: "XMind / 系统拆解",
  nameEn: "XMind / System Breakdown",
  descriptionZh: "复用现有案例中的系统分支与双竞品拆解展示。",
  descriptionEn:
    "Reuses the established system-branch and paired-reference breakdown layouts.",
  schema: [
    {
      id: "sectionTitle",
      labelZh: "章节标题",
      labelEn: "Section title",
      type: "text",
    },
    {
      id: "documentOne",
      labelZh: "第一个 XMind",
      labelEn: "First XMind",
      type: "xmind",
    },
    {
      id: "documentTwo",
      labelZh: "第二个 XMind",
      labelEn: "Second XMind",
      type: "xmind",
    },
    {
      id: "referenceOneTitle",
      labelZh: "参照一标题",
      labelEn: "Reference one title",
      type: "text",
    },
    {
      id: "referenceOneCategory",
      labelZh: "参照一分类与状态",
      labelEn: "Reference one category and status",
      type: "text",
    },
    {
      id: "referenceOneSummary",
      labelZh: "参照一总结",
      labelEn: "Reference one summary",
      type: "richtext",
    },
    {
      id: "referenceOneFocus",
      labelZh: "参照一分析重点",
      labelEn: "Reference one focus",
      type: "richtext",
    },
    {
      id: "referenceTwoTitle",
      labelZh: "参照二标题",
      labelEn: "Reference two title",
      type: "text",
    },
    {
      id: "referenceTwoCategory",
      labelZh: "参照二分类与状态",
      labelEn: "Reference two category and status",
      type: "text",
    },
    {
      id: "referenceTwoSummary",
      labelZh: "参照二总结",
      labelEn: "Reference two summary",
      type: "richtext",
    },
    {
      id: "referenceTwoFocus",
      labelZh: "参照二分析重点",
      labelEn: "Reference two focus",
      type: "richtext",
    },
  ],
  createdAt: "2026-07-26T00:00:02.000Z",
};

// Single mode's compact 3-column detail-row grid needs far more usable
// width than double mode's paired reference cards ever did. The shared
// per-template default (see templateLayoutDefaults.ts) was tuned for
// double mode's cards, so single mode caps how much of it applies to
// itself here rather than lowering the shared default (which would also
// narrow double mode).
const SINGLE_MODE_HORIZONTAL_INSET_CAP = 40;

type LocalizedText = { zh: string; en: string };

function localizedValue(
  content: TemplateProps["content"],
  key: string,
  locale: TemplateProps["locale"],
) {
  return (content[key] as LocalizedText | undefined)?.[locale]?.trim() ?? "";
}

function documentValue(
  content: TemplateProps["content"],
  key: string,
) {
  const value = content[key] as NormalizedXMindDocument | undefined;
  return value?.branches?.length ? value : undefined;
}

function SingleBreakdown({
  document,
  locale,
  stableDialogLayout = false,
}: {
  document: NormalizedXMindDocument;
  locale: TemplateProps["locale"];
  stableDialogLayout?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [selectedBranchId, setSelectedBranchId] = useState(
    () => document.branches[0]?.id ?? "",
  );
  const selectedBranch = useMemo(
    () =>
      document.branches.find((branch) => branch.id === selectedBranchId)
      ?? document.branches[0],
    [document.branches, selectedBranchId],
  );

  useEffect(() => {
    if (
      !document.branches.some((branch) => branch.id === selectedBranchId)
    ) {
      setSelectedBranchId(document.branches[0]?.id ?? "");
    }
  }, [document.branches, selectedBranchId]);

  return (
    <section className={`overflow-hidden rounded-[22px] border border-[rgba(85,145,255,0.62)] bg-[rgba(43,67,156,0.28)] shadow-[0_0_0_1px_rgba(80,135,255,0.16),0_0_28px_rgba(55,115,255,0.28),inset_0_0_32px_rgba(60,100,230,0.08)] backdrop-blur-lg ${stableDialogLayout ? "md:flex md:min-h-0 md:flex-1 md:flex-col" : ""}`}>
      <div className="border-b border-[rgba(145,178,255,0.18)] px-5 py-5 md:px-7 md:py-6">
        <span
          className="mb-3 block h-[3px] w-9 rounded-full bg-acidGreen/80"
          aria-hidden="true"
        />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen/72">
            {locale === "zh" ? "系统分支" : "System branches"}
          </p>
          <p className="font-mono text-[10px] tracking-[0.1em] text-white/[0.58]">
            {locale === "zh"
              ? `共 ${document.branches.length} 个分支`
              : `${document.branches.length} branches`}
          </p>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-2.5"
          role="tablist"
          aria-label={document.centerTopic}
        >
          {document.branches.map((branch) => {
            const selected = branch.id === selectedBranch?.id;
            return (
              <button
                key={branch.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`rounded-full px-4 py-2 text-sm font-semibold leading-5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen ${
                  selected
                    ? "bg-acidGreen text-deepIndigo shadow-[0_8px_24px_rgba(198,255,66,0.16)]"
                    : "bg-archiveBlue/38 text-softWhite/58 hover:bg-archiveBlue/68 hover:text-softWhite"
                }`}
                onClick={() => setSelectedBranchId(branch.id)}
              >
                {branch.title}
              </button>
            );
          })}
        </div>
      </div>

      {selectedBranch ? (
        <div className={`rounded-b-[20px] border-t border-[rgba(125,165,255,0.22)] bg-[rgba(25,42,112,0.32)] px-5 py-7 md:px-7 md:py-9 ${stableDialogLayout ? "md:min-h-0 md:flex-1" : ""}`}>
          <div className={`grid min-w-0 items-center gap-5 lg:grid-cols-[minmax(9rem,0.2fr)_2rem_minmax(0,0.8fr)] lg:gap-7 ${stableDialogLayout ? "md:h-full md:min-h-0" : ""}`}>
            <div className="w-full max-w-[13rem] justify-self-center rounded-[12px] border border-[rgba(76,166,255,0.68)] bg-[rgba(39,82,156,0.36)] px-4 py-5 text-center shadow-[0_0_18px_rgba(52,145,255,0.24),inset_0_0_18px_rgba(60,130,255,0.08)]">
              <p className="font-display text-base font-semibold leading-snug text-acidGreen md:text-lg">
                {selectedBranch.title}
              </p>
            </div>
            <ArrowRight
              className="mx-auto !hidden h-5 w-5 text-[#9FAAD2]/55 lg:!block"
              aria-hidden="true"
            />
            <ArrowDown
              className="mx-auto !block h-5 w-5 text-[#9FAAD2]/55 lg:!hidden"
              aria-hidden="true"
            />

            <div className={`min-w-0 ${stableDialogLayout ? "md:h-full md:min-h-0" : ""}`}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selectedBranch.id}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    shouldReduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -6 }
                  }
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.2,
                    ease: "easeOut",
                  }}
                  className={`divide-y divide-[rgba(145,178,255,0.18)] border-y border-[rgba(145,178,255,0.18)] ${stableDialogLayout ? "md:h-full md:overflow-y-auto md:pr-2" : ""}`}
                >
                  {selectedBranch.groups.map((group, groupIndex) => (
                    <div
                      key={group.id}
                      className="grid min-w-0 gap-3 py-5 md:grid-cols-[2rem_minmax(11rem,0.68fr)_minmax(0,1.32fr)] md:gap-5"
                    >
                      <span className="font-mono text-[10px] leading-6 text-white/[0.58]">
                        {String(groupIndex + 1).padStart(2, "0")}
                      </span>
                      {group.title ? (
                        <h4 className="font-display text-base font-semibold leading-6 text-softWhite/88">
                          {group.title}
                        </h4>
                      ) : null}
                      {group.items.length ? (
                        <ul className="grid min-w-0 gap-2">
                          {group.items.map((item, itemIndex) => (
                            <li
                              key={`${group.id}-${itemIndex}`}
                              className="relative pl-4 text-sm leading-6 text-white/[0.78] before:absolute before:left-0 before:top-[0.68rem] before:h-1 before:w-1 before:rounded-full before:bg-acidGreen/68"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Single mode's own renderer -- deliberately not shared with SingleBreakdown
// (which stays exactly as-is for double mode's detail modal). Single mode
// must not inherit double mode's decorative bar, branch-count label, or
// card/modal-oriented spacing; it mirrors the original direct-view layout
// (see XMindBranchViewer.tsx) instead, with its own compact padding.
function SingleXMindBreakdown({
  document,
  locale,
}: {
  document: NormalizedXMindDocument;
  locale: TemplateProps["locale"];
}) {
  const shouldReduceMotion = useReducedMotion();
  const [selectedBranchId, setSelectedBranchId] = useState(
    () => document.branches[0]?.id ?? "",
  );
  const selectedBranch = useMemo(
    () =>
      document.branches.find((branch) => branch.id === selectedBranchId)
      ?? document.branches[0],
    [document.branches, selectedBranchId],
  );

  useEffect(() => {
    if (
      !document.branches.some((branch) => branch.id === selectedBranchId)
    ) {
      setSelectedBranchId(document.branches[0]?.id ?? "");
    }
  }, [document.branches, selectedBranchId]);

  return (
    <section className="overflow-hidden rounded-[22px] border border-[rgba(85,145,255,0.62)] bg-[rgba(43,67,156,0.28)] shadow-[0_0_0_1px_rgba(80,135,255,0.16),0_0_28px_rgba(55,115,255,0.28),inset_0_0_32px_rgba(60,100,230,0.08)] backdrop-blur-lg">
      <div className="px-5 pt-8 md:px-7">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen/72">
          {locale === "zh" ? "系统分支" : "System branches"}
        </p>
        <div
          className="mt-5 flex flex-wrap gap-2.5"
          role="tablist"
          aria-label={document.centerTopic}
        >
          {document.branches.map((branch) => {
            const selected = branch.id === selectedBranch?.id;
            return (
              <button
                key={branch.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`rounded-full px-4 py-2 text-sm font-semibold leading-5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen ${
                  selected
                    ? "bg-acidGreen text-deepIndigo shadow-[0_8px_24px_rgba(198,255,66,0.16)]"
                    : "bg-archiveBlue/38 text-softWhite/58 hover:bg-archiveBlue/68 hover:text-softWhite"
                }`}
                onClick={() => setSelectedBranchId(branch.id)}
              >
                {branch.title}
              </button>
            );
          })}
        </div>
      </div>

      {selectedBranch ? (
        <div className="mt-6 border-t border-[rgba(125,165,255,0.22)] bg-[rgba(25,42,112,0.32)] px-5 pb-8 pt-5 md:px-7">
          <div className="grid min-w-0 items-center gap-5 lg:grid-cols-[minmax(15rem,0.3fr)_2rem_minmax(0,0.7fr)] lg:gap-7">
            <div className="w-full max-w-[16rem] justify-self-center rounded-[14px] border border-[rgba(76,166,255,0.68)] bg-[rgba(39,82,156,0.36)] px-5 py-6 text-center shadow-[0_0_18px_rgba(52,145,255,0.24),inset_0_0_18px_rgba(60,130,255,0.08)]">
              <p className="font-display text-lg font-semibold leading-snug text-acidGreen md:text-xl">
                {selectedBranch.title}
              </p>
            </div>
            <ArrowRight
              className="mx-auto !hidden h-5 w-5 text-[#9FAAD2]/55 lg:!block"
              aria-hidden="true"
            />
            <ArrowDown
              className="mx-auto !block h-5 w-5 text-[#9FAAD2]/55 lg:!hidden"
              aria-hidden="true"
            />

            <div className="min-w-0">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selectedBranch.id}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    shouldReduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -6 }
                  }
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.2,
                    ease: "easeOut",
                  }}
                  className="divide-y divide-[rgba(145,178,255,0.18)] border-y border-[rgba(145,178,255,0.18)]"
                >
                  {selectedBranch.groups.map((group, groupIndex) => (
                    <div
                      key={group.id}
                      className="grid min-w-0 gap-3 py-5 md:grid-cols-[2rem_minmax(11rem,0.68fr)_minmax(0,1.32fr)] md:gap-5"
                    >
                      <span className="font-mono text-[10px] leading-6 text-white/[0.58]">
                        {String(groupIndex + 1).padStart(2, "0")}
                      </span>
                      {group.title ? (
                        <h4 className="font-display text-base font-semibold leading-6 text-softWhite/88">
                          {group.title}
                        </h4>
                      ) : null}
                      {group.items.length ? (
                        <ul className="grid min-w-0 gap-2">
                          {group.items.map((item, itemIndex) => (
                            <li
                              key={`${group.id}-${itemIndex}`}
                              className="relative pl-4 text-sm leading-6 text-white/[0.78] before:absolute before:left-0 before:top-[0.68rem] before:h-1 before:w-1 before:rounded-full before:bg-acidGreen/68"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReferenceCard({
  index,
  title,
  category,
  summary,
  focus,
  locale,
  onOpen,
}: {
  index: number;
  title: string;
  category: string;
  summary: string;
  focus: string;
  locale: TemplateProps["locale"];
  onOpen: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      className="group relative flex min-h-[15rem] min-w-0 flex-col overflow-hidden rounded-[18px] border border-[rgba(145,178,255,0.18)] bg-[rgba(35,58,140,0.34)] p-5 text-left shadow-[0_14px_34px_rgba(3,5,26,0.24),inset_0_1px_0_rgba(244,245,250,0.08)] ring-1 ring-inset ring-softWhite/5 transition-colors hover:bg-[rgba(35,58,140,0.46)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen md:p-6"
      onClick={onOpen}
      whileHover={shouldReduceMotion ? undefined : { y: -6, scale: 1.015 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.22,
        ease: "easeOut",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-acidGreen/40 bg-acidGreen/10 font-mono text-xs font-bold text-acidGreen">
          {String(index + 1).padStart(2, "0")}
        </span>
        <p className="font-mono text-xs font-bold tracking-[0.1em] text-white/[0.58]">
          {locale === "zh" ? "拆解入口" : "BREAKDOWN ENTRY"}
        </p>
      </div>
      {title ? (
        <h3 className="mt-4 break-words font-display text-[clamp(1.45rem,2.2vw,1.85rem)] leading-tight text-softWhite">
          {title}
        </h3>
      ) : null}
      {category || summary ? (
        <div className="mt-4 border-l-2 border-acidGreen/20 pl-3">
          <p className="font-mono text-xs tracking-[0.08em] text-white/[0.58]">
            {locale === "zh" ? "参考定位" : "REFERENCE POSITIONING"}
          </p>
          {category ? (
            <p className="mt-1 text-sm font-semibold leading-5 text-softWhite/70">
              {category}
            </p>
          ) : null}
          {summary ? (
            <p className={`${category ? "mt-2" : "mt-1"} text-sm leading-5 text-white/[0.78]`}>
              {summary}
            </p>
          ) : null}
        </div>
      ) : null}
      {focus ? (
        <div className="mt-3 border-l-2 border-acidGreen/20 pl-3">
          <p className="font-mono text-xs tracking-[0.08em] text-white/[0.58]">
            {locale === "zh" ? "拆解关注点" : "BREAKDOWN FOCUS"}
          </p>
          <p className="mt-1 text-sm leading-5 text-white/[0.78]">{focus}</p>
        </div>
      ) : null}
      <span className="mt-auto inline-flex w-fit items-center gap-2 self-end rounded-full border border-acidGreen/50 bg-acidGreen/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] text-acidGreen transition-colors group-hover:border-acidGreen group-hover:bg-acidGreen group-hover:text-deepIndigo">
        {locale === "zh" ? "查看拆解" : "View breakdown"}
        <span
          className="transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        >
          →
        </span>
      </span>
    </motion.button>
  );
}

export default function XMindBreakdownTemplate({
  content,
  locale,
  horizontalInset = 0,
}: TemplateProps) {
  const shouldReduceMotion = useReducedMotion();
  const sectionTitle = localizedValue(content, "sectionTitle", locale);
  const documentOne = documentValue(content, "documentOne");
  const documentTwo = documentValue(content, "documentTwo");
  // Per-instance mode: an explicit content.displayMode always wins (this is
  // the key layoutControlSchema already advertises). Instances authored
  // before this field existed have no such value, so they fall back to the
  // one unambiguous structural fact about them — whether a second, real
  // XMind document was ever attached — rather than to the old file-wide
  // `layoutControls.displayMode` constant, which forced every instance into
  // whatever mode the template file happened to be built with.
  const explicitDisplayMode =
    content.displayMode === "single" || content.displayMode === "double"
      ? content.displayMode
      : undefined;
  const displayMode: "single" | "double" =
    explicitDisplayMode ?? (documentTwo ? "double" : "single");
  const [openDocument, setOpenDocument] =
    useState<NormalizedXMindDocument | null>(null);

  const references = [
    documentOne
      ? {
          document: documentOne,
          title: localizedValue(content, "referenceOneTitle", locale),
          category: localizedValue(content, "referenceOneCategory", locale),
          summary: localizedValue(content, "referenceOneSummary", locale),
          focus: localizedValue(content, "referenceOneFocus", locale),
        }
      : null,
    documentTwo
      ? {
          document: documentTwo,
          title: localizedValue(content, "referenceTwoTitle", locale),
          category: localizedValue(content, "referenceTwoCategory", locale),
          summary: localizedValue(content, "referenceTwoSummary", locale),
          focus: localizedValue(content, "referenceTwoFocus", locale),
        }
      : null,
  ].filter(Boolean) as Array<{
    document: NormalizedXMindDocument;
    title: string;
    category: string;
    summary: string;
    focus: string;
  }>;

  if (displayMode === "single" && !documentOne) return null;
  if (displayMode === "double" && !references.length) return null;

  const effectiveHorizontalInset =
    displayMode === "single"
      ? Math.min(horizontalInset, SINGLE_MODE_HORIZONTAL_INSET_CAP)
      : horizontalInset;

  return (
    <TemplateSurface>
      <TemplateContent
        horizontalInset={effectiveHorizontalInset}
        className="pt-[16px] pb-[16px]"
      >
        {sectionTitle ? (
          <div className="text-center">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-acidGreen/68">
              {locale === "zh" ? "核心分析框架" : "CORE ANALYSIS FRAMEWORK"}
            </p>
            <h2 className="mt-2.5 w-full text-center font-display text-[clamp(1.35rem,2.3vw,1.75rem)] font-semibold leading-[1.3] text-softWhite">
              {sectionTitle}
            </h2>
            <span className="mx-auto mt-3 block h-px w-14 bg-acidGreen/45" aria-hidden="true" />
          </div>
        ) : null}

        <div className={sectionTitle ? "mt-6 md:mt-8" : ""}>
          {displayMode === "single" && documentOne ? (
            <SingleXMindBreakdown document={documentOne} locale={locale} />
          ) : null}

          {displayMode === "double" ? (
            <section className="overflow-hidden rounded-[22px] border border-[rgba(85,145,255,0.62)] bg-[rgba(43,67,156,0.28)] shadow-[0_0_0_1px_rgba(80,135,255,0.16),0_0_28px_rgba(55,115,255,0.28),inset_0_0_32px_rgba(60,100,230,0.08)] backdrop-blur-lg">
              <div className="border-b border-[rgba(145,178,255,0.18)] px-5 py-5 md:px-7 md:py-6">
                <span
                  className="mb-3 block h-[3px] w-9 rounded-full bg-acidGreen/80"
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen/72">
                    {locale === "zh" ? "参照框架" : "Reference framework"}
                  </p>
                  <p className="font-mono text-[10px] tracking-[0.1em] text-white/[0.58]">
                    {locale === "zh" ? `共 ${references.length} 个入口` : `${references.length} entries`}
                  </p>
                </div>
              </div>
              <div className="rounded-b-[20px] border-t border-[rgba(125,165,255,0.22)] bg-[rgba(25,42,112,0.32)] grid w-full gap-6 p-5 sm:grid-cols-2 sm:items-stretch md:p-7 lg:gap-8">
                {references.map((reference, index) => (
                  <ReferenceCard
                    key={`${reference.document.fileName}-${index}`}
                    index={index}
                    title={reference.title}
                    category={reference.category}
                    summary={reference.summary}
                    focus={reference.focus}
                    locale={locale}
                    onOpen={() => setOpenDocument(reference.document)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {typeof document !== "undefined"
          ? createPortal(
              <AnimatePresence>
                {openDocument ? (
                  <motion.div
                    className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-[#070A28]/80 p-4 backdrop-blur-md md:p-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) {
                        setOpenDocument(null);
                      }
                    }}
                    role="presentation"
                  >
                    <motion.article
                      className="relative my-auto max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-y-auto rounded-[30px] bg-[#111746]/95 p-6 shadow-[0_36px_100px_rgba(2,4,24,0.68),inset_0_1px_0_rgba(244,245,250,0.12)] ring-1 ring-inset ring-softWhite/5 md:flex md:h-[min(46rem,calc(100vh-4rem))] md:max-h-none md:flex-col md:overflow-hidden md:p-10"
                      initial={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: 24, scale: 0.97 }
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: 16, scale: 0.98 }
                      }
                      transition={{
                        duration: shouldReduceMotion ? 0 : 0.28,
                        ease: "easeOut",
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <div className="mb-6 flex shrink-0 items-center justify-between gap-4">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-sm font-semibold text-acidGreen"
                          onClick={() => setOpenDocument(null)}
                        >
                          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                          {locale === "zh"
                            ? "返回双排展示"
                            : "Back to references"}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-softWhite/10 text-[#9FAAD2] transition hover:bg-softWhite/20 hover:text-softWhite focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen"
                          aria-label={locale === "zh" ? "关闭拆解" : "Close breakdown"}
                          onClick={() => setOpenDocument(null)}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <SingleBreakdown
                        document={openDocument}
                        locale={locale}
                        stableDialogLayout
                      />
                    </motion.article>
                  </motion.div>
                ) : null}
              </AnimatePresence>,
              document.body,
            )
          : null}
      </TemplateContent>
    </TemplateSurface>
  );
}
