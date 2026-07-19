import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { CaseStudyEditorActions, useCaseStudyEditor } from "../components/CaseStudyEditor";
import { PageTransition } from "../components/PageTransition";
import { ProjectCoverEditor } from "../components/ProjectCoverEditor";
import { caseStudyLayout } from "../lib/caseStudyLayout";
import { INTERACTION_PROFILE_AGENT_DRAFT_STORAGE_KEY } from "../lib/interactionProfileAgentDraftStorage";
import { setProjectPublicMetaOverride } from "../lib/projectMetadata";
import { useLocale } from "../locales/LocaleContext";

type Locale = "zh" | "en";
type EvidenceStatus = "implemented" | "planned";

type ChapterCopy = {
  title: string;
  heading: string;
  body: string;
};

type EditableAgentCopy = {
  category: string;
  title: string;
  subtitle: string;
  duration: string;
  context: string;
  chapters: ChapterCopy[];
};

type InteractionAgentDraft = {
  version: 1;
  zh: EditableAgentCopy;
  en: EditableAgentCopy;
  updatedAt: string;
};

type EvidenceSlotCopy = {
  id: string;
  title: string;
  description: string;
  status: EvidenceStatus;
};

const copy = {
  zh: {
    category: "AI AGENT / 交互研究",
    title: "从静态参考到可积累的交互判断",
    subtitle: "构建一个连接交互素材管理与设计评审的双端 Agent，将零散截图转化为包含任务、状态、动效与体验判断的可复用知识。",
    duration: "2026 — 进行中",
    context: "这是一个正在推进中的个人研究项目。当前已完成本地经验建构原型，设计评审端仍处于产品定义与流程验证阶段；页面会明确区分已经实现的基础设施与尚未实现的 Agent 能力。",
    chapters: [
      {
        title: "参考如何限制设计",
        heading: "竞品分析帮助设计快速建立方向，也可能让方向停留在已有答案附近",
        body: "竞品分析本来应该帮助设计师理解不同方案产生的原因，但在真实项目中，它也常被用来为已经存在的方向寻找依据。设计师容易反复依赖自己熟悉的游戏、当前项目已经对标的产品，以及最容易取得的静态截图。\n\n当成熟商业系统、有限时间和有限参考来源不断叠加，团队得到的方案会越来越接近已经被行业验证过的平均解。问题不是这些方案一定错误，而是设计判断的输入逐渐变窄。",
      },
      {
        title: "静态截图丢失了什么",
        heading: "截图保存了视觉结果，却没有保存产生结果的任务、操作与体验",
        body: "一张截图能记录界面长什么样，却无法单独说明用户是谁、正在完成什么任务、对系统是否熟悉、操作发生得多频繁，也无法保留状态转换、动效反馈、实现约束和真实体验。\n\n生成式 AI 可以高效学习和重组这些视觉与文本分布，但输出质量仍取决于输入中已经包含的判断。机会不是继续增加截图数量，而是让截图重新携带人类设计判断。",
      },
      {
        title: "双端交互知识系统",
        heading: "一端积累经验，一端使用证据评审新的设计方案",
        body: "产品被定义为一个双端系统。端口一服务经验建构：收集零散素材、整理统一图库，并记录用户、任务、熟悉度、动机、交互策略维度、视觉证据和评价。端口二服务设计评审：设计师提交自己的 UI 草稿、状态、完整流程或动态证据，Agent 在明确证据边界后给出反馈。\n\n两端通过可积累的设计知识连接，而不是通过一个看似客观的总分连接。",
      },
      {
        title: "端口一：经验建构",
        heading: "从零散文件到包含因果关系的设计记录",
        body: "经验建构端先解决现实中的素材管理问题：截图分散在游戏文件夹、平台目录和临时位置中，游戏卸载后参考也可能一起消失。原型支持管理多个来源、启动扫描、统一图库、去重和安全整理。\n\n素材进入图库后，快速标注用于记录用户熟悉度、玩家动机、界面类型和交互策略维度；高价值案例再进入深度评分和状态对。评分是人工观察结构，不是客观真理。状态对则用操作和预期结果重新连接前后状态。",
      },
      {
        title: "端口二：设计评审",
        heading: "Agent 先判断证据允许它说到哪里，再解释多个方向为何成立",
        body: "设计评审端接收 UI 草稿、交互状态、完整流程、GIF 或视频，并结合 intended user、玩家任务、操作频率、体验目标、视觉设计、动效反馈、实现约束和已有证据进行判断。\n\n最终反馈需要说明观察到了什么、它如何影响任务与体验、严重程度、修改优先级、置信度和缺失证据。Agent 不负责给出唯一标准答案，而是提出多个可成立方向，分别解释适用用户、适用任务、体验收益、取舍以及支持案例。",
      },
      {
        title: "人类修正与知识循环",
        heading: "设计师修正的不只是答案，也是在补充判断成立的条件",
        body: "当 Agent 做出无证据推断、忽略实现约束或错误理解任务时，设计师可以修正观察、补充上下文、调整优先级，并记录分歧原因。修正不会覆盖原始判断，而会成为新的对照数据。\n\n随着优秀案例、反例、状态对与修正记录持续积累，系统逐步形成可检索、可比较、可继续修正的设计知识。它不替代设计师，而是让高质量经验更难丢失。",
      },
      {
        title: "当前进度与验证",
        heading: "已实现经验建构基础设施，评审端仍需分别验证能力与边界",
        body: "当前本地原型已经覆盖来源管理、扫描、统一图库、重复检测、快速标注、自定义分类、玩家动机、交互策略维度、深度评分、状态对、SQLite 持久化和 JSON 导出。GIF／视频证据、任务与体验目标、模型接入、案例检索和人类修正闭环仍在计划中。\n\n验证会把两端分开评估，避免用标注工具可运行来替代对设计评审价值的证明。",
      },
      {
        title: "项目价值",
        heading: "让新的设计站在已有判断之上，而不是一次次从零开始寻找参考",
        body: "这个产品无法自动创造优秀设计，也不把启发式评分包装成客观真理。它尝试保存的是界面为何这样组织、操作如何产生反馈，以及这些选择最终带来了什么体验。\n\n当这些判断能够被检索、质疑和修正时，AI 才不只是更快地组合行业已有答案，而有机会使用更丰富的人类经验支持新的设计探索。",
      },
    ] satisfies ChapterCopy[],
  },
  en: {
    category: "AI AGENT / INTERACTION RESEARCH",
    title: "From Static References to Accumulated Interaction Judgment",
    subtitle: "A dual-sided agent that turns fragmented game UI references into reusable knowledge grounded in tasks, states, motion, and human experience judgment.",
    duration: "2026 — In progress",
    context: "This is an ongoing independent research project. The local experience-building prototype is implemented; the design-review side remains in product definition and flow validation. This case separates completed infrastructure from planned agent capability.",
    chapters: [
      {
        title: "How references constrain design",
        heading: "Competitor analysis helps teams move quickly, but can also keep new work close to existing answers",
        body: "Competitor analysis should reveal why different solutions exist. In practice, it is also used selectively to support an existing direction. Designers repeatedly rely on games they personally know, products already benchmarked by the project, and screenshots that are easiest to obtain.\n\nWhen mature commercial systems, limited time, and narrow reference sources reinforce one another, teams repeatedly produce solutions close to the established industry average. Those solutions are not inherently wrong; the design input has simply become narrower.",
      },
      {
        title: "What static screenshots lose",
        heading: "A screenshot preserves visual output while removing the task, operation, and experience that produced it",
        body: "A screenshot records appearance but cannot independently explain who the user is, what task they are completing, how familiar they are, how frequently the operation occurs, or how state transitions, motion, implementation constraints, and lived experience shaped the result.\n\nGenerative AI can efficiently learn and recombine visual and textual distributions, but its output still depends on the judgment embedded in those inputs. The opportunity is not to collect more screenshots. It is to let screenshots carry human design judgment again.",
      },
      {
        title: "A dual-sided interaction knowledge system",
        heading: "One side builds experience knowledge; the other reviews new proposals against evidence",
        body: "The product is defined as a dual-sided system. Side A supports experience building by collecting fragmented material, organising a central library, and recording users, tasks, familiarity, motivation, interaction-strategy dimensions, visual evidence, and evaluation. Side B supports design review: a designer submits UI drafts, states, a complete flow, or dynamic evidence, and the agent responds within an explicit evidence boundary.\n\nThe two sides connect through accumulated design knowledge, not through a deceptively objective total score.",
      },
      {
        title: "Side A: experience building",
        heading: "From fragmented files to design records that preserve causal relationships",
        body: "The experience-building side first addresses a practical material problem: screenshots are scattered across game folders, platform directories, and temporary locations, and may disappear with an uninstalled game. The prototype manages multiple sources, launch-time scanning, a central library, duplicate detection, and safe organisation.\n\nFast annotation records familiarity, player motivation, screen type, and interaction-strategy dimensions. High-value examples can then receive deep scoring and state pairs. Scores structure human observation; they are not objective truth. State pairs reconnect before and after through an explicit user action and expected result.",
      },
      {
        title: "Side B: design review",
        heading: "The agent first decides what the evidence allows it to claim, then explains why multiple directions may work",
        body: "The review side accepts UI drafts, interaction states, complete flows, GIFs, or video, and evaluates them against the intended user, player task, operation frequency, experience goal, visual design, motion and feedback, implementation constraints, available evidence, and relevant library examples.\n\nThe review explains what was observed, its effect on task and experience, severity, modification priority, confidence, and missing evidence. It does not choose one standard answer. It presents multiple viable directions and states their applicable users, tasks, benefits, trade-offs, and supporting examples.",
      },
      {
        title: "Human correction and the knowledge loop",
        heading: "A correction does more than change an answer; it adds the conditions under which a judgment holds",
        body: "When the agent makes an unsupported inference, misses an implementation constraint, or misunderstands the task, a designer can correct the observation, add context, revise priority, and record the reason for disagreement. The correction does not erase the original output; it becomes comparison data.\n\nAs strong examples, counterexamples, state pairs, and corrections accumulate, the system develops design knowledge that can be retrieved, compared, and revised. It supports designers rather than replacing them.",
      },
      {
        title: "Current progress and validation",
        heading: "Experience-building infrastructure is implemented; review capability and boundaries still require separate validation",
        body: "The local prototype currently covers source management, scanning, a central library, duplicate detection, fast annotation, custom taxonomy, player motivation, interaction-strategy dimensions, deep scoring, state pairs, SQLite persistence, and JSON export. GIF and video evidence, task and experience-goal context, model integration, example retrieval, and the human-correction loop remain planned.\n\nThe two sides will be evaluated separately so a working annotation tool is not mistaken for proof of design-review value.",
      },
      {
        title: "Project value",
        heading: "Let new design stand on accumulated judgment instead of repeatedly rebuilding reference context from zero",
        body: "This product cannot automatically create excellent design, and it does not present heuristic scoring as objective truth. It attempts to preserve why an interface is organised in a particular way, how it responds to an operation, and what experience those choices create.\n\nWhen that judgment can be retrieved, challenged, and corrected, AI can move beyond recombining familiar industry answers and begin supporting exploration with richer human experience.",
      },
    ] satisfies ChapterCopy[],
  },
} as const;

