import { type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowUp, Download, FileUp, Plus, Trash2, X } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { CaseStudyEditorActions, useCaseStudyEditor } from "../components/CaseStudyEditor";
import { ProjectCoverEditor } from "../components/ProjectCoverEditor";
import {
  deleteDraftImage,
  getDraftImage,
  putDraftImage,
  type DraftImageRecord,
} from "../lib/crossPlatformImageDraftDb";
import { getProjectBySlug } from "../data/projects";
import competitorXmindExtracted from "../data/competitor-xmind-extracted.json";
import { getProjectTranslation } from "../content/projects/translations";
import { CROSS_PLATFORM_DRAFT_STORAGE_KEY } from "../lib/crossPlatformDraftStorage";
import { caseStudyLayout } from "../lib/caseStudyLayout";
import { setProjectPublicMetaOverride } from "../lib/projectMetadata";
import { useLocale } from "../locales/LocaleContext";

export { CROSS_PLATFORM_DRAFT_STORAGE_KEY } from "../lib/crossPlatformDraftStorage";
const AUTOSAVE_DELAY_MS = 400;
const ACCEPTED_DRAFT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"];
const MAXIMUM_DRAFT_IMAGE_SIZE = 20 * 1024 * 1024;
const FUNCTION_THREE_IMAGE_BLOCK_ID = "function-hierarchy-current-architecture";
const FUNCTION_THREE_IMAGE_MIGRATION = "function-three-image-evidence-v1";
const PRODUCTION_DECISION_MATRIX_BLOCK_ID = "production-guidelines-decision-matrix";
const PRODUCTION_DECISION_MATRIX_MIGRATION = "production-decision-matrix-v1";
const PRODUCTION_DECISION_MATRIX_SCOPE_MIGRATION = "production-decision-matrix-scope-v2";
const PRODUCTION_FOUR_IMAGE_BLOCK_ID = "production-guidelines-four-image-evidence";
const PRODUCTION_FOUR_IMAGE_MIGRATION = "production-four-image-evidence-v1";
const UI_STYLE_SIX_IMAGE_BLOCK_ID = "ui-direction-reset-six-image-showcase";
const UI_STYLE_SIX_IMAGE_MIGRATION = "ui-style-six-image-showcase-v1";
const fourImageEvidenceDescriptions = [
  "保留原有图标与品质识别，减少不必要的资源重做。",
  "基础控件沿用原项目认知，只调整尺寸、间距和状态清晰度。",
  "弹窗结构根据即时操作与系统内容进行拆分，避免连续叠加。",
  "页面底板和信息分区重新整理，为后续页面铺量提供更稳定的承载方式。",
] as const;
const sixImageShowcaseTitles = [
  "风格参考 / 灵感方向",
  "配色与视觉关键词",
  "基础控件样式",
  "底板 / 信息分区规则",
  "页面应用示例 01",
  "页面应用示例 02",
] as const;
const sixImageShowcaseDescriptions = [
  "用参考图和视觉关键词确定新的界面方向，重点关注轻量化、清晰层级与可延展性，而不是直接复用原手游的重装饰风格。",
  "在保留原游戏识别感的前提下，重新整理主色、品质色和强调色，让整体观感更轻，同时保证功能信息依然易于识别。",
  "对按钮、标签、页签和状态控件进行统一整理，保留玩家熟悉的交互认知，同时减少不必要的视觉负担。",
  "重新定义底板、信息分区和内容承载规则，让页面在小程序端更稳定，也更适合后续继续铺量扩展。",
  "将前面的风格判断应用到具体界面中，验证信息层级、视觉节奏和主操作是否比旧版更清楚。",
  "进一步验证新方向在不同页面中的一致性，确保风格不仅可用，而且能够支持后续批量页面生产。",
] as const;
const threeImageEvidenceLabels = [
  "图 01：系统入口与页面分布",
  "图 02：弹窗层级与信息叠加",
  "图 03：核心功能操作链路",
] as const;
const threeImageEvidenceCaptions = [
  "入口与页面关系",
  "弹窗层级变化",
  "核心操作链路",
] as const;
const previousDynamicDemoCaption = "动态演示：调整后的页面承载与操作反馈";
const dynamicDemoCaption = "动态演示";
const dynamicDemoDescription = "展示调整后的页面承载方式如何减少连续弹窗层级，并让玩家更清楚地完成核心操作。";

function requireCrossPlatformPublishedProject() {
  const project = getProjectBySlug("cross-platform-game-ux");
  if (!project) throw new Error("Missing shared project metadata for cross-platform-game-ux.");
  return project;
}

const crossPlatformPublishedProject = requireCrossPlatformPublishedProject();

type SectionKey =
  | "heroSubtitle"
  | "projectIntro"
  | "projectContext"
  | "openQuestion"
  | "myEntryPoint"
  | "exploration"
  | "constraints"
  | "iteration"
  | "application"
  | "reflection";

type ImageSlotKey =
  | "portraitApproach"
  | "miniProgramReferences"
  | "keepChangeEvidence"
  | "directionV1"
  | "directionV2"
  | "directionV3"
  | "retainedSystemApplication"
  | "beforeAfterDetail";

type BoundaryListKey = "keep" | "change";

type DraftImageSlot = {
  publicPath: string;
  localImageId?: string;
};

type ThinkingMapNodeId =
  | "business-decision"
  | "technical-direction"
  | "scope-definition"
  | "my-entry-point"
  | "exploration"
  | "design-boundary"
  | "iteration"
  | "direction-established";

type ThinkingMapNode = {
  id: ThinkingMapNodeId;
  label: string;
  body: string;
  emphasis: "default" | "accent";
  exploration?: {
    primary: string;
    secondary: string;
  };
  designBoundary?: {
    keepHeading: string;
    keepItems: string;
    changeHeading: string;
    changeItems: string;
  };
};

type ThinkingMapDraft = {
  eyebrow: string;
  heading: string;
  description: string;
  nodes: ThinkingMapNode[];
};

type TimelineNode = {
  id: string;
  label: string;
  meta: string;
  isIntervention: boolean;
  targetSectionId?: string;
};

type CompetitorBreakdownBranch = {
  id: string;
  label: string;
  details: string[];
};

type CompetitorBreakdownItem = {
  id: string;
  name: string;
  role: string;
  focus: string;
  branches: CompetitorBreakdownBranch[];
};

type CompetitorBreakdownDraft = {
  competitors: CompetitorBreakdownItem[];
  researchRationale: {
    title: string;
    body: string;
  };
  competitorRoles: Record<string, string>;
  distilledTakeaways: [string, string, string];
  summaryTags: string[];
};

type InterventionKey =
  | "marketCompetitorAnalysis"
  | "functionHierarchyOptimisation"
  | "productionGuidelines"
  | "uiDirectionReset";

type ContentBlockType =
  | "competitorCards"
  | "threeCircleTakeaway"
  | "imageEvidencePair"
  | "threeImageEvidence"
  | "fourImageEvidence"
  | "sixImageShowcase"
  | "decisionMatrix"
  | "textBlock"
  | "beforeAfter";

type DecisionMatrixRow = {
  id: string;
  content: string;
  decision: string;
  treatment: string;
  reason: string;
};

const defaultDecisionMatrixRows: DecisionMatrixRow[] = [
  {
    id: "icon-assets",
    content: "图标资源",
    decision: "尽量保留",
    treatment: "资源图标、道具图标、品质图标",
    reason: "已有识别度高，重做成本大，且不直接造成层级问题",
  },
  {
    id: "base-controls",
    content: "基础控件",
    decision: "保留并轻量调整",
    treatment: "按钮、标签、页签、关闭按钮、数量展示",
    reason: "保持原游戏识别感，只调整尺寸、间距和状态清晰度",
  },
  {
    id: "popup-structure",
    content: "弹窗结构",
    decision: "部分重组",
    treatment: "确认弹窗、道具详情弹窗、二级说明弹窗",
    reason: "旧结构容易连续叠加，需要区分即时操作和系统内容",
  },
  {
    id: "page-surfaces",
    content: "页面底板",
    decision: "重新整理",
    treatment: "背景、内容底板、信息分区、九宫格适配",
    reason: "影响后续页面铺量，需要形成更稳定的承载规则",
  },
  {
    id: "information-hierarchy",
    content: "信息层级",
    decision: "重新梳理",
    treatment: "主操作、资源消耗、升级反馈、说明信息",
    reason: "影响玩家是否能快速理解当前目标和下一步操作",
  },
  {
    id: "system-page-container",
    content: "系统级页面承载",
    decision: "重点调整",
    treatment: "成长类页面、背包类页面、资源使用流程",
    reason: "信息量较大，不适合继续完全依赖多层弹窗承载",
  },
];

type ContentBlockDraft = {
  id: string;
  type: ContentBlockType;
  label: string;
  title: string;
  body: string;
  takeaways: [string, string, string];
  imageSlots: Record<string, DraftImageSlot>;
  imageCaptions: Record<string, string>;
  imageDescriptions: Record<string, string>;
  matrixRows: DecisionMatrixRow[];
  before: { title: string; body: string };
  after: { title: string; body: string };
};

type InterventionDraft = {
  title: string;
  goal: string;
  body: string;
  items: string;
  imageSlots: Record<string, DraftImageSlot>;
  blocks: ContentBlockDraft[];
};

type InterventionTextBackup = Omit<InterventionDraft, "imageSlots" | "blocks">;

type DraftTextBackup = {
  createdAt: string;
  title: string;
  sections: Record<SectionKey, string>;
  boundaryLists: Record<BoundaryListKey, string>;
  thinkingMap: ThinkingMapDraft;
  interventionTimeline: { nodes: TimelineNode[] };
  interventions: Record<InterventionKey, InterventionTextBackup>;
};

type ProjectContextCardDraft = {
  id: string;
  title: string;
  body: string;
};

type ProjectContextDraft = {
  eyebrow: string;
  title: string;
  body: string;
  cards: ProjectContextCardDraft[];
};

export type CrossPlatformDraft = {
  version: 1;
  title: string;
  projectDuration: string;
  updatedAt: string;
  projectContext: ProjectContextDraft;
  sections: Record<SectionKey, string>;
  boundaryLists: Record<BoundaryListKey, string>;
  imageSlots: Record<ImageSlotKey, DraftImageSlot>;
  competitorBreakdown: CompetitorBreakdownDraft;
  thinkingMap: ThinkingMapDraft;
  interventionTimeline: { nodes: TimelineNode[] };
  interventions: Record<InterventionKey, InterventionDraft>;
  appliedContentMigrations: string[];
  legacyDraftBackup?: DraftTextBackup;
};

type SaveStatus = "ready" | "saving" | "saved" | "error";

const legacyTitleMap = {
  "title-01": "Keeping the Game,\nLightening the Experience",
  "title-02": "Translating a Legacy Mobile Game\ninto a Lighter UI Experience",
  "title-03": "Designing a Lightweight UI Direction\nfor a Legacy Game",
} as const;

const competitorResearchRationale = {
  title: "为什么先看这两个竞品？",
  body: "我选择这两个小程序游戏作为参照，并不是为了直接模仿它们的界面，而是因为它们分别代表了我需要理解的两个方向：一个更接近微信生态中的轻量入口和社交触达，另一个则保留了较完整的 SLG 成长、资源和任务循环。\n\n通过它们，我可以先判断轻量小程序游戏通常如何组织入口、目标和重复体验，再回到本项目的保留系统中，判断哪些部分需要减轻、重组或重新强调。",
};

const defaultDistilledTakeaways: [string, string, string] = [
  "轻量化不是删功能，而是重组入口",
  "高频入口要直接，任务循环承担主引导",
  "资源与系统信息需要服务下一步操作",
];

const previousDefaultDistilledTakeaways: [string, string, string] = [
  "轻量化不是删功能",
  "入口与任务承担主引导",
  "信息需要服务下一步操作",
];

function getDefaultCompetitorRole(name: string) {
  if (name === "指尖无双") return "观察微信小程序生态下的轻量入口、社交触达和任务回流方式。";
  if (name === "无尽冬日") return "观察复杂 SLG 系统如何通过任务、资源和成长路径被重新组织。";
  return "记录这个参照对象在本次研究中的作用。";
}

function getDefaultCompetitorStatus(name: string) {
  if (name === "指尖无双") return "微信小程序生态中的轻量 SLG 参照。";
  if (name === "无尽冬日") return "保留完整 SLG 成长、资源和任务循环的成熟参照。";
  return "本次体验研究中的竞品参照。";
}

function getDefaultCompetitorFocus(name: string) {
  if (name === "指尖无双") return "重点观察平台入口、社交触达、任务回流与轻量化操作路径。";
  if (name === "无尽冬日") return "重点观察复杂系统如何通过任务、资源和成长路径被重新组织。";
  return "记录与本项目设计判断相关的观察重点。";
}

const parsedXmindCompetitors: CompetitorBreakdownItem[] = structuredClone(
  competitorXmindExtracted.competitorBreakdown.competitors,
).map((competitor) => ({
  ...competitor,
  role: getDefaultCompetitorStatus(competitor.name),
  focus: getDefaultCompetitorFocus(competitor.name),
}));
const parsedXmindCompetitorBreakdown: CompetitorBreakdownDraft = {
  competitors: parsedXmindCompetitors,
  researchRationale: { ...competitorResearchRationale },
  competitorRoles: Object.fromEntries(
    parsedXmindCompetitors.map((competitor) => [competitor.id, getDefaultCompetitorRole(competitor.name)]),
  ),
  distilledTakeaways: [...defaultDistilledTakeaways],
  summaryTags: [...competitorXmindExtracted.competitorBreakdown.summaryTags],
};

const previousDefaultProjectContext: ProjectContextDraft = {
  eyebrow: "PROJECT CONTEXT / DESIGN BOUNDARY",
  title: "项目背景与设计边界",
  body: "这个项目并不是一次从 0 开始的全新游戏设计，而是在一款成熟手游已经存在的系统、资源和商业目标基础上，进行小程序平台适配。\n\n在我介入之前，项目的适配方向、技术路线和核心保留系统已经基本确定：团队需要保留原游戏的主要成长与资源系统，同时尽量减少新增美术和开发成本。也因此，这次设计工作的重点不是推翻原有体验，而是在既有边界内判断哪些内容需要重组，哪些资产和组件应该继续保留。\n\n我的工作主要集中在玩家可见的 UI 与交互层面：通过竞品和体验循环拆解理解小程序平台的轻量化需求，再针对部分系统的层级问题、页面承载方式和后续铺量范围进行整理，最终帮助团队形成更清晰、可延展的界面方向。",
  cards: [
    { id: "established-direction", title: "既定方向", body: "手游内容适配到小程序平台，而不是重新设计一款新游戏。" },
    { id: "retained-systems", title: "系统保留", body: "核心成长、资源和背包相关系统需要继续保留。" },
    { id: "resource-constraints", title: "资源约束", body: "尽量复用已有图标、控件和美术资源，减少新增成本。" },
    { id: "platform-limits", title: "平台限制", body: "小程序平台更依赖轻量页面、清晰入口和更低视觉 / 渲染负担。" },
  ],
};

const previousCompactProjectContext: ProjectContextDraft = {
  eyebrow: "PROJECT CONTEXT",
  title: "项目背景与设计边界",
  body: "这不是一次从 0 开始的游戏重做，而是在既有手游系统、资源和商业目标下，完成小程序平台的轻量化适配。\n\n我的介入点集中在玩家可见的 UI 与交互层面：理解平台限制，判断哪些内容需要重组，哪些资产与组件应该保留。",
  cards: [
    {
      id: "established-direction",
      title: "既定方向",
      body: "手游适配小程序，而不是重做新游戏。",
    },
    {
      id: "resource-constraints",
      title: "资源约束",
      body: "尽量复用已有图标、控件和美术资源。",
    },
    {
      id: "my-contribution",
      title: "我的介入",
      body: "聚焦 UI / 交互层级、承载方式和后续铺量范围。",
    },
  ],
};

const previousSingleProjectContext: ProjectContextDraft = {
  eyebrow: "PROJECT CONTEXT / DESIGN BOUNDARY",
  title: "项目背景与设计边界",
  body: "这个项目并不是一次从 0 开始的全新游戏设计，而是在一款成熟手游已有系统、资源和商业目标的基础上，进行小程序平台适配。在我介入之前，适配方向、技术路线和核心保留系统已经基本确定，因此这次设计工作的重点不是推翻原有体验，而是在既有边界内判断哪些内容需要重组，哪些资产和组件应该继续保留。我的工作主要集中在玩家可见的 UI 与交互层面：通过竞品和体验循环拆解理解小程序平台的轻量化需求，再针对部分系统的层级问题、页面承载方式和后续铺量范围进行整理，帮助团队形成更清晰、可延展的界面方向。",
  cards: structuredClone(previousCompactProjectContext.cards),
};

const defaultProjectContext: ProjectContextDraft = {
  eyebrow: previousSingleProjectContext.eyebrow,
  title: previousSingleProjectContext.title,
  body: "这个项目不是从 0 开始重做一款游戏，而是在成熟手游已有系统、资源和商业目标下，进行小程序平台适配。适配方向、技术路线和核心保留系统在我介入前已经基本确定，因此我的工作重点不是推翻原有体验，而是在既有边界内判断哪些内容需要重组，哪些资产和组件应该继续保留。我的介入主要集中在玩家可见的 UI 与交互层面，包括平台体验调研、层级问题梳理、页面承载方式调整和后续铺量范围整理。",
  cards: structuredClone(previousSingleProjectContext.cards),
};

