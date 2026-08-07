import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ArrowLeft,
  FileUp,
  RotateCcw,
  Save,
} from "lucide-react";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { PageTransition } from "../components/PageTransition";
import {
  TemplatePreviewFrame,
  TemplateRenderBoundary,
} from "../components/template-tools/TemplatePreviewFrame";
import { TemplateDebugProvider } from "../components/template-tools/TemplateResponsiveFoundation";
import {
  getRegisteredTemplates,
  type TemplateFieldDefinition,
  type TemplateLayoutControlDefinition,
  type TemplateMeta,
  type TemplateContentValue,
  type TemplateProps,
} from "../lib/templateLibrary";
import {
  loadTemplateSource,
  parseLayoutControls,
  prepareTemplatePreview,
  saveTemplateSource,
  templateFilesById,
  updateLayoutControl,
} from "../lib/templateSourceClient";
import {
  importXMindDocument,
  type NormalizedXMindDocument,
} from "../lib/xmindImport";
import { optimizeUploadedImage } from "../lib/imageOptimization";
import {
  getTemplateHorizontalInset,
  setTemplateHorizontalInset,
} from "../lib/templateLayoutDefaults";
import {
  figmaPrototypeUrlErrorMessage,
  normalizeFigmaPrototypeUrl,
} from "../lib/figmaEmbed";

type TemplateModule = {
  default?: ComponentType<TemplateProps>;
  templateMeta?: TemplateMeta;
  layoutControlSchema?: TemplateLayoutControlDefinition[];
};

type FriendlyOption = {
  value: string;
  zh: string;
  en: string;
};

type FriendlyAdjustment = {
  key: string;
  zh: string;
  en: string;
  type: "slider" | "choice";
  options: FriendlyOption[];
};

type FriendlyAdjustmentSet = {
  defaults: Record<string, string>;
  fields: FriendlyAdjustment[];
};

const friendlyAdjustments: Record<string, FriendlyAdjustmentSet> = {
  "project-header": {
    defaults: {
      titleFontSize: "7.25rem",
      topSpacing: "4rem",
      bottomSpacing: "5rem",
      textAlignment: "left",
    },
    fields: [
      {
        key: "titleFontSize",
        zh: "标题大小",
        en: "Title size",
        type: "slider",
        options: [
          { value: "6.25rem", zh: "小", en: "Small" },
          { value: "7.25rem", zh: "标准", en: "Standard" },
          { value: "8rem", zh: "大", en: "Large" },
        ],
      },
      {
        key: "topSpacing",
        zh: "上方留白",
        en: "Space above",
        type: "choice",
        options: [
          { value: "2.5rem", zh: "少", en: "Less" },
          { value: "4rem", zh: "标准", en: "Standard" },
          { value: "6rem", zh: "多", en: "More" },
        ],
      },
      {
        key: "bottomSpacing",
        zh: "下方留白",
        en: "Space below",
        type: "choice",
        options: [
          { value: "3.5rem", zh: "少", en: "Less" },
          { value: "5rem", zh: "标准", en: "Standard" },
          { value: "7rem", zh: "多", en: "More" },
        ],
      },
      {
        key: "textAlignment",
        zh: "文字位置",
        en: "Text position",
        type: "choice",
        options: [
          { value: "left", zh: "左对齐", en: "Left" },
          { value: "center", zh: "居中", en: "Centered" },
        ],
      },
    ],
  },
  "statement-longform": {
    defaults: {
      bodyFontSize: "1.25rem",
      lineHeight: "1.75",
      headingSpacing: "2rem",
    },
    fields: [
      {
        key: "bodyFontSize",
        zh: "正文字号",
        en: "Body size",
        type: "choice",
        options: [
          { value: "1.05rem", zh: "小", en: "Small" },
          { value: "1.25rem", zh: "标准", en: "Standard" },
          { value: "1.4rem", zh: "大", en: "Large" },
        ],
      },
      {
        key: "lineHeight",
        zh: "行距",
        en: "Line spacing",
        type: "choice",
        options: [
          { value: "1.5", zh: "紧凑", en: "Compact" },
          { value: "1.75", zh: "舒适", en: "Comfortable" },
          { value: "2", zh: "宽松", en: "Relaxed" },
        ],
      },
      {
        key: "headingSpacing",
        zh: "标题与正文距离",
        en: "Heading distance",
        type: "choice",
        options: [
          { value: "1.5rem", zh: "近", en: "Near" },
          { value: "2rem", zh: "标准", en: "Standard" },
          { value: "3rem", zh: "远", en: "Far" },
        ],
      },
    ],
  },
  "xmind-breakdown": {
    defaults: {
      displayMode: "double",
    },
    fields: [
      {
        key: "displayMode",
        zh: "展示方式",
        en: "Display mode",
        type: "choice",
        options: [
          { value: "single", zh: "单一展示", en: "Single" },
          { value: "double", zh: "双排展示", en: "Double" },
        ],
      },
    ],
  },
  "supporting-note": {
    defaults: {
      bodyFontSize: "1.125rem",
      verticalSpacing: "2.5rem",
    },
    fields: [
      {
        key: "bodyFontSize",
        zh: "文字大小",
        en: "Text size",
        type: "choice",
        options: [
          { value: "1rem", zh: "小", en: "Small" },
          { value: "1.125rem", zh: "标准", en: "Standard" },
        ],
      },
      {
        key: "verticalSpacing",
        zh: "上下留白",
        en: "Vertical spacing",
        type: "choice",
        options: [
          { value: "1.5rem", zh: "紧凑", en: "Compact" },
          { value: "2.5rem", zh: "标准", en: "Standard" },
          { value: "4rem", zh: "宽松", en: "Relaxed" },
        ],
      },
    ],
  },
  "phase-milestones": {
    defaults: {
      emphasisMode: "custom",
      nodeSpacing: "standard",
      verticalSpacing: "standard",
    },
    fields: [
      {
        key: "emphasisMode",
        zh: "节点强调方式",
        en: "Node emphasis",
        type: "choice",
        options: [
          {
            value: "custom",
            zh: "自定义每个节点",
            en: "Custom per node",
          },
          {
            value: "second-half",
            zh: "前半部分普通、后半部分强调",
            en: "First half outline, second half active",
          },
        ],
      },
      {
        key: "nodeSpacing",
        zh: "节点间距",
        en: "Node spacing",
        type: "choice",
        options: [
          { value: "compact", zh: "紧凑", en: "Compact" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "wide", zh: "宽松", en: "Wide" },
        ],
      },
      {
        key: "verticalSpacing",
        zh: "上下留白",
        en: "Vertical spacing",
        type: "choice",
        options: [
          { value: "compact", zh: "紧凑", en: "Compact" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "wide", zh: "宽松", en: "Wide" },
        ],
      },
    ],
  },
  "circle-summary": {
    defaults: {
      circleSize: "standard",
      circleSpacing: "standard",
      verticalSpacing: "standard",
    },
    fields: [
      {
        key: "circleSize",
        zh: "圆形大小",
        en: "Circle size",
        type: "choice",
        options: [
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "smaller", zh: "稍小", en: "Slightly smaller" },
        ],
      },
      {
        key: "circleSpacing",
        zh: "圆形间距",
        en: "Circle spacing",
        type: "choice",
        options: [
          { value: "compact", zh: "紧凑", en: "Compact" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "wide", zh: "宽松", en: "Wide" },
        ],
      },
      {
        key: "verticalSpacing",
        zh: "上下留白",
        en: "Vertical spacing",
        type: "choice",
        options: [
          { value: "compact", zh: "紧凑", en: "Compact" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "wide", zh: "宽松", en: "Wide" },
        ],
      },
    ],
  },
  "decision-table": {
    defaults: {
      rowSpacing: "standard",
      headingGap: "standard",
    },
    fields: [
      {
        key: "rowSpacing",
        zh: "行间留白",
        en: "Row spacing",
        type: "choice",
        options: [
          { value: "compact", zh: "紧凑", en: "Compact" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "wide", zh: "宽松", en: "Wide" },
        ],
      },
      {
        key: "headingGap",
        zh: "标题与表格距离",
        en: "Heading distance",
        type: "choice",
        options: [
          { value: "near", zh: "近", en: "Near" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "far", zh: "远", en: "Far" },
        ],
      },
    ],
  },
  "image-row": {
    defaults: {
      imageGap: "standard",
      imageSize: "standard",
      sectionSpacing: "standard",
      headingGap: "standard",
    },
    fields: [
      {
        key: "imageGap",
        zh: "图片间距",
        en: "Image spacing",
        type: "choice",
        options: [
          { value: "compact", zh: "紧凑", en: "Compact" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "wide", zh: "宽松", en: "Wide" },
        ],
      },
      {
        key: "imageSize",
        zh: "图片大小",
        en: "Image size",
        type: "choice",
        options: [
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "large", zh: "较大", en: "Larger" },
        ],
      },
      {
        key: "sectionSpacing",
        zh: "上下留白",
        en: "Vertical padding",
        type: "choice",
        options: [
          { value: "compact", zh: "紧凑", en: "Compact" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "wide", zh: "宽松", en: "Wide" },
        ],
      },
      {
        key: "headingGap",
        zh: "标题与图片距离",
        en: "Heading distance",
        type: "choice",
        options: [
          { value: "near", zh: "近", en: "Near" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "far", zh: "远", en: "Far" },
        ],
      },
    ],
  },
  "figma-prototype": {
    defaults: {
      displaySize: "standard",
      sectionSpacing: "standard",
      headingGap: "standard",
      captionGap: "standard",
    },
    fields: [
      {
        key: "displaySize",
        zh: "展示大小",
        en: "Display size",
        type: "choice",
        options: [
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "large", zh: "较大", en: "Larger" },
        ],
      },
      {
        key: "sectionSpacing",
        zh: "上下留白",
        en: "Vertical padding",
        type: "choice",
        options: [
          { value: "compact", zh: "紧凑", en: "Compact" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "wide", zh: "宽松", en: "Wide" },
        ],
      },
      {
        key: "headingGap",
        zh: "标题与展示区域距离",
        en: "Heading distance",
        type: "choice",
        options: [
          { value: "near", zh: "近", en: "Near" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "far", zh: "远", en: "Far" },
        ],
      },
      {
        key: "captionGap",
        zh: "展示区域与说明距离",
        en: "Caption distance",
        type: "choice",
        options: [
          { value: "near", zh: "近", en: "Near" },
          { value: "standard", zh: "标准", en: "Standard" },
          { value: "far", zh: "远", en: "Far" },
        ],
      },
    ],
  },
};