function cloneAgentCopy(value: (typeof copy)[Locale]): EditableAgentCopy {
  return {
    category: value.category,
    title: value.title,
    subtitle: value.subtitle,
    duration: value.duration,
    context: value.context,
    chapters: value.chapters.map((chapter) => ({ ...chapter })),
  };
}

const defaultAgentDraft: InteractionAgentDraft = {
  version: 1,
  zh: cloneAgentCopy(copy.zh),
  en: cloneAgentCopy(copy.en),
  updatedAt: new Date(0).toISOString(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function mergeAgentLocale(value: unknown, fallback: EditableAgentCopy): EditableAgentCopy {
  if (!isRecord(value)) return fallback;
  const chapters = Array.isArray(value.chapters) ? value.chapters : [];

  return {
    ...value,
    category: readString(value.category, fallback.category),
    title: readString(value.title, fallback.title),
    subtitle: readString(value.subtitle, fallback.subtitle),
    duration: readString(value.duration, fallback.duration),
    context: readString(value.context, fallback.context),
    chapters: fallback.chapters.map((chapter, index) => {
      const saved = chapters[index];
      if (!isRecord(saved)) return chapter;
      return {
        ...saved,
        title: readString(saved.title, chapter.title),
        heading: readString(saved.heading, chapter.heading),
        body: readString(saved.body, chapter.body),
      };
    }),
  };
}

function loadAgentDraft(): InteractionAgentDraft {
  if (typeof window === "undefined") return defaultAgentDraft;
  try {
    const raw = window.localStorage.getItem(INTERACTION_PROFILE_AGENT_DRAFT_STORAGE_KEY);
    if (!raw) return defaultAgentDraft;
    const saved = JSON.parse(raw) as unknown;
    if (!isRecord(saved) || saved.version !== 1) return defaultAgentDraft;
    return {
      ...saved,
      version: 1,
      zh: mergeAgentLocale(saved.zh, defaultAgentDraft.zh),
      en: mergeAgentLocale(saved.en, defaultAgentDraft.en),
      updatedAt: readString(saved.updatedAt, defaultAgentDraft.updatedAt),
    };
  } catch {
    return defaultAgentDraft;
  }
}

const detail = {
  zh: {
    backgroundSteps: [
      ["01", "有限参考", "设计师优先使用自己玩过的游戏和项目已有对标。"],
      ["02", "选择性论证", "竞品材料容易被组织成支持既定方向的证据。"],
      ["03", "平均解循环", "有限来源与成熟系统持续强化已经常见的解决方式。"],
    ],
    staticLosses: ["用户与熟悉度", "玩家任务与动机", "操作频率", "前后状态", "动效与反馈", "实现约束", "真实体验判断"],
    sideA: {
      title: "端口一 / 经验建构",
      body: "把素材整理成 AI 可读、设计师也能继续修正的经验记录。",
      steps: ["收集与去重", "快速标注", "深度判断", "状态对", "结构化导出"],
    },
    sideB: {
      title: "端口二 / 设计评审",
      body: "让新方案在任务、证据和相关案例的约束下获得多方向反馈。",
      steps: ["提交方案", "检查证据", "检索案例与反例", "生成多个方向", "人类修正"],
    },
    evidenceBoundary: [
      ["证据充分", "描述观察、影响、优先级，并给出支持案例。"],
      ["证据有限", "降低置信度，明确哪些结论只能暂时成立。"],
      ["关键状态缺失", "停止推断动态行为，要求补充流程、GIF 或视频。"],
    ],
    reviewOutput: ["观察内容", "任务与体验影响", "严重程度", "修改优先级", "置信度", "缺失证据"],
    directions: [
      ["方向 A / 效率优先", "适合熟悉系统、高频重复操作；收益是更直接，代价是较少展示空间。"],
      ["方向 B / 反馈优先", "适合关键成长节点；收益是强化体验，代价是节奏更长。"],
      ["方向 C / 渐进展开", "适合信息复杂且熟悉度不一的用户；收益是兼顾学习与效率，代价是状态设计更复杂。"],
    ],
    correction: ["Agent 给出判断与证据", "设计师标记成立或不成立", "补充条件与反例", "保留原判断和修正原因", "回流为可检索知识"],
    completed: ["多来源截图文件夹管理", "启动时来源扫描", "安全统一图库整理", "重复检测", "源文件重命名与删除流程", "快速标注", "可自定义分类", "用户熟悉度与玩家动机", "交互策略维度", "启发式与视觉深度评分", "A/B 状态对", "SQLite 持久化", "JSON 导出"],
    planned: ["GIF／视频证据", "任务与体验目标上下文", "模型接入", "证据约束评审", "多个可成立方向输出", "优秀案例与反例检索", "人类修正反馈循环"],
    validationA: [["标注时间", "完成一条可复用记录需要多久。"], ["分类理解", "设计师能否稳定理解并使用分类。"], ["检索价值", "历史判断是否比单张截图更容易复用。"], ["状态对价值", "状态对是否比孤立截图提供更多交互信息。"], ["遗忘参考复用", "过去被遗忘的案例是否重新进入设计过程。"]],
    validationB: [["无证据推断数", "评审中有多少结论超出证据边界。"], ["上下文敏感度", "任务和用户变化时建议是否合理变化。"], ["案例相关性", "检索到的案例与反例是否真正支持判断。"], ["方向多样性", "输出是否包含多个有差异且可成立的方向。"], ["反馈可行动性", "设计师能否据此决定下一步。"], ["相对通用 AI 的价值", "是否比缺少上下文的通用评语更有帮助。"], ["修正成本", "设计师需要花多少精力纠正 Agent。"]],
    statusLabels: { implemented: "已实现", planned: "计划中", empty: "等待添加原型截图" },
    evidence: [
      ["fragmented-sources", "零散来源文件夹", "展示截图分散在游戏、平台和临时目录中的问题。", "implemented"],
      ["source-management", "截图来源管理", "添加、启用和配置多个截图来源。", "implemented"],
      ["central-library", "统一图库配置", "为长期保存与安全整理指定中央图库位置。", "implemented"],
      ["scan-result", "来源扫描结果", "区分新增、已登记、重复内容和不可访问文件。", "implemented"],
      ["collision-handling", "重复与冲突处理", "在整理前识别重复内容并保留可恢复路径。", "implemented"],
      ["annotation-main", "快速标注主界面", "在浏览截图的同时完成核心上下文记录。", "implemented"],
      ["taxonomy", "可自定义分类", "项目可调整界面类型与其他分类词表。", "implemented"],
      ["motivation", "玩家动机多选", "记录界面主要服务的玩家需求。", "implemented"],
      ["strategy-dimensions", "交互策略维度", "记录交互倾向，而不是把倾向误写成质量分。", "implemented"],
      ["deep-scoring", "深度评分", "为高价值案例记录启发式、视觉证据、风险与置信度。", "implemented"],
      ["state-pair", "状态对创建", "明确 A/B 状态、用户操作与预期结果。", "implemented"],
      ["record-review", "完整记录复核", "检查快速标注、深度判断与状态关系是否完整。", "implemented"],
      ["json-export", "JSON 导出与数据结构", "将 SQLite 中的结构化判断导出为不含图片的知识包。", "implemented"],
      ["review-flow", "设计评审流程", "提交方案、确定证据边界、检索案例并输出多个方向。", "planned"],
    ] satisfies Array<[string, string, string, EvidenceStatus]>,
  },
  en: {
    backgroundSteps: [["01", "Narrow references", "Designers rely on personally familiar games and existing project benchmarks."], ["02", "Selective support", "Competitor material is organised to support a direction already under consideration."], ["03", "Average-solution loop", "Narrow sources and mature systems reinforce familiar solutions."]],
    staticLosses: ["User and familiarity", "Player task and motivation", "Operation frequency", "Before/after states", "Motion and feedback", "Implementation constraints", "Human experience judgment"],
    sideA: { title: "Side A / Experience building", body: "Turn material into AI-readable experience records that designers can continue correcting.", steps: ["Collect and deduplicate", "Fast annotation", "Deep judgment", "State pairs", "Structured export"] },
    sideB: { title: "Side B / Design review", body: "Review new proposals within task, evidence, and relevant-example constraints.", steps: ["Submit proposal", "Check evidence", "Retrieve examples and counterexamples", "Generate viable directions", "Human correction"] },
    evidenceBoundary: [["Sufficient evidence", "Describe observations, impact, priority, and supporting examples."], ["Limited evidence", "Lower confidence and state which conclusions are provisional."], ["Missing critical states", "Stop inferring dynamic behaviour and request a flow, GIF, or video."]],
    reviewOutput: ["Observation", "Task and experience impact", "Severity", "Modification priority", "Confidence", "Missing evidence"],
    directions: [["Direction A / Efficiency first", "For familiar users and frequent operation; faster, with less presentation space."], ["Direction B / Feedback first", "For key progression moments; stronger experience, with a longer rhythm."], ["Direction C / Progressive disclosure", "For complex information and mixed familiarity; balances learning and speed, with more state complexity."]],
    correction: ["Agent states judgment and evidence", "Designer marks what holds", "Add conditions and counterexamples", "Retain original and correction reason", "Return it to retrievable knowledge"],
    completed: ["Multi-source screenshot-folder management", "Launch-time source scanning", "Safe central-library organisation", "Duplicate detection", "Source rename and deletion workflow", "Fast annotation", "Custom taxonomy", "User familiarity and player motivations", "Interaction-strategy dimensions", "Heuristic and visual deep scoring", "A/B state pairs", "SQLite persistence", "JSON export"],
    planned: ["GIF/video evidence", "Task and experience-goal context", "Model integration", "Evidence-bound review", "Multiple viable design directions", "Strong-example and counterexample retrieval", "Human-correction feedback loop"],
    validationA: [["Annotation time", "Time required to create a reusable record."], ["Taxonomy comprehension", "Whether designers understand and apply categories consistently."], ["Retrieval usefulness", "Whether past judgment is easier to reuse than isolated screenshots."], ["State-pair value", "Whether state pairs carry more interaction information."], ["Forgotten-reference reuse", "Whether older examples re-enter design work."]],
    validationB: [["Unsupported inferences", "How many claims exceed the evidence boundary."], ["Context sensitivity", "Whether recommendations change appropriately with task and user."], ["Retrieved-example relevance", "Whether examples and counterexamples support the judgment."], ["Direction diversity", "Whether outputs include meaningfully different viable directions."], ["Feedback actionability", "Whether a designer can decide what to do next."], ["Value over generic AI", "Whether it helps more than critique without context."], ["Correction effort", "How much work designers spend correcting the agent."]],
    statusLabels: { implemented: "Implemented", planned: "Planned", empty: "Prototype capture slot" },
    evidence: [
      ["fragmented-sources", "Fragmented source folders", "Show screenshots dispersed across game, platform, and temporary folders.", "implemented"],
      ["source-management", "Screenshot-source management", "Add, enable, and configure multiple screenshot sources.", "implemented"],
      ["central-library", "Central-library configuration", "Choose a durable library for safe organisation.", "implemented"],
      ["scan-result", "Source scan result", "Distinguish new, registered, duplicate, and inaccessible files.", "implemented"],
      ["collision-handling", "Duplicate and collision handling", "Identify duplicate content before organisation and retain recovery paths.", "implemented"],
      ["annotation-main", "Fast annotation workspace", "Record core context while browsing screenshots.", "implemented"],
      ["taxonomy", "Custom taxonomy", "Adapt screen types and other vocabularies to a project.", "implemented"],
      ["motivation", "Player-motivation multi-select", "Record the player needs primarily served by the screen.", "implemented"],
      ["strategy-dimensions", "Interaction-strategy dimensions", "Capture tendencies without treating them as quality scores.", "implemented"],
      ["deep-scoring", "Deep scoring", "Record heuristics, visual evidence, risks, and confidence for high-value examples.", "implemented"],
      ["state-pair", "State-pair creation", "Make A/B states, user action, and expected result explicit.", "implemented"],
      ["record-review", "Completed-record review", "Check whether context, judgment, and state relationships are complete.", "implemented"],
      ["json-export", "JSON export and data structure", "Export structured SQLite judgment as an image-free knowledge package.", "implemented"],
      ["review-flow", "Design-review flow", "Submit a proposal, set the evidence boundary, retrieve examples, and output viable directions.", "planned"],
    ] satisfies Array<[string, string, string, EvidenceStatus]>,
  },
} as const;

export function InteractionProfileAgentPage() {
  const { locale, messages, pathFor } = useLocale();
  const [draft, setDraft] = useState<InteractionAgentDraft>(() => loadAgentDraft());
  const { isEditing } = useCaseStudyEditor();
  const [saveStatus, setSaveStatus] = useState<"ready" | "saving" | "saved" | "error">("ready");
  const didMount = useRef(false);
  const current = draft[locale];
  const d = detail[locale];
  const evidence = d.evidence.map(([id, title, description, status]) => ({ id, title, description, status })) as EvidenceSlotCopy[];

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return undefined;
    }
    setSaveStatus("saving");
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(INTERACTION_PROFILE_AGENT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
        try {
          setProjectPublicMetaOverride("interaction-profile-agent", {
            titleZh: draft.zh.title,
            titleEn: draft.en.title,
            summaryZh: draft.zh.subtitle,
            summaryEn: draft.en.subtitle,
            duration: draft.zh.duration,
          });
        } catch {
          // The case draft remains authoritative if public metadata cannot be updated.
        }
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [draft]);

  const updateCurrent = (updater: (value: EditableAgentCopy) => EditableAgentCopy) => {
    setDraft((existing) => ({
      ...existing,
      [locale]: updater(existing[locale]),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateChapter = (index: number, chapter: ChapterCopy) => {
    updateCurrent((value) => ({
      ...value,
      chapters: value.chapters.map((existing, chapterIndex) => chapterIndex === index ? chapter : existing),
    }));
  };

  return (
    <PageTransition>
      <article className="overflow-hidden bg-deepIndigo text-softWhite">
        {isEditing ? <div className="fixed right-3 top-[132px] z-[79] md:right-6 md:top-[136px]"><CaseStudyEditorActions saveStatus={saveStatus} /></div> : null}
        <section className={caseStudyLayout.heroSection}>
          <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-25" />
          <div className={caseStudyLayout.heroContainer}>
            <Link to={pathFor("/work")} className={caseStudyLayout.backLink}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {messages.project.backToArchive}
            </Link>
            <div className={caseStudyLayout.heroComposition}>
              <div className={caseStudyLayout.heroCopy}>
                <EditableAgentText label="Category" value={current.category} isEditing={isEditing} onChange={(category) => updateCurrent((value) => ({ ...value, category }))} className={caseStudyLayout.category} />
                <EditableAgentText label="Project title" value={current.title} isEditing={isEditing} multiline onChange={(title) => updateCurrent((value) => ({ ...value, title }))} className={caseStudyLayout.heroTitle} as="h1" />
                <EditableAgentText label="Subtitle" value={current.subtitle} isEditing={isEditing} multiline onChange={(subtitle) => updateCurrent((value) => ({ ...value, subtitle }))} className={caseStudyLayout.subtitle} />
              </div>
              <div className={caseStudyLayout.durationPosition}>
                <EditableAgentText label="Duration" value={current.duration} isEditing={isEditing} onChange={(duration) => updateCurrent((value) => ({ ...value, duration }))} className={caseStudyLayout.durationText} />
              </div>
            </div>
          </div>
        </section>

        {isEditing ? <ProjectCoverEditor projectId="interaction-profile-agent" locale={locale} /> : null}

        <section className="border-b border-softWhite/10 py-8 md:py-10">
          <div className="site-container">
            <EditableAgentText label="Project context" value={current.context} isEditing={isEditing} multiline onChange={(context) => updateCurrent((value) => ({ ...value, context }))} className="text-[clamp(1rem,1.1vw,1.125rem)] leading-[1.85] text-softWhite/68" />
          </div>
        </section>

        <section className={caseStudyLayout.contentSection}>
          <div className={caseStudyLayout.contentStack}>
            <MajorSection index={0} chapter={current.chapters[0]} isEditing={isEditing} onChange={(chapter) => updateChapter(0, chapter)}>
              <EditorialRows items={d.backgroundSteps} />
              <PullQuote>{locale === "zh" ? "AI 可以迅速组合平均解，但如果没有新的判断输入，它只会更高效地复制行业已经拥有的答案。" : "AI can rapidly recombine average solutions, but without new judgment in its inputs, it only reproduces answers the industry already has more efficiently."}</PullQuote>
              <EvidenceGrid items={evidence.slice(0, 1)} labels={d.statusLabels} columns="single" />
            </MajorSection>

            <MajorSection index={1} chapter={current.chapters[1]} isEditing={isEditing} onChange={(chapter) => updateChapter(1, chapter)}>
              <LossStrip items={d.staticLosses} />
              <PullQuote>{locale === "zh" ? "真正值得积累的不是界面长什么样，而是它为什么这样组织、如何响应操作，以及它最终带来了什么体验。" : "What is worth accumulating is not what an interface looks like, but why it is organised that way, how it responds to action, and what experience it creates."}</PullQuote>
              <p className="text-center text-xl font-semibold leading-9 text-softWhite/76 md:text-2xl">
                {locale === "zh" ? "问题不是 AI 缺少更多截图，而是现有截图没有携带足够的人类判断。" : "The problem is not that AI lacks more screenshots. Existing screenshots do not carry enough human judgment."}
              </p>
            </MajorSection>

            <MajorSection index={2} chapter={current.chapters[2]} isEditing={isEditing} onChange={(chapter) => updateChapter(2, chapter)}>
              <DualSystem sideA={d.sideA} sideB={d.sideB} />
            </MajorSection>

            <MajorSection index={3} chapter={current.chapters[3]} isEditing={isEditing} onChange={(chapter) => updateChapter(3, chapter)}>
              <Subsection title={locale === "zh" ? "多来源截图与统一图库" : "Multi-source screenshots and a central library"}>
                <EvidenceGrid items={evidence.slice(1, 5)} labels={d.statusLabels} />
              </Subsection>
              <Subsection title={locale === "zh" ? "快速标注与交互策略维度" : "Fast annotation and interaction-strategy dimensions"}>
                <EvidenceGrid items={evidence.slice(5, 9)} labels={d.statusLabels} />
              </Subsection>
              <Subsection title={locale === "zh" ? "深度评分、状态对和动态证据" : "Deep scoring, state pairs, and dynamic evidence"}>
                <PullQuote>{locale === "zh" ? "状态对不是把两张相似截图放在一起，而是重新建立操作与结果之间的因果关系。" : "A state pair is not two similar screenshots placed together. It rebuilds the causal relationship between an action and its result."}</PullQuote>
                <EvidenceGrid items={evidence.slice(9, 13)} labels={d.statusLabels} />
              </Subsection>
            </MajorSection>

            <MajorSection index={4} chapter={current.chapters[4]} isEditing={isEditing} onChange={(chapter) => updateChapter(4, chapter)}>
              <Subsection title={locale === "zh" ? "根据证据决定评审边界" : "Let evidence define the review boundary"}>
                <EditorialRows items={d.evidenceBoundary.map((item, index) => [String(index + 1).padStart(2, "0"), ...item])} />
              </Subsection>
              <Subsection title={locale === "zh" ? "完整的交互与体验反馈" : "Complete interaction and experience feedback"}>
                <OutputSequence items={d.reviewOutput} />
              </Subsection>
              <Subsection title={locale === "zh" ? "多个成立方向，而非唯一标准答案" : "Multiple viable directions, not one standard answer"}>
                <DirectionList items={d.directions} />
                <PullQuote>{locale === "zh" ? "Agent 不负责选择唯一方向，而是帮助设计师理解不同方向为什么成立。" : "The agent does not choose one direction. It helps designers understand why different directions may work."}</PullQuote>
              </Subsection>
              <Subsection title={locale === "zh" ? "优秀案例与反例检索" : "Strong-example and counterexample retrieval"}>
                <EvidenceGrid items={evidence.slice(13)} labels={d.statusLabels} columns="single" />
              </Subsection>
            </MajorSection>

            <MajorSection index={5} chapter={current.chapters[5]} isEditing={isEditing} onChange={(chapter) => updateChapter(5, chapter)}>
              <CorrectionLoop items={d.correction} />
            </MajorSection>

            <MajorSection index={6} chapter={current.chapters[6]} isEditing={isEditing} onChange={(chapter) => updateChapter(6, chapter)}>
              <ProgressColumns completed={d.completed} planned={d.planned} locale={locale} />
              <ValidationSection title={locale === "zh" ? "经验建构端验证" : "Experience-building validation"} items={d.validationA} />
              <ValidationSection title={locale === "zh" ? "设计评审端验证" : "Design-review validation"} items={d.validationB} />
            </MajorSection>

            <MajorSection index={7} chapter={current.chapters[7]} isEditing={isEditing} onChange={(chapter) => updateChapter(7, chapter)}>
              <PullQuote>{locale === "zh" ? "这个产品无法自动创造优秀设计，但它可以让优秀经验不再轻易丢失，让新的设计更有机会站在已有判断之上继续向前。" : "This product cannot automatically create excellent design, but it can keep strong experience from disappearing and give new design a better chance to build on accumulated judgment."}</PullQuote>
            </MajorSection>
          </div>
        </section>
      </article>
    </PageTransition>
  );
}

function MajorSection({ index, chapter, isEditing, onChange, children }: { index: number; chapter: ChapterCopy; isEditing: boolean; onChange: (chapter: ChapterCopy) => void; children: React.ReactNode }) {
  return (
    <section className="scroll-mt-24">
      <div className={caseStudyLayout.majorGrid}>
        <div className={caseStudyLayout.majorTitleComposition}>
          <span aria-hidden="true" className={caseStudyLayout.majorNumber}>{String(index + 1).padStart(2, "0")}</span>
          <div className={caseStudyLayout.majorTitleOffset}><EditableAgentText label="Section title" value={chapter.title} isEditing={isEditing} multiline onChange={(title) => onChange({ ...chapter, title })} className={caseStudyLayout.majorTitle} as="h2" /></div>
        </div>
        <div className={caseStudyLayout.majorCopy}>
          <EditableAgentText label="Section heading" value={chapter.heading} isEditing={isEditing} multiline onChange={(heading) => onChange({ ...chapter, heading })} className={caseStudyLayout.majorHeading} as="h3" />
          <EditableAgentText label="Section body" value={chapter.body} isEditing={isEditing} multiline paragraphs onChange={(body) => onChange({ ...chapter, body })} className={caseStudyLayout.majorBody} />
        </div>
      </div>
      <div className={caseStudyLayout.blocks}>{children}</div>
    </section>
  );
}

function EditableAgentText({ label, value, isEditing, onChange, className, multiline = false, paragraphs = false, as = "div" }: { label: string; value: string; isEditing: boolean; onChange: (value: string) => void; className: string; multiline?: boolean; paragraphs?: boolean; as?: "div" | "h1" | "h2" | "h3" }) {
  if (isEditing) {
    return <label className="block min-w-0 rounded-[8px] border border-dashed border-electricBlue/40 bg-archiveBlue/12 p-3"><span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-acidGreen/72">{label}</span>{multiline ? <textarea className={`w-full min-w-0 resize-y bg-transparent outline-none ${className}`} rows={Math.max(2, value.split("\n").length + 1)} value={value} onChange={(event) => onChange(event.target.value)} /> : <input className={`w-full min-w-0 bg-transparent outline-none ${className}`} value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
  }
  if (paragraphs) return <div className={className}>{value.split(/\n{2,}/).map((paragraph) => <p key={paragraph} className="mb-5 whitespace-pre-line last:mb-0">{paragraph}</p>)}</div>;
  const Tag = as;
  return <Tag className={className}>{value}</Tag>;
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-14 first:mt-0 md:mt-20"><h4 className="text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite">{title}</h4><div className="mt-8 md:mt-10">{children}</div></section>;
}

function EditorialRows({ items }: { items: readonly (readonly string[])[] }) {
  return <div className="divide-y divide-softWhite/12 border-y border-softWhite/12">{items.map(([number, title, body]) => <div key={`${number}-${title}`} className="grid gap-3 py-7 md:grid-cols-[5rem_minmax(200px,0.8fr)_1.4fr] md:gap-7"><span className="font-mono text-sm font-bold text-acidGreen">{number}</span><h4 className="text-lg font-semibold leading-7 text-softWhite/82">{title}</h4><p className="text-base leading-7 text-softWhite/60">{body}</p></div>)}</div>;
}

function PullQuote({ children }: { children: React.ReactNode }) {
  return <blockquote className="mx-auto my-12 max-w-5xl border-l border-acidGreen/55 py-2 pl-6 font-display text-[clamp(1.55rem,2.6vw,2.8rem)] leading-[1.35] text-softWhite/82 md:my-16 md:pl-8">{children}</blockquote>;
}

function LossStrip({ items }: { items: readonly string[] }) {
  return <div className="grid divide-y divide-softWhite/10 border-y border-softWhite/12 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-7">{items.map((item, index) => <div key={item} className="p-4"><span className="font-mono text-[10px] text-acidGreen/68">{String(index + 1).padStart(2, "0")}</span><p className="mt-3 text-sm font-semibold leading-6 text-softWhite/68">{item}</p></div>)}</div>;
}

function DualSystem({ sideA, sideB }: { sideA: { title: string; body: string; steps: readonly string[] }; sideB: { title: string; body: string; steps: readonly string[] } }) {
  return <div className="grid gap-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center"><SystemSide value={sideA} /><ArrowRight className="mx-auto hidden h-7 w-7 text-acidGreen/65 lg:block" aria-hidden="true" /><SystemSide value={sideB} /></div>;
}

function SystemSide({ value }: { value: { title: string; body: string; steps: readonly string[] } }) {
  return <div className="border-y border-softWhite/12 py-7"><h4 className="font-display text-2xl font-semibold text-acidGreen">{value.title}</h4><p className="mt-3 text-base leading-7 text-softWhite/62">{value.body}</p><div className="mt-6 divide-y divide-softWhite/10">{value.steps.map((step, index) => <p key={step} className="flex gap-4 py-3 text-sm text-softWhite/68"><span className="font-mono text-[10px] text-softWhite/34">{String(index + 1).padStart(2, "0")}</span>{step}</p>)}</div></div>;
}

function EvidenceGrid({ items, labels, columns = "two" }: { items: EvidenceSlotCopy[]; labels: { implemented: string; planned: string; empty: string }; columns?: "single" | "two" }) {
  return <div className={`grid gap-x-7 gap-y-10 ${columns === "two" && items.length > 1 ? "md:grid-cols-2" : "mx-auto max-w-5xl"}`}>{items.map((item) => <figure key={item.id} className="min-w-0"><div className="case-study-media-frame"><div className="case-study-media-placeholder"><span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-softWhite/34">{labels.empty}</span></div></div><figcaption className="mt-4"><div className="flex flex-wrap items-center gap-3"><span className={`font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${item.status === "implemented" ? "text-acidGreen" : "text-[#9FAAD2]"}`}>{labels[item.status]}</span><h5 className="text-base font-semibold text-softWhite/82">{item.title}</h5></div><p className="mt-2 text-sm leading-6 text-softWhite/56">{item.description}</p></figcaption></figure>)}</div>;
}

function OutputSequence({ items }: { items: readonly string[] }) {
  return <div className="grid gap-3 md:grid-cols-6">{items.map((item, index) => <div key={item} className="border-t border-acidGreen/45 pt-4"><span className="font-mono text-[10px] text-acidGreen/65">{String(index + 1).padStart(2, "0")}</span><p className="mt-2 text-sm font-semibold leading-6 text-softWhite/72">{item}</p></div>)}</div>;
}

function DirectionList({ items }: { items: readonly (readonly string[])[] }) {
  return <div className="divide-y divide-softWhite/12 border-y border-softWhite/12">{items.map(([title, body]) => <div key={title} className="grid gap-3 py-6 md:grid-cols-[minmax(220px,0.65fr)_1.35fr] md:gap-8"><h5 className="text-lg font-semibold text-softWhite/82">{title}</h5><p className="text-base leading-7 text-softWhite/60">{body}</p></div>)}</div>;
}

function CorrectionLoop({ items }: { items: readonly string[] }) {
  return <div className="grid gap-3 md:grid-cols-5 md:items-center">{items.map((item, index) => <div key={item} className="contents"><div className="flex min-h-24 items-center justify-center rounded-[8px] bg-archiveBlue/24 px-4 text-center text-sm font-semibold leading-6 text-softWhite/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">{item}</div>{index < items.length - 1 ? <ArrowDown className="mx-auto h-4 w-4 text-acidGreen/55 md:hidden" aria-hidden="true" /> : null}</div>)}</div>;
}

function ProgressColumns({ completed, planned, locale }: { completed: readonly string[]; planned: readonly string[]; locale: Locale }) {
  return <div className="grid gap-10 lg:grid-cols-2"><ProgressList title={locale === "zh" ? "已实现" : "Implemented"} items={completed} accent /><ProgressList title={locale === "zh" ? "计划中" : "Planned"} items={planned} /></div>;
}

function ProgressList({ title, items, accent = false }: { title: string; items: readonly string[]; accent?: boolean }) {
  return <section><h4 className={`font-display text-2xl font-semibold ${accent ? "text-acidGreen" : "text-[#9FAAD2]"}`}>{title}</h4><div className="mt-5 divide-y divide-softWhite/10 border-y border-softWhite/12">{items.map((item, index) => <p key={item} className="flex gap-4 py-3 text-sm leading-6 text-softWhite/66"><span className="font-mono text-[10px] text-softWhite/32">{String(index + 1).padStart(2, "0")}</span>{item}</p>)}</div></section>;
}

function ValidationSection({ title, items }: { title: string; items: readonly (readonly string[])[] }) {
  return <section className="mt-16"><h4 className="text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold text-softWhite">{title}</h4><div className="mt-8 grid gap-x-8 gap-y-7 md:grid-cols-2">{items.map(([name, description]) => <div key={name} className="border-t border-softWhite/14 pt-5"><h5 className="text-lg font-semibold text-softWhite/80">{name}</h5><p className="mt-2 text-sm leading-7 text-softWhite/58">{description}</p></div>)}</div></section>;
}