export const defaultCrossPlatformDraft: CrossPlatformDraft = {
  version: 1,
  appliedContentMigrations: [
    FUNCTION_THREE_IMAGE_MIGRATION,
    PRODUCTION_DECISION_MATRIX_MIGRATION,
    PRODUCTION_DECISION_MATRIX_SCOPE_MIGRATION,
    PRODUCTION_FOUR_IMAGE_MIGRATION,
    UI_STYLE_SIX_IMAGE_MIGRATION,
  ],
  title: "保留游戏，减轻体验",
  projectDuration: crossPlatformPublishedProject.duration ?? "2024.11 — 2025.02",
  updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  projectContext: structuredClone(defaultProjectContext),
  sections: {
    heroSubtitle: "在成熟手游适配小程序平台的过程中，定义更轻量、可延展的 UI 方向。",
    projectIntro: "这个项目来自一次成熟手游向轻量化小程序版本的适配尝试。",
    projectContext: "小程序版本的立项方向由老板和策划决定，系统保留与删减范围也主要由策划和美术先行明确。我介入时，项目已经大致知道哪些系统需要保留，但这些保留下来的系统应该以什么样的 UI 方式进入一个更轻量的新版本，还没有非常明确的答案。",
    openQuestion: "保留系统，不代表保留原来的体验方式。",
    myEntryPoint: "主美不太熟悉 UI 前期立项和方向探索的工作流，因此让我参与这部分的 UI 与交互方向预研。",
    exploration: "我先通过竞品拆解理解小程序体验特征，再回到项目现有系统中寻找可调整的设计空间，并与策划和美术反复对齐。",
    constraints: "这个项目的关键不是“全部重做”，而是判断什么必须保留，什么可以改变。",
    iteration: "我在这个项目中的工作并不是重新设计整个游戏，也不是主导完整跨平台策略，而是在既有系统、既有资源和技术限制之下，寻找哪些界面结构、信息层级和视觉表达可以被减轻、重组，并最终形成一个可以继续铺量的 UI 方向。",
    application: "新的 UI 方向逐步应用到保留系统与关键界面中，在功能不大改的前提下优化信息层级与视觉负担。",
    reflection: "这次工作让我更清楚地理解：在成熟项目中，设计的价值有时不是推翻原有系统，而是在限制之中找到真正可以改变的部分。",
  },
  boundaryLists: {
    keep:
      "核心系统功能\n可作为识别锚点的旧版控件\n已有物品与资源图标\n原游戏的整体识别感",
    change:
      "页面底板与容器处理\n界面构图\n信息层级\n视觉密度与重量\n主要操作的强调方式\n必要范围内的交互层级调整",
  },
  imageSlots: {
    portraitApproach: { publicPath: "" },
    miniProgramReferences: { publicPath: "" },
    keepChangeEvidence: { publicPath: "" },
    directionV1: { publicPath: "" },
    directionV2: { publicPath: "" },
    directionV3: { publicPath: "" },
    retainedSystemApplication: { publicPath: "" },
    beforeAfterDetail: { publicPath: "" },
  },
  competitorBreakdown: structuredClone(parsedXmindCompetitorBreakdown),
  thinkingMap: {
    eyebrow: "项目思考路径",
    heading: "设计工作从哪里真正开始。",
    description: "从业务决策、技术方向和系统范围，到我实际参与的设计介入点。",
    nodes: [
      {
        id: "business-decision",
        label: "业务决策",
        body: "将成熟手游适配为\n更轻量的小程序版本",
        emphasis: "default",
      },
      {
        id: "technical-direction",
        label: "技术方向",
        body: "原有竖屏复用方案\n不适合资源量较大的\n成熟项目",
        emphasis: "default",
      },
      {
        id: "scope-definition",
        label: "系统范围",
        body: "策划与美术先行明确\n系统保留与删减范围",
        emphasis: "default",
      },
      {
        id: "my-entry-point",
        label: "我的介入点",
        body: "保留系统已基本明确，\n但轻量化 UI 方向\n仍待探索",
        emphasis: "accent",
      },
      {
        id: "exploration",
        label: "方向探索",
        body: "",
        emphasis: "default",
        exploration: {
          primary: "拆解成熟小程序游戏\n的体验特征",
          secondary: "回到项目拆解\n保留系统体验循环",
        },
      },
      {
        id: "design-boundary",
        label: "设计边界",
        body: "",
        emphasis: "accent",
        designBoundary: {
          keepHeading: "保留",
          keepItems: "核心功能\n旧版识别控件\n资源图标\n游戏身份",
          changeHeading: "调整",
          changeItems: "页面底板\n界面构图\n信息层级\n视觉密度\n操作强调",
        },
      },
      {
        id: "iteration",
        label: "迭代对齐",
        body: "与策划和美术反复对齐\n版本 01\n版本 02\n版本 03",
        emphasis: "default",
      },
      {
        id: "direction-established",
        label: "方向确定",
        body: "轻量化 UI 方向应用到\n保留系统与关键界面",
        emphasis: "default",
      },
    ],
  },
  interventionTimeline: {
    nodes: [
      { id: "business-decision", label: "业务决策", meta: "老板 / 策划", isIntervention: false },
      { id: "technical-direction", label: "技术方向", meta: "程序 / 策划 / 美术", isIntervention: false },
      { id: "system-scope", label: "保留系统范围", meta: "策划 / 美术", isIntervention: false },
      {
        id: "market-competitor-analysis",
        label: "市场调研",
        meta: "我 / UI / 主美",
        isIntervention: true,
        targetSectionId: "market-competitor-analysis",
      },
      {
        id: "function-hierarchy-optimisation",
        label: "功能层级优化",
        meta: "我 / 策划 / 主美",
        isIntervention: true,
        targetSectionId: "function-hierarchy-optimisation",
      },
      {
        id: "production-guidelines",
        label: "铺量规范整理",
        meta: "我 / UI / 程序",
        isIntervention: true,
        targetSectionId: "production-guidelines",
      },
      {
        id: "ui-direction-reset",
        label: "UI 风格重置",
        meta: "我 / 主美",
        isIntervention: true,
        targetSectionId: "ui-direction-reset",
      },
      { id: "scalable-direction", label: "可铺量方向确定", meta: "UI / 美术 / 项目组", isIntervention: false },
    ],
  },
  interventions: {
    marketCompetitorAnalysis: {
      title: "市场调研 / 竞品拆解",
      goal: "在定义 UI 方向之前，先理解轻量化小程序游戏通常如何组织体验循环、入口和视觉密度。",
      body: "因为我之前并不熟悉小程序游戏，所以没有一开始就直接画页面。\n\n我先拆解了几个较成熟的小程序游戏，观察它们如何处理高频入口、成长循环、背包 / 养成系统以及整体视觉负担。随后，我再回到我们自己的游戏，拆解保留系统中的体验循环，并用红色标注出在轻量版本中可能缺失或负担过重的部分。\n\n这一步的目的不是照抄竞品，而是先建立对平台体验的基本判断：轻量版本需要更快让玩家理解入口、目标和下一步操作，同时不能继续照搬原手游过重的展示方式。",
      items: "小程序体验循环更短\n高频入口需要更直接\n视觉负担需要降低\n保留系统需要重新组织",
      imageSlots: {
        "market-competitor-board": { publicPath: "" }, "market-competitor-board-winter": { publicPath: "" },
        "market-competitor-loop": { publicPath: "" },
        "market-own-loop": { publicPath: "" }, "market-missing-points": { publicPath: "" },
      },
      blocks: [],
    },
    functionHierarchyOptimisation: {
      title: "功能层级优化",
      goal: "在不大改功能逻辑的前提下，减少相似弹窗反复覆盖带来的层级负担。",
      body: "部分保留系统沿用了旧版本中较复杂的承载方式：一些功能信息被放进相似弹窗中，继续点击后又会出现新的弹窗层级。\n\n这些功能本身仍然需要保留，但它们不一定必须继续以多层相似弹窗的方式呈现。我通过交互稿尝试把部分系统级内容改为更稳定的全屏 / 页面承载，再将必要操作保留在弹窗中，从而减少反复覆盖的层级感。\n\n这不是一次完整的交互架构重构，而是在保留功能的边界内，调整部分界面的承载方式，让系统内容和操作弹窗的关系更清楚。",
      items: "系统级内容改用更稳定的页面承载\n必要操作保留为聚焦弹窗\n减少相似弹窗的连续覆盖\n保留原有功能逻辑",
      imageSlots: {
        "function-old-popup-structure": { publicPath: "" }, "function-new-hierarchy": { publicPath: "" },
        "function-wireframe": { publicPath: "" }, "function-before-after": { publicPath: "" },
      },
      blocks: [getContentBlockDefaults("threeImageEvidence", FUNCTION_THREE_IMAGE_BLOCK_ID)],
    },
    productionGuidelines: {
      title: "铺量规范整理",
      goal: "把方向整理成可以继续铺开的生产规则",
      body: "在确定部分系统的承载方式之后，下一步不是继续单独精修某一个页面，而是把这些方向整理成后续可以反复使用的规则。\n\n由于项目仍然需要在多个保留系统中继续铺量，UI 方向必须能被稳定复用。我开始整理更偏生产层面的规范，包括背景与底板的处理方式、九宫格结构的使用、透明度和阴影的控制，以及小图标和组件的基础规则。\n\n这部分工作的重点，是让新的 UI 方向不只停留在一两张效果图上，而是能够支持后续页面继续扩展。",
      items: "减少高透明度产出\n统一背景和底板\n使用九宫格结构\n整理图标 / 组件规则",
      imageSlots: {
        "guideline-transparency": { publicPath: "" }, "guideline-background": { publicPath: "" },
        "guideline-nine-slice": { publicPath: "" }, "guideline-icons": { publicPath: "" },
      },
      blocks: [
        getContentBlockDefaults("decisionMatrix", PRODUCTION_DECISION_MATRIX_BLOCK_ID),
        getContentBlockDefaults("fourImageEvidence", PRODUCTION_FOUR_IMAGE_BLOCK_ID),
      ],
    },
    uiDirectionReset: {
      title: "UI 风格重置",
      goal: "在保留原游戏识别感的同时，建立更轻量、可延展的 UI 风格方向。",
      body: "在系统范围、资源限制和前期体验判断逐渐清楚后，我开始探索新的 UI 风格方向。\n\n这部分包括配色尝试、风格参考、灵感来源整理以及不同版本的试错。我的职责不是把所有最终界面逐一细化完成，而是先设定一个可以被团队继续延展和铺量的 UI 方向。\n\n最终方向需要比原手游更轻，同时保留老项目已有控件、资源图标和整体识别感，让它既不像简单换皮，也不完全脱离原游戏。",
      items: "降低整体视觉重量\n保留旧项目识别锚点\n提供可铺量风格样张\n为后续生产留出规范空间",
      imageSlots: {
        "ui-colour-exploration": { publicPath: "" }, "ui-style-reference": { publicPath: "" },
        "ui-trial-versions": { publicPath: "" }, "ui-final-direction": { publicPath: "" },
      },
      blocks: [getContentBlockDefaults("sixImageShowcase", UI_STYLE_SIX_IMAGE_BLOCK_ID)],
    },
  },
};

const sectionMeta: Record<SectionKey, { eyebrow: string; title: string }> = {
  heroSubtitle: { eyebrow: "Hero", title: "Hero subtitle" },
  projectIntro: { eyebrow: "01", title: "Project Intro" },
  projectContext: { eyebrow: "02", title: "Project Context" },
  openQuestion: { eyebrow: "03", title: "Open Question" },
  myEntryPoint: { eyebrow: "04", title: "My Entry Point" },
  exploration: { eyebrow: "05", title: "Exploration" },
  constraints: { eyebrow: "06", title: "Design Boundary" },
  iteration: { eyebrow: "07", title: "Iteration" },
  application: { eyebrow: "08", title: "Application" },
  reflection: { eyebrow: "09", title: "Reflection" },
};

const imageSlotMeta: Record<ImageSlotKey, { label: string; suggestion: string }> = {
  portraitApproach: {
    label: "Previous portrait mini-program approach",
    suggestion: "screenshot / diagram of the old portrait crop approach",
  },
  miniProgramReferences: {
    label: "Mini-program experience references",
    suggestion: "my own competitor/reference breakdown board",
  },
  keepChangeEvidence: {
    label: "Keep / Change visual evidence",
    suggestion: "legacy controls, icons, foundations, container comparisons",
  },
  directionV1: { label: "Direction V1", suggestion: "first UI direction exploration" },
  directionV2: { label: "Direction V2", suggestion: "second UI direction exploration" },
  directionV3: { label: "Direction V3", suggestion: "third UI direction exploration" },
  retainedSystemApplication: {
    label: "Retained system application",
    suggestion: "5 key screen overview",
  },
  beforeAfterDetail: {
    label: "Before / After detail",
    suggestion: "one focused legacy vs lightweight comparison",
  },
};