export function sampleContentFor(
  schema: TemplateFieldDefinition[],
  templateId?: string,
) {
  if (templateId === "direction-compare") {
    return {
      heading: { zh: "方案对比", en: "" },
      leftLabel: { zh: "方向 A", en: "" },
      rightLabel: { zh: "方向 B", en: "" },
      leftTitle: { zh: "方案 A", en: "" },
      rightTitle: { zh: "方案 B", en: "" },
      leftDescription: { zh: "补充左侧方案说明。", en: "" },
      rightDescription: { zh: "补充右侧方案说明。", en: "" },
      leftImage: null,
      rightImage: null,
      direction: "left-to-right",
    };
  }

  if (templateId === "playable-game") {
    return {
      heading: { zh: "可玩原型", en: "Playable Prototype" },
      description: { zh: "", en: "" },
      game: null,
      cover: null,
      controls: [],
      versionLabel: { zh: "", en: "" },
      status: "prototype",
      aspectRatio: "16:9",
    };
  }

  if (templateId === "process-flow") {
    return {
      heading: {
        zh: "从需求判断到方案落地",
        en: "From Requirement to Delivery",
      },
      items: [
        {
          id: "process-flow-1",
          number: { zh: "01", en: "01" },
          title: { zh: "确认目标", en: "Define Goal" },
          description: {
            zh: "明确任务边界与核心体验目标。",
            en: "Clarify the task boundary and experience goal.",
          },
        },
        {
          id: "process-flow-2",
          number: { zh: "02", en: "02" },
          title: { zh: "梳理问题", en: "Frame Problems" },
          description: {
            zh: "拆分当前流程中的关键阻力。",
            en: "Separate the main friction in the current flow.",
          },
        },
        {
          id: "process-flow-3",
          number: { zh: "03", en: "03" },
          title: { zh: "建立判断", en: "Build Judgments" },
          description: {
            zh: "将观察整理为可执行的设计原则。",
            en: "Turn observations into actionable design principles.",
          },
        },
        {
          id: "process-flow-4",
          number: { zh: "04", en: "04" },
          title: { zh: "组织方案", en: "Shape Direction" },
          description: {
            zh: "组合信息、操作与反馈节奏。",
            en: "Compose information, action, and feedback rhythm.",
          },
        },
        {
          id: "process-flow-5",
          number: { zh: "05", en: "05" },
          title: { zh: "验证原型", en: "Validate Prototype" },
          description: {
            zh: "通过关键状态验证方案有效性。",
            en: "Validate the direction through key interface states.",
          },
        },
        {
          id: "process-flow-6",
          number: { zh: "06", en: "06" },
          title: { zh: "沉淀规则", en: "Codify Rules" },
          description: {
            zh: "整理为可持续复用的生产规则。",
            en: "Codify the result into reusable production rules.",
          },
        },
      ],
    };
  }

  if (templateId === "circle-summary") {
    return {
      heading: {
        zh: "带回本项目的判断",
        en: "Judgments Brought Back to the Project",
      },
      items: [
        {
          id: "circle-summary-1",
          text: {
            zh: "轻量化来自系统重组与交互重构",
            en: "Lightweight experience comes from system and interaction restructuring",
          },
        },
        {
          id: "circle-summary-2",
          text: {
            zh: "面向不同熟悉程度的用户设计体验循环",
            en: "Design experience loops for different levels of familiarity",
          },
        },
        {
          id: "circle-summary-3",
          text: {
            zh: "美术表现保持轻度，高难玩法逐步开放",
            en: "Keep presentation light and reveal demanding play progressively",
          },
        },
      ],
    };
  }

  if (templateId === "decision-table") {
    return {
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
          id: "decision-row-1",
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
          id: "decision-row-2",
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
          id: "decision-row-3",
          cells: {
            category: { zh: "弹窗结构", en: "Popup structure" },
            strategy: { zh: "重组", en: "Restructure" },
            scope: {
              zh: "确认弹窗、道具详情弹窗与二级说明弹窗",
              en: "Confirmation, item detail, and information dialogs",
            },
            reason: {
              zh: "旧结构容易连续叠加，需要区分即时操作和系统内容",
              en: "Separate immediate actions from deeper system content.",
            },
          },
        },
        {
          id: "decision-row-4",
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
    };
  }

  if (templateId === "image-row") {
    return {
      heading: { zh: "", en: "" },
      items: [],
    };
  }

  if (templateId === "figma-prototype") {
    return {
      heading: { zh: "", en: "" },
      figmaUrl: "",
      caption: { zh: "", en: "" },
    };
  }

  const content: Record<string, unknown> = {};
  for (const field of schema) {
    switch (field.id) {
      case "category":
        content[field.id] = {
          zh: "商业项目 / 系统 UI",
          en: "COMMERCIAL PROJECT / SYSTEM UI",
        };
        break;
      case "duration":
        content[field.id] = {
          zh: "2021.07 — 2024.02",
          en: "2021.07 — 2024.02",
        };
        break;
      case "title":
        content[field.id] = {
          zh: "从系统驱动到体验驱动：重新分配界面节奏",
          en: "From System-Driven to Experience-Driven",
        };
        break;
      case "summary":
        content[field.id] = {
          zh: "围绕成熟游戏系统，重新组织信息密度、操作节奏与角色体验之间的关系。",
          en: "Rebalancing information density, interaction rhythm, and character experience inside a mature game system.",
        };
        break;
      case "leftTitle":
        content[field.id] = {
          zh: "传统手游痛点",
          en: "Traditional Mobile Game Pain Points",
        };
        break;
      case "sectionNumber":
        content[field.id] = {
          zh: "01",
          en: "01",
        };
        break;
      case "statement":
        content[field.id] = {
          zh: "UI 在展示信息的同时还高强度指引玩家进行下一步操作。",
          en: "While presenting information, the UI also strongly directs the player's next action.",
        };
        break;
      case "body":
        content[field.id] = {
          zh: "2016 年后，受“魔灵-like”与《小冰冰传奇》等影响，传统手游逐渐形成了以系统循环、资源反馈和连续引导为中心的界面组织方式。",
          en: "After 2016, influenced by Summoners War-like games and titles such as Soul Hunters, traditional mobile games increasingly organized their interfaces around system loops, resource feedback, and continuous guidance.",
        };
        break;
      case "heading":
        content[field.id] = {
          zh: "四个设计介入阶段",
          en: "Four Design Intervention Phases",
        };
        break;
      case "items":
        content[field.id] = [
          {
            id: "business-decision",
            number: "01",
            title: { zh: "业务决策", en: "Business Decision" },
            state: "outline",
          },
          {
            id: "technical-direction",
            number: "02",
            title: { zh: "技术方向", en: "Technical Direction" },
            state: "outline",
          },
          {
            id: "system-restructure",
            number: "03",
            title: { zh: "系统重构", en: "System Restructure" },
            state: "outline",
          },
          {
            id: "competitor-analysis",
            number: "04",
            title: { zh: "竞品分析拆解", en: "Competitor Analysis" },
            state: "active",
          },
          {
            id: "hierarchy-optimisation",
            number: "05",
            title: { zh: "功能层级优化", en: "Hierarchy Optimisation" },
            state: "active",
          },
          {
            id: "production",
            number: "06",
            title: { zh: "铺量", en: "Production" },
            state: "active",
          },
        ];
        break;
      case "sectionTitle":
      case "referenceOneTitle":
      case "referenceOneCategory":
      case "referenceOneSummary":
      case "referenceOneFocus":
      case "referenceTwoTitle":
      case "referenceTwoCategory":
      case "referenceTwoSummary":
      case "referenceTwoFocus":
        content[field.id] = { zh: "", en: "" };
        break;
      default:
        if (field.type === "text" || field.type === "richtext") {
          content[field.id] = {
            zh: field.labelZh,
            en: field.labelEn,
          };
        } else {
          content[field.id] = null;
        }
    }
  }
  return content;
}

