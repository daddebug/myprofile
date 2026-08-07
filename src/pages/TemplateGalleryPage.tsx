import {
  useEffect,
  useState,
  type ComponentType,
} from "react";
import {
  Code2,
  Copy,
  Download,
  Pencil,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import { threeDCharacterSystemMap } from "../data/three-d-character-system-map";
import imageRowSampleA from "../assets/template-samples/image-row-sample-a.png";
import imageRowSampleB from "../assets/template-samples/image-row-sample-b.png";
import imageRowSampleC from "../assets/template-samples/image-row-sample-c.png";
import {
  TemplatePreviewFrame,
  TemplateRenderBoundary,
} from "../components/template-tools/TemplatePreviewFrame";
import { TemplateDebugProvider } from "../components/template-tools/TemplateResponsiveFoundation";
import type {
  TemplateMeta,
  TemplateProps,
} from "../lib/templateLibrary";
import {
  loadTemplateSource,
  prepareTemplatePreview,
  templateFilesById,
} from "../lib/templateSourceClient";
import {
  getTemplateHorizontalInset,
  setTemplateHorizontalInset,
  useTemplateHorizontalInset,
} from "../lib/templateLayoutDefaults";

type TemplateModule = {
  default?: ComponentType<TemplateProps>;
  templateMeta?: TemplateMeta;
};

type GalleryTemplate = {
  loader: () => Promise<TemplateModule>;
  sample: Record<string, unknown>;
};

const systemBreakdownSample = {
  fileName: "项目系统结构.xmind",
  sheetTitle: "项目系统结构",
  centerTopic: threeDCharacterSystemMap.rootTitle.zh,
  branches: threeDCharacterSystemMap.branches.map((branch) => ({
    id: branch.id,
    title: branch.label.zh,
    groups: branch.groups.map((group) => ({
      id: group.id,
      title: group.title.zh,
      items: group.items.map((item) => item.zh),
    })),
  })),
};

const galleryTemplates: GalleryTemplate[] = [
  {
    loader: () => import("../templates/ProjectHeaderTemplate"),
    sample: {
      category: {
        zh: "商业项目 / 系统 UI",
        en: "COMMERCIAL PROJECT / SYSTEM UI",
      },
      duration: {
        zh: "2021.07 — 2024.02",
        en: "2021.07 — 2024.02",
      },
      title: {
        zh: "从系统驱动到体验驱动：重新分配界面节奏",
        en: "From System-Driven to Experience-Driven",
      },
      summary: {
        zh: "围绕成熟游戏系统，重新组织信息密度、操作节奏与角色体验之间的关系。",
        en: "Rebalancing information density, interaction rhythm, and character experience inside a mature game system.",
      },
    },
  },
  {
    loader: () => import("../templates/StatementLongformTemplate"),
    sample: {
      sectionNumber: {
        zh: "01",
        en: "01",
      },
      leftTitle: {
        zh: "传统手游痛点",
        en: "Traditional Mobile Game Pain Points",
      },
      statement: {
        zh: "UI 在展示信息的同时还高强度指引玩家进行下一步操作。",
        en: "While presenting information, the UI also strongly directs the player's next action.",
      },
      body: {
        zh: "2016 年后，受“魔灵-like”与《小冰冰传奇》等影响，传统手游逐渐形成了以系统循环、资源反馈和连续引导为中心的界面组织方式。",
        en: "After 2016, influenced by Summoners War-like games and titles such as Soul Hunters, traditional mobile games increasingly organized their interfaces around system loops, resource feedback, and continuous guidance.",
      },
    },
  },
  {
    loader: () => import("../templates/XMindBreakdownTemplate"),
    sample: {
      sectionTitle: {
        zh: "系统拆解",
        en: "System Mapping",
      },
      documentOne: systemBreakdownSample,
    },
  },
  {
    loader: () => import("../templates/SupportingNoteTemplate"),
    sample: {
      body: {
        zh: "项目建立在成熟的任务驱动型养成框架上，玩家日常在多个系统之间高频切换。随着体验目标逐渐转向角色与内容表现，原有界面节奏开始暴露出新的冲突。",
        en: "The project was built on a mature task-driven progression framework. As the experience shifted toward character and content presentation, the existing interface rhythm began to reveal new conflicts.",
      },
    },
  },
  {
    loader: () => import("../templates/PhaseMilestonesTemplate"),
    sample: {
      heading: {
        zh: "四个设计介入阶段",
        en: "Four Design Intervention Phases",
      },
      items: [
        {
          id: "business-decision",
          number: "01",
          title: { zh: "业务决策", en: "Business Decision" },
          hoverTitle: { zh: "项目前提", en: "Project premise" },
          hoverText: {
            zh: "明确商业目标与需要保留的体验边界。",
            en: "Clarify the business goal and the experience boundary.",
          },
          targetId: "phase-demo-business-decision",
          state: "outline",
        },
        {
          id: "technical-direction",
          number: "02",
          title: { zh: "技术方向", en: "Technical Direction" },
          hoverTitle: { zh: "技术约束", en: "Technical constraints" },
          hoverText: {
            zh: "确认平台能力、性能限制与实现方式。",
            en: "Confirm platform capabilities and implementation limits.",
          },
          targetId: "phase-demo-technical-direction",
          state: "outline",
        },
        {
          id: "system-restructure",
          number: "03",
          title: { zh: "系统重构", en: "System Restructure" },
          hoverTitle: { zh: "结构判断", en: "Structural judgment" },
          hoverText: {
            zh: "重新梳理系统层级与页面承载关系。",
            en: "Reframe system hierarchy and page relationships.",
          },
          targetId: "phase-demo-system-restructure",
          state: "outline",
        },
        {
          id: "competitor-analysis",
          number: "04",
          title: { zh: "竞品分析拆解", en: "Competitor Analysis" },
          hoverTitle: { zh: "研究参照", en: "Research reference" },
          hoverText: {
            zh: "通过竞品拆解建立平台体验判断。",
            en: "Use competitor analysis to establish platform judgments.",
          },
          targetId: "phase-demo-competitor-analysis",
          state: "active",
        },
        {
          id: "hierarchy-optimisation",
          number: "05",
          title: { zh: "功能层级优化", en: "Hierarchy Optimisation" },
          hoverTitle: { zh: "交互调整", en: "Interaction adjustment" },
          hoverText: {
            zh: "减少连续覆盖，让功能关系更清楚。",
            en: "Reduce repeated overlays and clarify functional hierarchy.",
          },
          targetId: "phase-demo-hierarchy-optimisation",
          state: "active",
        },
        {
          id: "production",
          number: "06",
          title: { zh: "铺量", en: "Production" },
          hoverTitle: { zh: "生产验证", en: "Production validation" },
          hoverText: {
            zh: "把设计方向整理成可持续扩展的生产规则。",
            en: "Turn the direction into scalable production rules.",
          },
          targetId: "phase-demo-production",
          state: "active",
        },
      ],
    },
  },
  {
    loader: () => import("../templates/CircleSummaryTemplate"),
    sample: {
      heading: {
        zh: "带回本项目的判断",
        en: "Judgments Brought Back to the Project",
      },
      items: [
        {
          id: "system-restructure",
          text: {
            zh: "轻量化来自系统重组与交互重构",
            en: "Lightweight experience comes from system and interaction restructuring",
          },
        },
        {
          id: "familiarity-loop",
          text: {
            zh: "面向不同熟悉程度的用户设计体验循环",
            en: "Design experience loops for different levels of familiarity",
          },
        },
        {
          id: "progressive-complexity",
          text: {
            zh: "美术表现保持轻度，高难玩法逐步开放",
            en: "Keep presentation light and reveal demanding play progressively",
          },
        },
      ],
    },
  },
  {
    loader: () => import("../templates/DecisionTableTemplate"),
    sample: {
      heading: {
        zh: "复用与设计范围判断",
        en: "Reuse and Design Scope Decisions",
      },
      columns: [
        { id: "category", title: { zh: "类型", en: "Type" } },
        { id: "strategy", title: { zh: "处理策略", en: "Strategy" } },
        { id: "scope", title: { zh: "具体范围", en: "Scope" } },
        { id: "reason", title: { zh: "判断原因", en: "Rationale" } },
      ],
      rows: [
        {
          id: "icon-assets",
          cells: {
            category: { zh: "图标资源", en: "Icon assets" },
            strategy: { zh: "全面保留", en: "Retain" },
            scope: {
              zh: "资源图标、道具图标、品质图标",
              en: "Resource, item, and rarity icons",
            },
            reason: {
              zh: "已有识别度高，重做成本大，且不直接造成层级问题",
              en: "Highly recognizable assets with a high replacement cost.",
            },
          },
        },
        {
          id: "base-controls",
          cells: {
            category: { zh: "基础控件", en: "Base controls" },
            strategy: {
              zh: "核心控件保留",
              en: "Keep core controls",
            },
            scope: {
              zh: "按钮、标签、页签、关闭按钮与数量展示",
              en: "Buttons, labels, tabs, close controls, and counters",
            },
            reason: {
              zh: "保持原游戏识别感，只调整尺寸、间距和状态清晰度",
              en: "Preserve recognition while refining size, spacing, and states.",
            },
          },
        },
        {
          id: "popup-structure",
          cells: {
            category: { zh: "弹窗结构", en: "Popup structure" },
            strategy: { zh: "重组", en: "Restructure" },
            scope: {
              zh: "确认弹窗、道具详情弹窗与二级说明弹窗",
              en: "Confirmation, item detail, and secondary information dialogs",
            },
            reason: {
              zh: "旧结构容易连续叠加，需要区分即时操作和系统内容",
              en: "Separate immediate actions from deeper system content.",
            },
          },
        },
        {
          id: "information-hierarchy",
          cells: {
            category: { zh: "信息层级", en: "Information hierarchy" },
            strategy: {
              zh: "部分尝试性重构",
              en: "Selective exploration",
            },
            scope: {
              zh: "主操作、资源消耗、升级反馈与说明信息",
              en: "Primary actions, resource costs, feedback, and explanations",
            },
            reason: {
              zh: "帮助玩家更快理解当前目标与下一步操作",
              en: "Help players understand the current goal and next action.",
            },
          },
        },
      ],
    },
  },
  {
    loader: () => import("../templates/ImageRowTemplate"),
    sample: {
      heading: {
        zh: "当前架构现状",
        en: "Current Architecture",
      },
      items: [
        {
          id: "image-row-sample-1",
          image: { publicPath: imageRowSampleA },
          alt: { zh: "示例界面 A", en: "Sample UI A" },
          caption: {
            zh: "入口与页面关系",
            en: "Entry points and page relationships",
          },
        },
        {
          id: "image-row-sample-2",
          image: { publicPath: imageRowSampleB },
          alt: { zh: "示例界面 B", en: "Sample UI B" },
          caption: {
            zh: "弹窗层级变化",
            en: "Popup hierarchy changes",
          },
        },
        {
          id: "image-row-sample-3",
          image: { publicPath: imageRowSampleC },
          alt: { zh: "示例界面 C", en: "Sample UI C" },
          caption: {
            zh: "核心功能操作链路",
            en: "Core function operation path",
          },
        },
      ],
    },
  },
  {
    loader: () => import("../templates/FigmaPrototypeTemplate"),
    sample: {
      heading: {
        zh: "交互原型演示",
        en: "Interactive Prototype Walkthrough",
      },
      figmaUrl: "",
      caption: {
        zh: "此处展示原型的补充说明文字，用于解释交互演示的重点。",
        en: "Supporting text explaining what the prototype demo highlights.",
      },
    },
  },
];

function validateTemplateModule(module: TemplateModule) {
  if (!module.default) {
    throw new Error("The template has no default component export.");
  }
  if (
    !module.templateMeta
    || typeof module.templateMeta.id !== "string"
    || !Array.isArray(module.templateMeta.schema)
  ) {
    throw new Error("The templateMeta export is missing or invalid.");
  }
  return {
    Component: module.default,
    meta: module.templateMeta,
  };
}

async function importPreviewModule(moduleUrl: string) {
  return (await import(
    /* @vite-ignore */ moduleUrl
  )) as TemplateModule;
}

function downloadSource(fileName: string, source: string) {
  const blob = new Blob([source], {
    type: "text/typescript;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}.tsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PhaseMilestoneDemoTargets({
  sample,
  locale,
}: {
  sample: Record<string, unknown>;
  locale: "zh" | "en";
}) {
  const items = Array.isArray(sample.items)
    ? sample.items.filter(
        (item): item is {
          targetId: string;
          title?: string | { zh?: string; en?: string };
        } =>
          Boolean(
            item
            && typeof item === "object"
            && typeof (item as { targetId?: unknown }).targetId === "string"
            && (item as { targetId: string }).targetId,
          ),
      )
    : [];

  if (!items.length) return null;

  return (
    <div
      className="mt-12 border-t border-softWhite/10"
      data-phase-gallery-demo-targets
    >
      {items.map((item, index) => {
        const title =
          typeof item.title === "string"
            ? item.title
            : item.title?.[locale] ?? "";
        return (
          <section
            key={item.targetId}
            id={item.targetId}
            className="flex min-h-72 items-center border-b border-softWhite/10"
            style={{
              scrollMarginTop:
                "calc(var(--site-header-height) + 2.25rem)",
            }}
          >
            <div>
              <p className="font-mono text-xs font-bold tracking-[0.12em] text-acidGreen/72">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 font-display text-3xl font-semibold text-softWhite">
                {title}
              </h3>
              <p className="mt-3 text-sm text-softWhite/42">
                {locale === "zh"
                  ? "Gallery 临时跳转目标"
                  : "Temporary Gallery navigation target"}
              </p>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TemplateGalleryEntry({
  entry,
  locale,
  showBoundaries,
  selectedId,
  selectedInsetDraft,
  onSelectTemplate,
}: {
  entry: GalleryTemplate;
  locale: "zh" | "en";
  showBoundaries: boolean;
  selectedId: string | null;
  selectedInsetDraft: number;
  onSelectTemplate: (id: string, nameZh: string, nameEn: string) => void;
}) {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<ReturnType<
    typeof validateTemplateModule
  > | null>(null);
  const [loadError, setLoadError] = useState("");
  const [source, setSource] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [copyState, setCopyState] = useState("");
  const savedInset = useTemplateHorizontalInset(loaded?.meta.id ?? "");
  const isSelected = Boolean(loaded && loaded.meta.id === selectedId);
  // While this entry is the selected one, its preview follows the top
  // control bar's live (unsaved) draft value instead of the persisted
  // default, so typing there updates only this template.
  const horizontalInset = isSelected ? selectedInsetDraft : savedInset;

  useEffect(() => {
    let active = true;
    entry
      .loader()
      .then((module) => {
        if (active) setLoaded(validateTemplateModule(module));
      })
      .catch((error) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "Template load failed.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [entry]);

  useEffect(() => {
    if (!loaded) return;
    let active = true;
    const fileName = templateFilesById[loaded.meta.id];
    if (!fileName) {
      setSourceError("No source file is registered for this template.");
      return;
    }
    loadTemplateSource(fileName)
      .then(async (record) => {
        const preview = await prepareTemplatePreview(
          record.code,
          loaded.meta.id,
        );
        const module = await importPreviewModule(preview.moduleUrl);
        if (!active) return;
        setSource(record.code);
        setLoaded(validateTemplateModule(module));
      })
      .catch((error) => {
        if (active) {
          setSourceError(
            error instanceof Error ? error.message : "Unable to read source.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [loaded?.meta.id]);

  useEffect(() => {
    if (loaded?.meta.id !== "phase-milestones" || !window.location.hash) {
      return;
    }
    const rawId = window.location.hash.slice(1);
    let targetId = rawId;
    try {
      targetId = decodeURIComponent(rawId);
    } catch {
      targetId = rawId;
    }
    if (!targetId.startsWith("phase-demo-")) return;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loaded?.meta.id, locale]);

  if (loadError) {
    return (
      <section className="border-y border-peach/35 py-10">
        <p className="font-mono text-xs uppercase text-peach">
          Template unavailable
        </p>
        <p className="mt-3 text-sm text-softWhite/68">{loadError}</p>
      </section>
    );
  }

  if (!loaded) {
    return (
      <section className="border-y border-softWhite/10 py-14 text-sm text-softWhite/40">
        Loading template...
      </section>
    );
  }

  const { Component, meta } = loaded;
  const fileName = templateFilesById[meta.id];
  const name = locale === "zh" ? meta.nameZh : meta.nameEn;
  const alternateName = locale === "zh" ? meta.nameEn : meta.nameZh;
  const debugInfo = showBoundaries
    ? {
        label: isSelected ? `${name} · ${horizontalInset}px` : name,
        showContentBoundary: true,
        emphasizeSurface: isSelected,
      }
    : null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopyState(locale === "zh" ? "已复制" : "Copied");
      window.setTimeout(() => setCopyState(""), 1400);
    } catch {
      setCopyState(locale === "zh" ? "复制失败" : "Copy failed");
    }
  };

  return (
    <section
      className="border-t border-softWhite/12 py-12 last:border-b"
      data-template-entry={meta.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-[8px] border border-softWhite/12 bg-deepIndigo/24 px-5 py-4">
        <div className="min-w-0">
          <p className="font-display text-2xl font-semibold text-softWhite">
            {name}
            <span className="ml-2 text-lg font-normal text-softWhite/38">
              / {alternateName}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="editor-action"
            onClick={() =>
              navigate(
                `/${locale}/owner-tools/templates?template=${encodeURIComponent(meta.id)}`,
              )
            }
          >
            <Pencil className="h-3.5 w-3.5" />
            {locale === "zh" ? "打开设计" : "Open Design"}
          </button>
          <button
            type="button"
            className="editor-action"
            onClick={() => setShowCode((current) => !current)}
            disabled={!source}
          >
            <Code2 className="h-3.5 w-3.5" />
            {locale === "zh" ? "查看代码" : "View Code"}
          </button>
          <button
            type="button"
            className="editor-action"
            onClick={() => void copyCode()}
            disabled={!source}
          >
            <Copy className="h-3.5 w-3.5" />
            {copyState || (locale === "zh" ? "复制代码" : "Copy Code")}
          </button>
          <button
            type="button"
            className="editor-action"
            onClick={() => downloadSource(fileName, source)}
            disabled={!source}
          >
            <Download className="h-3.5 w-3.5" />
            {locale === "zh" ? "导出 TSX" : "Export TSX"}
          </button>
        </div>
      </div>

      <div
        className={showBoundaries ? "mt-7 cursor-pointer" : "mt-7"}
        onClick={showBoundaries ? () => onSelectTemplate(meta.id, meta.nameZh, meta.nameEn) : undefined}
      >
        <TemplatePreviewFrame>
          <TemplateRenderBoundary
            name={name}
            resetKey={`${meta.id}-${locale}-${source.length}`}
          >
            <TemplateDebugProvider info={debugInfo}>
              <Component content={entry.sample} locale={locale} horizontalInset={horizontalInset} />
            </TemplateDebugProvider>
          </TemplateRenderBoundary>
        </TemplatePreviewFrame>
      </div>
      {meta.id === "phase-milestones" ? (
        <PhaseMilestoneDemoTargets sample={entry.sample} locale={locale} />
      ) : null}

      {showCode ? (
        <div className="mt-5 border border-softWhite/12 bg-[#09091f]">
          <div className="border-b border-softWhite/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-softWhite/42">
            src/templates/{fileName}.tsx
          </div>
          <pre className="max-h-[34rem] overflow-auto whitespace-pre p-4 font-mono text-xs leading-6 text-softWhite/76">
            <code>{source}</code>
          </pre>
        </div>
      ) : null}

      {sourceError ? (
        <p className="mt-3 text-sm text-peach">{sourceError}</p>
      ) : null}
    </section>
  );
}

// Session-only Gallery boundary-debug selection: which template the top
// control bar is currently editing, and its live (unsaved) inset draft.
// Never persisted — only setTemplateHorizontalInset (below, on Save) writes
// to the shared template-layout-defaults store.
type GallerySelection = {
  id: string;
  nameZh: string;
  nameEn: string;
};

function GalleryBoundaryControlBar({
  locale,
  showBoundaries,
  onToggleBoundaries,
  selected,
  insetDraft,
  onInsetDraftChange,
  hasUnsaved,
  onRestore,
  onSave,
}: {
  locale: "zh" | "en";
  showBoundaries: boolean;
  onToggleBoundaries: (value: boolean) => void;
  selected: GallerySelection | null;
  insetDraft: number;
  onInsetDraftChange: (value: number) => void;
  hasUnsaved: boolean;
  onRestore: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[8px] border border-softWhite/14 bg-archiveBlue/16 px-4 py-2.5">
      <label className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-softWhite/76">
        <input
          type="checkbox"
          checked={showBoundaries}
          onChange={(event) => onToggleBoundaries(event.target.checked)}
        />
        {locale === "zh" ? "显示模板边界" : "Show template boundaries"}
      </label>
      <div className="h-4 w-px bg-softWhite/16" aria-hidden="true" />
      {selected ? (
        <>
          <span className="font-mono text-[11px] text-softWhite/56">
            {locale === "zh" ? "当前模板：" : "Current template: "}
            <span className="text-softWhite">
              {locale === "zh" ? selected.nameZh : selected.nameEn}
            </span>
          </span>
          <label className="flex items-center gap-1.5 font-mono text-[11px] text-softWhite/56">
            {locale === "zh" ? "左右缩进" : "Inset"}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={400}
              step={8}
              value={insetDraft}
              onChange={(event) => {
                const next = Number(event.target.value);
                onInsetDraftChange(Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0);
              }}
              className="w-16 border-b border-softWhite/24 bg-transparent py-1 text-center text-softWhite outline-none focus:border-acidGreen"
            />
            px
          </label>
          <button
            type="button"
            className="editor-action"
            onClick={onRestore}
            disabled={!hasUnsaved}
          >
            {locale === "zh" ? "恢复已保存值" : "Restore saved value"}
          </button>
          <button
            type="button"
            className="editor-action border-acidGreen/60 text-acidGreen disabled:opacity-40"
            onClick={onSave}
            disabled={!hasUnsaved}
          >
            {locale === "zh" ? "保存当前模板缩进" : "Save this template's inset"}
          </button>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-softWhite/44">
            {hasUnsaved
              ? (locale === "zh" ? "有未保存更改" : "Unsaved changes")
              : (locale === "zh" ? "已保存" : "Saved")}
          </span>
        </>
      ) : (
        <span className="font-mono text-[11px] text-softWhite/44">
          {locale === "zh" ? "当前模板：未选择 · 左右缩进：—" : "Current template: none · Inset: —"}
        </span>
      )}
    </div>
  );
}

export function TemplateGalleryPage() {
  const [locale, setLocale] = useState<"zh" | "en">("zh");
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [selected, setSelected] = useState<GallerySelection | null>(null);
  const [insetDraft, setInsetDraft] = useState(0);
  const [insetSaved, setInsetSaved] = useState(0);
  const hasUnsavedInset = selected !== null && insetDraft !== insetSaved;

  const selectTemplate = (id: string, nameZh: string, nameEn: string) => {
    setSelected({ id, nameZh, nameEn });
    const current = getTemplateHorizontalInset(id);
    setInsetDraft(current);
    setInsetSaved(current);
  };

  const saveSelectedInset = () => {
    if (!selected) return;
    setTemplateHorizontalInset(selected.id, insetDraft);
    setInsetSaved(insetDraft);
  };

  return (
    <PageTransition>
      <main className="relative z-10 min-h-screen bg-transparent text-softWhite">
        <div className="sticky top-0 z-20 border-b border-softWhite/10 bg-deepIndigo/95 py-5 backdrop-blur">
          <div className="site-container flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">
                Owner Tools
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold">
                Template Gallery
              </h1>
            </div>
            <GalleryBoundaryControlBar
              locale={locale}
              showBoundaries={showBoundaries}
              onToggleBoundaries={setShowBoundaries}
              selected={selected}
              insetDraft={insetDraft}
              onInsetDraftChange={setInsetDraft}
              hasUnsaved={hasUnsavedInset}
              onRestore={() => setInsetDraft(insetSaved)}
              onSave={saveSelectedInset}
            />
            <div className="flex border border-softWhite/16">
              <button
                type="button"
                className={`px-4 py-1.5 text-xs font-semibold ${
                  locale === "zh"
                    ? "bg-acidGreen text-deepIndigo"
                    : "text-softWhite/60"
                }`}
                onClick={() => setLocale("zh")}
              >
                中文
              </button>
              <button
                type="button"
                className={`px-4 py-1.5 text-xs font-semibold ${
                  locale === "en"
                    ? "bg-acidGreen text-deepIndigo"
                    : "text-softWhite/60"
                }`}
                onClick={() => setLocale("en")}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        <div className="site-container pb-24 pt-10">
          {galleryTemplates.map((entry, index) => (
            <TemplateGalleryEntry
              key={index}
              entry={entry}
              locale={locale}
              showBoundaries={showBoundaries}
              selectedId={selected?.id ?? null}
              selectedInsetDraft={insetDraft}
              onSelectTemplate={selectTemplate}
            />
          ))}
        </div>
      </main>
    </PageTransition>
  );
}