const interventionMeta: Record<InterventionKey, {
  anchor: string;
  number: string;
  itemLabel: string;
  slots: Array<{ id: string; label: string; suggestion: string }>;
}> = {
  marketCompetitorAnalysis: {
    anchor: "market-competitor-analysis", number: "01", itemLabel: "关键发现",
    slots: [
      { id: "market-competitor-board", label: "完整竞品拆解图：指尖无双", suggestion: "上传指尖无双的原始完整思维导图" },
      { id: "market-competitor-board-winter", label: "完整竞品拆解图：无尽冬日", suggestion: "上传无尽冬日的原始完整思维导图" },
      { id: "market-competitor-loop", label: "竞品体验循环总结", suggestion: "简洁的竞品体验循环图" },
      { id: "market-own-loop", label: "本项目体验循环拆解", suggestion: "保留系统的体验循环" },
      { id: "market-missing-points", label: "缺失 / 负担点标注", suggestion: "上传带红色标注的分析图" },
    ],
  },
  functionHierarchyOptimisation: {
    anchor: "function-hierarchy-optimisation", number: "02", itemLabel: "设计判断",
    slots: [
      { id: "function-old-popup-structure", label: "原始弹窗覆盖结构", suggestion: "旧版层级结构图" },
      { id: "function-new-hierarchy", label: "全屏 + 弹窗的简化结构", suggestion: "新的层级结构图" },
      { id: "function-wireframe", label: "交互稿 / 线框稿", suggestion: "过程交互稿" },
      { id: "function-before-after", label: "前后层级对比图", suggestion: "聚焦展示层级变化" },
    ],
  },
  productionGuidelines: {
    anchor: "production-guidelines", number: "03", itemLabel: "规范要点",
    slots: [
      { id: "guideline-transparency", label: "透明度 / 渲染压力规则", suggestion: "生产规则与示例" },
      { id: "guideline-background", label: "统一背景处理", suggestion: "背景和底板基础" },
      { id: "guideline-nine-slice", label: "九宫格 / 可缩放面板规范", suggestion: "可缩放结构示例" },
      { id: "guideline-icons", label: "小图标与组件规范示例", suggestion: "可复用的小组件规则" },
    ],
  },
  uiDirectionReset: {
    anchor: "ui-direction-reset", number: "04", itemLabel: "方向要点",
    slots: [
      { id: "ui-colour-exploration", label: "配色探索", suggestion: "色板与配色方案" },
      { id: "ui-style-reference", label: "风格参考 / 灵感来源", suggestion: "风格参考板" },
      { id: "ui-trial-versions", label: "试错版本对比", suggestion: "不同方向的版本对比" },
      { id: "ui-final-direction", label: "最终可铺量风格稿", suggestion: "最终方向样张" },
    ],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readListText(value: unknown, defaults: string) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join("\n");
  return defaults;
}

function mergeThinkingMap(value: unknown): ThinkingMapDraft {
  const source = isRecord(value) ? value : {};
  const sourceNodes = Array.isArray(source.nodes) ? source.nodes : [];

  const nodes = defaultCrossPlatformDraft.thinkingMap.nodes.map((defaultNode) => {
    const sourceNode = sourceNodes.find(
      (candidate) => isRecord(candidate) && candidate.id === defaultNode.id,
    );

    if (!isRecord(sourceNode)) return defaultNode;

    const mergedNode: ThinkingMapNode = {
      ...defaultNode,
      label: typeof sourceNode.label === "string" ? sourceNode.label : defaultNode.label,
      body: typeof sourceNode.body === "string" ? sourceNode.body : defaultNode.body,
      emphasis:
        sourceNode.emphasis === "default" || sourceNode.emphasis === "accent"
          ? sourceNode.emphasis
          : defaultNode.emphasis,
    };

    if (defaultNode.exploration) {
      const exploration = isRecord(sourceNode.exploration) ? sourceNode.exploration : {};
      mergedNode.exploration = {
        primary:
          typeof exploration.primary === "string"
            ? exploration.primary
            : defaultNode.exploration.primary,
        secondary:
          typeof exploration.secondary === "string"
            ? exploration.secondary
            : defaultNode.exploration.secondary,
      };
    }

    if (defaultNode.designBoundary) {
      const boundary = isRecord(sourceNode.designBoundary) ? sourceNode.designBoundary : {};
      mergedNode.designBoundary = {
        keepHeading:
          typeof boundary.keepHeading === "string"
            ? boundary.keepHeading
            : defaultNode.designBoundary.keepHeading,
        keepItems: readListText(boundary.keepItems, defaultNode.designBoundary.keepItems),
        changeHeading:
          typeof boundary.changeHeading === "string"
            ? boundary.changeHeading
            : defaultNode.designBoundary.changeHeading,
        changeItems: readListText(boundary.changeItems, defaultNode.designBoundary.changeItems),
      };
    }

    return mergedNode;
  });

  return {
    eyebrow: typeof source.eyebrow === "string" ? source.eyebrow : defaultCrossPlatformDraft.thinkingMap.eyebrow,
    heading: typeof source.heading === "string" ? source.heading : defaultCrossPlatformDraft.thinkingMap.heading,
    description:
      typeof source.description === "string"
        ? source.description
        : defaultCrossPlatformDraft.thinkingMap.description,
    nodes,
  };
}

function mergeInterventionTimeline(value: unknown) {
  const source = isRecord(value) ? value : {};
  const sourceNodes = Array.isArray(source.nodes) ? source.nodes : [];

  if (sourceNodes.length === 0) {
    return structuredClone(defaultCrossPlatformDraft.interventionTimeline);
  }

  const defaultNodesById = new Map(
    defaultCrossPlatformDraft.interventionTimeline.nodes.map((node) => [node.id, node]),
  );

  const nodes = sourceNodes.flatMap((saved) => {
      if (!isRecord(saved) || typeof saved.id !== "string" || !saved.id) return [];

      const defaults = defaultNodesById.get(saved.id);
      const targetSectionId =
        typeof saved.targetSectionId === "string"
          ? saved.targetSectionId
          : defaults?.targetSectionId;

      return {
        id: saved.id,
        label:
          typeof saved.label === "string"
            ? saved.label
            : defaults?.label ?? "新阶段",
        meta:
          typeof saved.meta === "string"
            ? saved.meta
            : defaults?.meta ?? "",
        isIntervention:
          typeof saved.isIntervention === "boolean"
            ? saved.isIntervention
            : defaults?.isIntervention ?? false,
        ...(targetSectionId !== undefined ? { targetSectionId } : {}),
      };
    });

  return nodes.length > 0
    ? { nodes }
    : structuredClone(defaultCrossPlatformDraft.interventionTimeline);
}

const contentBlockTemplateNames: Record<ContentBlockType, string> = {
  competitorCards: "竞品参照双卡",
  threeCircleTakeaway: "三圆总结",
  imageEvidencePair: "双图证据展示",
  threeImageEvidence: "三图到动态演示",
  fourImageEvidence: "四图并列说明",
  sixImageShowcase: "六图风格探索展示",
  decisionMatrix: "保留与重设计判断表",
  textBlock: "正文说明段落",
  beforeAfter: "前后对比",
};

const contentBlockTypes = Object.keys(contentBlockTemplateNames) as ContentBlockType[];

function getContentBlockDefaults(type: ContentBlockType, id: string): ContentBlockDraft {
  const shared = {
    id,
    type,
    label: "",
    title: "",
    body: "",
    takeaways: [...defaultDistilledTakeaways] as [string, string, string],
    imageSlots: {},
    imageCaptions: {},
    imageDescriptions: {},
    matrixRows: [],
    before: { title: "调整前", body: "" },
    after: { title: "调整后", body: "" },
  };

  switch (type) {
    case "competitorCards":
      return { ...shared, label: "竞品研究", title: "竞品参照" };
    case "threeCircleTakeaway":
      return { ...shared, title: "带回本项目的判断" };
    case "imageEvidencePair":
      return {
        ...shared,
        title: "双图证据展示",
        imageSlots: { left: { publicPath: "" }, right: { publicPath: "" } },
        imageCaptions: { left: "证据图片 01", right: "证据图片 02" },
      };
    case "threeImageEvidence":
      return {
        ...shared,
        imageSlots: {
          image01: { publicPath: "" },
          image02: { publicPath: "" },
          image03: { publicPath: "" },
          demo: { publicPath: "" },
        },
        imageCaptions: {
          image01: threeImageEvidenceCaptions[0],
          image02: threeImageEvidenceCaptions[1],
          image03: threeImageEvidenceCaptions[2],
          demo: dynamicDemoCaption,
        },
        imageDescriptions: { demo: dynamicDemoDescription },
      };
    case "fourImageEvidence":
      return {
        ...shared,
        imageSlots: {
          image01: { publicPath: "" },
          image02: { publicPath: "" },
          image03: { publicPath: "" },
          image04: { publicPath: "" },
        },
        imageDescriptions: {
          image01: fourImageEvidenceDescriptions[0],
          image02: fourImageEvidenceDescriptions[1],
          image03: fourImageEvidenceDescriptions[2],
          image04: fourImageEvidenceDescriptions[3],
        },
      };
    case "sixImageShowcase":
      return {
        ...shared,
        imageSlots: {
          image01: { publicPath: "" },
          image02: { publicPath: "" },
          image03: { publicPath: "" },
          image04: { publicPath: "" },
          image05: { publicPath: "" },
          image06: { publicPath: "" },
        },
        imageCaptions: {
          image01: sixImageShowcaseTitles[0],
          image02: sixImageShowcaseTitles[1],
          image03: sixImageShowcaseTitles[2],
          image04: sixImageShowcaseTitles[3],
          image05: sixImageShowcaseTitles[4],
          image06: sixImageShowcaseTitles[5],
        },
        imageDescriptions: {
          image01: sixImageShowcaseDescriptions[0],
          image02: sixImageShowcaseDescriptions[1],
          image03: sixImageShowcaseDescriptions[2],
          image04: sixImageShowcaseDescriptions[3],
          image05: sixImageShowcaseDescriptions[4],
          image06: sixImageShowcaseDescriptions[5],
        },
      };
    case "decisionMatrix":
      return {
        ...shared,
        label: "REUSE / REDESIGN SCOPE",
        title: "复用与重设计范围判断表",
        matrixRows: structuredClone(defaultDecisionMatrixRows),
      };
    case "textBlock":
      return { ...shared, label: "PROCESS NOTE", title: "说明标题", body: "在这里补充过程说明。" };
    case "beforeAfter":
      return {
        ...shared,
        title: "前后对比",
        imageSlots: { before: { publicPath: "" }, after: { publicPath: "" } },
      };
  }
}

function createContentBlock(type: ContentBlockType) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `content-block-${crypto.randomUUID()}`
    : `content-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return getContentBlockDefaults(type, id);
}

function mergeFlexibleImageSlots(value: unknown, defaults: Record<string, DraftImageSlot>) {
  const source = isRecord(value) ? value : {};
  return Object.keys(defaults).reduce<Record<string, DraftImageSlot>>((result, key) => {
    const saved = source[key];
    if (typeof saved === "string") result[key] = { publicPath: saved };
    else if (isRecord(saved)) result[key] = {
      publicPath: typeof saved.publicPath === "string" ? saved.publicPath : "",
      ...(typeof saved.localImageId === "string" && saved.localImageId ? { localImageId: saved.localImageId } : {}),
    };
    else result[key] = { ...defaults[key] };
    return result;
  }, {});
}

function mergeContentBlocks(value: unknown): ContentBlockDraft[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate, index) => {
    if (!isRecord(candidate) || !contentBlockTypes.includes(candidate.type as ContentBlockType)) return [];

    const type = candidate.type as ContentBlockType;
    const id = typeof candidate.id === "string" && candidate.id
      ? candidate.id
      : `legacy-content-block-${index + 1}`;
    const defaults = getContentBlockDefaults(type, id);
    const before = isRecord(candidate.before) ? candidate.before : {};
    const after = isRecord(candidate.after) ? candidate.after : {};
    const savedCaptions = isRecord(candidate.imageCaptions) ? candidate.imageCaptions : {};
    const savedDescriptions = isRecord(candidate.imageDescriptions) ? candidate.imageDescriptions : {};
    const savedTakeaways = Array.isArray(candidate.takeaways) ? candidate.takeaways : [];
    const matrixRows = Array.isArray(candidate.matrixRows)
      ? candidate.matrixRows.flatMap((row, rowIndex) => {
        if (!isRecord(row)) return [];
        const fallback = defaults.matrixRows[rowIndex];
        return [{
          id: typeof row.id === "string" && row.id ? row.id : `matrix-row-${rowIndex + 1}`,
          content: typeof row.content === "string" ? row.content : fallback?.content ?? "",
          decision: typeof row.decision === "string" ? row.decision : fallback?.decision ?? "",
          treatment: typeof row.treatment === "string" ? row.treatment : fallback?.treatment ?? "",
          reason: typeof row.reason === "string" ? row.reason : fallback?.reason ?? "",
        }];
      })
      : structuredClone(defaults.matrixRows);

    return [{
      ...defaults,
      label: typeof candidate.label === "string" ? candidate.label : defaults.label,
      title: typeof candidate.title === "string" ? candidate.title : defaults.title,
      body: typeof candidate.body === "string" ? candidate.body : defaults.body,
      takeaways: defaults.takeaways.map((fallback, takeawayIndex) =>
        typeof savedTakeaways[takeawayIndex] === "string" ? savedTakeaways[takeawayIndex] : fallback,
      ) as [string, string, string],
      imageSlots: mergeFlexibleImageSlots(candidate.imageSlots, defaults.imageSlots),
      imageCaptions: Object.keys(defaults.imageCaptions).reduce<Record<string, string>>((captions, key) => {
        const savedCaption = typeof savedCaptions[key] === "string" ? savedCaptions[key] : defaults.imageCaptions[key];
        captions[key] = type === "threeImageEvidence" && key === "demo" && savedCaption === previousDynamicDemoCaption
          ? dynamicDemoCaption
          : savedCaption;
        return captions;
      }, {}),
      imageDescriptions: Object.keys(defaults.imageDescriptions).reduce<Record<string, string>>((descriptions, key) => {
        descriptions[key] = typeof savedDescriptions[key] === "string"
          ? savedDescriptions[key]
          : defaults.imageDescriptions[key];
        return descriptions;
      }, {}),
      matrixRows,
      before: {
        title: typeof before.title === "string" ? before.title : defaults.before.title,
        body: typeof before.body === "string" ? before.body : defaults.before.body,
      },
      after: {
        title: typeof after.title === "string" ? after.title : defaults.after.title,
        body: typeof after.body === "string" ? after.body : defaults.after.body,
      },
    }];
  });
}

function readDetailLines(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  return [...fallback];
}

function mergeCompetitorBreakdown(value: unknown): CompetitorBreakdownDraft {
  if (!isRecord(value)) return structuredClone(defaultCrossPlatformDraft.competitorBreakdown);

  const sourceCompetitors = Array.isArray(value.competitors) ? value.competitors : [];
  const savedRoles = isRecord(value.competitorRoles) ? value.competitorRoles : {};
  const competitors = sourceCompetitors.flatMap((saved, competitorIndex) => {
    if (!isRecord(saved)) return [];

    const defaults = defaultCrossPlatformDraft.competitorBreakdown.competitors.find(
      (candidate) => candidate.id === saved.id || candidate.name === saved.name,
    ) ?? defaultCrossPlatformDraft.competitorBreakdown.competitors[competitorIndex];
    const savedBranches = Array.isArray(saved.branches) ? saved.branches : [];
    const branches = savedBranches.flatMap((branch, branchIndex) => {
      if (!isRecord(branch)) return [];
      const branchDefaults = defaults?.branches.find((candidate) => candidate.id === branch.id)
        ?? defaults?.branches[branchIndex];

      return [{
        id: typeof branch.id === "string" ? branch.id : branchDefaults?.id ?? `branch-${branchIndex + 1}`,
        label: typeof branch.label === "string" ? branch.label : branchDefaults?.label ?? "新分支",
        details: readDetailLines(branch.details, branchDefaults?.details ?? []),
      }];
    });

    const id = typeof saved.id === "string" ? saved.id : defaults?.id ?? `competitor-${competitorIndex + 1}`;
    const name = typeof saved.name === "string" ? saved.name : defaults?.name ?? "竞品";
    const legacyFocus = typeof savedRoles[id] === "string" ? savedRoles[id] : undefined;

    return [{
      id,
      name,
      role: typeof saved.role === "string" ? saved.role : defaults?.role ?? getDefaultCompetitorStatus(name),
      focus: typeof saved.focus === "string" ? saved.focus : legacyFocus ?? defaults?.focus ?? getDefaultCompetitorFocus(name),
      branches: branches.length > 0 ? branches : structuredClone(defaults?.branches ?? []),
    }];
  });

  const savedRationale = isRecord(value.researchRationale) ? value.researchRationale : {};
  const competitorRoles = Object.entries(savedRoles).reduce<Record<string, string>>((result, [key, role]) => {
    if (typeof role === "string") result[key] = role;
    return result;
  }, {});

  const resolvedCompetitors = competitors.length > 0
    ? competitors
    : structuredClone(defaultCrossPlatformDraft.competitorBreakdown.competitors);

  resolvedCompetitors.forEach((competitor) => {
    if (typeof competitorRoles[competitor.id] !== "string") {
      competitorRoles[competitor.id] = getDefaultCompetitorRole(competitor.name);
    }
  });

  const savedTakeaways = Array.isArray(value.distilledTakeaways) ? value.distilledTakeaways : [];
  const usesPreviousDefaults = previousDefaultDistilledTakeaways.every(
    (takeaway, index) => savedTakeaways[index] === takeaway,
  );
  const distilledTakeaways = defaultDistilledTakeaways.map((fallback, index) =>
    !usesPreviousDefaults && typeof savedTakeaways[index] === "string" ? savedTakeaways[index] : fallback,
  ) as [string, string, string];

  return {
    competitors: resolvedCompetitors,
    researchRationale: {
      title: typeof savedRationale.title === "string"
        ? savedRationale.title
        : defaultCrossPlatformDraft.competitorBreakdown.researchRationale.title,
      body: typeof savedRationale.body === "string"
        ? savedRationale.body
        : defaultCrossPlatformDraft.competitorBreakdown.researchRationale.body,
    },
    competitorRoles,
    distilledTakeaways,
    summaryTags: Array.isArray(value.summaryTags)
      ? value.summaryTags.filter((item): item is string => typeof item === "string")
      : [...defaultCrossPlatformDraft.competitorBreakdown.summaryTags],
  };
}

function mergeInterventions(value: unknown) {
  const source = isRecord(value) ? value : {};
  return (Object.keys(defaultCrossPlatformDraft.interventions) as InterventionKey[]).reduce<
    Record<InterventionKey, InterventionDraft>
  >((result, key) => {
    const defaults = defaultCrossPlatformDraft.interventions[key];
    const saved = isRecord(source[key]) ? source[key] : {};
    result[key] = {
      title: typeof saved.title === "string" ? saved.title : defaults.title,
      goal: typeof saved.goal === "string" ? saved.goal : defaults.goal,
      body: typeof saved.body === "string" ? saved.body : defaults.body,
      items: readListText(saved.items, defaults.items),
      imageSlots: mergeFlexibleImageSlots(saved.imageSlots, defaults.imageSlots),
      blocks: mergeContentBlocks(saved.blocks),
    };
    return result;
  }, {} as Record<InterventionKey, InterventionDraft>);
}

function readStringRecord<T extends string>(value: unknown, defaults: Record<T, string>) {
  const source = isRecord(value) ? value : {};

  return (Object.keys(defaults) as T[]).reduce<Record<T, string>>((result, key) => {
    result[key] = typeof source[key] === "string" ? source[key] : defaults[key];
    return result;
  }, {} as Record<T, string>);
}

function mergeImageSlots(value: unknown) {
  const source = isRecord(value) ? value : {};

  return (Object.keys(defaultCrossPlatformDraft.imageSlots) as ImageSlotKey[]).reduce<
    Record<ImageSlotKey, DraftImageSlot>
  >((result, key) => {
    const sourceSlot = source[key];
    const defaultSlot = defaultCrossPlatformDraft.imageSlots[key];

    if (typeof sourceSlot === "string") {
      result[key] = { publicPath: sourceSlot };
      return result;
    }

    if (isRecord(sourceSlot)) {
      result[key] = {
        publicPath: typeof sourceSlot.publicPath === "string" ? sourceSlot.publicPath : defaultSlot.publicPath,
        ...(typeof sourceSlot.localImageId === "string" && sourceSlot.localImageId
          ? { localImageId: sourceSlot.localImageId }
          : {}),
      };
      return result;
    }

    result[key] = { ...defaultSlot };
    return result;
  }, {} as Record<ImageSlotKey, DraftImageSlot>);
}

function mergeDraftTextBackup(value: unknown): DraftTextBackup | undefined {
  if (!isRecord(value) || typeof value.title !== "string" || !isRecord(value.sections)) {
    return undefined;
  }

  const sourceInterventions = isRecord(value.interventions) ? value.interventions : {};

  return {
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    title: value.title,
    sections: readStringRecord(value.sections, defaultCrossPlatformDraft.sections),
    boundaryLists: readStringRecord(value.boundaryLists, defaultCrossPlatformDraft.boundaryLists),
    thinkingMap: mergeThinkingMap(value.thinkingMap),
    interventionTimeline: mergeInterventionTimeline(value.interventionTimeline),
    interventions: (Object.keys(defaultCrossPlatformDraft.interventions) as InterventionKey[]).reduce<
      Record<InterventionKey, InterventionTextBackup>
    >((result, key) => {
      const saved = isRecord(sourceInterventions[key]) ? sourceInterventions[key] : {};
      const defaults = defaultCrossPlatformDraft.interventions[key];
      result[key] = {
        title: typeof saved.title === "string" ? saved.title : defaults.title,
        goal: typeof saved.goal === "string" ? saved.goal : defaults.goal,
        body: typeof saved.body === "string" ? saved.body : defaults.body,
        items: readListText(saved.items, defaults.items),
      };
      return result;
    }, {} as Record<InterventionKey, InterventionTextBackup>),
  };
}

function createDraftTextBackup(draft: CrossPlatformDraft): DraftTextBackup {
  return {
    createdAt: new Date().toISOString(),
    title: draft.title,
    sections: { ...draft.sections },
    boundaryLists: { ...draft.boundaryLists },
    thinkingMap: structuredClone(draft.thinkingMap),
    interventionTimeline: structuredClone(draft.interventionTimeline),
    interventions: (Object.keys(draft.interventions) as InterventionKey[]).reduce<
      Record<InterventionKey, InterventionTextBackup>
    >((result, key) => {
      const { title, goal, body, items } = draft.interventions[key];
      result[key] = { title, goal, body, items };
      return result;
    }, {} as Record<InterventionKey, InterventionTextBackup>),
  };
}

function migrateTitle(value: Record<string, unknown>) {
  if (typeof value.title === "string") {
    return value.title;
  }

  if (typeof value.selectedTitleId === "string" && value.selectedTitleId in legacyTitleMap) {
    return legacyTitleMap[value.selectedTitleId as keyof typeof legacyTitleMap];
  }

  return defaultCrossPlatformDraft.title;
}

function mergeProjectContext(value: unknown): ProjectContextDraft {
  if (!isRecord(value)) {
    return structuredClone(defaultProjectContext);
  }

  const savedCards = Array.isArray(value.cards) ? value.cards : [];
  const matchesContextDefault = (candidate: ProjectContextDraft) => value.eyebrow === candidate.eyebrow
    && value.title === candidate.title
    && value.body === candidate.body
    && savedCards.length === candidate.cards.length
    && candidate.cards.every((defaultCard, index) => {
      const savedCard = savedCards[index];
      return isRecord(savedCard)
        && savedCard.id === defaultCard.id
        && savedCard.title === defaultCard.title
        && savedCard.body === defaultCard.body;
    });

  if (
    matchesContextDefault(previousDefaultProjectContext)
    || matchesContextDefault(previousCompactProjectContext)
    || matchesContextDefault(previousSingleProjectContext)
  ) {
    return structuredClone(defaultProjectContext);
  }

  const savedCardsHaveIds = savedCards.some(
    (card) => isRecord(card) && typeof card.id === "string",
  );
  const cards = defaultProjectContext.cards.map((defaultCard, index) => {
    const matchingCard = savedCards.find(
      (card) => isRecord(card) && card.id === defaultCard.id,
    );
    const savedCard = isRecord(matchingCard)
      ? matchingCard
      : !savedCardsHaveIds && isRecord(savedCards[index])
        ? savedCards[index]
        : {};

    return {
      id: typeof savedCard.id === "string" ? savedCard.id : defaultCard.id,
      title: typeof savedCard.title === "string" ? savedCard.title : defaultCard.title,
      body: typeof savedCard.body === "string" ? savedCard.body : defaultCard.body,
    };
  });

  return {
    eyebrow: typeof value.eyebrow === "string" ? value.eyebrow : defaultProjectContext.eyebrow,
    title: typeof value.title === "string" ? value.title : defaultProjectContext.title,
    body: typeof value.body === "string" ? value.body : defaultProjectContext.body,
    cards,
  };
}

export function mergeCrossPlatformDraft(value: unknown): CrossPlatformDraft {
  if (!isRecord(value)) {
    return defaultCrossPlatformDraft;
  }

  const interventions = mergeInterventions(value.interventions);
  const appliedContentMigrations = Array.isArray(value.appliedContentMigrations)
    ? value.appliedContentMigrations.filter((migration): migration is string => typeof migration === "string")
    : [];

  if (!appliedContentMigrations.includes(FUNCTION_THREE_IMAGE_MIGRATION)) {
    const currentBlocks = interventions.functionHierarchyOptimisation.blocks;
    if (!currentBlocks.some((block) => block.id === FUNCTION_THREE_IMAGE_BLOCK_ID)) {
      interventions.functionHierarchyOptimisation = {
        ...interventions.functionHierarchyOptimisation,
        blocks: [
          getContentBlockDefaults("threeImageEvidence", FUNCTION_THREE_IMAGE_BLOCK_ID),
          ...currentBlocks,
        ],
      };
    }
    appliedContentMigrations.push(FUNCTION_THREE_IMAGE_MIGRATION);
  }

  if (!appliedContentMigrations.includes(PRODUCTION_DECISION_MATRIX_MIGRATION)) {
    const currentBlocks = interventions.productionGuidelines.blocks;
    if (!currentBlocks.some((block) => block.id === PRODUCTION_DECISION_MATRIX_BLOCK_ID)) {
      interventions.productionGuidelines = {
        ...interventions.productionGuidelines,
        blocks: [
          getContentBlockDefaults("decisionMatrix", PRODUCTION_DECISION_MATRIX_BLOCK_ID),
          ...currentBlocks,
        ],
      };
    }
    appliedContentMigrations.push(PRODUCTION_DECISION_MATRIX_MIGRATION);
  }

  if (!appliedContentMigrations.includes(PRODUCTION_DECISION_MATRIX_SCOPE_MIGRATION)) {
    interventions.productionGuidelines = {
      ...interventions.productionGuidelines,
      blocks: interventions.productionGuidelines.blocks.map((block) => block.id === PRODUCTION_DECISION_MATRIX_BLOCK_ID
        ? {
          ...block,
          label: "REUSE / REDESIGN SCOPE",
          title: "复用与重设计范围判断表",
          matrixRows: structuredClone(defaultDecisionMatrixRows),
        }
        : block),
    };
    appliedContentMigrations.push(PRODUCTION_DECISION_MATRIX_SCOPE_MIGRATION);
  }

  if (!appliedContentMigrations.includes(PRODUCTION_FOUR_IMAGE_MIGRATION)) {
    const currentBlocks = interventions.productionGuidelines.blocks;
    if (!currentBlocks.some((block) => block.id === PRODUCTION_FOUR_IMAGE_BLOCK_ID)) {
      const nextBlocks = [...currentBlocks];
      const matrixIndex = nextBlocks.findIndex((block) => block.id === PRODUCTION_DECISION_MATRIX_BLOCK_ID);
      nextBlocks.splice(
        matrixIndex >= 0 ? matrixIndex + 1 : nextBlocks.length,
        0,
        getContentBlockDefaults("fourImageEvidence", PRODUCTION_FOUR_IMAGE_BLOCK_ID),
      );
      interventions.productionGuidelines = {
        ...interventions.productionGuidelines,
        blocks: nextBlocks,
      };
    }
    appliedContentMigrations.push(PRODUCTION_FOUR_IMAGE_MIGRATION);
  }

  if (!appliedContentMigrations.includes(UI_STYLE_SIX_IMAGE_MIGRATION)) {
    const currentBlocks = interventions.uiDirectionReset.blocks;
    if (!currentBlocks.some((block) => block.id === UI_STYLE_SIX_IMAGE_BLOCK_ID)) {
      interventions.uiDirectionReset = {
        ...interventions.uiDirectionReset,
        blocks: [
          ...currentBlocks,
          getContentBlockDefaults("sixImageShowcase", UI_STYLE_SIX_IMAGE_BLOCK_ID),
        ],
      };
    }
    appliedContentMigrations.push(UI_STYLE_SIX_IMAGE_MIGRATION);
  }

  return {
    version: 1,
    title: migrateTitle(value),
    projectDuration:
      typeof value.projectDuration === "string"
        ? value.projectDuration
        : defaultCrossPlatformDraft.projectDuration,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : defaultCrossPlatformDraft.updatedAt,
    projectContext: mergeProjectContext(value.projectContext),
    sections: readStringRecord(value.sections, defaultCrossPlatformDraft.sections),
    boundaryLists: readStringRecord(value.boundaryLists, defaultCrossPlatformDraft.boundaryLists),
    imageSlots: mergeImageSlots(value.imageSlots),
    competitorBreakdown: mergeCompetitorBreakdown(value.competitorBreakdown),
    thinkingMap: mergeThinkingMap(value.thinkingMap),
    interventionTimeline: mergeInterventionTimeline(value.interventionTimeline),
    interventions,
    appliedContentMigrations,
    legacyDraftBackup: mergeDraftTextBackup(value.legacyDraftBackup),
  };
}

function loadDraft() {
  if (typeof window === "undefined") {
    return defaultCrossPlatformDraft;
  }

  try {
    // IMPORTANT:
    // User-authored local case-study content.
    // Do not rename storage key or reset persisted content during layout-only refactors.
    const storedDraft = window.localStorage.getItem(CROSS_PLATFORM_DRAFT_STORAGE_KEY);

    if (!storedDraft) {
      return defaultCrossPlatformDraft;
    }

    const parsedDraft = JSON.parse(storedDraft) as unknown;
    return mergeCrossPlatformDraft(parsedDraft);
  } catch {
    return defaultCrossPlatformDraft;
  }
}

function paragraphLines(text: string) {
  return text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function createUpdatedDraft(draft: CrossPlatformDraft) {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
  };
}

export function CrossPlatformDraftPage() {
  const { locale, messages, pathFor } = useLocale();
  const localizedProjectContent = getProjectTranslation("cross-platform-game-ux", locale);
  const [draft, setDraft] = useState<CrossPlatformDraft>(() => loadDraft());
  const { isEditing } = useCaseStudyEditor();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("ready");
  const [importError, setImportError] = useState("");
  const didMountRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return undefined;
    }

    setSaveStatus("saving");

    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(CROSS_PLATFORM_DRAFT_STORAGE_KEY, JSON.stringify(draft));
        try {
          setProjectPublicMetaOverride("cross-platform-game-ux", {
            titleZh: draft.title,
            summaryZh: draft.sections.heroSubtitle,
            duration: draft.projectDuration,
          });
        } catch {
          // The case-study draft remains authoritative if the listing cache cannot be updated.
        }
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [draft]);

  const updateDraft = (updater: (current: CrossPlatformDraft) => CrossPlatformDraft) => {
    setDraft((current) => createUpdatedDraft(updater(current)));
    setImportError("");
  };

  const updateTitle = (title: string) => {
    updateDraft((current) => ({
      ...current,
      title,
    }));
  };

  const updateProjectDuration = (projectDuration: string) => {
    updateDraft((current) => ({
      ...current,
      projectDuration,
    }));
  };

  const updateProjectContext = (projectContext: ProjectContextDraft) => {
    updateDraft((current) => ({
      ...current,
      projectContext,
    }));
  };

  const updateSection = (key: SectionKey, value: string) => {
    updateDraft((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [key]: value,
      },
    }));
  };

  const updateImageSlot = (key: ImageSlotKey, value: DraftImageSlot) => {
    updateDraft((current) => ({
      ...current,
      imageSlots: {
        ...current.imageSlots,
        [key]: value,
      },
    }));
  };

  const updateBoundaryList = (key: BoundaryListKey, value: string) => {
    updateDraft((current) => ({
      ...current,
      boundaryLists: {
        ...current.boundaryLists,
        [key]: value,
      },
    }));
  };

  const updateThinkingMap = (thinkingMap: ThinkingMapDraft) => {
    updateDraft((current) => ({
      ...current,
      thinkingMap,
    }));
  };

  const updateCompetitorBreakdown = (competitorBreakdown: CompetitorBreakdownDraft) => {
    updateDraft((current) => ({
      ...current,
      competitorBreakdown,
    }));
  };

  const updateTimeline = (interventionTimeline: { nodes: TimelineNode[] }) => {
    updateDraft((current) => ({ ...current, interventionTimeline }));
  };

  const updateIntervention = (key: InterventionKey, value: InterventionDraft) => {
    updateDraft((current) => ({
      ...current,
      interventions: { ...current.interventions, [key]: value },
    }));
  };

  const applyChineseTemplate = () => {
    const confirmed = window.confirm("这会用中文模板替换当前本地草稿文字，但不会删除已上传图片。确定继续吗？");
    if (!confirmed) return;

    updateDraft((current) => ({
      ...defaultCrossPlatformDraft,
      version: current.version,
      appliedContentMigrations: current.appliedContentMigrations,
      projectDuration: current.projectDuration,
      competitorBreakdown: current.competitorBreakdown,
      updatedAt: current.updatedAt,
      imageSlots: current.imageSlots,
      interventionTimeline: current.interventionTimeline,
      interventions: (Object.keys(defaultCrossPlatformDraft.interventions) as InterventionKey[]).reduce<
        Record<InterventionKey, InterventionDraft>
      >((result, key) => {
        result[key] = {
          ...defaultCrossPlatformDraft.interventions[key],
          imageSlots: current.interventions[key].imageSlots,
          blocks: current.interventions[key].blocks ?? [],
        };
        return result;
      }, {} as Record<InterventionKey, InterventionDraft>),
      legacyDraftBackup: current.legacyDraftBackup ?? createDraftTextBackup(current),
    }));
  };

  const exportDraft = () => {
    const blob = new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cross-platform-game-ux-draft.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importDraft = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    try {
      const imported = JSON.parse(await file.text()) as unknown;

      if (!isRecord(imported) || imported.version !== 1 || !isRecord(imported.sections)) {
        throw new Error("Invalid draft file.");
      }

      const nextDraft = createUpdatedDraft(mergeCrossPlatformDraft(imported));

      window.localStorage.setItem(CROSS_PLATFORM_DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
      try {
        setProjectPublicMetaOverride("cross-platform-game-ux", {
          titleZh: nextDraft.title,
          summaryZh: nextDraft.sections.heroSubtitle,
          duration: nextDraft.projectDuration,
        });
      } catch {
        // Importing the case-study draft must not depend on the listing cache.
      }
      setDraft(nextDraft);
      setSaveStatus("saved");
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Invalid draft file.");
    }
  };

  return (
    <PageTransition>
      <article className="overflow-hidden bg-deepIndigo text-softWhite">
        <EditDock
          isEditing={isEditing}
          saveStatus={saveStatus}
          importError={importError}
          draftTitle={draft.title}
          publishedTitle={crossPlatformPublishedProject.title}
          onApplyChineseTemplate={applyChineseTemplate}
          onExport={exportDraft}
          onImportClick={() => fileInputRef.current?.click()}
        />
        <input ref={fileInputRef} className="hidden" type="file" accept="application/json,.json" onChange={importDraft} />

        <section className={caseStudyLayout.heroSection}>
          <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-25" />
          <div className={caseStudyLayout.heroContainer}>
            <Link
              to={pathFor("/work")}
              className={caseStudyLayout.backLink}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {messages.project.backToArchive}
            </Link>

            <div className={caseStudyLayout.heroComposition}>
              <div className={caseStudyLayout.heroCopy}>
                <p className={caseStudyLayout.category}>
                  商业项目 / 跨平台游戏体验
                </p>
                <EditableTitle
                  isEditing={isEditing}
                  value={draft.title}
                  onChange={updateTitle}
                />
                <EditableText
                  className={caseStudyLayout.subtitle}
                  editClassName="mt-6 max-w-3xl"
                  isEditing={isEditing}
                  label={sectionMeta.heroSubtitle.title}
                  minRows={3}
                  value={draft.sections.heroSubtitle}
                  onChange={(value) => updateSection("heroSubtitle", value)}
                />
              </div>
              {localizedProjectContent?.hero?.durationLabel ? (
                <div className={caseStudyLayout.durationPosition}>
                  {isEditing ? (
                    <label className="block min-w-0 sm:w-64">
                      <span className="mb-2 block font-mono text-xs font-bold uppercase tracking-[0.1em] text-[#9FAAD2] sm:text-right">
                        {localizedProjectContent.hero.durationLabel}
                      </span>
                      <input
                        className="w-full min-w-0 rounded-[6px] border border-electricBlue/45 bg-deepIndigo/58 px-3 py-2 font-mono text-sm text-softWhite outline-none transition focus:border-acidGreen/60 sm:text-right"
                        value={draft.projectDuration}
                        onChange={(event) => updateProjectDuration(event.target.value)}
                      />
                    </label>
                  ) : (
                    <p className={caseStudyLayout.durationText}>
                      {draft.projectDuration}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {isEditing ? <ProjectCoverEditor projectId="cross-platform-game-ux" locale={locale} /> : null}

        <ProjectContextSection
          value={draft.projectContext}
          isEditing={isEditing}
          onChange={updateProjectContext}
        />

        <InterventionTimeline
          timeline={draft.interventionTimeline}
          isEditing={isEditing}
          onChange={updateTimeline}
        />

        <InterventionContent
          draft={draft}
          isEditing={isEditing}
          onCompetitorBreakdownChange={updateCompetitorBreakdown}
          onInterventionChange={updateIntervention}
          onSectionChange={updateSection}
          onBoundaryListChange={updateBoundaryList}
          onImageSlotChange={updateImageSlot}
          onThinkingMapChange={updateThinkingMap}
        />
      </article>
    </PageTransition>
  );
}

function EditDock({
  isEditing,
  saveStatus,
  importError,
  draftTitle,
  publishedTitle,
  onApplyChineseTemplate,
  onExport,
  onImportClick,
}: {
  isEditing: boolean;
  saveStatus: SaveStatus;
  importError: string;
  draftTitle: string;
  publishedTitle: string;
  onApplyChineseTemplate: () => void;
  onExport: () => void;
  onImportClick: () => void;
}) {
  const normaliseTitle = (value: string) => value.replace(/\s+/g, " ").trim();
  const titleIsSynced = normaliseTitle(draftTitle) === normaliseTitle(publishedTitle);

  if (!isEditing) return null;

  return (
    <div className="fixed right-3 top-[132px] z-[79] max-w-[calc(100vw-1.5rem)] md:right-6 md:top-[136px]">
      <CaseStudyEditorActions saveStatus={saveStatus}>
          <span className="rounded-full border border-acidGreen/35 bg-acidGreen/10 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-[0.12em] text-acidGreen">
            Draft edit mode
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-acidGreen/35 bg-acidGreen/10 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.1em] text-acidGreen transition hover:border-acidGreen/65 hover:bg-acidGreen/15"
            onClick={onApplyChineseTemplate}
          >
            Use Chinese template
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-softWhite/16 bg-archiveBlue/40 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.1em] text-softWhite/72 transition hover:border-acidGreen/45 hover:text-acidGreen"
            onClick={onExport}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export draft
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-softWhite/16 bg-archiveBlue/40 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.1em] text-softWhite/72 transition hover:border-acidGreen/45 hover:text-acidGreen"
            onClick={onImportClick}
          >
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            Import draft
          </button>
          {importError ? <span className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-peach">{importError}</span> : null}
          <div className="w-full border-t border-softWhite/10 pt-2 text-right">
            <p
              className={`font-mono text-[11px] font-bold uppercase tracking-[0.1em] ${
                titleIsSynced ? "text-softWhite/42" : "text-peach"
              }`}
            >
              {titleIsSynced ? "Title synced" : "Title differs from site"}
            </p>
            {!titleIsSynced ? (
              <p className="mt-1 text-[11px] leading-4 text-softWhite/54">
                <span className="mr-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-softWhite/34">
                  Site title
                </span>
                {publishedTitle}
              </p>
            ) : null}
          </div>
          <p className="w-full text-right font-mono text-[11px] uppercase leading-5 tracking-[0.08em] text-softWhite/42">
            Local images are stored in this browser. JSON export does not include image files.
          </p>
      </CaseStudyEditorActions>
    </div>
  );
}

function ProjectContextSection({
  value,
  isEditing,
  onChange,
}: {
  value: ProjectContextDraft;
  isEditing: boolean;
  onChange: (value: ProjectContextDraft) => void;
}) {
  const updateBody = (body: string) => onChange({ ...value, body });

  return (
    <section className="border-b border-softWhite/10 bg-deepIndigo px-4 py-8 md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl">
        {isEditing ? (
          <EditableText
            isEditing
            label="Project context and design boundary"
            value={value.body}
            onChange={updateBody}
            className=""
            editClassName=""
            textareaClassName="text-base leading-[1.8]"
            minRows={5}
          />
        ) : (
          <div className="text-[clamp(1rem,1.1vw,1.125rem)] leading-[1.85] text-softWhite/68">
            {paragraphLines(value.body).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        )}
      </div>
    </section>
  );
}

function InterventionTimeline({
  timeline,
  isEditing,
  onChange,
}: {
  timeline: { nodes: TimelineNode[] };
  isEditing: boolean;
  onChange: (timeline: { nodes: TimelineNode[] }) => void;
}) {
  const [newStageId, setNewStageId] = useState("");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const autoScrollTimeRef = useRef<number | null>(null);
  const autoScrollPositionRef = useRef(0);
  const timelinePointerPressedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const canDelete = timeline.nodes.length > 1;
  const canAdd = timeline.nodes.length < 99;

  const updateScrollHints = () => {
    const viewport = timelineScrollRef.current;
    if (!viewport) return;

    if (autoScrollDirectionRef.current === 0) {
      autoScrollPositionRef.current = viewport.scrollLeft;
    }
    setCanScrollLeft(viewport.scrollLeft > 2);
    setCanScrollRight(viewport.scrollLeft < viewport.scrollWidth - viewport.clientWidth - 2);
  };

  const stopEdgeAutoScroll = () => {
    autoScrollDirectionRef.current = 0;
    autoScrollTimeRef.current = null;
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  };

  const startEdgeAutoScroll = (direction: -1 | 1) => {
    if (
      reducedMotionRef.current
      || timelinePointerPressedRef.current
      || autoScrollDirectionRef.current === direction
    ) return;

    stopEdgeAutoScroll();
    autoScrollDirectionRef.current = direction;
    autoScrollPositionRef.current = timelineScrollRef.current?.scrollLeft ?? 0;

    const step = (time: number) => {
      autoScrollFrameRef.current = null;
      const viewport = timelineScrollRef.current;
      if (!viewport || autoScrollDirectionRef.current === 0) return;

      const elapsed = autoScrollTimeRef.current === null ? 16 : Math.min(time - autoScrollTimeRef.current, 32);
      autoScrollTimeRef.current = time;
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const nextScrollLeft = Math.min(
        maxScrollLeft,
        Math.max(0, autoScrollPositionRef.current + autoScrollDirectionRef.current * 90 * elapsed / 1000),
      );
      autoScrollPositionRef.current = nextScrollLeft;
      viewport.scrollLeft = nextScrollLeft;
      updateScrollHints();

      const reachedBoundary = autoScrollDirectionRef.current < 0
        ? nextScrollLeft <= 0
        : nextScrollLeft >= maxScrollLeft;
      if (reachedBoundary) {
        stopEdgeAutoScroll();
        return;
      }

      autoScrollFrameRef.current = window.requestAnimationFrame(step);
    };

    autoScrollFrameRef.current = window.requestAnimationFrame(step);
  };

  const handleTimelinePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== "mouse"
      || timelinePointerPressedRef.current
      || isEditing
      || reducedMotionRef.current
    ) {
      stopEdgeAutoScroll();
      return;
    }

    const viewport = timelineScrollRef.current;
    if (!viewport) return;

    const bounds = viewport.getBoundingClientRect();
    const edgeZone = bounds.width * 0.16;
    const pointerX = event.clientX - bounds.left;

    if (pointerX <= edgeZone && canScrollLeft) {
      startEdgeAutoScroll(-1);
    } else if (pointerX >= bounds.width - edgeZone && canScrollRight) {
      startEdgeAutoScroll(1);
    } else {
      stopEdgeAutoScroll();
    }
  };

  const handleTimelinePointerDown = () => {
    timelinePointerPressedRef.current = true;
    stopEdgeAutoScroll();
  };

  const handleTimelinePointerRelease = () => {
    timelinePointerPressedRef.current = false;
  };

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      reducedMotionRef.current = reducedMotionQuery.matches;
      if (reducedMotionQuery.matches) stopEdgeAutoScroll();
    };

    syncReducedMotion();
    reducedMotionQuery.addEventListener("change", syncReducedMotion);
    const frame = window.requestAnimationFrame(updateScrollHints);

    return () => {
      window.cancelAnimationFrame(frame);
      reducedMotionQuery.removeEventListener("change", syncReducedMotion);
      stopEdgeAutoScroll();
    };
  }, [isEditing, timeline.nodes.length]);

  const updateNode = (id: string, updates: Partial<TimelineNode>) => {
    onChange({ nodes: timeline.nodes.map((node) => (node.id === id ? { ...node, ...updates } : node)) });
  };

  const addStage = () => {
    if (!canAdd) return;
    const id = `custom-stage-${Date.now()}`;
    setNewStageId(id);
    onChange({
      nodes: [
        ...timeline.nodes,
        { id, label: "新阶段", meta: "参与方 / 部门", isIntervention: false },
      ],
    });
  };

  const deleteStage = (id: string) => {
    if (!canDelete || !window.confirm("确定删除这个阶段吗？")) return;
    onChange({ nodes: timeline.nodes.filter((node) => node.id !== id) });
  };

  return (
    <section className="border-b border-softWhite/10 bg-[#121239] px-4 py-14 md:px-6 md:py-20">
      <div className="mx-auto max-w-7xl">
        <p className="text-center font-mono text-base font-bold uppercase tracking-[0.12em] text-acidGreen/80">
          四个设计介入阶段
        </p>
        {isEditing ? (
          <div className="mt-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {timeline.nodes.map((node, index) => (
                <TimelineNodeEditor
                  key={node.id}
                  node={node}
                  index={index}
                  autoFocus={node.id === newStageId}
                  canDelete={canDelete}
                  onChange={(updates) => updateNode(node.id, updates)}
                  onDelete={() => deleteStage(node.id)}
                />
              ))}
            </div>
            <button
              type="button"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-acidGreen/40 bg-acidGreen/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-acidGreen transition hover:border-acidGreen/70 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canAdd}
              onClick={addStage}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              添加阶段
            </button>
          </div>
        ) : (
          <>
            <div className="relative mt-10 hidden lg:block">
              <div
                ref={timelineScrollRef}
                className="timeline-scroll overflow-x-auto overscroll-x-contain"
                onScroll={updateScrollHints}
                onPointerMove={handleTimelinePointerMove}
                onPointerDown={handleTimelinePointerDown}
                onPointerUp={handleTimelinePointerRelease}
                onPointerCancel={handleTimelinePointerRelease}
                onPointerLeave={() => {
                  handleTimelinePointerRelease();
                  stopEdgeAutoScroll();
                }}
              >
                <div className="relative -ml-12 grid w-max grid-flow-col auto-cols-[190px] gap-8 px-3 pb-2 pt-1">
                  <span className="absolute left-[107px] right-[107px] top-[34px] h-px bg-softWhite/18" />
                  {timeline.nodes.map((node, index) => (
                    <TimelineNodeView key={node.id} node={node} index={index} large />
                  ))}
                </div>
              </div>
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 left-0 z-20 w-12 bg-gradient-to-r from-[#121239] to-transparent transition-opacity motion-reduce:transition-none ${
                  canScrollLeft ? "opacity-100" : "opacity-0"
                }`}
              />
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 right-0 z-20 w-12 bg-gradient-to-l from-[#121239] to-transparent transition-opacity motion-reduce:transition-none ${
                  canScrollRight ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
            <div className="mt-8 grid lg:hidden">
              {timeline.nodes.map((node, index) => (
                <div key={node.id} className="group/timeline relative grid min-w-0 grid-cols-[34px_minmax(0,1fr)] gap-4">
                  <div className="flex flex-col items-center">
                    <TimelineDot node={node} index={index} />
                    {index < timeline.nodes.length - 1 ? <span className="min-h-10 flex-1 border-l border-softWhite/18" /> : null}
                  </div>
                  <div className="min-w-0 pb-7">
                    <TimelineLabel node={node} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function TimelineNodeEditor({
  node,
  index,
  autoFocus,
  canDelete,
  onChange,
  onDelete,
}: {
  node: TimelineNode;
  index: number;
  autoFocus: boolean;
  canDelete: boolean;
  onChange: (updates: Partial<TimelineNode>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="min-w-0 rounded-[8px] border border-softWhite/12 bg-archiveBlue/18 p-4">
      <div className="flex items-center justify-between gap-3">
        <TimelineDot node={node} index={index} />
        <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-softWhite/32">{node.id}</span>
      </div>
      <label className="mt-4 block">
        <span className="mb-2 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/46">阶段标题</span>
        <input
          autoFocus={autoFocus}
          className="w-full min-w-0 rounded-[6px] border border-electricBlue/45 bg-deepIndigo/55 px-3 py-2 text-base font-semibold leading-6 text-softWhite outline-none focus:border-acidGreen/60"
          value={node.label}
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </label>
      <label className="mt-3 block">
        <span className="mb-2 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/46">参与方 / 部门</span>
        <input
          className="w-full min-w-0 rounded-[6px] border border-electricBlue/45 bg-deepIndigo/55 px-3 py-2 text-base leading-6 text-softWhite outline-none focus:border-acidGreen/60"
          value={node.meta}
          onChange={(event) => onChange({ meta: event.target.value })}
        />
      </label>
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-semibold text-softWhite/70">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#c7ff43]"
          checked={node.isIntervention}
          onChange={(event) => onChange({ isIntervention: event.target.checked })}
        />
        我的介入阶段
      </label>
      <details className="mt-4 border-t border-softWhite/10 pt-3">
        <summary className="cursor-pointer font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">高级设置</summary>
        <label className="mt-3 block">
          <span className="mb-2 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">跳转锚点</span>
          <input
            className="w-full min-w-0 rounded-[6px] border border-softWhite/14 bg-deepIndigo/55 px-3 py-2 font-mono text-sm text-softWhite outline-none focus:border-acidGreen/60"
            value={node.targetSectionId ?? ""}
            onChange={(event) => onChange({ targetSectionId: event.target.value })}
          />
        </label>
      </details>
      <button
        type="button"
        className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs font-bold tracking-[0.08em] text-peach/75 transition hover:text-peach disabled:cursor-not-allowed disabled:opacity-30"
        disabled={!canDelete}
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        删除阶段
      </button>
    </div>
  );
}

function TimelineDot({ node, index, large = false }: { node: TimelineNode; index: number; large?: boolean }) {
  return (
    <span className={`relative z-10 grid shrink-0 place-items-center rounded-full border font-mono font-bold ${
      large ? "h-[60px] w-[60px] text-lg" : "h-8 w-8 text-xs"
    } ${
      node.isIntervention
        ? "intervention-node-pulse border-acidGreen bg-acidGreen text-deepIndigo"
        : "border-softWhite/34 bg-[#121239] text-softWhite/50"
    }`}>
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}

function TimelineLabel({ node, large = false }: { node: TimelineNode; large?: boolean }) {
  const hasMeta = Boolean(node.meta);
  const content = (
    <span className={`relative grid w-full min-w-0 place-items-center overflow-hidden text-center ${
      large ? "h-16 px-3" : "h-12 px-2"
    }`}>
      <span
        className={`col-start-1 row-start-1 transition-opacity motion-reduce:transition-none ${
          large ? "text-xl leading-6" : "text-sm leading-5"
        } ${
          node.isIntervention ? "font-semibold text-softWhite/78" : "font-medium text-softWhite/48"
        } ${hasMeta ? "group-hover/timeline:opacity-0 group-focus-within/timeline:opacity-0" : ""}`}
      >
        {node.label}
      </span>
      {hasMeta ? (
        <span
          className={`pointer-events-none col-start-1 row-start-1 opacity-0 transition-opacity motion-reduce:transition-none group-hover/timeline:opacity-100 group-focus-within/timeline:opacity-100 ${
            large ? "text-xl leading-6" : "text-sm leading-5"
          } ${
            node.isIntervention
              ? "font-semibold text-[#9FAAD2]"
              : "font-medium text-[#9FAAD2]"
          }`}
        >
          {node.meta}
        </span>
      ) : null}
    </span>
  );

  return node.targetSectionId ? (
    <a
      href={`#${node.targetSectionId}`}
      className={`relative block w-full transition hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen ${
        large ? "mt-4" : "lg:mt-3"
      }`}
    >
      {content}
    </a>
  ) : (
    <span
      tabIndex={0}
      className={`relative block w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen ${
        large ? "mt-4" : "lg:mt-3"
      }`}
    >
      {content}
    </span>
  );
}

function TimelineNodeView({ node, index, large = false }: { node: TimelineNode; index: number; large?: boolean }) {
  return (
    <div className="group/timeline relative z-10 flex min-w-0 flex-col items-center text-center">
      <TimelineDot node={node} index={index} large={large} />
      <TimelineLabel node={node} large={large} />
    </div>
  );
}

function InterventionContent({
  draft,
  isEditing,
  onCompetitorBreakdownChange,
  onInterventionChange,
  onSectionChange,
  onBoundaryListChange,
  onImageSlotChange,
  onThinkingMapChange,
}: {
  draft: CrossPlatformDraft;
  isEditing: boolean;
  onCompetitorBreakdownChange: (value: CompetitorBreakdownDraft) => void;
  onInterventionChange: (key: InterventionKey, value: InterventionDraft) => void;
  onSectionChange: (key: SectionKey, value: string) => void;
  onBoundaryListChange: (key: BoundaryListKey, value: string) => void;
  onImageSlotChange: (key: ImageSlotKey, value: DraftImageSlot) => void;
  onThinkingMapChange: (value: ThinkingMapDraft) => void;
}) {
  return (
    <section className={caseStudyLayout.contentSection}>
      <div className={caseStudyLayout.contentStack}>
        {(Object.keys(interventionMeta) as InterventionKey[]).map((key) => {
          const section = draft.interventions[key];
          const linkedTimelineNode = draft.interventionTimeline.nodes.find(
            (node) => node.id === interventionMeta[key].anchor,
          );

          return (
            <InterventionSection
              key={key}
              sectionKey={key}
              displayTitle={linkedTimelineNode?.label || section.title}
              value={section}
              competitorBreakdown={draft.competitorBreakdown}
              isEditing={isEditing}
              onCompetitorBreakdownChange={onCompetitorBreakdownChange}
              onChange={(value) => onInterventionChange(key, value)}
            />
          );
        })}
        {isEditing ? (
          <LegacyDraftBackup
            draft={draft}
            onSectionChange={onSectionChange}
            onBoundaryListChange={onBoundaryListChange}
            onImageSlotChange={onImageSlotChange}
            onThinkingMapChange={onThinkingMapChange}
          />
        ) : null}
      </div>
    </section>
  );
}

function InterventionSection({ sectionKey, displayTitle, value, competitorBreakdown, isEditing, onCompetitorBreakdownChange, onChange }: {
  sectionKey: InterventionKey;
  displayTitle: string;
  value: InterventionDraft;
  competitorBreakdown: CompetitorBreakdownDraft;
  isEditing: boolean;
  onCompetitorBreakdownChange: (value: CompetitorBreakdownDraft) => void;
  onChange: (value: InterventionDraft) => void;
}) {
  const meta = interventionMeta[sectionKey];
  const update = (field: "goal" | "body" | "items", next: string) => onChange({ ...value, [field]: next });
  const updateSlot = (slotId: string, slot: DraftImageSlot) => onChange({ ...value, imageSlots: { ...value.imageSlots, [slotId]: slot } });
  const slots = meta.slots;
  const displayedBlocks = sectionKey === "uiDirectionReset"
    ? value.blocks.filter((block) => block.id === UI_STYLE_SIX_IMAGE_BLOCK_ID)
    : value.blocks;
  const updateDisplayedBlocks = (blocks: ContentBlockDraft[]) => {
    if (sectionKey !== "uiDirectionReset") {
      onChange({ ...value, blocks });
      return;
    }

    const preservedHiddenBlocks = value.blocks.filter((block) => block.id !== UI_STYLE_SIX_IMAGE_BLOCK_ID);
    onChange({ ...value, blocks: [...preservedHiddenBlocks, ...blocks] });
  };

  return (
    <section id={meta.anchor} className="scroll-mt-24">
      <div className={caseStudyLayout.majorGrid}>
        <div className={caseStudyLayout.majorTitleComposition}>
          <span
            aria-hidden="true"
            className={caseStudyLayout.majorNumber}
          >
            {meta.number}
          </span>
          <div className={caseStudyLayout.majorTitleOffset}>
            <h2 className={caseStudyLayout.majorTitle}>
              {displayTitle}
            </h2>
            {isEditing ? (
              <p className="mt-4 font-mono text-[13px] font-bold tracking-[0.06em] text-softWhite/38">
                标题来自上方时间线节点
              </p>
            ) : null}
          </div>
        </div>
        <div className={caseStudyLayout.majorCopy}>
          <EditableText
            isEditing={isEditing}
            label="Section subtitle"
            value={value.goal}
            onChange={(next) => update("goal", next)}
            className={caseStudyLayout.majorHeading}
            minRows={4}
            textareaClassName="font-display text-[clamp(1.5rem,2.4vw,2.75rem)] leading-[1.3]"
          />
          <EditableText isEditing={isEditing} label="Section body" value={value.body} onChange={(next) => update("body", next)} className={caseStudyLayout.majorBody} editClassName="mt-6" minRows={10} />
        </div>
      </div>

      {sectionKey === "marketCompetitorAnalysis" ? (
        <CompetitorAnalysisBoard
          value={competitorBreakdown}
          isEditing={isEditing}
          onChange={onCompetitorBreakdownChange}
        />
      ) : null}

      <ContentBlockList
        blocks={displayedBlocks}
        competitorBreakdown={competitorBreakdown}
        isEditing={isEditing}
        onCompetitorBreakdownChange={onCompetitorBreakdownChange}
        onChange={updateDisplayedBlocks}
        allowTemplateInsertion={sectionKey !== "uiDirectionReset"}
      />

      {sectionKey !== "marketCompetitorAnalysis"
        && sectionKey !== "functionHierarchyOptimisation"
        && sectionKey !== "productionGuidelines"
        && sectionKey !== "uiDirectionReset" ? (
        <>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <EvidenceImageSlot slotId={slots[0].id} meta={slots[0]} slot={value.imageSlots[slots[0].id]} isEditing={isEditing} onChange={updateSlot} />
            </div>
            {slots.slice(1).map((slotMeta) => (
              <EvidenceImageSlot key={slotMeta.id} slotId={slotMeta.id} meta={slotMeta} slot={value.imageSlots[slotMeta.id]} isEditing={isEditing} onChange={updateSlot} compact />
            ))}
          </div>
          <FindingCardGrid label={meta.itemLabel} value={value.items} isEditing={isEditing} onChange={(next) => update("items", next)} />
        </>
      ) : null}
    </section>
  );
}

function CompetitorAnalysisBoard({
  value,
  isEditing,
  onChange,
  showTakeaway = true,
}: {
  value: CompetitorBreakdownDraft;
  isEditing: boolean;
  onChange: (value: CompetitorBreakdownDraft) => void;
  showTakeaway?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<string | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<Record<string, string>>(() =>
    Object.fromEntries(value.competitors.map((competitor) => [competitor.id, ""])),
  );

  const openCompetitor = (competitor: CompetitorBreakdownItem) => {
    setSelectedBranches((current) => ({
      ...current,
      [competitor.id]: competitor.branches[0]?.id ?? "",
    }));
    setSelectedCompetitorId(competitor.id);
  };

  const closeCompetitor = () => {
    if (selectedCompetitorId) {
      setSelectedBranches((current) => ({ ...current, [selectedCompetitorId]: "" }));
    }
    setSelectedCompetitorId(null);
  };

  useEffect(() => {
    if (selectedCompetitorId && !value.competitors.some((competitor) => competitor.id === selectedCompetitorId)) {
      setSelectedBranches((current) => ({ ...current, [selectedCompetitorId]: "" }));
      setSelectedCompetitorId(null);
    }
    setSelectedBranches((current) => Object.fromEntries(
      value.competitors.map((competitor) => {
        const currentId = current[competitor.id];
        const nextId = currentId && competitor.branches.some((branch) => branch.id === currentId)
          ? currentId
          : competitor.id === selectedCompetitorId
            ? competitor.branches[0]?.id ?? ""
            : "";
        return [competitor.id, nextId];
      }),
    ));
  }, [selectedCompetitorId, value.competitors]);

  useEffect(() => {
    if (isEditing) {
      closeCompetitor();
      return;
    }
    if (!selectedCompetitorId) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCompetitor();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditing, selectedCompetitorId]);

  const applyParsedXmindData = () => {
    const confirmed = window.confirm(
      "这会用解析后的 XMind 结构替换当前竞品拆解草稿文字，但不会删除已上传图片。确定继续吗？",
    );
    if (!confirmed) return;

    setSelectedCompetitorId(null);
    setSelectedBranches(Object.fromEntries(
      parsedXmindCompetitorBreakdown.competitors.map((competitor) => [competitor.id, ""]),
    ));
    onChange(structuredClone(parsedXmindCompetitorBreakdown));
  };

  const updateRationale = (field: "title" | "body", next: string) => {
    onChange({
      ...value,
      researchRationale: { ...value.researchRationale, [field]: next },
    });
  };

  const updateCompetitor = (competitorIndex: number, updater: (item: CompetitorBreakdownItem) => CompetitorBreakdownItem) => {
    onChange({
      ...value,
      competitors: value.competitors.map((competitor, index) =>
        index === competitorIndex ? updater(competitor) : competitor,
      ),
    });
  };

  const updateBranch = (
    competitorIndex: number,
    branchIndex: number,
    updates: Partial<CompetitorBreakdownBranch>,
  ) => {
    updateCompetitor(competitorIndex, (competitor) => ({
      ...competitor,
      branches: competitor.branches.map((branch, index) =>
        index === branchIndex ? { ...branch, ...updates } : branch,
      ),
    }));
  };

  const selectedCompetitor = value.competitors.find((competitor) => competitor.id === selectedCompetitorId);

  return (
    <section className={isEditing ? "mt-14 border-t border-softWhite/10 pt-12 md:mt-18 md:pt-16" : "mt-14 md:mt-18"}>
      {isEditing ? (
        <>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-16">
            <p className="font-mono text-xs font-bold tracking-[0.1em] text-acidGreen/80">RESEARCH RATIONALE</p>
            <div className="grid gap-5">
              <label className="block min-w-0">
                <span className="mb-2 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">研究理由标题</span>
                <input
                  className="w-full min-w-0 border-b border-electricBlue/55 bg-transparent pb-2 font-display text-3xl leading-tight text-softWhite outline-none focus:border-acidGreen"
                  value={value.researchRationale.title}
                  onChange={(event) => updateRationale("title", event.target.value)}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-2 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">研究理由正文</span>
                <textarea
                  className="block min-h-48 w-full min-w-0 resize-y rounded-[6px] border border-electricBlue/35 bg-deepIndigo/48 px-3 py-3 text-base leading-7 text-softWhite outline-none focus:border-acidGreen/60"
                  value={value.researchRationale.body}
                  onChange={(event) => updateRationale("body", event.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-2 border border-electricBlue/45 px-3 py-2 font-mono text-xs font-bold tracking-[0.06em] text-[#9FAAD2] transition hover:border-acidGreen/70 hover:text-acidGreen focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen"
              onClick={applyParsedXmindData}
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              USE PARSED XMIND DATA
            </button>
          </div>
        </>
      ) : null}

      {isEditing ? (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {value.competitors.map((competitor, competitorIndex) => (
            <article key={competitor.id} className="min-w-0 border border-softWhite/12 bg-archiveBlue/16 p-4 md:p-5">
              <div className="flex items-baseline gap-3 border-b border-softWhite/10 pb-4">
                <span className="font-mono text-xs text-acidGreen/68">
                  {String(competitorIndex + 1).padStart(2, "0")}
                </span>
                <label className="min-w-0 flex-1">
                  <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                    竞品名称
                  </span>
                  <input
                    className="w-full min-w-0 border-b border-electricBlue/55 bg-transparent pb-2 font-display text-2xl text-softWhite outline-none focus:border-acidGreen"
                    value={competitor.name}
                    onChange={(event) => updateCompetitor(competitorIndex, (item) => ({ ...item, name: event.target.value }))}
                  />
                </label>
              </div>
              <label className="mt-4 block min-w-0">
                <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                  游戏角色 / 状态
                </span>
                <input
                  className="w-full min-w-0 border-b border-electricBlue/45 bg-transparent pb-2 text-sm leading-6 text-softWhite outline-none focus:border-acidGreen"
                  value={competitor.role}
                  onChange={(event) => updateCompetitor(competitorIndex, (item) => ({ ...item, role: event.target.value }))}
                />
              </label>
              <label className="mt-4 block min-w-0">
                <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                  分析重点
                </span>
                <textarea
                  className="block min-h-24 w-full min-w-0 resize-y rounded-[6px] border border-softWhite/10 bg-deepIndigo/48 px-3 py-2 text-sm leading-6 text-softWhite outline-none focus:border-acidGreen/60"
                  value={competitor.focus}
                  onChange={(event) => updateCompetitor(competitorIndex, (item) => ({ ...item, focus: event.target.value }))}
                />
              </label>
              <div className="mt-3 grid gap-2">
                {competitor.branches.map((branch, branchIndex) => (
                  <div key={branch.id} className="border-b border-softWhite/10 py-3 last:border-b-0">
                    <label className="block">
                      <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                        分支名称
                      </span>
                      <input
                        className="w-full min-w-0 bg-transparent text-base font-semibold leading-6 text-softWhite outline-none focus:text-acidGreen"
                        value={branch.label}
                        onChange={(event) => updateBranch(competitorIndex, branchIndex, { label: event.target.value })}
                      />
                    </label>
                    <label className="mt-3 block">
                      <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                        详细观察 / 每行一条
                      </span>
                      <textarea
                        className="block min-h-28 w-full resize-y rounded-[6px] border border-softWhite/10 bg-deepIndigo/48 px-3 py-2 text-sm leading-6 text-softWhite outline-none focus:border-acidGreen/60"
                        rows={Math.max(4, branch.details.length + 1)}
                        value={branch.details.join("\n")}
                        onChange={(event) => updateBranch(competitorIndex, branchIndex, {
                          details: event.target.value.split("\n"),
                        })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <>
          <div className="grid w-full gap-6 px-10 sm:grid-cols-2 sm:items-stretch lg:gap-10">
            {value.competitors.map((competitor, competitorIndex) => (
              <motion.button
                key={competitor.id}
                type="button"
                className="group relative flex min-h-[15rem] min-w-0 flex-col overflow-hidden rounded-[24px] bg-[#151B4D]/90 p-5 text-left shadow-[0_14px_34px_rgba(3,5,26,0.24),inset_0_1px_0_rgba(244,245,250,0.08)] ring-1 ring-inset ring-softWhite/5 transition-colors hover:bg-[#192057]/95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen md:p-6"
                onClick={() => openCompetitor(competitor)}
                whileHover={shouldReduceMotion ? undefined : { y: -6, scale: 1.015 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: "easeOut" }}
              >
                <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-softWhite/20" aria-hidden="true" />
                <p className="font-mono text-xs font-bold tracking-[0.1em] text-[#9FAAD2]">
                  研究参照 {String(competitorIndex + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 break-words font-display text-[clamp(1.45rem,2.2vw,1.85rem)] leading-tight text-softWhite">
                  {competitor.name}
                </h3>
                <div className="mt-4">
                  <p className="font-mono text-xs tracking-[0.08em] text-softWhite/40">游戏角色 / 状态</p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-softWhite/70">{competitor.role}</p>
                </div>
                <div className="mt-3">
                  <p className="font-mono text-xs tracking-[0.08em] text-softWhite/40">分析重点</p>
                  <p className="mt-1 text-sm leading-5 text-[#9FAAD2]">{competitor.focus}</p>
                </div>
                <span className="mt-auto inline-flex items-center gap-2 pt-4 text-sm font-semibold text-acidGreen">
                  查看拆解
                  <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
                </span>
              </motion.button>
            ))}
          </div>

          {typeof document !== "undefined" ? createPortal(
            <AnimatePresence>
              {selectedCompetitor ? (
              <motion.div
                className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[#070A28]/80 p-4 backdrop-blur-md md:p-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) closeCompetitor();
                }}
                role="presentation"
              >
                <motion.article
                  className="relative my-auto max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-y-auto rounded-[30px] bg-[#111746]/95 p-6 shadow-[0_36px_100px_rgba(2,4,24,0.68),inset_0_1px_0_rgba(244,245,250,0.12)] ring-1 ring-inset ring-softWhite/5 md:max-h-[calc(100vh-4rem)] md:p-10"
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.28, ease: "easeOut" }}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-softWhite/10 text-[#9FAAD2] transition hover:bg-softWhite/20 hover:text-softWhite focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen md:right-7 md:top-7"
                    aria-label="关闭竞品拆解"
                    onClick={closeCompetitor}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <header className="grid min-w-0 gap-7 pr-12 md:grid-cols-[minmax(12rem,0.62fr)_minmax(0,1.38fr)] md:gap-12">
                    <div>
                      <p className="font-mono text-xs font-bold tracking-[0.1em] text-acidGreen/80">SELECTED REFERENCE</p>
                      <h3 className="mt-3 break-words font-display text-[clamp(2rem,3.5vw,3.25rem)] leading-none text-softWhite">
                        {selectedCompetitor.name}
                      </h3>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2">
                      <div>
                        <p className="font-mono text-xs tracking-[0.08em] text-softWhite/40">游戏角色 / 状态</p>
                        <p className="mt-2 text-sm leading-6 text-softWhite/70">{selectedCompetitor.role}</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs tracking-[0.08em] text-softWhite/40">分析重点</p>
                        <p className="mt-2 text-sm leading-6 text-[#9FAAD2]">{selectedCompetitor.focus}</p>
                      </div>
                    </div>
                  </header>

                  {(() => {
                    const activeBranch = selectedCompetitor.branches.find(
                      (branch) => branch.id === selectedBranches[selectedCompetitor.id],
                    );
                    const details = activeBranch?.details.filter(Boolean) ?? [];

                    return (
                      <div className="mt-9 min-w-0">
                        <p className="font-mono text-xs font-bold tracking-[0.08em] text-softWhite/40">观察分支</p>
                        <div className="mt-4 flex flex-wrap gap-2.5">
                          {selectedCompetitor.branches.map((branch) => {
                            const isSelected = activeBranch?.id === branch.id;
                            return (
                              <button
                                key={branch.id}
                                type="button"
                                className={`rounded-full px-4 py-2 text-sm font-semibold leading-5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen ${
                                  isSelected
                                    ? "bg-acidGreen text-deepIndigo shadow-[0_8px_24px_rgba(198,255,66,0.18)]"
                                    : "bg-archiveBlue/40 text-softWhite/60 hover:bg-archiveBlue/70 hover:text-softWhite"
                                }`}
                                aria-pressed={isSelected}
                                onClick={() => setSelectedBranches((current) => ({
                                  ...current,
                                  [selectedCompetitor.id]: branch.id,
                                }))}
                              >
                                {branch.label}
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-7 min-h-44 rounded-[22px] bg-deepIndigo/60 p-5 shadow-[inset_0_1px_0_rgba(244,245,250,0.06)] md:p-7">
                          {activeBranch ? (
                            <>
                              <div className="flex flex-wrap items-baseline justify-between gap-3 pb-5">
                                <h4 className="font-display text-[clamp(1.4rem,2vw,2rem)] leading-tight text-softWhite">
                                  {activeBranch.label}
                                </h4>
                                <span className="font-mono text-xs tracking-[0.08em] text-[#9FAAD2]">
                                  {String(details.length).padStart(2, "0")} NOTES
                                </span>
                              </div>
                              <div className="grid gap-x-8 md:grid-cols-2">
                                {details.map((detail, detailIndex) => (
                                  <div
                                    key={`${detailIndex}-${detail}`}
                                    className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3 border-t border-softWhite/10 py-3.5"
                                  >
                                    <span className="font-mono text-xs leading-6 text-[#9FAAD2]/60">
                                      {String(detailIndex + 1).padStart(2, "0")}
                                    </span>
                                    <p className="min-w-0 text-sm leading-6 text-[#9FAAD2]">{detail}</p>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="flex min-h-32 items-center justify-center text-center">
                              <p className="max-w-md text-sm leading-6 text-[#9FAAD2]">选择一个观察分支查看拆解笔记。</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </motion.article>
              </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          ) : null}
        </>
      )}

      {showTakeaway ? (
        <ThreeCircleTakeaway
          title="带回本项目的判断"
          takeaways={value.distilledTakeaways}
          isEditing={isEditing}
          onTitleChange={() => undefined}
          onTakeawaysChange={(distilledTakeaways) => onChange({ ...value, distilledTakeaways })}
          titleIsEditable={false}
        />
      ) : null}
    </section>
  );
}

function ThreeCircleTakeaway({
  title,
  takeaways,
  isEditing,
  onTitleChange,
  onTakeawaysChange,
  titleIsEditable = true,
}: {
  title: string;
  takeaways: [string, string, string];
  isEditing: boolean;
  onTitleChange: (value: string) => void;
  onTakeawaysChange: (value: [string, string, string]) => void;
  titleIsEditable?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();
  const updateTakeaway = (index: number, next: string) => {
    const updated = [...takeaways] as [string, string, string];
    updated[index] = next;
    onTakeawaysChange(updated);
  };

  return (
    <div className="mt-20 pb-16 text-center md:pb-[4.5rem]">
      {isEditing && titleIsEditable ? (
        <label className="mx-auto block max-w-2xl min-w-0">
          <span className="mb-2 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">总结标题</span>
          <input
            className="w-full min-w-0 border-b border-electricBlue/45 bg-transparent pb-2 text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite outline-none focus:border-acidGreen"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </label>
      ) : (
        <h3 className="font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite">
          {title}
        </h3>
      )}
      {isEditing ? (
        <div className="mx-auto mt-8 grid max-w-3xl min-w-0 gap-3 text-left">
          {takeaways.map((takeaway, index) => (
            <label key={index} className="block min-w-0">
              <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                判断 {String(index + 1).padStart(2, "0")}
              </span>
              <input
                className="w-full min-w-0 rounded-[6px] border border-electricBlue/45 bg-deepIndigo/48 px-3 py-3 text-base leading-7 text-softWhite outline-none focus:border-acidGreen/60"
                value={takeaway}
                onChange={(event) => updateTakeaway(index, event.target.value)}
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="mt-8 grid w-full grid-cols-1 items-center sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-x-11 md:gap-x-[3.25rem]">
          <span className="hidden h-px w-full bg-[#5968A8]/40 sm:block" aria-hidden="true" />
          <div className="flex flex-wrap justify-center gap-x-11 gap-y-7 md:gap-x-[3.25rem] md:gap-y-9">
            {takeaways.map((takeaway, index) => (
              <motion.div
                key={`${index}-${takeaway}`}
                className="flex h-[clamp(8.125rem,12vw,10.625rem)] w-[clamp(8.125rem,12vw,10.625rem)] items-center justify-center rounded-full bg-acidGreen/90 p-5 text-center shadow-[0_16px_40px_rgba(198,255,66,0.14),inset_0_1px_0_rgba(255,255,255,0.26)]"
                animate={shouldReduceMotion ? undefined : { scale: [1, 1.035, 1] }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 5 + index * 0.45,
                  repeat: shouldReduceMotion ? 0 : Infinity,
                  ease: "easeInOut",
                  delay: shouldReduceMotion ? 0 : index * 0.45,
                }}
              >
                <p className="text-[clamp(1.0625rem,1.4vw,1.25rem)] font-semibold leading-[1.4] text-deepIndigo">
                  {takeaway}
                </p>
              </motion.div>
            ))}
          </div>
          <span className="hidden h-px w-full bg-[#5968A8]/40 sm:block" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function ContentBlockList({
  blocks,
  competitorBreakdown,
  isEditing,
  onCompetitorBreakdownChange,
  onChange,
  allowTemplateInsertion = true,
}: {
  blocks: ContentBlockDraft[];
  competitorBreakdown: CompetitorBreakdownDraft;
  isEditing: boolean;
  onCompetitorBreakdownChange: (value: CompetitorBreakdownDraft) => void;
  onChange: (blocks: ContentBlockDraft[]) => void;
  allowTemplateInsertion?: boolean;
}) {
  const [selectedType, setSelectedType] = useState<ContentBlockType>("textBlock");

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const reordered = [...blocks];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    onChange(reordered);
  };

  const removeBlock = (index: number) => {
    if (!window.confirm("删除这个内容块？已上传的本地图片文件不会从浏览器中删除。")) return;
    onChange(blocks.filter((_, blockIndex) => blockIndex !== index));
  };

  return (
    <div className={blocks.length > 0 || isEditing ? caseStudyLayout.blocks : ""}>
      {blocks.map((block, index) => (
        <div key={block.id} className="min-w-0">
          {isEditing ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-softWhite/10 pb-3">
              <p className="font-mono text-xs font-bold tracking-[0.08em] text-[#9FAAD2]">
                {contentBlockTemplateNames[block.type]}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-archiveBlue/38 text-softWhite/62 transition hover:text-softWhite disabled:cursor-not-allowed disabled:opacity-25"
                  aria-label="上移内容块"
                  disabled={index === 0}
                  onClick={() => moveBlock(index, -1)}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-archiveBlue/38 text-softWhite/62 transition hover:text-softWhite disabled:cursor-not-allowed disabled:opacity-25"
                  aria-label="下移内容块"
                  disabled={index === blocks.length - 1}
                  onClick={() => moveBlock(index, 1)}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-peach/10 text-peach/72 transition hover:bg-peach/18 hover:text-peach"
                  aria-label="删除内容块"
                  onClick={() => removeBlock(index)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
          <ContentBlockRenderer
            block={block}
            competitorBreakdown={competitorBreakdown}
            isEditing={isEditing}
            onCompetitorBreakdownChange={onCompetitorBreakdownChange}
            onChange={(next) => onChange(blocks.map((item, blockIndex) => blockIndex === index ? next : item))}
          />
        </div>
      ))}

      {isEditing && allowTemplateInsertion ? (
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-electricBlue/25 pt-5">
          <label className="min-w-[15rem] flex-1 sm:max-w-sm">
            <span className="mb-2 block font-mono text-xs font-bold tracking-[0.08em] text-softWhite/42">插入内容模板</span>
            <select
              className="w-full rounded-[6px] border border-electricBlue/40 bg-deepIndigo px-3 py-2.5 text-sm text-softWhite outline-none focus:border-acidGreen"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value as ContentBlockType)}
            >
              {contentBlockTypes.map((type) => (
                <option key={type} value={type}>{contentBlockTemplateNames[type]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-acidGreen px-5 py-2.5 text-sm font-semibold text-deepIndigo transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acidGreen"
            onClick={() => onChange([...blocks, createContentBlock(selectedType)])}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            插入模板
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ContentBlockRenderer({
  block,
  competitorBreakdown,
  isEditing,
  onCompetitorBreakdownChange,
  onChange,
}: {
  block: ContentBlockDraft;
  competitorBreakdown: CompetitorBreakdownDraft;
  isEditing: boolean;
  onCompetitorBreakdownChange: (value: CompetitorBreakdownDraft) => void;
  onChange: (block: ContentBlockDraft) => void;
}) {
  const update = <K extends keyof ContentBlockDraft>(field: K, value: ContentBlockDraft[K]) => {
    onChange({ ...block, [field]: value });
  };
  const updateSlot = (key: string, value: DraftImageSlot) => {
    update("imageSlots", { ...block.imageSlots, [key]: value });
  };

  if (block.type === "competitorCards") {
    return (
      <div className="min-w-0">
        {isEditing ? (
          <BlockHeadingEditor block={block} onChange={onChange} />
        ) : block.title ? (
          <BlockHeading label={block.label} title={block.title} />
        ) : null}
        <CompetitorAnalysisBoard
          value={competitorBreakdown}
          isEditing={isEditing}
          onChange={onCompetitorBreakdownChange}
          showTakeaway={false}
        />
      </div>
    );
  }

  if (block.type === "threeCircleTakeaway") {
    return (
      <ThreeCircleTakeaway
        title={block.title}
        takeaways={block.takeaways}
        isEditing={isEditing}
        onTitleChange={(title) => update("title", title)}
        onTakeawaysChange={(takeaways) => update("takeaways", takeaways)}
      />
    );
  }

  if (block.type === "fourImageEvidence") {
    const imageKeys = ["image01", "image02", "image03", "image04"] as const;
    return (
      <div className="mx-4 min-w-0 sm:mx-6 lg:mx-10">
        <div className="grid min-w-0 items-start gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {imageKeys.map((key, index) => (
            <article key={key} className="min-w-0">
              <EvidenceImageSlot
                slotId={`${block.id}:${key}`}
                meta={{
                  label: `范围说明图 ${String(index + 1).padStart(2, "0")}`,
                  suggestion: "上传与复用或重设计判断对应的界面示例",
                }}
                slot={block.imageSlots[key] ?? { publicPath: "" }}
                isEditing={isEditing}
                onChange={(_, slot) => updateSlot(key, slot)}
                soft
                fourThree
                hideViewCaption
              />
              {isEditing ? (
                <label className="mt-4 block min-w-0">
                  <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                    图片 {String(index + 1).padStart(2, "0")} / 描述
                  </span>
                  <textarea
                    className="block min-h-28 w-full min-w-0 resize-y rounded-[6px] border border-electricBlue/35 bg-deepIndigo/44 px-3 py-2.5 text-base leading-[1.6] text-softWhite/76 outline-none transition focus:border-acidGreen/60"
                    value={block.imageDescriptions[key] ?? ""}
                    onChange={(event) => update("imageDescriptions", {
                      ...block.imageDescriptions,
                      [key]: event.target.value,
                    })}
                  />
                </label>
              ) : (
                <p className="mt-4 text-base leading-[1.6] text-softWhite/64">
                  {block.imageDescriptions[key]}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === "sixImageShowcase") {
    const imageKeys = ["image01", "image02", "image03", "image04", "image05", "image06"] as const;
    return (
      <div className="grid min-w-0 gap-7 md:grid-cols-2 md:gap-8">
        {imageKeys.map((key, index) => (
          <article
            key={key}
            className="min-w-0 rounded-[20px] bg-[#151B4D]/42 p-3 pb-5 shadow-[0_16px_38px_rgba(3,5,26,0.16),inset_0_1px_0_rgba(244,245,250,0.05)] md:p-4 md:pb-6"
          >
            <EvidenceImageSlot
              slotId={`${block.id}:${key}`}
              meta={{
                label: block.imageCaptions[key] || `风格探索图 ${String(index + 1).padStart(2, "0")}`,
                suggestion: "上传风格探索、组件规则或页面应用图片",
              }}
              slot={block.imageSlots[key] ?? { publicPath: "" }}
              isEditing={isEditing}
              onChange={(_, slot) => updateSlot(key, slot)}
              soft
              sixteenTen
              hideViewCaption
            />
            {isEditing ? (
              <div className="mt-4 grid min-w-0 gap-4 px-1">
                <label className="block min-w-0">
                  <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-acidGreen/68">
                    图片 {String(index + 1).padStart(2, "0")} / 小标题
                  </span>
                  <input
                    className="w-full min-w-0 border-b border-electricBlue/40 bg-transparent pb-2 text-base font-semibold leading-6 text-softWhite outline-none focus:border-acidGreen"
                    value={block.imageCaptions[key] ?? ""}
                    onChange={(event) => update("imageCaptions", {
                      ...block.imageCaptions,
                      [key]: event.target.value,
                    })}
                  />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                    图片 {String(index + 1).padStart(2, "0")} / 说明
                  </span>
                  <textarea
                    className="block min-h-28 w-full min-w-0 resize-y rounded-[6px] border border-electricBlue/35 bg-deepIndigo/44 px-3 py-2.5 text-base leading-[1.65] text-softWhite/76 outline-none transition focus:border-acidGreen/60"
                    value={block.imageDescriptions[key] ?? ""}
                    onChange={(event) => update("imageDescriptions", {
                      ...block.imageDescriptions,
                      [key]: event.target.value,
                    })}
                  />
                </label>
              </div>
            ) : (
              <div className="px-2 pt-4">
                <p className="font-mono text-xs font-bold tracking-[0.08em] text-acidGreen/72">
                  {block.imageCaptions[key]}
                </p>
                <p className="mt-2 text-base leading-[1.65] text-softWhite/64 md:text-[17px]">
                  {block.imageDescriptions[key]}
                </p>
              </div>
            )}
          </article>
        ))}
      </div>
    );
  }

  if (block.type === "threeImageEvidence") {
    const imageKeys = ["image01", "image02", "image03"] as const;
    return (
      <div className="min-w-0">
        <div className="grid min-w-0 gap-5 lg:grid-cols-3">
          {imageKeys.map((key, index) => (
            <article
              key={key}
              className="min-w-0 rounded-[20px] bg-[#151B4D]/52 p-3 pb-4 shadow-[0_16px_38px_rgba(3,5,26,0.2),inset_0_1px_0_rgba(244,245,250,0.06)]"
            >
              <EvidenceImageSlot
                slotId={`${block.id}:${key}`}
                meta={{ label: threeImageEvidenceLabels[index], suggestion: "上传当前架构、层级或操作链路截图" }}
                slot={block.imageSlots[key] ?? { publicPath: "" }}
                isEditing={isEditing}
                onChange={(_, slot) => updateSlot(key, slot)}
                compact
                soft
                hideViewCaption
              />
              {isEditing ? (
                <label className="mt-4 block min-w-0 px-1">
                  <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                    {threeImageEvidenceLabels[index]}
                  </span>
                  <input
                    className="w-full min-w-0 border-b border-electricBlue/40 bg-transparent pb-2 text-sm leading-6 text-softWhite outline-none focus:border-acidGreen"
                    value={block.imageCaptions[key] ?? ""}
                    onChange={(event) => update("imageCaptions", { ...block.imageCaptions, [key]: event.target.value })}
                  />
                </label>
              ) : (
                <p className="px-2 pt-4 text-sm leading-6 text-softWhite/66">
                  {block.imageCaptions[key]}
                </p>
              )}
            </article>
          ))}
        </div>

        <div className="mb-7 mt-8 flex justify-center" aria-hidden="true">
          <span
            className="block h-6 w-8 bg-acidGreen/62 drop-shadow-[0_6px_12px_rgba(198,255,66,0.14)]"
            style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
          />
        </div>

        <article className="mx-auto w-full max-w-5xl rounded-[20px] bg-[#151B4D]/52 p-3 pb-4 shadow-[0_18px_44px_rgba(3,5,26,0.22),inset_0_1px_0_rgba(244,245,250,0.06)] md:p-4 md:pb-5">
          <EvidenceImageSlot
            slotId={`${block.id}:demo`}
            meta={{ label: "动态交互演示", suggestion: "上传 GIF 或动态交互演示图片" }}
            slot={block.imageSlots.demo ?? { publicPath: "" }}
            isEditing={isEditing}
            onChange={(_, slot) => updateSlot("demo", slot)}
            soft
            wide
            hideViewCaption
          />
          {isEditing ? (
            <div className="mt-4 grid min-w-0 gap-4 px-1">
              <label className="block min-w-0">
                <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                  动态演示标题
                </span>
                <input
                  className="w-full min-w-0 border-b border-electricBlue/40 bg-transparent pb-2 text-sm font-semibold leading-6 text-softWhite outline-none focus:border-acidGreen"
                  value={block.imageCaptions.demo ?? ""}
                  onChange={(event) => update("imageCaptions", { ...block.imageCaptions, demo: event.target.value })}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">
                  动态演示描述
                </span>
                <input
                  className="w-full min-w-0 border-b border-electricBlue/40 bg-transparent pb-2 text-sm leading-6 text-softWhite/76 outline-none focus:border-acidGreen"
                  value={block.imageDescriptions?.demo ?? dynamicDemoDescription}
                  onChange={(event) => update("imageDescriptions", { ...(block.imageDescriptions ?? {}), demo: event.target.value })}
                />
              </label>
            </div>
          ) : (
            <div className="px-2 pt-4 text-center">
              <p className="text-sm font-semibold leading-6 text-softWhite/72">{block.imageCaptions.demo}</p>
              <p className="mx-auto mt-1 max-w-3xl text-sm leading-6 text-softWhite/52">
                {block.imageDescriptions?.demo ?? dynamicDemoDescription}
              </p>
            </div>
          )}
        </article>
      </div>
    );
  }

  if (block.type === "decisionMatrix") {
    const matrixRows = block.matrixRows ?? [];
    const updateMatrixRow = (rowIndex: number, field: keyof Omit<DecisionMatrixRow, "id">, value: string) => {
      update("matrixRows", matrixRows.map((row, index) => index === rowIndex ? { ...row, [field]: value } : row));
    };
    const addMatrixRow = () => {
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `matrix-row-${crypto.randomUUID()}`
        : `matrix-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      update("matrixRows", [...matrixRows, { id, content: "新类型", decision: "待判断", treatment: "", reason: "" }]);
    };

    return (
      <div className="min-w-0">
        {isEditing ? (
          <BlockHeadingEditor block={block} onChange={onChange} />
        ) : (
          <h3 className="text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite">
            {block.title}
          </h3>
        )}
        <div className="mx-4 mt-7 overflow-x-auto rounded-[20px] bg-[#151B4D]/58 shadow-[0_18px_46px_rgba(3,5,26,0.22),inset_0_1px_0_rgba(244,245,250,0.06)] sm:mx-6 lg:mx-10">
          <table className="w-full min-w-[960px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[30%]" />
              <col className="w-[30%]" />
            </colgroup>
            <thead>
              <tr className="bg-deepIndigo/34">
                {(["类型", "处理策略", "具体范围", "判断原因"] as const).map((heading) => (
                  <th key={heading} className="px-5 py-4 font-mono text-xs font-bold tracking-[0.07em] text-[#9FAAD2]">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row, rowIndex) => (
                <tr key={row.id} className="border-t border-softWhite/10 align-top">
                  <td className="px-5 py-5">
                    {isEditing ? (
                      <div className="flex items-start gap-2">
                        <textarea
                          className="min-h-20 w-full min-w-0 resize-y bg-transparent text-sm font-semibold leading-6 text-softWhite outline-none focus:text-acidGreen"
                          value={row.content}
                          aria-label={`第 ${rowIndex + 1} 行类型`}
                          onChange={(event) => updateMatrixRow(rowIndex, "content", event.target.value)}
                        />
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-softWhite/30 transition hover:bg-peach/10 hover:text-peach"
                          aria-label={`删除第 ${rowIndex + 1} 行`}
                          onClick={() => update("matrixRows", matrixRows.filter((_, index) => index !== rowIndex))}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold leading-6 text-softWhite/82">{row.content}</p>
                    )}
                  </td>
                  <td className="px-5 py-5">
                    {isEditing ? (
                      <textarea
                        className="min-h-20 w-full min-w-0 resize-y rounded-[8px] bg-acidGreen/10 px-3 py-2 text-sm font-semibold leading-6 text-acidGreen/82 outline-none focus:bg-acidGreen/15"
                        value={row.decision}
                        aria-label={`第 ${rowIndex + 1} 行处理策略`}
                        onChange={(event) => updateMatrixRow(rowIndex, "decision", event.target.value)}
                      />
                    ) : (
                      <span className="inline-flex rounded-full bg-acidGreen/10 px-3 py-1.5 text-sm font-semibold leading-5 text-acidGreen/78">
                        {row.decision}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-5">
                    {isEditing ? (
                      <textarea
                        className="min-h-20 w-full min-w-0 resize-y bg-transparent text-sm leading-6 text-softWhite/74 outline-none focus:text-softWhite"
                        value={row.treatment}
                        aria-label={`第 ${rowIndex + 1} 行具体范围`}
                        onChange={(event) => updateMatrixRow(rowIndex, "treatment", event.target.value)}
                      />
                    ) : (
                      <p className="text-sm leading-6 text-softWhite/68">{row.treatment}</p>
                    )}
                  </td>
                  <td className="px-5 py-5">
                    {isEditing ? (
                      <textarea
                        className="min-h-20 w-full min-w-0 resize-y bg-transparent text-sm leading-6 text-softWhite/64 outline-none focus:text-softWhite"
                        value={row.reason}
                        aria-label={`第 ${rowIndex + 1} 行判断原因`}
                        onChange={(event) => updateMatrixRow(rowIndex, "reason", event.target.value)}
                      />
                    ) : (
                      <p className="text-sm leading-6 text-softWhite/58">{row.reason}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isEditing ? (
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-archiveBlue/40 px-4 py-2 text-sm font-semibold text-softWhite/68 transition hover:bg-archiveBlue/64 hover:text-softWhite"
            onClick={addMatrixRow}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            添加判断行
          </button>
        ) : null}
      </div>
    );
  }

  if (block.type === "imageEvidencePair") {
    return (
      <div className="min-w-0">
        {isEditing ? <BlockHeadingEditor block={block} onChange={onChange} /> : <BlockHeading label={block.label} title={block.title} />}
        <div className="mt-6 grid min-w-0 gap-4 md:grid-cols-2">
          {(["left", "right"] as const).map((key, index) => (
            <div key={key} className="min-w-0">
              <EvidenceImageSlot
                slotId={`${block.id}:${key}`}
                meta={{ label: block.imageCaptions[key] || `证据图片 ${String(index + 1).padStart(2, "0")}`, suggestion: "上传过程图、界面截图或分析证据" }}
                slot={block.imageSlots[key] ?? { publicPath: "" }}
                isEditing={isEditing}
                onChange={(_, slot) => updateSlot(key, slot)}
                compact
              />
              {isEditing ? (
                <label className="mt-3 block min-w-0">
                  <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">图片标题 / 说明</span>
                  <input
                    className="w-full min-w-0 border-b border-electricBlue/40 bg-transparent pb-2 text-sm text-softWhite outline-none focus:border-acidGreen"
                    value={block.imageCaptions[key] ?? ""}
                    onChange={(event) => update("imageCaptions", { ...block.imageCaptions, [key]: event.target.value })}
                  />
                </label>
              ) : block.imageCaptions[key] ? (
                <p className="mt-3 text-sm leading-6 text-softWhite/54">{block.imageCaptions[key]}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (block.type === "beforeAfter") {
    return (
      <div className="min-w-0">
        {isEditing ? <BlockHeadingEditor block={block} onChange={onChange} /> : <BlockHeading label={block.label} title={block.title} />}
        <div className="mt-6 grid min-w-0 gap-6 md:grid-cols-2">
          {(["before", "after"] as const).map((key) => {
            const copy = block[key];
            return (
              <div key={key} className="min-w-0">
                <EvidenceImageSlot
                  slotId={`${block.id}:${key}`}
                  meta={{ label: key === "before" ? "调整前" : "调整后", suggestion: "上传对应的对比图片" }}
                  slot={block.imageSlots[key] ?? { publicPath: "" }}
                  isEditing={isEditing}
                  onChange={(_, slot) => updateSlot(key, slot)}
                  compact
                />
                {isEditing ? (
                  <div className="mt-4 grid gap-3">
                    <input
                      className="w-full min-w-0 border-b border-electricBlue/45 bg-transparent pb-2 font-display text-xl text-softWhite outline-none focus:border-acidGreen"
                      value={copy.title}
                      onChange={(event) => update(key, { ...copy, title: event.target.value })}
                    />
                    <textarea
                      className="min-h-28 w-full min-w-0 resize-y rounded-[6px] border border-softWhite/10 bg-deepIndigo/48 px-3 py-3 text-sm leading-6 text-softWhite outline-none focus:border-acidGreen/60"
                      value={copy.body}
                      onChange={(event) => update(key, { ...copy, body: event.target.value })}
                    />
                  </div>
                ) : (
                  <div className="mt-4">
                    <h4 className="font-display text-xl text-softWhite">{copy.title}</h4>
                    {copy.body ? <p className="mt-2 whitespace-pre-line text-base leading-7 text-softWhite/66">{copy.body}</p> : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(12rem,0.62fr)_minmax(0,1.38fr)] lg:gap-14">
      {isEditing ? <BlockHeadingEditor block={block} onChange={onChange} /> : <BlockHeading label={block.label} title={block.title} />}
      <EditableText
        isEditing={isEditing}
        label="正文说明"
        value={block.body}
        onChange={(body) => update("body", body)}
        className="text-[clamp(1.05rem,1.15vw,1.25rem)] leading-[1.75] text-softWhite/70"
        minRows={8}
      />
    </div>
  );
}

function BlockHeading({ label, title }: { label: string; title: string }) {
  return (
    <div className="min-w-0">
      {label ? <p className="font-mono text-xs font-bold tracking-[0.1em] text-[#9FAAD2]">{label}</p> : null}
      {title ? <h3 className="mt-2 break-words font-display text-[clamp(1.65rem,2.8vw,2.8rem)] leading-[1.15] text-softWhite">{title}</h3> : null}
    </div>
  );
}

function BlockHeadingEditor({ block, onChange }: { block: ContentBlockDraft; onChange: (block: ContentBlockDraft) => void }) {
  return (
    <div className="grid min-w-0 gap-3">
      <label className="block min-w-0">
        <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">小标签</span>
        <input
          className="w-full min-w-0 border-b border-electricBlue/40 bg-transparent pb-2 font-mono text-xs tracking-[0.08em] text-[#9FAAD2] outline-none focus:border-acidGreen"
          value={block.label}
          onChange={(event) => onChange({ ...block, label: event.target.value })}
        />
      </label>
      <label className="block min-w-0">
        <span className="mb-1.5 block font-mono text-xs font-bold tracking-[0.06em] text-softWhite/42">内容块标题</span>
        <input
          className="w-full min-w-0 border-b border-electricBlue/45 bg-transparent pb-2 font-display text-[clamp(1.65rem,2.8vw,2.8rem)] leading-[1.15] text-softWhite outline-none focus:border-acidGreen"
          value={block.title}
          onChange={(event) => onChange({ ...block, title: event.target.value })}
        />
      </label>
    </div>
  );
}

function FindingCardGrid({ label, value, isEditing, onChange }: { label: string; value: string; isEditing: boolean; onChange: (value: string) => void }) {
  const items = value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  return (
    <div className="mt-8">
      <p className="font-mono text-sm font-bold tracking-[0.08em] text-softWhite/42">{label}</p>
      {isEditing ? (
        <EditableText isEditing label={`${label} / one per line`} value={value} onChange={onChange} className="" editClassName="mt-3" minRows={6} />
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item, index) => <div key={`${index}-${item}`} className="min-w-0 border-t border-acidGreen/55 bg-archiveBlue/18 px-4 py-5 text-base font-semibold leading-7 text-softWhite/76"><span className="mr-3 font-mono text-xs text-acidGreen">{String(index + 1).padStart(2, "0")}</span>{item}</div>)}
        </div>
      )}
    </div>
  );
}

function ThinkingMap({
  thinkingMap,
  isEditing,
  onChange,
}: {
  thinkingMap: ThinkingMapDraft;
  isEditing: boolean;
  onChange: (thinkingMap: ThinkingMapDraft) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number } | null>(null);

  const updateHeader = (field: "eyebrow" | "heading" | "description", value: string) => {
    onChange({
      ...thinkingMap,
      [field]: value,
    });
  };

  const updateNode = (id: ThinkingMapNodeId, updater: (node: ThinkingMapNode) => ThinkingMapNode) => {
    onChange({
      ...thinkingMap,
      nodes: thinkingMap.nodes.map((node) => (node.id === id ? updater(node) : node)),
    });
  };

  const isEditableTarget = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest("input, textarea, button, a, label, [contenteditable='true']"));

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || isEditableTarget(event.target)) return;

    const viewport = scrollRef.current;
    if (!viewport) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: viewport.scrollLeft,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-dragging");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = scrollRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
  };

  const stopPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = scrollRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;

    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    viewport.classList.remove("is-dragging");
    dragRef.current = null;
  };

  return (
    <section className="bg-[#121239] px-4 py-14 md:px-6 md:py-18">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            {isEditing ? (
              <MapEditField label="Map eyebrow">
                <input
                  className="w-full bg-transparent font-mono text-sm font-bold uppercase tracking-[0.12em] text-acidGreen outline-none"
                  value={thinkingMap.eyebrow}
                  onChange={(event) => updateHeader("eyebrow", event.target.value)}
                />
              </MapEditField>
            ) : (
              <p className="font-mono text-sm font-bold uppercase tracking-[0.12em] text-acidGreen/80">
                {thinkingMap.eyebrow}
              </p>
            )}
            {isEditing ? (
              <MapEditField className="mt-3 max-w-3xl" label="Map heading">
                <textarea
                  className="block w-full resize-none overflow-hidden bg-transparent font-display text-4xl leading-tight text-softWhite outline-none md:text-6xl"
                  rows={Math.max(2, thinkingMap.heading.split("\n").length)}
                  value={thinkingMap.heading}
                  onChange={(event) => updateHeader("heading", event.target.value)}
                />
              </MapEditField>
            ) : (
              <h2 className="mt-3 max-w-3xl whitespace-pre-line font-display text-4xl leading-tight md:text-6xl">
                {thinkingMap.heading}
              </h2>
            )}
          </div>
          {isEditing ? (
            <MapEditField className="max-w-md" label="Map description">
              <textarea
                className="block w-full resize-none overflow-hidden bg-transparent text-base leading-7 text-softWhite outline-none"
                rows={Math.max(4, thinkingMap.description.split("\n").length + 1)}
                value={thinkingMap.description}
                onChange={(event) => updateHeader("description", event.target.value)}
              />
            </MapEditField>
          ) : (
            <p className="max-w-md whitespace-pre-line text-base leading-7 text-softWhite/58">
              {thinkingMap.description}
            </p>
          )}
        </div>

        <div
          ref={scrollRef}
          data-testid="thinking-map-scroll"
          className="thinking-map-scroll hidden cursor-grab touch-auto overflow-x-auto pb-2 [&.is-dragging]:cursor-grabbing [&.is-dragging]:select-none lg:block"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPointerDrag}
          onPointerCancel={stopPointerDrag}
        >
          <div className="grid w-max grid-flow-col items-stretch gap-3 [grid-auto-columns:212px] xl:[grid-auto-columns:216px]">
            {thinkingMap.nodes.map((node, index) => (
              <div key={node.id} className="relative">
                {index < thinkingMap.nodes.length - 1 ? (
                  <div className={`absolute left-[calc(100%-6px)] top-1/2 h-px w-5 ${node.emphasis === "accent" ? "bg-acidGreen/75" : "bg-softWhite/18"}`} />
                ) : null}
                <ThinkingMapNodeCard node={node} isEditing={isEditing} onChange={(updater) => updateNode(node.id, updater)} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:hidden">
          {thinkingMap.nodes.map((node, index) => (
            <div key={node.id} className="grid grid-cols-[32px_1fr] gap-3">
              <div className="flex flex-col items-center">
                <span className={`grid h-8 w-8 place-items-center rounded-full border font-mono text-xs font-bold ${node.emphasis === "accent" ? "border-acidGreen bg-acidGreen text-deepIndigo" : "border-softWhite/16 text-softWhite/52"}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                {index < thinkingMap.nodes.length - 1 ? <span className="min-h-8 flex-1 border-l border-softWhite/14" /> : null}
              </div>
              <ThinkingMapNodeCard node={node} isEditing={isEditing} onChange={(updater) => updateNode(node.id, updater)} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MapEditField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block rounded-[6px] border border-electricBlue/42 bg-archiveBlue/20 px-3 py-2 ${className}`}>
      <span className="mb-1.5 block font-mono text-xs font-bold uppercase tracking-[0.1em] text-acidGreen/70">
        {label}
      </span>
      {children}
    </label>
  );
}

function ThinkingMapNodeCard({
  node,
  isEditing,
  onChange,
}: {
  node: ThinkingMapNode;
  isEditing: boolean;
  onChange: (updater: (node: ThinkingMapNode) => ThinkingMapNode) => void;
}) {
  const accent = node.emphasis === "accent";
  const cardClass = `h-full rounded-[8px] border p-4 ${
    accent ? "border-acidGreen/55 bg-acidGreen/8" : "border-softWhite/12 bg-archiveBlue/22"
  }`;

  if (!isEditing) {
    return (
      <div className={cardClass} data-thinking-map-node={node.id}>
        <p className={`font-mono text-xs font-bold uppercase tracking-[0.1em] ${accent ? "text-acidGreen" : "text-softWhite/40"}`}>
          {node.label}
        </p>
        <ThinkingMapNodeBody node={node} />
      </div>
    );
  }

  const updateExploration = (field: "primary" | "secondary", value: string) => {
    onChange((current) => ({
      ...current,
      exploration: {
        primary: current.exploration?.primary ?? "",
        secondary: current.exploration?.secondary ?? "",
        [field]: value,
      },
    }));
  };

  const updateBoundary = (
    field: "keepHeading" | "keepItems" | "changeHeading" | "changeItems",
    value: string,
  ) => {
    onChange((current) => ({
      ...current,
      designBoundary: {
        keepHeading: current.designBoundary?.keepHeading ?? "",
        keepItems: current.designBoundary?.keepItems ?? "",
        changeHeading: current.designBoundary?.changeHeading ?? "",
        changeItems: current.designBoundary?.changeItems ?? "",
        [field]: value,
      },
    }));
  };

  return (
    <div className={cardClass} data-thinking-map-node={node.id}>
      <MapEditField label="Label">
        <input
          aria-label={`${node.label} label`}
          className={`w-full bg-transparent font-mono text-xs font-bold uppercase tracking-[0.08em] outline-none ${accent ? "text-acidGreen" : "text-softWhite/72"}`}
          value={node.label}
          onChange={(event) => onChange((current) => ({ ...current, label: event.target.value }))}
        />
      </MapEditField>

      {node.exploration ? (
        <div className="mt-3 grid gap-2">
          <MapEditField label="Primary">
            <textarea
              aria-label={`${node.label} primary`}
              className="block w-full resize-none overflow-hidden bg-transparent text-base leading-6 text-softWhite outline-none"
              rows={Math.max(3, node.exploration.primary.split("\n").length + 1)}
              value={node.exploration.primary}
              onChange={(event) => updateExploration("primary", event.target.value)}
            />
          </MapEditField>
          <span className="text-center font-mono text-sm font-bold text-acidGreen">+</span>
          <MapEditField label="Secondary">
            <textarea
              aria-label={`${node.label} secondary`}
              className="block w-full resize-none overflow-hidden bg-transparent text-base leading-6 text-softWhite outline-none"
              rows={Math.max(3, node.exploration.secondary.split("\n").length + 1)}
              value={node.exploration.secondary}
              onChange={(event) => updateExploration("secondary", event.target.value)}
            />
          </MapEditField>
        </div>
      ) : node.designBoundary ? (
        <div className="mt-3 grid gap-2">
          <MapEditField label="Keep heading">
            <input
              aria-label={`${node.label} keep heading`}
              className="w-full bg-transparent font-mono text-xs font-bold uppercase text-softWhite outline-none"
              value={node.designBoundary.keepHeading}
              onChange={(event) => updateBoundary("keepHeading", event.target.value)}
            />
          </MapEditField>
          <MapEditField label="Keep items / one per line">
            <textarea
              aria-label={`${node.label} keep items`}
              className="block w-full resize-none overflow-hidden bg-transparent text-sm leading-6 text-softWhite outline-none"
              rows={Math.max(5, node.designBoundary.keepItems.split("\n").length + 1)}
              value={node.designBoundary.keepItems}
              onChange={(event) => updateBoundary("keepItems", event.target.value)}
            />
          </MapEditField>
          <MapEditField label="Change heading">
            <input
              aria-label={`${node.label} change heading`}
              className="w-full bg-transparent font-mono text-xs font-bold uppercase text-acidGreen outline-none"
              value={node.designBoundary.changeHeading}
              onChange={(event) => updateBoundary("changeHeading", event.target.value)}
            />
          </MapEditField>
          <MapEditField label="Change items / one per line">
            <textarea
              aria-label={`${node.label} change items`}
              className="block w-full resize-none overflow-hidden bg-transparent text-sm leading-6 text-softWhite outline-none"
              rows={Math.max(6, node.designBoundary.changeItems.split("\n").length + 1)}
              value={node.designBoundary.changeItems}
              onChange={(event) => updateBoundary("changeItems", event.target.value)}
            />
          </MapEditField>
        </div>
      ) : (
        <MapEditField className="mt-3" label="Body">
          <textarea
            aria-label={`${node.label} body`}
            className="block w-full resize-none overflow-hidden bg-transparent text-base font-semibold leading-7 text-softWhite outline-none"
            rows={Math.max(5, node.body.split("\n").length + 1)}
            value={node.body}
            onChange={(event) => onChange((current) => ({ ...current, body: event.target.value }))}
          />
        </MapEditField>
      )}
    </div>
  );
}

function ThinkingMapNodeBody({ node }: { node: ThinkingMapNode }) {
  if (node.exploration) {
    return (
      <div className="mt-4 text-base font-semibold leading-7 text-softWhite/78">
        <p className="whitespace-pre-line">{node.exploration.primary}</p>
        <p className="my-2 font-mono text-acidGreen">+</p>
        <p className="whitespace-pre-line">{node.exploration.secondary}</p>
      </div>
    );
  }

  if (node.designBoundary) {
    return (
      <div className="mt-4 text-sm leading-6 text-softWhite/74">
        <p className="font-mono font-bold text-softWhite">{node.designBoundary.keepHeading}</p>
        {node.designBoundary.keepItems.split(/\n/).filter((item) => item.trim()).map((item, index) => <p key={`${index}-${item}`}>{item}</p>)}
        <p className="mt-3 font-mono font-bold text-acidGreen">{node.designBoundary.changeHeading}</p>
        {node.designBoundary.changeItems.split(/\n/).filter((item) => item.trim()).map((item, index) => <p key={`${index}-${item}`}>{item}</p>)}
      </div>
    );
  }

  return <p className="mt-4 whitespace-pre-line text-base font-semibold leading-7 text-softWhite/78">{node.body}</p>;
}

function CaseContent({
  draft,
  isEditing,
  onSectionChange,
  onBoundaryListChange,
  onImageSlotChange,
}: {
  draft: CrossPlatformDraft;
  isEditing: boolean;
  onSectionChange: (key: SectionKey, value: string) => void;
  onBoundaryListChange: (key: BoundaryListKey, value: string) => void;
  onImageSlotChange: (key: ImageSlotKey, value: DraftImageSlot) => void;
}) {
  return (
    <section className="bg-deepIndigo px-4 py-16 md:px-6 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-16">
        <EditableSection sectionKey="projectIntro" draft={draft} isEditing={isEditing} onSectionChange={onSectionChange} />
        <EditableSection sectionKey="projectContext" draft={draft} isEditing={isEditing} onSectionChange={onSectionChange} />
        <ImageSlot slotKey="portraitApproach" slot={draft.imageSlots.portraitApproach} isEditing={isEditing} onChange={onImageSlotChange} />
        <EditableSection sectionKey="openQuestion" draft={draft} isEditing={isEditing} onSectionChange={onSectionChange} statement />
        <EditableSection sectionKey="myEntryPoint" draft={draft} isEditing={isEditing} onSectionChange={onSectionChange} />
        <ImageSlot slotKey="miniProgramReferences" slot={draft.imageSlots.miniProgramReferences} isEditing={isEditing} onChange={onImageSlotChange} />
        <EditableSection sectionKey="exploration" draft={draft} isEditing={isEditing} onSectionChange={onSectionChange} />
        <DesignBoundarySection draft={draft} isEditing={isEditing} onSectionChange={onSectionChange} onBoundaryListChange={onBoundaryListChange} />
        <ImageSlot slotKey="keepChangeEvidence" slot={draft.imageSlots.keepChangeEvidence} isEditing={isEditing} onChange={onImageSlotChange} />
        <EditableSection sectionKey="iteration" draft={draft} isEditing={isEditing} onSectionChange={onSectionChange} />
        <div className="grid gap-4 lg:grid-cols-3">
          <ImageSlot slotKey="directionV1" slot={draft.imageSlots.directionV1} isEditing={isEditing} onChange={onImageSlotChange} compact />
          <ImageSlot slotKey="directionV2" slot={draft.imageSlots.directionV2} isEditing={isEditing} onChange={onImageSlotChange} compact />
          <ImageSlot slotKey="directionV3" slot={draft.imageSlots.directionV3} isEditing={isEditing} onChange={onImageSlotChange} compact />
        </div>
        <EditableSection sectionKey="application" draft={draft} isEditing={isEditing} onSectionChange={onSectionChange} />
        <ImageSlot slotKey="retainedSystemApplication" slot={draft.imageSlots.retainedSystemApplication} isEditing={isEditing} onChange={onImageSlotChange} />
        <ImageSlot slotKey="beforeAfterDetail" slot={draft.imageSlots.beforeAfterDetail} isEditing={isEditing} onChange={onImageSlotChange} />
        <EditableSection sectionKey="reflection" draft={draft} isEditing={isEditing} onSectionChange={onSectionChange} statement />
      </div>
    </section>
  );
}

function EditableSection({
  sectionKey,
  draft,
  isEditing,
  onSectionChange,
  statement = false,
}: {
  sectionKey: SectionKey;
  draft: CrossPlatformDraft;
  isEditing: boolean;
  onSectionChange: (key: SectionKey, value: string) => void;
  statement?: boolean;
}) {
  const meta = sectionMeta[sectionKey];

  return (
    <section className="grid gap-8 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.6fr)] xl:gap-x-[clamp(4rem,6vw,6rem)]">
      <div className="min-w-0">
        <p className="font-mono text-sm font-bold uppercase tracking-[0.12em] text-acidGreen/84">{meta.eyebrow}</p>
        <h2 className="mt-3 max-w-full break-words font-display text-[clamp(2.25rem,4vw,4rem)] leading-[1.1] text-softWhite">
          {meta.title}
        </h2>
      </div>
      <div className="min-w-0 max-w-[52rem]">
        <EditableText
          isEditing={isEditing}
          label={meta.title}
          value={draft.sections[sectionKey]}
          onChange={(value) => onSectionChange(sectionKey, value)}
          className={statement ? "font-display text-4xl leading-[1.15] text-softWhite/88 md:text-5xl" : "text-[clamp(1.05rem,1.15vw,1.25rem)] leading-[1.75] text-softWhite/72"}
          editClassName="min-h-64"
          minRows={statement ? 8 : 10}
        />
      </div>
    </section>
  );
}

function DesignBoundarySection({
  draft,
  isEditing,
  onSectionChange,
  onBoundaryListChange,
}: {
  draft: CrossPlatformDraft;
  isEditing: boolean;
  onSectionChange: (key: SectionKey, value: string) => void;
  onBoundaryListChange: (key: BoundaryListKey, value: string) => void;
}) {
  return (
    <section className="grid gap-8 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.6fr)] xl:gap-x-[clamp(4rem,6vw,6rem)]">
      <div className="min-w-0">
        <p className="font-mono text-sm font-bold uppercase tracking-[0.12em] text-acidGreen/84">06</p>
        <h2 className="mt-3 max-w-full break-words font-display text-[clamp(2.25rem,4vw,4rem)] leading-[1.1] text-softWhite">
          Design Boundary
        </h2>
      </div>
      <div className="min-w-0 max-w-[52rem]">
        <EditableText
          isEditing={isEditing}
          label="Design Boundary"
          value={draft.sections.constraints}
          onChange={(value) => onSectionChange("constraints", value)}
          className="text-[clamp(1.05rem,1.15vw,1.25rem)] leading-[1.75] text-softWhite/72"
          editClassName="min-h-80"
          minRows={16}
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <BoundaryList
            title="Keep"
            value={draft.boundaryLists.keep}
            isEditing={isEditing}
            onChange={(value) => onBoundaryListChange("keep", value)}
          />
          <BoundaryList
            title="Change"
            value={draft.boundaryLists.change}
            isEditing={isEditing}
            onChange={(value) => onBoundaryListChange("change", value)}
            accent
          />
        </div>
      </div>
    </section>
  );
}

function BoundaryList({
  title,
  value,
  isEditing,
  onChange,
  accent = false,
}: {
  title: string;
  value: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  accent?: boolean;
}) {
  const items = value.split(/\n+/).map((item) => item.trim()).filter(Boolean);

  return (
    <div className={`rounded-[8px] border p-5 ${accent ? "border-acidGreen/38 bg-acidGreen/7" : "border-softWhite/12 bg-archiveBlue/22"}`}>
      <h3 className={`font-mono text-sm font-bold uppercase tracking-[0.1em] ${accent ? "text-acidGreen" : "text-softWhite/44"}`}>{title}</h3>
      {isEditing ? (
        <label className="mt-4 block rounded-[8px] border border-electricBlue/45 bg-deepIndigo/40 p-3">
          <span className="mb-2 block font-mono text-xs font-bold uppercase tracking-[0.1em] text-acidGreen/80">
            Editable
          </span>
          <textarea
            className="block w-full resize-none overflow-hidden rounded-[6px] border border-softWhite/10 bg-deepIndigo/58 px-3 py-3 text-base leading-7 text-softWhite outline-none transition focus:border-acidGreen/60"
            rows={Math.max(6, value.split("\n").length + 1)}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      ) : (
        <ul className="mt-4 grid gap-3">
          {items.map((item) => (
            <li key={item} className="flex gap-3 text-base leading-7 text-softWhite/70">
              <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${accent ? "bg-acidGreen" : "bg-softWhite/34"}`} />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditableText({
  isEditing,
  label,
  value,
  onChange,
  className,
  editClassName = "",
  textareaClassName = "text-[clamp(1.05rem,1.15vw,1.25rem)] leading-[1.75]",
  minRows = 8,
}: {
  isEditing: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  className: string;
  editClassName?: string;
  textareaClassName?: string;
  minRows?: number;
}) {
  if (isEditing) {
    return (
      <label className={`block w-full min-w-0 rounded-[8px] border border-electricBlue/50 bg-archiveBlue/24 p-3 shadow-[0_0_0_1px_rgba(42,67,199,0.12)] ${editClassName}`}>
        <span className="mb-2 block font-mono text-xs font-bold uppercase tracking-[0.1em] text-acidGreen/80">
          Editable
          <span className="text-softWhite/34"> / {label}</span>
        </span>
        <textarea
          className={`block min-h-full w-full min-w-0 resize-none overflow-hidden rounded-[6px] border border-softWhite/10 bg-deepIndigo/58 px-3 py-3 text-softWhite outline-none transition placeholder:text-softWhite/28 focus:border-acidGreen/60 ${textareaClassName}`}
          rows={Math.max(minRows, value.split("\n").length + 2)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <div className={className}>
      {paragraphLines(value).map((paragraph) => (
        <p key={paragraph} className="mb-5 last:mb-0">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function EditableTitle({
  isEditing,
  value,
  onChange,
}: {
  isEditing: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  if (isEditing) {
    return (
      <label className="mt-5 block max-w-5xl rounded-[8px] border border-electricBlue/50 bg-archiveBlue/24 p-3 shadow-[0_0_0_1px_rgba(42,67,199,0.12)]">
        <span className="mb-2 block font-mono text-xs font-bold uppercase tracking-[0.1em] text-acidGreen/80">
          Editable
          <span className="text-softWhite/34"> / Project title</span>
        </span>
        <textarea
          className={caseStudyLayout.heroTitleEditor}
          rows={Math.max(3, value.split("\n").length + 1)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <h1 className={caseStudyLayout.heroTitle}>
      {value}
    </h1>
  );
}

function EvidenceImageSlot({ slotId, meta, slot, isEditing, onChange, compact = false, soft = false, wide = false, fourThree = false, sixteenTen = false, hideViewCaption = false }: {
  slotId: string;
  meta: { label: string; suggestion: string };
  slot: DraftImageSlot;
  isEditing: boolean;
  onChange: (slotId: string, value: DraftImageSlot) => void;
  compact?: boolean;
  soft?: boolean;
  wide?: boolean;
  fourThree?: boolean;
  sixteenTen?: boolean;
  hideViewCaption?: boolean;
}) {
  return <ImageSlot slotKey={slotId} customMeta={meta} slot={slot} isEditing={isEditing} onChange={onChange} compact={compact} soft={soft} wide={wide} fourThree={fourThree} sixteenTen={sixteenTen} hideViewCaption={hideViewCaption} />;
}

function LegacyDraftBackup({ draft, onSectionChange, onBoundaryListChange, onImageSlotChange, onThinkingMapChange }: {
  draft: CrossPlatformDraft;
  onSectionChange: (key: SectionKey, value: string) => void;
  onBoundaryListChange: (key: BoundaryListKey, value: string) => void;
  onImageSlotChange: (key: ImageSlotKey, value: DraftImageSlot) => void;
  onThinkingMapChange: (value: ThinkingMapDraft) => void;
}) {
  return (
    <details className="rounded-[8px] border border-peach/30 bg-archiveBlue/16 p-4 md:p-6">
      <summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-[0.18em] text-peach">
        旧版草稿备份
      </summary>
      <p className="mt-3 max-w-2xl text-base leading-7 text-softWhite/54">
        使用中文模板前的文字会保存在这里，方便随时复制。当前图片路径与本地上传图片不会被中文模板替换。
      </p>
      {draft.legacyDraftBackup ? (
        <label className="mt-6 block">
          <span className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-softWhite/44">
            替换前文字快照 / {new Date(draft.legacyDraftBackup.createdAt).toLocaleString("zh-CN")}
          </span>
          <textarea
            readOnly
            className="mt-2 block min-h-80 w-full min-w-0 rounded-[6px] border border-softWhite/12 bg-deepIndigo/60 p-3 font-mono text-xs leading-5 text-softWhite/64 outline-none focus:border-acidGreen/60"
            value={JSON.stringify(draft.legacyDraftBackup, null, 2)}
          />
        </label>
      ) : (
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.1em] text-softWhite/38">
          尚未应用中文模板，因此没有替换前快照。
        </p>
      )}
      <p className="mt-10 font-mono text-xs font-bold uppercase tracking-[0.1em] text-softWhite/44">
        当前旧版结构字段
      </p>
      <div className="mt-10">
        <CaseContent draft={draft} isEditing onSectionChange={onSectionChange} onBoundaryListChange={onBoundaryListChange} onImageSlotChange={onImageSlotChange} />
      </div>
      <label className="mt-8 block">
        <span className="font-mono text-xs font-bold tracking-[0.06em] text-softWhite/44">当前思考路径 / JSON</span>
        <textarea
          className="mt-2 block min-h-64 w-full min-w-0 rounded-[6px] border border-softWhite/12 bg-deepIndigo/60 p-3 font-mono text-xs leading-5 text-softWhite/64 outline-none focus:border-acidGreen/60"
          value={JSON.stringify(draft.thinkingMap, null, 2)}
          onChange={(event) => {
            try { onThinkingMapChange(mergeThinkingMap(JSON.parse(event.target.value))); } catch { /* Keep the current backup until valid JSON is entered. */ }
          }}
        />
      </label>
    </details>
  );
}

function ImageSlot<T extends string>({
  slotKey,
  slot,
  isEditing,
  onChange,
  customMeta,
  compact = false,
  soft = false,
  wide = false,
  fourThree = false,
  sixteenTen = false,
  hideViewCaption = false,
}: {
  slotKey: T;
  slot: DraftImageSlot;
  isEditing: boolean;
  onChange: (key: T, value: DraftImageSlot) => void;
  customMeta?: { label: string; suggestion: string };
  compact?: boolean;
  soft?: boolean;
  wide?: boolean;
  fourThree?: boolean;
  sixteenTen?: boolean;
  hideViewCaption?: boolean;
}) {
  const meta = customMeta ?? imageSlotMeta[slotKey as ImageSlotKey];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [publicImageFailed, setPublicImageFailed] = useState(false);
  const [localImage, setLocalImage] = useState<{ url: string; record: DraftImageRecord } | null>(null);
  const [localLookupComplete, setLocalLookupComplete] = useState(!slot.localImageId);
  const [imageRevision, setImageRevision] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setPublicImageFailed(false);
  }, [slot.publicPath]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    setLocalImage(null);
    setLocalLookupComplete(!slot.localImageId);

    if (!slot.localImageId) {
      return undefined;
    }

    getDraftImage(slot.localImageId)
      .then((record) => {
        if (cancelled) return;

        if (record) {
          objectUrl = URL.createObjectURL(record.blob);
          setLocalImage({ url: objectUrl, record });
        }
        setLocalLookupComplete(true);
      })
      .catch(() => {
        if (!cancelled) {
          setLocalLookupComplete(true);
          setUploadError("The local image could not be read. The public path is being used instead.");
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [slot.localImageId, imageRevision]);

  const chooseImage = () => {
    setUploadError("");
    fileInputRef.current?.click();
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!ACCEPTED_DRAFT_IMAGE_TYPES.includes(file.type)) {
      setUploadError("Choose a PNG, JPEG, WebP, AVIF, or GIF image.");
      return;
    }

    if (file.size === 0) {
      setUploadError("This image file is empty.");
      return;
    }

    if (file.size > MAXIMUM_DRAFT_IMAGE_SIZE) {
      setUploadError("This image is larger than the 20 MB limit.");
      return;
    }

    const imageId = slot.localImageId || `cross-platform-game-ux:${slotKey}`;

    try {
      setIsUploading(true);
      setUploadError("");
      await putDraftImage({
        id: imageId,
        blob: file,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        updatedAt: new Date().toISOString(),
      });
      onChange(slotKey, { ...slot, localImageId: imageId });
      setImageRevision((current) => current + 1);
    } catch {
      setUploadError("The image could not be saved in this browser. Your existing image was not changed.");
    } finally {
      setIsUploading(false);
    }
  };

  const removeLocalImage = async () => {
    if (!slot.localImageId) return;

    try {
      setIsUploading(true);
      setUploadError("");
      await deleteDraftImage(slot.localImageId);
      onChange(slotKey, { publicPath: slot.publicPath });
      setImageRevision((current) => current + 1);
    } catch {
      setUploadError("The local image could not be removed. Your existing image was not changed.");
    } finally {
      setIsUploading(false);
    }
  };

  const localImageIsLoading = Boolean(slot.localImageId) && !localLookupComplete;
  const imageSource = localImage?.url || (!publicImageFailed ? slot.publicPath : "");
  const hasImage = Boolean(imageSource) && !localImageIsLoading;
  const frameClass = "case-study-media-frame";
  const frameContent = hasImage ? (
    <img
      src={imageSource}
      alt={meta.label}
      className="case-study-media-image"
      loading="lazy"
      onError={() => {
        if (localImage) {
          URL.revokeObjectURL(localImage.url);
          setLocalImage(null);
          setUploadError("The local image could not be displayed. The public path is being used instead.");
        } else {
          setPublicImageFailed(true);
        }
      }}
    />
  ) : (
    <span className="case-study-media-placeholder">Image slot</span>
  );

  return (
    <figure className="grid gap-3">
      {!isEditing && !hideViewCaption ? (
        <p className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-softWhite/58">{meta.label}</p>
      ) : null}
      {isEditing ? (
        <button
          type="button"
          data-testid={`image-slot-${slotKey}`}
          className={`group cursor-pointer text-softWhite outline-none transition focus-visible:border-acidGreen/60 ${frameClass}`}
          aria-label={`${localImage ? "Replace" : "Choose"} local image for ${meta.label}`}
          disabled={isUploading}
          onClick={chooseImage}
        >
          {frameContent}
        </button>
      ) : (
        <div className={frameClass}>{frameContent}</div>
      )}
      {isEditing ? (
        <figcaption className="rounded-[8px] border border-electricBlue/35 bg-archiveBlue/16 p-3">
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
            onChange={uploadImage}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-acidGreen/82">
                Local draft image
              </p>
              <p className="mt-1 text-[13px] leading-5 text-softWhite/46">
                {localImage ? `${localImage.record.fileName} / ${(localImage.record.size / 1024 / 1024).toFixed(1)} MB` : "Stored only in this browser"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-softWhite/16 bg-deepIndigo/44 px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-softWhite/72 transition hover:border-acidGreen/45 hover:text-acidGreen disabled:cursor-wait disabled:opacity-50"
                disabled={isUploading}
                onClick={chooseImage}
              >
                <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                {localImage || slot.localImageId ? "Replace local image" : "Choose image"}
              </button>
              {slot.localImageId ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-softWhite/12 px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-softWhite/48 transition hover:border-peach/45 hover:text-peach disabled:cursor-wait disabled:opacity-50"
                  disabled={isUploading}
                  onClick={removeLocalImage}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove local image
                </button>
              ) : null}
            </div>
          </div>
          <p className="mt-3 font-mono text-xs font-bold uppercase tracking-[0.1em] text-softWhite/42">
            Public asset path
          </p>
          <input
            className="mt-2 w-full rounded-[6px] border border-softWhite/10 bg-deepIndigo/52 px-3 py-2 font-mono text-sm text-softWhite outline-none transition placeholder:text-softWhite/28 focus:border-acidGreen/60"
            value={slot.publicPath}
            placeholder="/images/projects/cross-platform/research-01.webp"
            aria-label={`Public asset path for ${meta.label}`}
            onChange={(event) => onChange(slotKey, { ...slot, publicPath: event.target.value })}
          />
          <p className="mt-2 text-[13px] leading-5 text-softWhite/42">{meta.suggestion}</p>
          {uploadError ? (
            <p className="mt-2 text-[13px] leading-5 text-peach" role="status">
              {uploadError}
            </p>
          ) : null}
        </figcaption>
      ) : hideViewCaption ? null : <figcaption className="text-[13px] leading-5 text-softWhite/42">{meta.suggestion}</figcaption>}
    </figure>
  );
}