export function XMindContentEditor({
  mode,
  content,
  language,
  onChange,
}: {
  mode: "single" | "double";
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
}) {
  const [importError, setImportError] = useState("");
  const documents = [
    content.documentOne as NormalizedXMindDocument | undefined,
    content.documentTwo as NormalizedXMindDocument | undefined,
  ];

  const updateLocalized = (key: string, value: string) => {
    const current = content[key] as
      | { zh?: string; en?: string }
      | undefined;
    onChange({
      ...content,
      [key]: {
        zh: current?.zh ?? "",
        en: current?.en ?? "",
        [language]: value,
      },
    });
  };

  const importFile = async (index: number, file?: File) => {
    if (!file) return;
    setImportError("");
    try {
      const document = await importXMindDocument(file);
      const documentKey = index === 0 ? "documentOne" : "documentTwo";
      const titleKey =
        index === 0 ? "referenceOneTitle" : "referenceTwoTitle";
      const currentTitle = content[titleKey] as
        | { zh?: string; en?: string }
        | undefined;
      onChange({
        ...content,
        [documentKey]: document,
        [titleKey]: {
          zh: currentTitle?.zh || document.centerTopic,
          en: currentTitle?.en || document.centerTopic,
        },
      });
    } catch (reason) {
      setImportError(
        reason instanceof Error ? reason.message : "Unable to import XMind.",
      );
    }
  };

  const localizedText = (key: string) => {
    const value = content[key] as
      | { zh?: string; en?: string }
      | undefined;
    return value?.[language] ?? "";
  };

  const referenceFields = (
    index: number,
    document: NormalizedXMindDocument | undefined,
  ) => {
    const prefix = index === 0 ? "referenceOne" : "referenceTwo";
    const sideName =
      language === "zh"
        ? index === 0
          ? "第一个 XMind"
          : "第二个 XMind"
        : index === 0
          ? "First XMind"
          : "Second XMind";

    return (
      <section
        key={prefix}
        className="min-w-0 border-y border-softWhite/10 py-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-softWhite">
              {sideName}
            </h3>
            {document ? (
              <p className="mt-1 text-sm text-softWhite/48">
                {document.fileName}
              </p>
            ) : null}
          </div>
          <label className="editor-action cursor-pointer">
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            {document
              ? language === "zh"
                ? "替换 XMind"
                : "Replace XMind"
              : language === "zh"
                ? `导入${index === 0 ? "第一个" : "第二个"} XMind`
                : `Import ${index === 0 ? "first" : "second"} XMind`}
            <input
              type="file"
              accept=".xmind,application/vnd.xmind.workbook"
              className="sr-only"
              onChange={(event) => {
                void importFile(index, event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        {mode === "double" && document ? (
          <div className="mt-5 grid gap-4">
            {([
              ["Title", "标题", `${prefix}Title`, false],
              ["Category / status", "分类与状态", `${prefix}Category`, false],
              ["Short summary", "简短总结", `${prefix}Summary`, true],
              ["Analysis focus", "分析重点", `${prefix}Focus`, true],
            ] satisfies Array<[string, string, string, boolean]>).map(
              ([labelEn, labelZh, key, multiline]) => (
              <label key={key} className="block min-w-0">
                <span className="mb-1.5 block text-sm font-semibold text-softWhite/64">
                  {language === "zh" ? labelZh : labelEn}
                </span>
                {multiline ? (
                  <textarea
                    className="min-h-20 w-full resize-y rounded-[6px] border border-softWhite/12 bg-deepIndigo/36 px-3 py-2 text-sm leading-6 text-softWhite outline-none focus:border-acidGreen/60"
                    value={localizedText(key)}
                    onChange={(event) =>
                      updateLocalized(key, event.target.value)
                    }
                  />
                ) : (
                  <input
                    className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
                    value={localizedText(key)}
                    onChange={(event) =>
                      updateLocalized(key, event.target.value)
                    }
                  />
                )}
              </label>
              ),
            )}
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <section className="mt-8 max-w-4xl">
      <h2 className="font-display text-2xl font-semibold">
        {language === "zh" ? "内容" : "Content"}
      </h2>
      <label className="mt-5 block max-w-xl">
        <span className="mb-1.5 block text-sm font-semibold text-softWhite/64">
          {language === "zh" ? "章节标题" : "Section title"}
        </span>
        <input
          className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
          value={localizedText("sectionTitle")}
          onChange={(event) =>
            updateLocalized("sectionTitle", event.target.value)
          }
        />
      </label>
      <div
        className={`mt-6 grid gap-6 ${
          mode === "double" ? "lg:grid-cols-2" : ""
        }`}
      >
        {referenceFields(0, documents[0])}
        {mode === "double" ? referenceFields(1, documents[1]) : null}
      </div>
      {importError ? (
        <p className="mt-4 border-l-2 border-peach pl-4 text-sm leading-6 text-peach">
          {importError}
        </p>
      ) : null}
    </section>
  );
}

type PhaseMilestoneEditorItem = {
  id: string;
  number: string;
  title: { zh: string; en: string };
  hoverTitle?: { zh: string; en: string };
  hoverText?: { zh: string; en: string };
  targetId?: string;
  state: "outline" | "active";
};

export function PhaseMilestonesContentEditor({
  emphasisMode,
  content,
  language,
  onChange,
  jumpTargets = [],
}: {
  emphasisMode: "custom" | "second-half";
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
  jumpTargets?: Array<{ instanceId: string; label: string }>;
}) {
  const heading =
    (content.heading as { zh: string; en: string } | undefined) ?? {
      zh: "",
      en: "",
    };
  const items = Array.isArray(content.items)
    ? (content.items as PhaseMilestoneEditorItem[])
    : [];

  const updateItems = (nextItems: PhaseMilestoneEditorItem[]) => {
    onChange({ ...content, items: nextItems });
  };

  const updateItem = (
    id: string,
    updates: Partial<PhaseMilestoneEditorItem>,
  ) => {
    updateItems(
      items.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
    );
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const nextItems = [...items];
    [nextItems[index], nextItems[targetIndex]] = [
      nextItems[targetIndex],
      nextItems[index],
    ];
    updateItems(nextItems);
  };

  const addItem = () => {
    if (items.length >= 12) return;
    updateItems([
      ...items,
      {
        id: `phase-${Date.now()}`,
        number: String(items.length + 1).padStart(2, "0"),
        title: { zh: "新阶段", en: "New phase" },
        hoverTitle: { zh: "", en: "" },
        hoverText: { zh: "", en: "" },
        targetId: "",
        state: "outline",
      },
    ]);
  };

  return (
    <section className="mt-8 max-w-4xl">
      <h2 className="font-display text-2xl font-semibold">
        {language === "zh" ? "内容" : "Content"}
      </h2>

      <label className="mt-5 block max-w-xl">
        <span className="mb-1.5 block text-sm font-semibold text-softWhite/64">
          {language === "zh" ? "顶部标题" : "Heading"}
        </span>
        <input
          className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
          value={heading[language]}
          onChange={(event) =>
            onChange({
              ...content,
              heading: { ...heading, [language]: event.target.value },
            })
          }
        />
      </label>

      <div className="mt-6 grid gap-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-3 border-b border-softWhite/10 pb-5 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-end"
          >
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                {language === "zh" ? "编号" : "Number"}
              </span>
              <input
                className="w-full border-b border-softWhite/18 bg-transparent py-2 font-mono text-sm text-softWhite outline-none focus:border-acidGreen"
                value={item.number}
                onChange={(event) =>
                  updateItem(item.id, { number: event.target.value })
                }
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                {language === "zh" ? "阶段名称" : "Milestone title"}
              </span>
              <input
                className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
                value={item.title[language]}
                onChange={(event) =>
                  updateItem(item.id, {
                    title: {
                      ...item.title,
                      [language]: event.target.value,
                    },
                  })
                }
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {emphasisMode === "custom" ? (
                <select
                  aria-label={
                    language === "zh" ? "节点状态" : "Node state"
                  }
                  className="editor-select"
                  value={item.state}
                  onChange={(event) =>
                    updateItem(item.id, {
                      state: event.target.value as "outline" | "active",
                    })
                  }
                >
                  <option value="outline">
                    {language === "zh" ? "空心" : "Outline"}
                  </option>
                  <option value="active">
                    {language === "zh" ? "绿色强调" : "Green active"}
                  </option>
                </select>
              ) : null}
              <button
                type="button"
                className="editor-action"
                disabled={index === 0}
                onClick={() => moveItem(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="editor-action"
                disabled={index === items.length - 1}
                onClick={() => moveItem(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="editor-action text-peach"
                onClick={() =>
                  updateItems(
                    items.filter((current) => current.id !== item.id),
                  )
                }
              >
                {language === "zh" ? "删除" : "Delete"}
              </button>
            </div>
            <div className="grid gap-3 md:col-span-3 md:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                  {language === "zh"
                    ? "悬浮标题（可选）"
                    : "Hover title (optional)"}
                </span>
                <input
                  className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
                  value={item.hoverTitle?.[language] ?? ""}
                  onChange={(event) =>
                    updateItem(item.id, {
                      hoverTitle: {
                        zh: item.hoverTitle?.zh ?? "",
                        en: item.hoverTitle?.en ?? "",
                        [language]: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                  {language === "zh"
                    ? "悬浮说明（可选）"
                    : "Hover note (optional)"}
                </span>
                <input
                  className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
                  value={item.hoverText?.[language] ?? ""}
                  onChange={(event) =>
                    updateItem(item.id, {
                      hoverText: {
                        zh: item.hoverText?.zh ?? "",
                        en: item.hoverText?.en ?? "",
                        [language]: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                  {language === "zh" ? "跳转到模板（可选）" : "Jump to template (optional)"}
                </span>
                <select
                  className="editor-select w-full"
                  value={item.targetId ?? ""}
                  onChange={(event) =>
                    updateItem(item.id, { targetId: event.target.value })
                  }
                >
                  <option value="">{language === "zh" ? "不跳转" : "No jump"}</option>
                  {item.targetId && !jumpTargets.some((target) => target.instanceId === item.targetId) ? (
                    <option value={item.targetId}>
                      {language === "zh" ? "旧跳转目标（保留）" : "Legacy jump target (kept)"}
                    </option>
                  ) : null}
                  {jumpTargets.map((target) => (
                    <option key={target.instanceId} value={target.instanceId}>{target.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>

      {items.length < 3 ? (
        <p className="mt-4 text-sm text-peach">
          {language === "zh"
            ? "至少需要 3 个阶段节点。"
            : "At least 3 milestone items are required."}
        </p>
      ) : null}

      <button
        type="button"
        className="editor-action mt-4"
        disabled={items.length >= 12}
        onClick={addItem}
      >
        {language === "zh" ? "添加节点" : "Add milestone"}
      </button>
    </section>
  );
}

type CircleSummaryEditorItem = {
  id: string;
  text: { zh: string; en: string };
};

export function CircleSummaryContentEditor({
  content,
  language,
  onChange,
}: {
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
}) {
  const heading =
    (content.heading as { zh: string; en: string } | undefined) ?? {
      zh: "",
      en: "",
    };
  const items = Array.isArray(content.items)
    ? (content.items as CircleSummaryEditorItem[])
    : [];

  const updateItems = (nextItems: CircleSummaryEditorItem[]) => {
    onChange({ ...content, items: nextItems });
  };

  const updateItem = (
    id: string,
    updates: Partial<CircleSummaryEditorItem>,
  ) => {
    updateItems(
      items.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
    );
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const nextItems = [...items];
    [nextItems[index], nextItems[targetIndex]] = [
      nextItems[targetIndex],
      nextItems[index],
    ];
    updateItems(nextItems);
  };

  const addItem = () => {
    if (items.length >= 5) return;
    updateItems([
      ...items,
      {
        id: `circle-summary-${Date.now()}`,
        text: { zh: "", en: "" },
      },
    ]);
  };

  return (
    <section className="mt-8 max-w-4xl">
      <h2 className="font-display text-2xl font-semibold">
        {language === "zh" ? "内容" : "Content"}
      </h2>

      <label className="mt-5 block max-w-xl">
        <span className="mb-1.5 block text-sm font-semibold text-softWhite/64">
          {language === "zh" ? "顶部标题" : "Heading"}
        </span>
        <input
          className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
          value={heading[language]}
          onChange={(event) =>
            onChange({
              ...content,
              heading: { ...heading, [language]: event.target.value },
            })
          }
        />
      </label>

      <div className="mt-6 grid gap-3">
        {items.map((item, index) => {
          const currentText = item.text?.[language] ?? "";
          return (
            <div
              key={item.id}
              className="grid gap-3 border-b border-softWhite/10 pb-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
            >
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                  {language === "zh"
                    ? `总结 ${index + 1}`
                    : `Summary ${index + 1}`}
                </span>
                <textarea
                  className="min-h-20 w-full resize-y border border-softWhite/14 bg-deepIndigo/28 px-3 py-2 text-sm leading-6 text-softWhite outline-none focus:border-acidGreen"
                  value={currentText}
                  onChange={(event) =>
                    updateItem(item.id, {
                      text: {
                        zh: item.text?.zh ?? "",
                        en: item.text?.en ?? "",
                        [language]: event.target.value,
                      },
                    })
                  }
                />
                {!currentText.trim() ? (
                  <span className="mt-1.5 block text-xs text-peach">
                    {language === "zh"
                      ? "请补充这一项的总结内容。"
                      : "Add summary text for this item."}
                  </span>
                ) : null}
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="editor-action"
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                >
                  {language === "zh" ? "上移" : "Move up"}
                </button>
                <button
                  type="button"
                  className="editor-action"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                >
                  {language === "zh" ? "下移" : "Move down"}
                </button>
                <button
                  type="button"
                  className="editor-action text-peach"
                  onClick={() =>
                    updateItems(
                      items.filter((current) => current.id !== item.id),
                    )
                  }
                >
                  {language === "zh" ? "删除" : "Delete"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {items.length < 3 ? (
        <p className="mt-4 text-sm text-peach">
          {language === "zh"
            ? "至少需要 3 个圆形总结。"
            : "At least 3 circle summaries are required."}
        </p>
      ) : null}

      <button
        type="button"
        className="editor-action mt-4"
        disabled={items.length >= 5}
        onClick={addItem}
      >
        {language === "zh" ? "添加一个总结" : "Add a summary"}
      </button>
    </section>
  );
}

type DecisionTableEditorText = { zh: string; en: string };
type DecisionTableEditorColumn = {
  id: string;
  title: DecisionTableEditorText;
};
type DecisionTableEditorRow = {
  id: string;
  cells: Record<string, DecisionTableEditorText>;
};

const defaultDecisionTableColumns: DecisionTableEditorColumn[] = [
  { id: "category", title: { zh: "类型", en: "Type" } },
  { id: "strategy", title: { zh: "处理策略", en: "Strategy" } },
  { id: "scope", title: { zh: "具体范围", en: "Scope" } },
  { id: "reason", title: { zh: "判断原因", en: "Rationale" } },
];

function decisionTableText(value: unknown): DecisionTableEditorText {
  if (!value || typeof value !== "object") return { zh: "", en: "" };
  const localized = value as Partial<DecisionTableEditorText>;
  return {
    zh: typeof localized.zh === "string" ? localized.zh : "",
    en: typeof localized.en === "string" ? localized.en : "",
  };
}

function decisionTableColumns(value: TemplateContentValue | undefined) {
  if (!Array.isArray(value) || value.length === 0) {
    return defaultDecisionTableColumns;
  }
  return value.map((rawColumn, index) => {
    const column =
      rawColumn && typeof rawColumn === "object"
        ? (rawColumn as Record<string, unknown>)
        : {};
    return {
      id:
        typeof column.id === "string" && column.id
          ? column.id
          : defaultDecisionTableColumns[index]?.id
            ?? `column-${index + 1}`,
      title: decisionTableText(column.title ?? column),
    };
  });
}

function decisionTableRows(
  value: TemplateContentValue | undefined,
  columns: DecisionTableEditorColumn[],
) {
  if (!Array.isArray(value)) return [];
  return value.map((rawRow, rowIndex) => {
    const row =
      rawRow && typeof rawRow === "object"
        ? (rawRow as Record<string, unknown>)
        : {};
    const savedCells =
      row.cells && typeof row.cells === "object"
        ? (row.cells as Record<string, unknown>)
        : {};
    return {
      id:
        typeof row.id === "string" && row.id
          ? row.id
          : `decision-row-${rowIndex + 1}`,
      cells: Object.fromEntries(
        columns.map((column) => [
          column.id,
          decisionTableText(savedCells[column.id] ?? row[column.id]),
        ]),
      ),
    };
  });
}

export function DecisionTableContentEditor({
  content,
  language,
  onChange,
}: {
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
}) {
  const heading =
    (content.heading as { zh: string; en: string } | undefined) ?? {
      zh: "",
      en: "",
    };
  const columns = decisionTableColumns(content.columns);
  const rows = decisionTableRows(content.rows, columns);

  const updateRows = (nextRows: DecisionTableEditorRow[]) => {
    onChange({ ...content, columns, rows: nextRows });
  };

  const updateRow = (
    id: string,
    columnId: string,
    value: string,
  ) => {
    updateRows(
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              cells: {
                ...row.cells,
                [columnId]: {
                  ...row.cells[columnId],
                  [language]: value,
                },
              },
            }
          : row,
      ),
    );
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= rows.length) return;
    const nextRows = [...rows];
    [nextRows[index], nextRows[targetIndex]] = [
      nextRows[targetIndex],
      nextRows[index],
    ];
    updateRows(nextRows);
  };

  const addRow = () => {
    if (rows.length >= 12) return;
    updateRows([
      ...rows,
      {
        id: `decision-row-${Date.now()}`,
        cells: Object.fromEntries(
          columns.map((column) => [
            column.id,
            { zh: "", en: "" },
          ]),
        ),
      },
    ]);
  };

  const updateColumn = (id: string, value: string) => {
    onChange({
      ...content,
      columns: columns.map((column) =>
        column.id === id
          ? {
              ...column,
              title: { ...column.title, [language]: value },
            }
          : column,
      ),
      rows,
    });
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    const nextColumns = [...columns];
    [nextColumns[index], nextColumns[targetIndex]] = [
      nextColumns[targetIndex],
      nextColumns[index],
    ];
    onChange({ ...content, columns: nextColumns, rows });
  };

  const deleteColumn = (id: string) => {
    if (columns.length <= 1) return;
    const nextColumns = columns.filter((column) => column.id !== id);
    const nextRows = rows.map((row) => {
      const nextCells = { ...row.cells };
      delete nextCells[id];
      return { ...row, cells: nextCells };
    });
    onChange({ ...content, columns: nextColumns, rows: nextRows });
  };

  const addColumn = () => {
    const id = `column-${Date.now()}`;
    onChange({
      ...content,
      columns: [
        ...columns,
        { id, title: { zh: "", en: "" } },
      ],
      rows: rows.map((row) => ({
        ...row,
        cells: {
          ...row.cells,
          [id]: { zh: "", en: "" },
        },
      })),
    });
  };

  return (
    <section className="mt-8 max-w-5xl">
      <h2 className="font-display text-2xl font-semibold">
        {language === "zh" ? "内容" : "Content"}
      </h2>

      <label className="mt-5 block max-w-xl">
        <span className="mb-1.5 block text-sm font-semibold text-softWhite/64">
          {language === "zh" ? "顶部标题" : "Heading"}
        </span>
        <input
          className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
          value={heading[language]}
          onChange={(event) =>
            onChange({
              ...content,
              heading: { ...heading, [language]: event.target.value },
            })
          }
        />
      </label>

      <div className="mt-6">
        <p className="text-sm font-semibold text-softWhite/64">
          {language === "zh" ? "表头" : "Column headings"}
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {columns.map((column, index) => (
            <div
              key={column.id}
              className="border-b border-softWhite/10 pb-3"
            >
              <label>
                <span className="mb-1.5 block text-xs text-softWhite/42">
                  {language === "zh"
                    ? `第 ${index + 1} 列`
                    : `Column ${index + 1}`}
                </span>
                <input
                  className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
                  value={column.title[language]}
                  onChange={(event) =>
                    updateColumn(column.id, event.target.value)
                  }
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="editor-action"
                  disabled={index === 0}
                  onClick={() => moveColumn(index, -1)}
                >
                  {language === "zh" ? "左移" : "Move left"}
                </button>
                <button
                  type="button"
                  className="editor-action"
                  disabled={index === columns.length - 1}
                  onClick={() => moveColumn(index, 1)}
                >
                  {language === "zh" ? "右移" : "Move right"}
                </button>
                <button
                  type="button"
                  className="editor-action text-peach"
                  disabled={columns.length <= 1}
                  onClick={() => deleteColumn(column.id)}
                >
                  {language === "zh" ? "删除列" : "Delete column"}
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="editor-action mt-4"
          onClick={addColumn}
        >
          {language === "zh" ? "新增列" : "Add column"}
        </button>
      </div>

      <div className="mt-7 grid gap-4">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="border-b border-softWhite/10 pb-5"
          >
            <div className="grid gap-3 md:grid-cols-2">
              {columns.map((column, columnIndex) => (
                <label key={column.id}>
                  <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                    {column.title[language]
                      || (language === "zh"
                        ? `第 ${columnIndex + 1} 列`
                        : `Column ${columnIndex + 1}`)}
                  </span>
                  <textarea
                    className="min-h-20 w-full resize-y border border-softWhite/14 bg-deepIndigo/28 px-3 py-2 text-sm leading-6 text-softWhite outline-none focus:border-acidGreen"
                    value={row.cells[column.id]?.[language] ?? ""}
                    onChange={(event) =>
                      updateRow(
                        row.id,
                        column.id,
                        event.target.value,
                      )
                    }
                  />
                </label>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="editor-action"
                disabled={index === 0}
                onClick={() => moveRow(index, -1)}
              >
                {language === "zh" ? "上移" : "Move up"}
              </button>
              <button
                type="button"
                className="editor-action"
                disabled={index === rows.length - 1}
                onClick={() => moveRow(index, 1)}
              >
                {language === "zh" ? "下移" : "Move down"}
              </button>
              <button
                type="button"
                className="editor-action text-peach"
                onClick={() =>
                  updateRows(
                    rows.filter((current) => current.id !== row.id),
                  )
                }
              >
                {language === "zh" ? "删除" : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {rows.length < 1 ? (
        <p className="mt-4 text-sm text-peach">
          {language === "zh"
            ? "至少需要 1 行信息。"
            : "At least one row is required."}
        </p>
      ) : null}

      <button
        type="button"
        className="editor-action mt-4"
        disabled={rows.length >= 12}
        onClick={addRow}
      >
        {language === "zh" ? "添加一行" : "Add row"}
      </button>
    </section>
  );
}

const ACCEPTED_TEMPLATE_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
];

type ImageRowEditorImage = { publicPath?: string };
type ImageRowEditorItem = {
  id: string;
  image?: ImageRowEditorImage;
  alt: { zh: string; en: string };
  caption: { zh: string; en: string };
};

function ImageRowContentEditor({
  content,
  language,
  onChange,
}: {
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
}) {
  const heading =
    (content.heading as { zh: string; en: string } | undefined) ?? {
      zh: "",
      en: "",
    };
  const items = Array.isArray(content.items)
    ? (content.items as ImageRowEditorItem[])
    : [];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeUploadId, setActiveUploadId] = useState("");
  const [uploadError, setUploadError] = useState("");

  // Preview-only: uploaded images live purely as in-memory object URLs for
  // this editing session (never written to IndexedDB/localStorage). They
  // are released whenever the underlying image is replaced or removed, and
  // naturally disappear on reload since nothing was persisted.
  const previousUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const current = new Set(
      items.map((item) => item.image?.publicPath).filter((url): url is string => Boolean(url)),
    );
    for (const url of previousUrlsRef.current) {
      if (!current.has(url)) URL.revokeObjectURL(url);
    }
    previousUrlsRef.current = current;
  }, [items]);
  useEffect(() => {
    return () => {
      for (const url of previousUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  const updateItems = (nextItems: ImageRowEditorItem[]) => {
    onChange({ ...content, items: nextItems });
  };

  const updateItem = (id: string, updates: Partial<ImageRowEditorItem>) => {
    updateItems(items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const nextItems = [...items];
    [nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]];
    updateItems(nextItems);
  };

  const addItem = () => {
    if (items.length >= 4) return;
    updateItems([
      ...items,
      {
        id: `image-row-${Date.now()}`,
        alt: { zh: "", en: "" },
        caption: { zh: "", en: "" },
      },
    ]);
  };

  const removeItem = (item: ImageRowEditorItem) => {
    updateItems(items.filter((current) => current.id !== item.id));
  };

  const chooseImage = (itemId: string) => {
    setUploadError("");
    setActiveUploadId(itemId);
    fileInputRef.current?.click();
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const itemId = activeUploadId;
    event.target.value = "";
    if (!file || !itemId) return;

    if (!ACCEPTED_TEMPLATE_IMAGE_TYPES.includes(file.type)) {
      setUploadError(
        language === "zh"
          ? "请选择 PNG、JPEG、WebP、AVIF 或 GIF 图片。"
          : "Choose a PNG, JPEG, WebP, AVIF, or GIF image.",
      );
      return;
    }

    try {
      const optimized = await optimizeUploadedImage(file);
      const previewUrl = URL.createObjectURL(optimized);
      updateItem(itemId, { image: { publicPath: previewUrl } });
    } catch {
      setUploadError(
        language === "zh"
          ? "图片预览失败，原有图片未被修改。"
          : "The image could not be previewed. Your existing image was not changed.",
      );
    }
  };

  return (
    <section className="mt-8 max-w-4xl">
      <h2 className="font-display text-2xl font-semibold">
        {language === "zh" ? "内容" : "Content"}
      </h2>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TEMPLATE_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => void uploadImage(event)}
      />

      <label className="mt-5 block max-w-xl">
        <span className="mb-1.5 block text-sm font-semibold text-softWhite/64">
          {language === "zh" ? "顶部标题" : "Heading"}
        </span>
        <input
          className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
          value={heading[language]}
          onChange={(event) =>
            onChange({
              ...content,
              heading: { ...heading, [language]: event.target.value },
            })
          }
        />
      </label>

      <div className="mt-7 grid gap-5">
        {items.map((item, index) => (
          <div key={item.id} className="grid gap-3 border-b border-softWhite/10 pb-5 md:grid-cols-[10rem_minmax(0,1fr)]">
            <div>
              <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-[10px] bg-deepIndigo/48 text-xs text-softWhite/38">
                {item.image?.publicPath ? (
                  <img src={item.image.publicPath} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span>{language === "zh" ? "尚未上传" : "No image yet"}</span>
                )}
              </div>
              <button
                type="button"
                className="editor-action mt-2 w-full justify-center"
                onClick={() => chooseImage(item.id)}
              >
                {item.image?.publicPath
                  ? (language === "zh" ? "替换图片" : "Replace image")
                  : (language === "zh" ? "上传图片" : "Add image")}
              </button>
            </div>

            <div className="grid gap-3">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-softWhite/46">
                  {language === "zh" ? "图片说明" : "Caption"}
                </span>
                <input
                  className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
                  value={item.caption[language]}
                  onChange={(event) =>
                    updateItem(item.id, {
                      caption: { ...item.caption, [language]: event.target.value },
                    })
                  }
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="editor-action"
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                >
                  {language === "zh" ? "上移" : "Move up"}
                </button>
                <button
                  type="button"
                  className="editor-action"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                >
                  {language === "zh" ? "下移" : "Move down"}
                </button>
                <button
                  type="button"
                  className="editor-action text-peach"
                  onClick={() => removeItem(item)}
                >
                  {language === "zh" ? "删除" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length < 1 ? (
        <p className="mt-4 text-sm text-peach">
          {language === "zh" ? "请至少添加 1 张图片。" : "Add at least one image."}
        </p>
      ) : null}

      {uploadError ? (
        <p className="mt-4 text-sm text-peach">{uploadError}</p>
      ) : null}

      <button
        type="button"
        className="editor-action mt-4"
        disabled={items.length >= 4}
        onClick={addItem}
      >
        {language === "zh" ? "添加图片" : "Add image"}
      </button>
    </section>
  );
}

function FigmaPrototypeContentEditor({
  content,
  language,
  onChange,
}: {
  content: Record<string, TemplateContentValue>;
  language: "zh" | "en";
  onChange: (content: Record<string, TemplateContentValue>) => void;
}) {
  const heading =
    (content.heading as { zh: string; en: string } | undefined) ?? { zh: "", en: "" };
  const caption =
    (content.caption as { zh: string; en: string } | undefined) ?? { zh: "", en: "" };
  const figmaUrl = typeof content.figmaUrl === "string" ? content.figmaUrl : "";
  const fallbackImage = content.fallbackImage as { publicPath?: string } | undefined;

  const [urlDraft, setUrlDraft] = useState(figmaUrl);
  const [urlError, setUrlError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previousUrlRef = useRef<string | undefined>(fallbackImage?.publicPath);

  useEffect(() => {
    const current = fallbackImage?.publicPath;
    const previous = previousUrlRef.current;
    if (previous && previous !== current) URL.revokeObjectURL(previous);
    previousUrlRef.current = current;
  }, [fallbackImage?.publicPath]);
  useEffect(() => {
    return () => {
      if (previousUrlRef.current) URL.revokeObjectURL(previousUrlRef.current);
    };
  }, []);

  const applyUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) {
      setUrlError("");
      onChange({ ...content, figmaUrl: "" });
      return;
    }
    const result = normalizeFigmaPrototypeUrl(trimmed);
    if (!result.ok) {
      setUrlError(figmaPrototypeUrlErrorMessage(result.error));
      return;
    }
    setUrlError("");
    onChange({ ...content, figmaUrl: trimmed });
  };

  const uploadFallback = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED_TEMPLATE_IMAGE_TYPES.includes(file.type)) {
      setUrlError(
        language === "zh"
          ? "请选择 PNG、JPEG、WebP、AVIF 或 GIF 图片。"
          : "Choose a PNG, JPEG, WebP, AVIF, or GIF image.",
      );
      return;
    }
    const optimized = await optimizeUploadedImage(file);
    const previewUrl = URL.createObjectURL(optimized);
    onChange({ ...content, fallbackImage: { publicPath: previewUrl } });
  };

  return (
    <section className="mt-8 max-w-4xl">
      <h2 className="font-display text-2xl font-semibold">
        {language === "zh" ? "内容" : "Content"}
      </h2>

      <label className="mt-5 block max-w-xl">
        <span className="mb-1.5 block text-sm font-semibold text-softWhite/64">
          {language === "zh" ? "顶部标题" : "Heading"}
        </span>
        <input
          className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
          value={heading[language]}
          onChange={(event) =>
            onChange({ ...content, heading: { ...heading, [language]: event.target.value } })
          }
        />
      </label>

      <label className="mt-6 block max-w-xl">
        <span className="mb-1.5 block text-sm font-semibold text-softWhite/64">
          {language === "zh" ? "Figma 链接" : "Figma URL"}
        </span>
        <input
          className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
          placeholder="https://www.figma.com/proto/..."
          value={urlDraft}
          onChange={(event) => setUrlDraft(event.target.value)}
          onBlur={applyUrl}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); applyUrl(); }
          }}
        />
      </label>
      {urlError ? <p className="mt-2 text-sm text-peach">{urlError}</p> : null}

      <div className="mt-6 max-w-xl">
        <span className="mb-1.5 block text-sm font-semibold text-softWhite/64">
          {language === "zh" ? "备用图片" : "Fallback image"}
        </span>
        <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-[10px] bg-deepIndigo/48 text-xs text-softWhite/38">
          {fallbackImage?.publicPath ? (
            <img src={fallbackImage.publicPath} alt="" className="h-full w-full object-contain" />
          ) : (
            <span>{language === "zh" ? "尚未上传" : "No image yet"}</span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TEMPLATE_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => void uploadFallback(event)}
        />
        <button
          type="button"
          className="editor-action mt-2"
          onClick={() => fileInputRef.current?.click()}
        >
          {fallbackImage?.publicPath
            ? (language === "zh" ? "替换图片" : "Replace image")
            : (language === "zh" ? "上传图片" : "Add image")}
        </button>
      </div>

      <label className="mt-6 block max-w-xl">
        <span className="mb-1.5 block text-sm font-semibold text-softWhite/64">
          {language === "zh" ? "说明文字" : "Caption"}
        </span>
        <input
          className="w-full border-b border-softWhite/18 bg-transparent py-2 text-sm text-softWhite outline-none focus:border-acidGreen"
          value={caption[language]}
          onChange={(event) =>
            onChange({ ...content, caption: { ...caption, [language]: event.target.value } })
          }
        />
      </label>
    </section>
  );
}

async function importPreviewModule(moduleUrl: string) {
  return (await import(
    /* @vite-ignore */ moduleUrl
  )) as TemplateModule;
}

export function OwnerTemplateBuilderPage() {
  const navigate = useNavigate();
  const { locale = "zh" } = useParams();
  const language = locale === "en" ? "en" : "zh";
  const [searchParams] = useSearchParams();
  const selectedId = searchParams.get("template") ?? "";
  const templates = useMemo(() => getRegisteredTemplates(), []);
  const selectedTemplate = templates.find(
    (template) => template.meta.id === selectedId,
  );
  const galleryPath = `/${language}/owner-tools/templates/gallery`;

  const [code, setCode] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] =
    useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewModule, setPreviewModule] =
    useState<TemplateModule | null>(null);
  const [previewRevision, setPreviewRevision] = useState("");
  const [previewLocale, setPreviewLocale] =
    useState<"zh" | "en">(language);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [templateContent, setTemplateContent] = useState<
    Record<string, TemplateContentValue>
  >({});
  // The template's persistent default horizontal inset (px). insetSaved is
  // the last value actually written to templateLayoutDefaults; insetDraft
  // is what's currently in the number input — they diverge exactly when
  // there are unsaved changes, and only "Save and return" reconciles them.
  const [insetDraft, setInsetDraft] = useState(0);
  const [insetSaved, setInsetSaved] = useState(0);
  const hasUnsavedInset = insetDraft !== insetSaved;
  // Session-only "show template boundaries" debug toggle — never persisted.
  const [showDebugBoundaries, setShowDebugBoundaries] = useState(false);

  useEffect(() => {
    if (!selectedTemplate) {
      setCode("");
      setOriginalCode("");
      setFileName("");
      setTemplateContent({});
      setInsetDraft(0);
      setInsetSaved(0);
      return;
    }
    const savedInset = getTemplateHorizontalInset(selectedTemplate.meta.id);
    setInsetDraft(savedInset);
    setInsetSaved(savedInset);
    const nextFileName = templateFilesById[selectedTemplate.meta.id];
    setLoading(true);
    setError("");
    loadTemplateSource(nextFileName)
      .then((record) => {
        setFileName(record.fileName);
        setCode(record.code);
        setOriginalCode(record.code);
        setTemplateContent(
          sampleContentFor(
            selectedTemplate.meta.schema,
            selectedTemplate.meta.id,
          ),
        );
        setPreviewModule({
          default: selectedTemplate.Component,
          templateMeta: selectedTemplate.meta,
          layoutControlSchema: selectedTemplate.layoutControlSchema,
        });
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load template source.",
        ),
      )
      .finally(() => setLoading(false));
  }, [selectedTemplate]);

  useEffect(() => {
    // Nothing has been edited yet — previewModule is already the real
    // registered component (set by the load effect above), so writing a
    // preview file here would be a same-content no-op that only exists to
    // trigger Vite's dev-server file watcher for no reason.
    if (!selectedTemplate || !code.trim() || code === originalCode) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setPreviewError("");
      prepareTemplatePreview(code, selectedTemplate.meta.id)
        .then(({ moduleUrl, revision }) =>
          importPreviewModule(moduleUrl).then((module) => ({
            module,
            revision,
          })),
        )
        .then(({ module, revision }) => {
          if (!active) return;
          if (!module.default || !module.templateMeta) {
            throw new Error(
              "Preview module requires default and templateMeta exports.",
            );
          }
          setPreviewModule(module);
          setPreviewRevision(revision);
        })
        .catch((reason) => {
          if (active) {
            setPreviewError(
              reason instanceof Error
                ? reason.message
                : "Unable to render this code.",
            );
          }
        });
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [code, originalCode, selectedTemplate]);

  const adjustmentSet = selectedTemplate
    ? friendlyAdjustments[selectedTemplate.meta.id]
    : undefined;
  const layoutControls = parseLayoutControls(
    code,
    adjustmentSet?.fields.map((field) => field.key) ?? [],
  );
  const activeMeta = previewModule?.templateMeta ?? selectedTemplate?.meta;
  const ActiveComponent =
    previewModule?.default ?? selectedTemplate?.Component;
  const sampleContent = activeMeta ? templateContent : {};
  const hasUnsavedChanges = code !== originalCode || hasUnsavedInset;

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const updateControl = (key: string, value: string) => {
    setCode((current) => updateLayoutControl(current, key, value));
    setError("");
  };

  const restoreDefaults = () => {
    if (!adjustmentSet) return;
    setCode((current) =>
      Object.entries(adjustmentSet.defaults).reduce(
        (next, [key, value]) => updateLayoutControl(next, key, value),
        current,
      ),
    );
    setError("");
  };

  const validateSource = async (source: string) => {
    if (!selectedTemplate) {
      throw new Error("No template is selected.");
    }
    const preview = await prepareTemplatePreview(
      source,
      selectedTemplate.meta.id,
    );
    const module = await importPreviewModule(preview.moduleUrl);
    if (!module.default || !module.templateMeta) {
      throw new Error(
        "Template requires default and templateMeta exports.",
      );
    }
    const ValidationComponent = module.default;
    renderToStaticMarkup(
      <ValidationComponent
        content={templateContent}
        locale={previewLocale}
      />,
    );
    return { module, revision: preview.revision };
  };

  const saveAndReturn = async () => {
    const currentTemplateId = selectedTemplate?.meta.id;
    if (!fileName || !code || !currentTemplateId) return;
    setSaveStatus("saving");
    setError("");
    try {
      await validateSource(code);
      await saveTemplateSource({ fileName, code });
      setOriginalCode(code);
      setTemplateHorizontalInset(currentTemplateId, insetDraft);
      setInsetSaved(insetDraft);
      setSaveStatus("saved");
      window.setTimeout(() => {
        navigate(galleryPath, {
          replace: true,
          state: { savedTemplateId: currentTemplateId },
        });
      }, 350);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save template.",
      );
      setSaveStatus("idle");
    }
  };

  const requestReturn = () => {
    if (hasUnsavedChanges) {
      setShowReturnConfirm(true);
      return;
    }
    navigate(galleryPath, { replace: true });
  };

  if (!selectedTemplate) {
    return (
      <PageTransition>
        <main className="relative z-10 min-h-screen bg-transparent py-16 text-softWhite">
          <div className="site-container">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-acidGreen">
              Owner Tools
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <h1 className="font-display text-4xl font-semibold md:text-5xl">
                Template Builder
              </h1>
              <button
                type="button"
                className="editor-action"
                onClick={() => navigate(galleryPath)}
              >
                Open Gallery
              </button>
            </div>
          </div>
        </main>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <main className="relative z-10 min-h-screen bg-transparent py-10 text-softWhite">
        <div className="site-container">
          <div className="flex flex-wrap items-start justify-between gap-5 border-b border-softWhite/12 pb-6">
            <div>
              <button
                type="button"
                className="editor-action"
                onClick={requestReturn}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {language === "zh" ? "返回模板库" : "Back to Gallery"}
              </button>
              <p className="mt-5 font-mono text-xs uppercase tracking-[0.16em] text-acidGreen">
                {selectedTemplate.meta.id}
              </p>
              <h1 className="mt-2 font-display text-4xl font-semibold">
                {selectedTemplate.meta.nameEn}
              </h1>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                className="editor-action border-acidGreen bg-acidGreen text-deepIndigo"
                onClick={() => void saveAndReturn()}
                disabled={saveStatus !== "idle" || loading}
              >
                <Save className="h-3.5 w-3.5" />
                {saveStatus === "saving"
                  ? language === "zh"
                    ? "正在保存…"
                    : "Saving…"
                  : saveStatus === "saved"
                    ? language === "zh"
                      ? "已保存"
                      : "Saved"
                    : language === "zh"
                      ? "保存并返回"
                      : "Save & Return"}
              </button>
              <span
                className={`text-xs ${
                  hasUnsavedChanges
                    ? "text-acidGreen"
                    : "text-softWhite/34"
                }`}
              >
                {hasUnsavedChanges
                  ? language === "zh"
                    ? "有未保存修改"
                    : "Unsaved changes"
                  : language === "zh"
                    ? "当前内容已保存"
                    : "Current content is saved"}
              </span>
            </div>
          </div>

          <section className="mt-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-softWhite/44">
                {language === "zh" ? "实时预览" : "Live preview"}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-softWhite/54">
                  <input
                    type="checkbox"
                    checked={showDebugBoundaries}
                    onChange={(event) => setShowDebugBoundaries(event.target.checked)}
                  />
                  {language === "zh" ? "显示模板边界" : "Show template boundaries"}
                </label>
                <div className="flex border border-softWhite/14">
                  {(["zh", "en"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`px-3 py-1.5 font-mono text-[10px] uppercase ${
                        previewLocale === option
                          ? "bg-archiveBlue text-softWhite"
                          : "text-softWhite/54"
                      }`}
                      onClick={() => setPreviewLocale(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-y border-softWhite/8 py-4">
              <TemplatePreviewFrame>
                {ActiveComponent && activeMeta ? (
                  <TemplateRenderBoundary
                    name={activeMeta.nameEn}
                    resetKey={previewRevision}
                  >
                    <TemplateDebugProvider
                      info={
                        showDebugBoundaries
                          ? {
                              label: `${activeMeta.nameZh} · ${insetDraft}px`,
                              showContentBoundary: true,
                            }
                          : null
                      }
                    >
                      <ActiveComponent
                        content={sampleContent}
                        locale={previewLocale}
                        horizontalInset={insetDraft}
                      />
                    </TemplateDebugProvider>
                  </TemplateRenderBoundary>
                ) : null}
              </TemplatePreviewFrame>
            </div>

            {previewError ? (
              <div className="mt-3 border-l-2 border-peach pl-4 text-sm leading-6 text-peach">
                {previewError}
              </div>
            ) : null}
          </section>

          <section className="mt-8 max-w-4xl">
            <h2 className="font-display text-2xl font-semibold">
              {language === "zh" ? "左右缩进" : "Horizontal Inset"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-softWhite/56">
              {language === "zh"
                ? "同时控制模板左右两侧的对称缩进。"
                : "Controls this template's left and right inset together, symmetrically."}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="editor-action h-9 w-9 justify-center p-0"
                  aria-label={language === "zh" ? "减小" : "Decrease"}
                  onClick={() => setInsetDraft((current) => Math.max(0, current - 8))}
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={400}
                  step={8}
                  value={insetDraft}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setInsetDraft(Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0);
                  }}
                  className="w-24 border-b border-softWhite/18 bg-transparent py-2 text-center text-sm text-softWhite outline-none focus:border-acidGreen"
                />
                <button
                  type="button"
                  className="editor-action h-9 w-9 justify-center p-0"
                  aria-label={language === "zh" ? "增大" : "Increase"}
                  onClick={() => setInsetDraft((current) => Math.min(400, current + 8))}
                >
                  +
                </button>
                <span className="text-sm text-softWhite/48">px</span>
              </div>

              <p className="font-mono text-xs uppercase tracking-[0.1em] text-softWhite/46">
                {hasUnsavedInset
                  ? (language === "zh" ? "有未保存更改" : "Unsaved changes")
                  : (language === "zh" ? "已保存" : "Saved")}
              </p>
            </div>
          </section>

          <section className="mt-8 max-w-4xl">
            <h2 className="font-display text-2xl font-semibold">
              {language === "zh" ? "排版调整" : "Typography"}
            </h2>

            {adjustmentSet && layoutControls ? (
              <div className="mt-5 divide-y divide-softWhite/10 border-y border-softWhite/10">
                {adjustmentSet.fields.map((field) => {
                  const currentValue = layoutControls[field.key];
                  const selectedIndex = Math.max(
                    0,
                    field.options.findIndex(
                      (option) => option.value === currentValue,
                    ),
                  );
                  return (
                    <div
                      key={field.key}
                      className="grid gap-4 py-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center"
                    >
                      <p className="text-sm font-semibold text-softWhite/78">
                        {language === "zh" ? field.zh : field.en}
                      </p>
                      {field.type === "slider" ? (
                        <div>
                          <input
                            aria-label={
                              language === "zh" ? field.zh : field.en
                            }
                            type="range"
                            min="0"
                            max={field.options.length - 1}
                            step="1"
                            value={selectedIndex}
                            className="w-full accent-acidGreen"
                            onChange={(event) => {
                              const option =
                                field.options[Number(event.target.value)];
                              if (option) {
                                updateControl(field.key, option.value);
                              }
                            }}
                          />
                          <div className="mt-2 flex justify-between text-xs text-softWhite/46">
                            {field.options.map((option) => (
                              <span key={option.value}>
                                {language === "zh" ? option.zh : option.en}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {field.options.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`editor-action ${
                                currentValue === option.value
                                  ? "border-acidGreen bg-acidGreen/8 text-acidGreen"
                                  : ""
                              }`}
                              onClick={() =>
                                updateControl(field.key, option.value)
                              }
                            >
                              {language === "zh" ? option.zh : option.en}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="py-5">
                  <button
                    type="button"
                    className="editor-action"
                    onClick={restoreDefaults}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {language === "zh"
                      ? "恢复默认"
                      : "Restore defaults"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-5 text-sm text-softWhite/48">
                {language === "zh"
                  ? "此模板暂时没有可用的排版调整。"
                  : "This template has no typography adjustments yet."}
              </p>
            )}
          </section>

          {selectedTemplate.meta.id === "xmind-breakdown" ? (
            <XMindContentEditor
              mode={
                layoutControls?.displayMode === "double"
                  ? "double"
                  : "single"
              }
              content={templateContent}
              language={language}
              onChange={setTemplateContent}
            />
          ) : null}

          {selectedTemplate.meta.id === "phase-milestones" ? (
            <PhaseMilestonesContentEditor
              emphasisMode={
                layoutControls?.emphasisMode === "second-half"
                  ? "second-half"
                  : "custom"
              }
              content={templateContent}
              language={language}
              onChange={setTemplateContent}
            />
          ) : null}

          {selectedTemplate.meta.id === "circle-summary" ? (
            <CircleSummaryContentEditor
              content={templateContent}
              language={language}
              onChange={setTemplateContent}
            />
          ) : null}

          {selectedTemplate.meta.id === "decision-table" ? (
            <DecisionTableContentEditor
              content={templateContent}
              language={language}
              onChange={setTemplateContent}
            />
          ) : null}

          {selectedTemplate.meta.id === "image-row" ? (
            <ImageRowContentEditor
              content={templateContent}
              language={language}
              onChange={setTemplateContent}
            />
          ) : null}

          {selectedTemplate.meta.id === "figma-prototype" ? (
            <FigmaPrototypeContentEditor
              content={templateContent}
              language={language}
              onChange={setTemplateContent}
            />
          ) : null}

          {error ? (
            <p className="mt-5 border-l-2 border-peach pl-4 text-sm leading-6 text-peach">
              {error}
            </p>
          ) : null}
        </div>

        {showReturnConfirm ? (
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-[#070719]/88 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={
              language === "zh"
                ? "放弃未保存修改"
                : "Discard unsaved changes"
            }
          >
            <div className="w-full max-w-md border border-softWhite/16 bg-[#0b0b24] p-6">
              <h2 className="font-display text-2xl font-semibold">
                {language === "zh"
                  ? "放弃未保存的修改？"
                  : "Discard unsaved changes?"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-softWhite/58">
                {language === "zh"
                  ? "返回模板库后，这些排版修改不会被保存。"
                  : "Your typography changes will not be saved."}
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="editor-action"
                  onClick={() => setShowReturnConfirm(false)}
                >
                  {language === "zh" ? "继续编辑" : "Keep editing"}
                </button>
                <button
                  type="button"
                  className="editor-action border-peach text-peach"
                  onClick={() =>
                    navigate(galleryPath, { replace: true })
                  }
                >
                  {language === "zh"
                    ? "放弃修改并返回"
                    : "Discard and return"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </PageTransition>
  );
}
