import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Download,
  FileUp,
  Plus,
  Trash2,
} from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { CaseStudyEditorActions, useCaseStudyEditor } from "../components/CaseStudyEditor";
import { ProjectCoverEditor } from "../components/ProjectCoverEditor";
import { XMindBranchViewer } from "../components/XMindBranchViewer";
import { threeDCharacterSystemMap, type SystemMapLocalizedText } from "../data/three-d-character-system-map";
import { useLocale } from "../locales/LocaleContext";
import type { Locale } from "../locales/types";
import {
  deleteThreeDCharacterDraftImage,
  getThreeDCharacterDraftImage,
  putThreeDCharacterDraftImage,
  type ThreeDCharacterDraftImageRecord,
} from "../lib/threeDCharacterImageDraftDb";
import { THREE_D_CHARACTER_DRAFT_STORAGE_KEY } from "../lib/threeDCharacterDraftStorage";
import { caseStudyLayout } from "../lib/caseStudyLayout";
import { setProjectPublicMetaOverride } from "../lib/projectMetadata";

const AUTOSAVE_DELAY_MS = 400;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"];
const MAXIMUM_IMAGE_SIZE = 20 * 1024 * 1024;
const HIDDEN_CASE_BLOCK_IDS = new Set([
  "attention-comparison",
  "attention-observations",
  "progression-flow",
  "progression-result",
]);

type DraftImageSlot = { publicPath: string; localImageId?: string };
type ChapterId = "attention" | "progression" | "production";
type SaveStatus = "ready" | "saving" | "saved" | "error";
type NarrativeApplyStatus = "idle" | "applied" | "error";

type ParagraphBlock = { id: string; type: "paragraph"; body: string };
type ComparisonBlock = {
  id: string;
  type: "comparison";
  leftTitle: string;
  leftDescription: string;
  leftImage: DraftImageSlot;
  rightTitle: string;
  rightDescription: string;
  rightImage: DraftImageSlot;
};
type FlowBlock = { id: string; type: "flow"; steps: string[] };
type StaticDemoBlock = {
  id: string;
  type: "staticDemo";
  items: { description: string; image: DraftImageSlot }[];
  demoTitle: string;
  demoDescription: string;
  demoImage: DraftImageSlot;
};
type PrinciplesBlock = {
  id: string;
  type: "principles";
  title: string;
  items: { title: string; description: string }[];
};
type GalleryBlock = {
  id: string;
  type: "gallery";
  intro: string;
  items: { title: string; description: string; image: DraftImageSlot }[];
};
type ResultBlock = { id: string; type: "result"; body: string };
type ReflectionBlock = { id: string; type: "reflection"; title: string; body: string };
type ContentBlock = ParagraphBlock | ComparisonBlock | FlowBlock | StaticDemoBlock | PrinciplesBlock | GalleryBlock | ResultBlock | ReflectionBlock;
type TemplateType = Exclude<ContentBlock["type"], "flow">;

type ChapterDraft = {
  id: ChapterId;
  navLabel: string;
  title: string;
  heading: string;
  body: string;
  blocks: ContentBlock[];
};

type LocalizedDraftText = SystemMapLocalizedText;
type SystemMappingConclusion = {
  title: LocalizedDraftText;
  body: LocalizedDraftText;
};
type SystemMappingReference = {
  image: DraftImageSlot;
  primary: LocalizedDraftText;
  secondary: LocalizedDraftText;
  source: LocalizedDraftText;
};
type SystemMappingDraft = {
  eyebrow: LocalizedDraftText;
  heading: LocalizedDraftText;
  introduction: LocalizedDraftText;
  references: [SystemMappingReference, SystemMappingReference, SystemMappingReference];
  summaryTitle: LocalizedDraftText;
  conclusions: [SystemMappingConclusion, SystemMappingConclusion, SystemMappingConclusion];
  transition: LocalizedDraftText;
};
type SystemMappingLocalizedField = Exclude<keyof SystemMappingDraft, "conclusions" | "references">;

export type ThreeDCharacterDraft = {
  version: 1;
  updatedAt: string;
  hero: {
    category: string;
    title: string;
    subtitle: string;
    role: string;
    responsibilities: string;
    duration: string;
    cover: DraftImageSlot;
  };
  context: string;
  question: string;
  systemMapping: SystemMappingDraft;
  chapters: ChapterDraft[];
  reflection: { title: string; body: string };
};

const emptyImage = (): DraftImageSlot => ({ publicPath: "" });
const fixedDate = "2026-07-15T00:00:00.000Z";

const defaultDraft: ThreeDCharacterDraft = {
  version: 1,
  updatedAt: fixedDate,
  hero: {
    category: "商业项目 / 早期研发 / 系统 UI",
    title: "从系统驱动到体验驱动：重新分配界面节奏",
    subtitle: "在成熟养成框架中，重新组织高频系统操作与连续角色体验之间的注意力分配。",
    role: "UI Designer",
    responsibilities: "英雄养成交互探索 / 公会系统铺量 / 交互演示 / UI 规范探索",
    duration: "2021.07 — 2024.02",
    cover: emptyImage(),
  },
  context: "项目建立在一套成熟的任务驱动型养成框架上。玩家日常通过任务、入口、资源提示和奖励反馈，在多个系统之间高频切换，UI 不只是辅助工具，也是主要的玩法承载面。\n\n随着项目希望将更多注意力留给角色、场景与成长表现，原有系统逻辑开始暴露出节奏冲突：界面仍在持续安排玩家下一步行动，并以相近的表现强度处理重复操作与关键成长时刻。",
  question: "当玩家的主要行为从菜单中的高频系统操作，转向更连续的角色与内容体验时，UI 如何保留必要的操作效率，同时减少对玩家注意力的持续占用？",
  systemMapping: {
    eyebrow: { zh: "01 / SYSTEM MAPPING", en: "01 / SYSTEM MAPPING" },
    heading: {
      zh: "先看清界面如何持续组织玩家行动",
      en: "Mapping the system before redesigning its rhythm",
    },
    introduction: {
      zh: "原有体验通过任务、系统入口、资源提示和奖励反馈，持续告诉玩家下一步去哪里、完成什么、领取什么。英雄升级只是其中一条路径，玩家每天还需要在公会、副本、PVP、周期活动与多种资源线之间反复切换。\n\n在进入具体界面设计前，我先拆解了这套任务驱动与养成结构，观察高频操作如何发生、资源判断如何叠加，以及相近强度的反馈如何让关键成长时刻失去停顿。",
      en: "The existing experience used tasks, system entrances, resource prompts, and reward feedback to continually direct where players should go, what they should complete, and what they should claim next. Hero upgrading was only one path among guild activities, battles, PVP, recurring events, and multiple resource lines.\n\nBefore redesigning individual screens, I mapped this task-driven progression structure to understand how frequent actions occurred, how resource decisions accumulated, and how uniformly weighted feedback removed pause from meaningful progression moments.",
    },
    references: [
      {
        image: emptyImage(),
        primary: { zh: "高频入口需要先服务切换效率", en: "High-frequency entrances should prioritize switching efficiency" },
        secondary: {
          zh: "日常任务、活动和养成入口的组织方式，会直接影响玩家是否能快速进入当天循环。",
          en: "How daily tasks, events, and progression entrances are organized directly affects how quickly players can enter the daily loop.",
        },
        source: { zh: "来源：案例参考 01", en: "Source: Case reference 01" },
      },
      {
        image: emptyImage(),
        primary: { zh: "成长反馈应该集中在关键时刻被看见", en: "Progression feedback should be visible at key moments" },
        secondary: {
          zh: "当强化、升级和资源消耗高频发生时，UI 需要区分重复操作与值得展示的成长反馈。",
          en: "When enhancement, upgrading, and resource spending happen frequently, the UI should distinguish repeated actions from progression worth emphasizing.",
        },
        source: { zh: "来源：案例参考 02", en: "Source: Case reference 02" },
      },
      {
        image: emptyImage(),
        primary: { zh: "角色体验需要从界面中被释放出来", en: "The character experience needs room beyond the interface" },
        secondary: {
          zh: "当角色、内容和表现成为体验重点时，系统信息应适度退后，避免持续争夺注意力。",
          en: "When characters, content, and presentation become the focus, system information should recede enough to avoid continuously competing for attention.",
        },
        source: { zh: "来源：案例参考 03", en: "Source: Case reference 03" },
      },
    ],
    summaryTitle: {
      zh: "从系统拆解中得到的判断",
      en: "What the system map revealed",
    },
    conclusions: [
      {
        title: { zh: "任务与入口组织玩家行动", en: "Tasks and entrances organize player action" },
        body: {
          zh: "每日任务、活动、公会、副本与 PVP 持续指定玩家下一步需要进入的系统，界面承担了主要的行动组织功能。",
          en: "Daily tasks, events, guild activities, battles, and PVP repeatedly determine which system the player enters next, making the interface a primary organizer of action.",
        },
      },
      {
        title: { zh: "高频切换强化了系统效率", en: "Frequent switching reinforces system efficiency" },
        body: {
          zh: "等级、技能、阶级、装备与多种资源线并行存在，玩家需要在短时间内完成大量状态判断和重复操作。",
          en: "Parallel progression systems require players to make repeated state and resource decisions across many short interactions.",
        },
      },
      {
        title: { zh: "相同强度的反馈稀释关键时刻", en: "Uniform feedback dilutes meaningful moments" },
        body: {
          zh: "领取、兑换、扫荡与连续升级占据了大部分操作节奏，真正重要的成长变化因此缺少足够的停顿和表现空间。",
          en: "Claiming, exchanging, sweeping, and repeated upgrading dominate the interaction rhythm, leaving meaningful progression changes without sufficient pause or expressive space.",
        },
      },
    ],
    transition: {
      zh: "问题并不是简单地减少界面信息，而是重新判断哪些操作需要高效完成，哪些时刻值得玩家停下来感受。",
      en: "The goal was not simply to reduce information, but to distinguish which actions needed to remain efficient and which moments deserved the player’s attention.",
    },
  },
  chapters: [
    {
      id: "attention",
      navLabel: "发现节奏冲突",
      title: "看见系统驱动的惯性",
      heading: "原有 UI 不只是展示信息，而是在持续组织玩家的下一步行动。",
      body: "任务、入口、资源提示与奖励反馈共同构成了稳定而高效的系统循环。玩家可以快速完成大量操作，但也需要持续响应界面安排的下一步行动。\n\n问题不在于界面信息是否足够多，而在于界面是否仍然是主要的玩法发生地。",
      blocks: [
        {
          id: "attention-observations",
          type: "principles",
          title: "界面持续占用注意力的表现",
          items: [
            { title: "01", description: "任务与系统入口持续指定下一步行动" },
            { title: "02", description: "多条资源线要求频繁切换和状态判断" },
            { title: "03", description: "重复操作与关键成长使用相近反馈强度" },
          ],
        },
      ],
    },
    {
      id: "progression",
      navLabel: "重建养成反馈",
      title: "英雄养成交互重建",
      heading: "把高频操作与关键成长时刻区分开",
      body: "早期方案几乎沿用了原有养成界面的组织方式：为了让升级、升星和资源判断都能在一个页面中快速完成，按钮、材料信息、数值反馈和结果展示被集中放在首屏中。这样虽然保留了操作效率，却也压缩了角色模型的展示区域，让界面本身变得比角色更抢眼。\n\n问题并不只是“信息太多”，而是信息和表现被放在了同一个节奏里：常规养成操作与关键成长时刻没有被区分，玩家在完成升级时可以很快点击，但很难真正感知到角色成长带来的反馈。\n\n因此，我后续的调整重点不是简单删减内容，而是重新分配界面权重与反馈节奏：保留高频操作所需的信息效率，同时把角色展示与关键成长反馈从拥挤的首屏中释放出来，让真正重要的成长时刻被看见。",
      blocks: [
        {
          id: "progression-rhythm-rules",
          type: "principles",
          title: "界面节奏调整规则",
          items: [
            { title: "高频操作保持短路径", description: "重复升级与日常操作继续保持直接和高效。" },
            { title: "重复反馈降低表现强度", description: "不让每一次重复动作都使用相同的动效、层级和打断强度。" },
            { title: "关键成长重新获得停顿", description: "重要成长变化获得更清晰的层级和足够的感知时间。" },
            { title: "让注意力回到内容本身", description: "界面支持角色与成长结果，而不是持续与内容争夺注意力。" },
          ],
        },
        {
          id: "attention-comparison",
          type: "comparison",
          leftTitle: "原有：系统操作持续占据中心",
          leftDescription: "资源、入口、操作按钮与结果反馈连续出现，高频动作和关键成长使用相近的表现强度。",
          leftImage: emptyImage(),
          rightTitle: "调整后：重复操作与关键反馈分层",
          rightDescription: "高频操作保持短路径，关键成长获得停顿，并把主要注意力重新留给角色和结果变化。",
          rightImage: emptyImage(),
        },
        { id: "progression-flow", type: "flow", steps: ["进入养成", "完成高频操作", "压缩重复反馈", "到达关键节点", "强化成长表现", "返回内容体验"] },
        {
          id: "progression-demo",
          type: "staticDemo",
          items: [
            { description: "资源、按钮和反馈被集中放在同一界面中，首屏承担了过多功能。", image: emptyImage() },
            { description: "角色展示区域缩小，视觉重心被界面元素分散。", image: emptyImage() },
            { description: "升级流程可以快速完成，但关键成长节点缺少应有的表现节奏。", image: emptyImage() },
          ],
          demoTitle: "重设计后的交互节奏",
          demoDescription: "我将常规养成操作与关键成长节点拆分处理：常规升级保持直接和高效；当玩家到达关键成长时刻时，再通过界面状态变化、角色表现和反馈节奏强化成长感。",
          demoImage: emptyImage(),
        },
        { id: "progression-result", type: "result", body: "这一版交互演示也成为后续项目采纳的方向之一。" },
      ],
    },
    {
      id: "production",
      navLabel: "验证铺量规则",
      title: "验证可铺量的界面规则",
      heading: "让单点判断能够进入真实生产，而不是停留在一个示范页面。",
      body: "单个英雄养成交互成立，并不代表相同判断能够支持真实生产。随着公会系统等功能页面进入铺量阶段，我继续观察这些节奏与视觉规则能否在不同信息密度和页面状态下保持一致。\n\n早期 UI 较依赖装饰框架和密集处理；后续探索逐步降低不必要的视觉竞争，并让底板、信息分区、控件状态与反馈层级承担更明确的职责。公会页面在这里作为生产应用与一致性验证，而不是完整系统设计所有权的证明。",
      blocks: [
        {
          id: "production-comparison",
          type: "comparison",
          leftTitle: "早期：装饰承担较高视觉权重",
          leftDescription: "底板和装饰能够建立项目气质，但在复杂页面中也会持续占据主要注意力并压缩信息空间。",
          leftImage: emptyImage(),
          rightTitle: "后续：装饰服务于信息层级",
          rightDescription: "降低不必要的视觉竞争，明确内容分区与反馈层级，让规则能够延展到更多生产页面。",
          rightImage: emptyImage(),
        },
        {
          id: "production-principles",
          type: "principles",
          title: "铺量过程中验证的规则",
          items: [
            { title: "识别与效率", description: "高频信息优先保证识别与操作效率。" },
            { title: "注意力边界", description: "常驻 UI 不持续争夺主要注意力。" },
            { title: "反馈分级", description: "重复动作与关键成长使用不同反馈强度。" },
            { title: "装饰服务层级", description: "装饰服务于层级，而不是填满界面。" },
          ],
        },
        {
          id: "production-gallery",
          type: "gallery",
          intro: "公会系统的页面生产用于验证这些规则能否延展到不同功能密度、页面状态和资源条件，而不是把单点方案停留在示范页面。",
          items: Array.from({ length: 6 }, (_, index) => ({
            title: `公会系统页面 ${String(index + 1).padStart(2, "0")}`,
            description: "记录不同功能密度、页面状态和资源条件下的系统 UI 生产验证。",
            image: emptyImage(),
          })),
        },
      ],
    },
  ],
  reflection: {
    title: "从完成界面，到判断界面应该占据多少注意力",
    body: "这次项目让我意识到，界面节奏不只是动效快慢或信息多少，而是在决定玩家的注意力在哪里停留。设计价值不只是让系统更高效，也包括在适当的时候让界面退后，使角色、内容和成长变化重新成为体验的中心。",
  },
};

function createEnglishNarrativeDefaults(): ThreeDCharacterDraft {
  const draft = structuredClone(defaultDraft);
  draft.hero = {
    ...draft.hero,
    category: "COMMERCIAL PROJECT / EARLY DEVELOPMENT / SYSTEM UI",
    title: "From System-Driven to Experience-Driven: Redistributing Interface Rhythm",
    subtitle: "Reorganizing attention between frequent system operations and more continuous character and content experiences within an established progression framework.",
    responsibilities: "Hero progression interaction exploration / guild UI production / interaction demos / visual iteration",
  };
  draft.context = "The project was built on an established task-driven progression framework. Daily play was organized through tasks, system entrances, resource prompts, and reward feedback, moving players frequently between menus. The interface was therefore not simply a support layer; it was one of the main places where gameplay occurred.\n\nAs the project began to place more emphasis on characters, scenes, and progression moments, the existing system logic revealed a rhythm conflict. The interface continued to direct each next action while treating repeated operations and meaningful progression moments with similar levels of emphasis.";
  draft.question = "When player activity shifts from frequent menu-based system operations toward more continuous character and content experiences, how can the UI preserve operational efficiency while demanding less continuous attention?";

  const attention = draft.chapters.find((chapter) => chapter.id === "attention");
  if (attention) {
    attention.navLabel = "Mapping the pattern";
    attention.title = "Mapping the System-Driven Pattern";
    attention.heading = "The existing UI did not merely present information; it continuously organized the player’s next action.";
    attention.body = "Tasks, entrances, resource prompts, and reward feedback formed a stable and efficient system loop. Players could complete many actions quickly, but doing so required them to continually respond to the interface’s direction.\n\nThe issue was not simply how much information the interface contained, but whether the interface should remain the primary place where play occurred.";
    const observations = attention.blocks.find((block): block is PrinciplesBlock => block.id === "attention-observations" && block.type === "principles");
    if (observations) {
      observations.title = "How the interface continuously occupied attention";
      observations.items = [
        { title: "01", description: "Tasks and entrances continually specified the next action" },
        { title: "02", description: "Parallel resource lines required frequent switching and state checks" },
        { title: "03", description: "Repeated actions and meaningful progression used similar feedback intensity" },
      ];
    }
  }

  const progression = draft.chapters.find((chapter) => chapter.id === "progression");
  if (progression) {
    progression.navLabel = "Rebuilding rhythm";
    progression.title = "Rebuilding Hero Progression Interaction";
    progression.heading = "Separating frequent operations from meaningful progression moments";
    progression.body = "The early proposal followed the organization of the original progression interface almost one-to-one. To keep upgrading, promotion, and resource decisions immediately accessible, controls, material information, numerical feedback, and results were concentrated on the first screen. This preserved operational efficiency, but compressed the 3D character display and made the interface visually overpower the character.\n\nThe issue was not simply that there was too much information. Information and presentation followed the same rhythm: routine progression operations and meaningful growth moments were not distinguished. Players could complete upgrades quickly, but had little opportunity to perceive the character’s growth.\n\nThe redesign therefore focused on redistributing interface weight and feedback rhythm rather than merely removing content. Frequent operations retained the information needed for efficiency, while character presentation and meaningful growth feedback were released from the crowded first screen so that important moments could be seen.";
    const rules = progression.blocks.find((block): block is PrinciplesBlock => block.id === "progression-rhythm-rules" && block.type === "principles");
    if (rules) {
      rules.title = "Interface rhythm rules";
      rules.items = [
        { title: "Keep frequent actions on short paths", description: "Repeated upgrading and routine actions remain direct and efficient." },
        { title: "Reduce the intensity of repeated feedback", description: "Repeated actions do not all require the same animation, hierarchy, or interruption level." },
        { title: "Restore pause to meaningful progression", description: "Important progression changes receive clearer hierarchy and enough time to perceive the result." },
        { title: "Return attention to the content itself", description: "The interface supports the character and progression result rather than continuously competing with them." },
      ];
    }
    const comparison = progression.blocks.find((block): block is ComparisonBlock => block.id === "attention-comparison" && block.type === "comparison");
    if (comparison) {
      comparison.leftTitle = "Before: system operations occupy the center";
      comparison.leftDescription = "Resources, entrances, controls, and result feedback appear continuously, giving routine actions and meaningful progression similar expressive weight.";
      comparison.rightTitle = "After: routine actions and key feedback are separated";
      comparison.rightDescription = "Frequent actions keep short paths while meaningful progression receives pause, returning primary attention to the character and its change.";
    }
    const flow = progression.blocks.find((block): block is FlowBlock => block.id === "progression-flow" && block.type === "flow");
    if (flow) flow.steps = ["Enter progression", "Complete routine action", "Compress repeated feedback", "Reach a key moment", "Emphasize progression", "Return to content"];
    const demo = progression.blocks.find((block): block is StaticDemoBlock => block.id === "progression-demo" && block.type === "staticDemo");
    if (demo) {
      const descriptions = [
        "Resources, controls, and feedback were concentrated in one interface, asking the first screen to carry too many functions.",
        "The character display became smaller while interface elements dispersed the visual focus.",
        "Upgrading could be completed quickly, but meaningful progression moments lacked an appropriate presentation rhythm.",
      ];
      demo.items = demo.items.map((item, index) => ({ ...item, description: descriptions[index] ?? item.description }));
      demo.demoTitle = "The Redesigned Interaction Rhythm";
      demo.demoDescription = "Routine progression operations remain direct and efficient, while meaningful growth moments use interface-state changes, character presentation, and feedback rhythm to strengthen the sense of progression.";
    }
    const result = progression.blocks.find((block): block is ResultBlock => block.id === "progression-result" && block.type === "result");
    if (result) result.body = "This interaction demonstration also became one of the directions adopted later in the project.";
  }

  const production = draft.chapters.find((chapter) => chapter.id === "production");
  if (production) {
    production.navLabel = "Validating rollout";
    production.title = "Validating Rules That Could Scale";
    production.heading = "Testing whether a local design judgment could survive real production across multiple screens.";
    production.body = "A single hero-progression interaction was not enough to show that the same judgment could support real production. As guild and related feature screens entered rollout, I continued observing whether these rhythm and visual rules could remain consistent across different information densities and page states.\n\nEarly UI relied more heavily on decorative framing and dense visual treatment. Later exploration reduced unnecessary visual competition and gave surfaces, information groups, control states, and feedback levels clearer responsibilities. The guild screens are presented here as production application and consistency validation, not as a claim of ownership over the complete feature.";
    const comparison = production.blocks.find((block): block is ComparisonBlock => block.id === "production-comparison" && block.type === "comparison");
    if (comparison) {
      comparison.leftTitle = "Early: decoration carries high visual weight";
      comparison.leftDescription = "Surfaces and decoration establish the project’s tone, but can continually occupy primary attention and compress information space in complex screens.";
      comparison.rightTitle = "Later: decoration supports hierarchy";
      comparison.rightDescription = "Unnecessary visual competition is reduced, clarifying content groups and feedback levels so the rules can extend across production screens.";
    }
    const principles = production.blocks.find((block): block is PrinciplesBlock => block.id === "production-principles" && block.type === "principles");
    if (principles) {
      principles.title = "Rules validated during production";
      principles.items = [
        { title: "Recognition & efficiency", description: "Prioritize recognition and efficiency for frequent information." },
        { title: "Attention boundary", description: "Do not let persistent UI continuously compete for primary attention." },
        { title: "Feedback hierarchy", description: "Use different feedback intensity for repeated actions and meaningful progression." },
        { title: "Decoration supports hierarchy", description: "Use decoration to support hierarchy rather than fill the interface." },
      ];
    }
    const gallery = production.blocks.find((block): block is GalleryBlock => block.id === "production-gallery" && block.type === "gallery");
    if (gallery) {
      gallery.intro = "Guild-system production tested whether these rules could extend across different feature densities, page states, and resource conditions instead of remaining on one demonstration screen.";
      gallery.items = gallery.items.map((item, index) => ({
        ...item,
        title: `Guild system screen ${String(index + 1).padStart(2, "0")}`,
        description: "A production example testing the interface rules across different information densities, page states, and resource conditions.",
      }));
    }
  }

  draft.reflection = {
    title: "From completing screens to deciding how much attention the interface should occupy",
    body: "This project showed me that interface rhythm is not simply about animation speed or information quantity. It determines where the player’s attention is allowed to remain. The value of UI design is not only to make systems more efficient, but also to know when the interface should step back so that characters, content, and progression changes can become the center of the experience.",
  };
  return draft;
}

const englishNarrativeDefaults = createEnglishNarrativeDefaults();

const templateLabels: Record<TemplateType, string> = {
  paragraph: "正文说明段落",
  comparison: "双图对比",
  staticDemo: "三图到动态演示",
  principles: "四点原则",
  gallery: "六图铺量展示",
  result: "结果说明",
  reflection: "反思段落",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function mergeLocalizedText(value: unknown, fallback: LocalizedDraftText): LocalizedDraftText {
  if (!isRecord(value)) return { ...fallback };
  return {
    zh: readString(value.zh, fallback.zh),
    en: readString(value.en, fallback.en),
  };
}

function mergeSystemMapping(value: unknown): SystemMappingDraft {
  const fallback = defaultDraft.systemMapping;
  if (!isRecord(value)) return structuredClone(fallback);
  const sourceConclusions = Array.isArray(value.conclusions) ? value.conclusions : [];
  const conclusions = fallback.conclusions.map((fallbackConclusion, index) => {
    const source = isRecord(sourceConclusions[index]) ? sourceConclusions[index] : {};
    return {
      title: mergeLocalizedText(source.title, fallbackConclusion.title),
      body: mergeLocalizedText(source.body, fallbackConclusion.body),
    };
  }) as SystemMappingDraft["conclusions"];
  const sourceReferences = Array.isArray(value.references) ? value.references : [];
  const references = fallback.references.map((fallbackReference, index) => {
    const source = isRecord(sourceReferences[index]) ? sourceReferences[index] : {};
    return {
      image: mergeImage(source.image, fallbackReference.image),
      primary: mergeLocalizedText(source.primary, fallbackReference.primary),
      secondary: mergeLocalizedText(source.secondary, fallbackReference.secondary),
      source: mergeLocalizedText(source.source, fallbackReference.source),
    };
  }) as SystemMappingDraft["references"];

  return {
    eyebrow: mergeLocalizedText(value.eyebrow, fallback.eyebrow),
    heading: mergeLocalizedText(value.heading, fallback.heading),
    introduction: mergeLocalizedText(value.introduction, fallback.introduction),
    references,
    summaryTitle: mergeLocalizedText(value.summaryTitle, fallback.summaryTitle),
    conclusions,
    transition: mergeLocalizedText(value.transition, fallback.transition),
  };
}

function mergeImage(value: unknown, fallback: DraftImageSlot = emptyImage()): DraftImageSlot {
  if (typeof value === "string") return { publicPath: value };
  if (!isRecord(value)) return { ...fallback };
  return {
    publicPath: readString(value.publicPath, fallback.publicPath),
    ...(typeof value.localImageId === "string" && value.localImageId ? { localImageId: value.localImageId } : {}),
  };
}

function mergeBlock(value: unknown, fallback: ContentBlock): ContentBlock {
  if (!isRecord(value) || value.type !== fallback.type) return fallback;
  const id = readString(value.id, fallback.id);
  switch (fallback.type) {
    case "paragraph": return { id, type: "paragraph", body: readString(value.body, fallback.body) };
    case "result": return { id, type: "result", body: readString(value.body, fallback.body) };
    case "reflection": return { id, type: "reflection", title: readString(value.title, fallback.title), body: readString(value.body, fallback.body) };
    case "flow": {
      const steps = Array.isArray(value.steps) ? value.steps.filter((item): item is string => typeof item === "string") : fallback.steps;
      return { id, type: "flow", steps: steps.length ? steps : fallback.steps };
    }
    case "comparison":
      return {
        id, type: "comparison",
        leftTitle: readString(value.leftTitle, fallback.leftTitle), leftDescription: readString(value.leftDescription, fallback.leftDescription), leftImage: mergeImage(value.leftImage, fallback.leftImage),
        rightTitle: readString(value.rightTitle, fallback.rightTitle), rightDescription: readString(value.rightDescription, fallback.rightDescription), rightImage: mergeImage(value.rightImage, fallback.rightImage),
      };
    case "staticDemo": {
      const sourceItems = Array.isArray(value.items) ? value.items : [];
      return {
        id, type: "staticDemo",
        items: fallback.items.map((item, index) => {
          const source = isRecord(sourceItems[index]) ? sourceItems[index] : {};
          return { description: readString(source.description, item.description), image: mergeImage(source.image, item.image) };
        }),
        demoTitle: readString(value.demoTitle, fallback.demoTitle), demoDescription: readString(value.demoDescription, fallback.demoDescription), demoImage: mergeImage(value.demoImage, fallback.demoImage),
      };
    }
    case "principles": {
      const sourceItems = Array.isArray(value.items) ? value.items : [];
      const items = sourceItems.length ? sourceItems.map((item, index) => {
        const source = isRecord(item) ? item : {};
        const fallbackItem = fallback.items[index] ?? { title: "原则", description: "说明" };
        return { title: readString(source.title, fallbackItem.title), description: readString(source.description, fallbackItem.description) };
      }) : fallback.items;
      return { id, type: "principles", title: readString(value.title, fallback.title), items };
    }
    case "gallery": {
      const sourceItems = Array.isArray(value.items) ? value.items : [];
      return {
        id, type: "gallery", intro: readString(value.intro, fallback.intro),
        items: fallback.items.map((item, index) => {
          const source = isRecord(sourceItems[index]) ? sourceItems[index] : {};
          return { title: readString(source.title, item.title), description: readString(source.description, item.description), image: mergeImage(source.image, item.image) };
        }),
      };
    }
  }
}

function createTemplate(type: TemplateType): ContentBlock {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (type === "paragraph") return { id, type, body: "在这里补充这一阶段的设计判断与过程说明。" };
  if (type === "comparison") return { id, type, leftTitle: "方向 A", leftDescription: "补充左侧方向说明。", leftImage: emptyImage(), rightTitle: "方向 B", rightDescription: "补充右侧方向说明。", rightImage: emptyImage() };
  if (type === "staticDemo") return { id, type, items: Array.from({ length: 3 }, (_, index) => ({ description: `静态交互稿 ${index + 1} 说明`, image: emptyImage() })), demoTitle: "动态演示", demoDescription: "补充动态演示说明。", demoImage: emptyImage() };
  if (type === "principles") return { id, type, title: "铺量过程中形成的判断", items: Array.from({ length: 4 }, (_, index) => ({ title: `原则 ${index + 1}`, description: "补充原则说明。" })) };
  if (type === "gallery") return { id, type, intro: "补充这组铺量页面的验证说明。", items: Array.from({ length: 6 }, (_, index) => ({ title: `页面 ${String(index + 1).padStart(2, "0")}`, description: "补充页面说明。", image: emptyImage() })) };
  if (type === "result") return { id, type, body: "补充方案采用情况或阶段结果。" };
  return { id, type: "reflection", title: "阶段反思", body: "补充这一阶段带来的理解与判断。" };
}

function updateKnownLegacyProgressionCopy(draft: ThreeDCharacterDraft): ThreeDCharacterDraft {
  const progression = draft.chapters.find((chapter) => chapter.id === "progression");
  const fallback = defaultDraft.chapters.find((chapter) => chapter.id === "progression");
  if (!progression || !fallback) return draft;

  if (progression.title === "重建界面节奏") progression.title = fallback.title;
  if (progression.heading === "将高频操作与关键成长时刻分开处理。") progression.heading = fallback.heading;
  if (progression.body === "英雄升级与升星既包含大量重复操作，也承载玩家感知成长变化的关键时刻。原有方案将资源、操作和结果反馈以相近强度连续呈现，效率很高，但不同动作之间缺少节奏差异。\n\n保留高频操作的效率，但降低 UI 对注意力的持续占用；压缩重复反馈，把表现空间留给真正重要的成长时刻。") {
    progression.body = fallback.body;
  }

  const demo = progression.blocks.find((block): block is StaticDemoBlock => block.id === "progression-demo" && block.type === "staticDemo");
  const fallbackDemo = fallback.blocks.find((block): block is StaticDemoBlock => block.id === "progression-demo" && block.type === "staticDemo");
  if (demo && fallbackDemo) {
    const legacyDescriptions = [
      "常规升级保持资源判断与操作之间的短路径。",
      "重复反馈降低打断强度，为关键节点建立节奏差异。",
      "关键成长通过层级、停顿与角色表现获得更明确的感知。",
    ];
    demo.items = demo.items.map((item, index) => ({
      ...item,
      description: item.description === legacyDescriptions[index]
        ? fallbackDemo.items[index]?.description ?? item.description
        : item.description,
    }));
    if (demo.demoTitle === "升级 / 升星动态演示") demo.demoTitle = fallbackDemo.demoTitle;
    if (demo.demoDescription === "通过信息出现顺序、反馈强度和页面状态变化，区分日常操作与关键成长节点。") {
      demo.demoDescription = fallbackDemo.demoDescription;
    }
  }

  const result = progression.blocks.find((block): block is ResultBlock => block.id === "progression-result" && block.type === "result");
  const fallbackResult = fallback.blocks.find((block): block is ResultBlock => block.id === "progression-result" && block.type === "result");
  if (result && fallbackResult && result.body === "升级与升星的交互演示及对应美术方向最终被项目采用。") {
    result.body = fallbackResult.body;
  }
  return draft;
}

function mergeDraft(value: unknown): ThreeDCharacterDraft {
  if (!isRecord(value)) return defaultDraft;
  const hero = isRecord(value.hero) ? value.hero : {};
  const sourceChapters = Array.isArray(value.chapters) ? value.chapters : [];
  const merged: ThreeDCharacterDraft = {
    version: 1,
    updatedAt: readString(value.updatedAt, defaultDraft.updatedAt),
    hero: {
      category: readString(hero.category, defaultDraft.hero.category), title: readString(hero.title, defaultDraft.hero.title), subtitle: readString(hero.subtitle, defaultDraft.hero.subtitle),
      role: readString(hero.role, defaultDraft.hero.role), responsibilities: readString(hero.responsibilities, defaultDraft.hero.responsibilities), duration: readString(hero.duration, defaultDraft.hero.duration), cover: mergeImage(hero.cover, defaultDraft.hero.cover),
    },
    context: readString(value.context, defaultDraft.context),
    question: readString(value.question, defaultDraft.question),
    systemMapping: mergeSystemMapping(value.systemMapping),
    chapters: defaultDraft.chapters.map((fallbackChapter) => {
      const source = sourceChapters.find((candidate) => isRecord(candidate) && candidate.id === fallbackChapter.id);
      if (!isRecord(source)) return fallbackChapter;
      const sourceBlocks = Array.isArray(source.blocks) ? source.blocks : [];
      const fallbackByType = (type: ContentBlock["type"]) => fallbackChapter.blocks.find((block) => block.type === type) ?? createTemplate(type === "flow" ? "paragraph" : type);
      const blocks = sourceBlocks.length
        ? sourceBlocks.flatMap((candidate) => {
            if (!isRecord(candidate) || typeof candidate.type !== "string") return [];
            const fallback = fallbackByType(candidate.type as ContentBlock["type"]);
            if (fallback.type !== candidate.type) return [];
            return [mergeBlock(candidate, fallback)];
          })
        : fallbackChapter.blocks;
      return { id: fallbackChapter.id, navLabel: readString(source.navLabel, fallbackChapter.navLabel), title: readString(source.title, fallbackChapter.title), heading: readString(source.heading, fallbackChapter.heading), body: readString(source.body, fallbackChapter.body), blocks };
    }),
    reflection: isRecord(value.reflection) ? { title: readString(value.reflection.title, defaultDraft.reflection.title), body: readString(value.reflection.body, defaultDraft.reflection.body) } : defaultDraft.reflection,
  };
  return updateKnownLegacyProgressionCopy(merged);
}

function loadDraft() {
  if (typeof window === "undefined") return defaultDraft;
  try {
    const stored = window.localStorage.getItem(THREE_D_CHARACTER_DRAFT_STORAGE_KEY);
    return stored ? mergeDraft(JSON.parse(stored) as unknown) : defaultDraft;
  } catch {
    return defaultDraft;
  }
}

function applyNarrativeBlock(current: ContentBlock, fallback: ContentBlock): ContentBlock {
  if (current.type !== fallback.type) return structuredClone(fallback);
  if (current.type === "paragraph" && fallback.type === "paragraph") return { ...current, body: fallback.body };
  if (current.type === "result" && fallback.type === "result") return { ...current, body: fallback.body };
  if (current.type === "reflection" && fallback.type === "reflection") return { ...current, title: fallback.title, body: fallback.body };
  if (current.type === "flow" && fallback.type === "flow") return { ...current, steps: [...fallback.steps] };
  if (current.type === "comparison" && fallback.type === "comparison") {
    return {
      ...current,
      leftTitle: fallback.leftTitle,
      leftDescription: fallback.leftDescription,
      rightTitle: fallback.rightTitle,
      rightDescription: fallback.rightDescription,
    };
  }
  if (current.type === "staticDemo" && fallback.type === "staticDemo") {
    return {
      ...current,
      items: current.items.map((item, index) => ({
        ...item,
        description: fallback.items[index]?.description ?? item.description,
      })),
      demoTitle: fallback.demoTitle,
      demoDescription: fallback.demoDescription,
    };
  }
  if (current.type === "principles" && fallback.type === "principles") {
    return { ...current, title: fallback.title, items: structuredClone(fallback.items) };
  }
  if (current.type === "gallery" && fallback.type === "gallery") {
    return {
      ...current,
      intro: fallback.intro,
      items: current.items.map((item, index) => ({
        ...item,
        title: fallback.items[index]?.title ?? item.title,
        description: fallback.items[index]?.description ?? item.description,
      })),
    };
  }
  return current;
}

function applyNarrativeDraft(current: ThreeDCharacterDraft, fallbackDraft: ThreeDCharacterDraft, preserveCustomBlocks: boolean): ThreeDCharacterDraft {
  const currentBlocksById = new Map(
    current.chapters.flatMap((chapter) => chapter.blocks.map((block) => [block.id, block] as const)),
  );
  const knownBlockIds = new Set(fallbackDraft.chapters.flatMap((chapter) => chapter.blocks.map((block) => block.id)));

  return {
    ...current,
    hero: {
      ...current.hero,
      category: fallbackDraft.hero.category,
      title: fallbackDraft.hero.title,
      subtitle: fallbackDraft.hero.subtitle,
      responsibilities: fallbackDraft.hero.responsibilities,
    },
    context: fallbackDraft.context,
    question: fallbackDraft.question,
    systemMapping: {
      ...structuredClone(fallbackDraft.systemMapping),
      references: fallbackDraft.systemMapping.references.map((reference, index) => ({
        ...reference,
        image: current.systemMapping.references[index]?.image ?? reference.image,
      })) as SystemMappingDraft["references"],
    },
    chapters: fallbackDraft.chapters.map((fallbackChapter) => {
      const currentChapter = current.chapters.find((chapter) => chapter.id === fallbackChapter.id);
      const knownBlocks = fallbackChapter.blocks.map((fallbackBlock) => {
        const currentBlock = currentBlocksById.get(fallbackBlock.id);
        return currentBlock ? applyNarrativeBlock(currentBlock, fallbackBlock) : structuredClone(fallbackBlock);
      });
      const customBlocks = preserveCustomBlocks
        ? currentChapter?.blocks.filter((block) => !knownBlockIds.has(block.id)) ?? []
        : [];

      return {
        ...(currentChapter ?? fallbackChapter),
        id: fallbackChapter.id,
        navLabel: fallbackChapter.navLabel,
        title: fallbackChapter.title,
        heading: fallbackChapter.heading,
        body: fallbackChapter.body,
        blocks: [...knownBlocks, ...customBlocks],
      };
    }),
    reflection: structuredClone(fallbackDraft.reflection),
  };
}

function applyRevisedNarrative(current: ThreeDCharacterDraft): ThreeDCharacterDraft {
  return applyNarrativeDraft(current, defaultDraft, true);
}

function mergeUnknownValues(raw: unknown, next: unknown): unknown {
  if (Array.isArray(next)) {
    const rawItems = Array.isArray(raw) ? raw : [];
    return next.map((item, index) => mergeUnknownValues(rawItems[index], item));
  }
  if (isRecord(next)) {
    const rawRecord = isRecord(raw) ? raw : {};
    return Object.fromEntries([
      ...Object.entries(rawRecord),
      ...Object.entries(next).map(([key, value]) => [key, mergeUnknownValues(rawRecord[key], value)]),
    ]);
  }
  return next;
}

function mergeDraftPreservingUnknown(raw: unknown, next: ThreeDCharacterDraft): Record<string, unknown> {
  const rawDraft = isRecord(raw) ? raw : {};
  const rawChapters = Array.isArray(rawDraft.chapters) ? rawDraft.chapters.filter(isRecord) : [];
  const rawBlocksById = new Map<string, Record<string, unknown>>();
  rawChapters.forEach((chapter) => {
    if (!Array.isArray(chapter.blocks)) return;
    chapter.blocks.filter(isRecord).forEach((block) => {
      if (typeof block.id === "string") rawBlocksById.set(block.id, block);
    });
  });

  const merged = mergeUnknownValues(rawDraft, { ...next, chapters: [] }) as Record<string, unknown>;
  const nextChapterIds = new Set(next.chapters.map((chapter) => chapter.id));
  const nextBlockIds = new Set(next.chapters.flatMap((chapter) => chapter.blocks.map((block) => block.id)));
  const mergedChapters = next.chapters.map((chapter) => {
    const rawChapter = rawChapters.find((candidate) => candidate.id === chapter.id);
    const mergedChapter = mergeUnknownValues(rawChapter, { ...chapter, blocks: [] }) as Record<string, unknown>;
    const revisedBlocks = chapter.blocks.map((block) => mergeUnknownValues(rawBlocksById.get(block.id), block));
    const unknownRawBlocks = rawChapter && Array.isArray(rawChapter.blocks)
      ? rawChapter.blocks.filter(isRecord).filter((block) => typeof block.id !== "string" || !nextBlockIds.has(block.id))
      : [];
    mergedChapter.blocks = [...revisedBlocks, ...unknownRawBlocks];
    return mergedChapter;
  });

  rawChapters.forEach((chapter) => {
    if (typeof chapter.id !== "string" || !nextChapterIds.has(chapter.id as ChapterId)) {
      mergedChapters.push(chapter);
    }
  });
  merged.chapters = mergedChapters;
  return merged;
}

function isRevisedNarrativeApplied(value: ThreeDCharacterDraft) {
  return value.hero.title === defaultDraft.hero.title
    && value.hero.subtitle === defaultDraft.hero.subtitle
    && value.context === defaultDraft.context
    && value.question === defaultDraft.question
    && value.chapters.every((chapter, index) => chapter.title === defaultDraft.chapters[index]?.title)
    && value.systemMapping.transition.zh === defaultDraft.systemMapping.transition.zh
    && value.reflection.title === defaultDraft.reflection.title;
}

function paragraphs(value: string) {
  return value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

export function ThreeDCharacterUiDraftPage() {
  const { locale, messages, pathFor } = useLocale();
  const [draft, setDraft] = useState<ThreeDCharacterDraft>(() => loadDraft());
  const { isEditing } = useCaseStudyEditor();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("ready");
  const [narrativeApplyStatus, setNarrativeApplyStatus] = useState<NarrativeApplyStatus>("idle");
  const [importError, setImportError] = useState("");
  const didMount = useRef(false);
  const skipNextAutosave = useRef(false);
  const importInput = useRef<HTMLInputElement | null>(null);
  const renderedDraft = useMemo(
    () => locale === "en" ? applyNarrativeDraft(draft, englishNarrativeDefaults, false) : draft,
    [draft, locale],
  );
  const narrativeApplied = isRevisedNarrativeApplied(draft);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return undefined; }
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return undefined;
    }
    setSaveStatus("saving");
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(THREE_D_CHARACTER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
        try {
          setProjectPublicMetaOverride("3d-character-ui-rhythm", {
            titleZh: draft.hero.title,
            summaryZh: draft.hero.subtitle,
            duration: draft.hero.duration,
          });
        } catch {
          // The case-study draft remains authoritative if the listing cache cannot be updated.
        }
        setSaveStatus("saved");
      }
      catch { setSaveStatus("error"); }
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [draft]);

  const changeDraft = (updater: (current: ThreeDCharacterDraft) => ThreeDCharacterDraft) => {
    setDraft((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
    setImportError("");
  };
  const changeChapter = (id: ChapterId, updater: (chapter: ChapterDraft) => ChapterDraft) => changeDraft((current) => ({ ...current, chapters: current.chapters.map((chapter) => chapter.id === id ? updater(chapter) : chapter) }));
  const changeBlock = (chapterId: ChapterId, blockId: string, next: ContentBlock) => changeChapter(chapterId, (chapter) => ({ ...chapter, blocks: chapter.blocks.map((block) => block.id === blockId ? next : block) }));
  const moveBlock = (chapterId: ChapterId, index: number, direction: -1 | 1) => changeChapter(chapterId, (chapter) => {
    const target = index + direction;
    if (target < 0 || target >= chapter.blocks.length) return chapter;
    const blocks = [...chapter.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    return { ...chapter, blocks };
  });
  const removeBlock = (chapterId: ChapterId, blockId: string) => changeChapter(chapterId, (chapter) => ({ ...chapter, blocks: chapter.blocks.filter((block) => block.id !== blockId) }));
  const insertBlock = (chapterId: ChapterId, type: TemplateType) => changeChapter(chapterId, (chapter) => ({ ...chapter, blocks: [...chapter.blocks, createTemplate(type)] }));
  const applyNarrativeRevision = () => {
    const confirmed = window.confirm(
      narrativeApplied
        ? "新版案例逻辑已经应用。是否确认再次应用？现有图片、图片顺序和自定义内容仍会保留。"
        : "确认应用“从系统驱动到体验驱动”的新版案例逻辑？现有图片、图片顺序和自定义内容不会被删除。",
    );
    if (!confirmed) return;
    try {
      const revised = { ...applyRevisedNarrative(draft), updatedAt: new Date().toISOString() };
      const rawStored = window.localStorage.getItem(THREE_D_CHARACTER_DRAFT_STORAGE_KEY);
      const rawDraft = rawStored ? JSON.parse(rawStored) as unknown : draft;
      const persisted = mergeDraftPreservingUnknown(rawDraft, revised);
      window.localStorage.setItem(THREE_D_CHARACTER_DRAFT_STORAGE_KEY, JSON.stringify(persisted));
      setProjectPublicMetaOverride("3d-character-ui-rhythm", {
        titleZh: revised.hero.title,
        summaryZh: revised.hero.subtitle,
        duration: revised.hero.duration,
      });
      skipNextAutosave.current = true;
      setDraft(mergeDraft(persisted));
      setSaveStatus("saved");
      setNarrativeApplyStatus("applied");
      setImportError("");
    } catch {
      setSaveStatus("error");
      setNarrativeApplyStatus("error");
    }
  };

  const exportDraft = () => {
    const blob = new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "3d-character-ui-rhythm-draft.json"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };
  const importDraft = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const value = JSON.parse(await file.text()) as unknown;
      if (!isRecord(value) || value.version !== 1) throw new Error("Invalid version-1 draft file.");
      const next = { ...mergeDraft(value), updatedAt: new Date().toISOString() };
      window.localStorage.setItem(THREE_D_CHARACTER_DRAFT_STORAGE_KEY, JSON.stringify(next));
      try {
        setProjectPublicMetaOverride("3d-character-ui-rhythm", {
          titleZh: next.hero.title,
          summaryZh: next.hero.subtitle,
          duration: next.hero.duration,
        });
      } catch {
        // Importing the case-study draft must not depend on the listing cache.
      }
      setDraft(next); setSaveStatus("saved"); setImportError("");
    } catch (error) { setImportError(error instanceof Error ? error.message : "Invalid draft file."); }
  };

  return (
    <PageTransition>
      <article className="overflow-hidden bg-deepIndigo text-softWhite">
        <AuthorDock isEditing={isEditing} saveStatus={saveStatus} importError={importError} onExport={exportDraft} onImport={() => importInput.current?.click()} />
        <input ref={importInput} className="hidden" type="file" accept="application/json,.json" onChange={importDraft} />

        <section className={caseStudyLayout.heroSection}>
          <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-25" />
          <div className={caseStudyLayout.heroContainer}>
            <Link to={pathFor("/work")} className={caseStudyLayout.backLink}><ArrowLeft className="h-4 w-4" />{messages.project.backToArchive}</Link>
            <div className={caseStudyLayout.heroComposition}>
              <div className={caseStudyLayout.heroCopy}>
                <EditableText label="Category" value={renderedDraft.hero.category} isEditing={isEditing} onChange={(category) => changeDraft((current) => ({ ...current, hero: { ...current.hero, category } }))} className={caseStudyLayout.category} />
                <EditableHeroTitle value={renderedDraft.hero.title} isEditing={isEditing} onChange={(title) => changeDraft((current) => ({ ...current, hero: { ...current.hero, title } }))} />
                <EditableText label="Subtitle" value={renderedDraft.hero.subtitle} isEditing={isEditing} multiline onChange={(subtitle) => changeDraft((current) => ({ ...current, hero: { ...current.hero, subtitle } }))} className={caseStudyLayout.subtitle} />
              </div>
              <div className={caseStudyLayout.durationPosition}>
                {isEditing ? (
                  <label className="block min-w-0 sm:w-64">
                    <span className="mb-2 block font-mono text-xs font-bold uppercase tracking-[0.1em] text-[#9FAAD2] sm:text-right">DURATION</span>
                    <input className="w-full min-w-0 rounded-[6px] border border-electricBlue/45 bg-deepIndigo/58 px-3 py-2 font-mono text-sm text-softWhite outline-none transition focus:border-acidGreen/60 sm:text-right" value={renderedDraft.hero.duration} onChange={(event) => changeDraft((current) => ({ ...current, hero: { ...current.hero, duration: event.target.value } }))} />
                  </label>
                ) : <p className={caseStudyLayout.durationText}>{renderedDraft.hero.duration}</p>}
              </div>
            </div>
            {isEditing ? (
              <div className="mt-10 grid gap-5 rounded-lg border border-dashed border-electricBlue/35 bg-archiveBlue/10 p-4 md:grid-cols-2">
                <MetadataField label="ROLE" value={renderedDraft.hero.role} isEditing onChange={(role) => changeDraft((current) => ({ ...current, hero: { ...current.hero, role } }))} />
                <MetadataField label="RESPONSIBILITIES" value={renderedDraft.hero.responsibilities} isEditing onChange={(responsibilities) => changeDraft((current) => ({ ...current, hero: { ...current.hero, responsibilities } }))} />
                <div className="md:col-span-2"><DraftImage slot={renderedDraft.hero.cover} label="Hero cover (kept in draft data)" slotId="hero-cover" isEditing onChange={(cover) => changeDraft((current) => ({ ...current, hero: { ...current.hero, cover } }))} hero /></div>
              </div>
            ) : null}
          </div>
        </section>

        {isEditing ? <ProjectCoverEditor projectId="3d-character-ui-rhythm" locale={locale} /> : null}

        {isEditing && locale === "zh" ? (
          <NarrativeRevisionPanel
            applied={narrativeApplied}
            status={narrativeApplyStatus}
            onApply={applyNarrativeRevision}
          />
        ) : null}

        <section className="border-b border-softWhite/10 bg-deepIndigo px-4 py-8 md:px-6 md:py-10">
          <div className="mx-auto max-w-7xl">
            <EditableText label="Project context" value={renderedDraft.context} isEditing={isEditing} multiline onChange={(context) => changeDraft((current) => ({ ...current, context }))} className="text-[clamp(1rem,1.1vw,1.125rem)] leading-[1.85] text-softWhite/68" />
          </div>
        </section>

        <section className={caseStudyLayout.contentSection}>
          <div className={caseStudyLayout.contentStack}>
            {renderedDraft.chapters.map((chapter, chapterIndex) => (
              <ChapterSection
                key={chapter.id}
                chapter={chapter}
                index={chapterIndex}
                isEditing={isEditing}
                onChapterChange={(next) => changeChapter(chapter.id, () => next)}
                locale={locale}
                systemMapping={renderedDraft.systemMapping}
                onSystemMappingChange={(systemMapping) => changeDraft((current) => ({ ...current, systemMapping }))}
                onBlockChange={(blockId, next) => changeBlock(chapter.id, blockId, next)}
                onMoveBlock={(index, direction) => moveBlock(chapter.id, index, direction)}
                onRemoveBlock={(blockId) => removeBlock(chapter.id, blockId)}
                onInsertBlock={(type) => insertBlock(chapter.id, type)}
              />
            ))}
          </div>
        </section>

      </article>
    </PageTransition>
  );
}

function AuthorDock({ isEditing, saveStatus, importError, onExport, onImport }: { isEditing: boolean; saveStatus: SaveStatus; importError: string; onExport: () => void; onImport: () => void }) {
  if (!isEditing) return null;
  return <div className="fixed right-3 top-[132px] z-[79] max-w-[calc(100vw-1.5rem)] md:right-6 md:top-[136px]">
    <CaseStudyEditorActions saveStatus={saveStatus}>
      <button type="button" className="editor-action" onClick={onExport}><Download className="h-3.5 w-3.5" />Export Draft</button>
      <button type="button" className="editor-action" onClick={onImport}><FileUp className="h-3.5 w-3.5" />Import Draft</button>
      {importError ? <p className="w-full text-right text-xs text-peach">{importError}</p> : null}
      <p className="w-full text-right text-[10px] text-softWhite/36">JSON does not include local image blobs.</p>
    </CaseStudyEditorActions>
  </div>;
}

function NarrativeRevisionPanel({ applied, status, onApply }: { applied: boolean; status: NarrativeApplyStatus; onApply: () => void }) {
  return (
    <section className="border-b border-softWhite/10 bg-[#11113a] py-7 md:py-9" data-narrative-revision-panel>
      <div className="site-container">
        <div className="grid gap-5 rounded-[14px] border border-acidGreen/35 bg-acidGreen/[0.055] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-6">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold leading-tight text-softWhite md:text-2xl">应用新版案例逻辑</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-softWhite/64 md:text-base">
              将当前案例更新为“从系统驱动到体验驱动”的新版叙事。现有图片、图片顺序和自定义内容不会被删除。
            </p>
            {status === "applied" ? (
              <p className="mt-3 font-mono text-[11px] font-bold tracking-[0.08em] text-acidGreen" role="status">
                新版案例逻辑已应用，现有图片已保留
              </p>
            ) : null}
            {status === "error" ? (
              <p className="mt-3 text-sm text-peach" role="alert">新版案例逻辑未能保存，请重试。</p>
            ) : null}
          </div>
          <button
            type="button"
            className={`inline-flex min-h-11 items-center justify-center rounded-full border px-5 py-3 font-mono text-[11px] font-bold tracking-[0.08em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen ${
              applied
                ? "border-softWhite/18 bg-softWhite/[0.055] text-softWhite/62 hover:border-acidGreen/45 hover:text-acidGreen"
                : "border-acidGreen bg-acidGreen text-deepIndigo hover:bg-acidGreen/88"
            }`}
            onClick={onApply}
            data-apply-revised-narrative
          >
            {applied ? "已应用新版案例逻辑" : "应用新版案例逻辑"}
          </button>
        </div>
      </div>
    </section>
  );
}

function EditableText({ label, value, isEditing, onChange, className, multiline = false }: { label: string; value: string; isEditing: boolean; onChange: (value: string) => void; className: string; multiline?: boolean }) {
  if (!isEditing) return <div className={className}>{multiline ? paragraphs(value).map((item) => <p key={item} className="mb-5 whitespace-pre-line last:mb-0">{item}</p>) : value}</div>;
  return <label className={`block min-w-0 rounded-lg border border-electricBlue/45 bg-archiveBlue/16 p-3 ${className}`}><span className="mb-2 block font-mono text-[9px] font-bold tracking-[0.14em] text-acidGreen/70">EDITABLE / {label}</span>{multiline ? <textarea className="w-full min-w-0 resize-y bg-deepIndigo/48 p-2 font-sans text-base leading-7 text-softWhite outline-none" rows={Math.max(3, value.split("\n").length + 1)} value={value} onChange={(event) => onChange(event.target.value)} /> : <input className="w-full min-w-0 bg-transparent font-inherit text-inherit outline-none" value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function EditableHeroTitle({ value, isEditing, onChange }: { value: string; isEditing: boolean; onChange: (value: string) => void }) {
  if (!isEditing) return <h1 className={caseStudyLayout.heroTitle}>{value}</h1>;
  return <label className="mt-5 block max-w-5xl rounded-[8px] border border-electricBlue/50 bg-archiveBlue/24 p-3 shadow-[0_0_0_1px_rgba(42,67,199,0.12)]"><span className="mb-2 block font-mono text-xs font-bold uppercase tracking-[0.1em] text-acidGreen/80">Editable<span className="text-softWhite/34"> / Project title</span></span><textarea className={caseStudyLayout.heroTitleEditor} rows={Math.max(3, value.split("\n").length + 1)} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function MetadataField({ label, value, isEditing, onChange }: { label: string; value: string; isEditing: boolean; onChange: (value: string) => void }) {
  return <div className="min-w-0"><p className="font-mono text-[10px] font-bold tracking-[0.16em] text-acidGreen/76">{label}</p>{isEditing ? <input className="mt-2 w-full min-w-0 border-b border-electricBlue/45 bg-transparent pb-2 text-sm text-softWhite outline-none" value={value} onChange={(event) => onChange(event.target.value)} /> : <p className="mt-2 text-sm leading-6 text-softWhite/66">{value}</p>}</div>;
}

function ChapterSection({ chapter, index, isEditing, locale, systemMapping, onChapterChange, onSystemMappingChange, onBlockChange, onMoveBlock, onRemoveBlock, onInsertBlock }: { chapter: ChapterDraft; index: number; isEditing: boolean; locale: Locale; systemMapping: SystemMappingDraft; onChapterChange: (chapter: ChapterDraft) => void; onSystemMappingChange: (value: SystemMappingDraft) => void; onBlockChange: (blockId: string, block: ContentBlock) => void; onMoveBlock: (index: number, direction: -1 | 1) => void; onRemoveBlock: (blockId: string) => void; onInsertBlock: (type: TemplateType) => void }) {
  const progressionResult = chapter.blocks.find((block): block is ResultBlock => block.id === "progression-result" && block.type === "result");
  const visibleBlocks = chapter.blocks
    .filter((block) => !HIDDEN_CASE_BLOCK_IDS.has(block.id))
    .sort((left, right) => {
      if (chapter.id !== "progression") return 0;
      const priority = (block: ContentBlock) => block.id === "progression-demo" ? 0 : 1;
      return priority(left) - priority(right);
    });
  return <section id={chapter.id} className="scroll-mt-24">
    <div className={caseStudyLayout.majorGrid}>
      <div className={caseStudyLayout.majorTitleComposition}>
        <span aria-hidden="true" className={caseStudyLayout.majorNumber}>{String(index + 1).padStart(2, "0")}</span>
        <div className={caseStudyLayout.majorTitleOffset}>
          <EditableText label="Chapter title" value={chapter.title} isEditing={isEditing} multiline onChange={(title) => onChapterChange({ ...chapter, title })} className={caseStudyLayout.majorTitle} />
        </div>
      </div>
      <div className={caseStudyLayout.majorCopy}>
        <EditableText label="Chapter heading" value={chapter.heading} isEditing={isEditing} multiline onChange={(heading) => onChapterChange({ ...chapter, heading })} className={caseStudyLayout.majorHeading} />
        <EditableText label="Chapter body" value={chapter.body} isEditing={isEditing} multiline onChange={(body) => onChapterChange({ ...chapter, body })} className={caseStudyLayout.majorBody} />
      </div>
    </div>
    {chapter.id === "attention" ? (
      <SystemMappingEvidence
        value={systemMapping}
        locale={locale}
        isEditing={isEditing}
        onChange={onSystemMappingChange}
      />
    ) : null}
    {visibleBlocks.length ? (
      <div className={caseStudyLayout.blocks}>
        {visibleBlocks.map((block, blockIndex) => <BlockFrame key={block.id} index={blockIndex} count={visibleBlocks.length} isEditing={isEditing} onMove={onMoveBlock} onRemove={() => onRemoveBlock(block.id)}><ContentBlockView chapterId={chapter.id} block={block} locale={locale} isEditing={isEditing} supportingResult={block.id === "progression-demo" ? progressionResult : undefined} onSupportingResultChange={(next) => onBlockChange(next.id, next)} onChange={(next) => onBlockChange(block.id, next)} /></BlockFrame>)}
      </div>
    ) : null}
    {isEditing ? <TemplateInserter onInsert={onInsertBlock} /> : null}
  </section>;
}

function SystemMappingEvidence({ value, locale, isEditing, onChange }: { value: SystemMappingDraft; locale: Locale; isEditing: boolean; onChange: (value: SystemMappingDraft) => void }) {
  const shouldReduceMotion = useReducedMotion();
  const current = (field: SystemMappingLocalizedField) => value[field][locale];
  const updateLocalized = (field: SystemMappingLocalizedField, next: string) => {
    onChange({ ...value, [field]: { ...value[field], [locale]: next } });
  };
  const updateConclusion = (index: number, field: keyof SystemMappingConclusion, next: string) => {
    const conclusions = value.conclusions.map((conclusion, conclusionIndex) => (
      conclusionIndex === index
        ? { ...conclusion, [field]: { ...conclusion[field], [locale]: next } }
        : conclusion
    )) as SystemMappingDraft["conclusions"];
    onChange({ ...value, conclusions });
  };
  const updateReferenceText = (index: number, field: "primary" | "secondary" | "source", next: string) => {
    const references = value.references.map((reference, referenceIndex) => (
      referenceIndex === index
        ? { ...reference, [field]: { ...reference[field], [locale]: next } }
        : reference
    )) as SystemMappingDraft["references"];
    onChange({ ...value, references });
  };
  const updateReferenceImage = (index: number, image: DraftImageSlot) => {
    const references = value.references.map((reference, referenceIndex) => (
      referenceIndex === index ? { ...reference, image } : reference
    )) as SystemMappingDraft["references"];
    onChange({ ...value, references });
  };

  return (
    <section className="mt-14 md:mt-16" data-system-mapping-evidence>
      <h3 className="font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite">
        {locale === "zh" ? "系统拆解" : "System Mapping"}
      </h3>

      <div className="mt-6 md:mt-8">
        <XMindBranchViewer
          rootTitle={threeDCharacterSystemMap.rootTitle}
          branches={threeDCharacterSystemMap.branches}
          locale={locale}
        />
      </div>

      <div className="mt-14 md:mt-16">
        <h3 className="text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite">
          {locale === "zh" ? "案例参考" : "Case References"}
        </h3>
        <div className="mt-8 grid min-w-0 gap-x-7 gap-y-10 md:mt-10 md:grid-cols-3 lg:gap-x-8">
          {value.references.map((reference, index) => (
            <article key={index} className="min-w-0">
              <DraftImage
                slot={reference.image}
                label={`${locale === "zh" ? "案例参考" : "Case reference"} ${String(index + 1).padStart(2, "0")}`}
                slotId={`system-mapping-reference-${index + 1}`}
                isEditing={isEditing}
                onChange={(image) => updateReferenceImage(index, image)}
              />
              <div className="mt-5 grid gap-3 text-left">
                <EditableText
                  label={`Reference ${index + 1} primary description`}
                  value={reference.primary[locale]}
                  isEditing={isEditing}
                  multiline
                  onChange={(next) => updateReferenceText(index, "primary", next)}
                  className="font-display text-[clamp(1.05rem,1.35vw,1.2rem)] font-semibold leading-[1.45] text-softWhite"
                />
                <EditableText
                  label={`Reference ${index + 1} supporting description`}
                  value={reference.secondary[locale]}
                  isEditing={isEditing}
                  multiline
                  onChange={(next) => updateReferenceText(index, "secondary", next)}
                  className="text-[clamp(0.95rem,1vw,1rem)] leading-[1.65] text-softWhite/64"
                />
                <EditableText
                  label={`Reference ${index + 1} source`}
                  value={reference.source[locale]}
                  isEditing={isEditing}
                  onChange={(next) => updateReferenceText(index, "source", next)}
                  className="font-mono text-[11px] leading-5 text-[#9FAAD2]/62"
                />
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-16 pb-4 text-center md:mt-20">
        <EditableText
          label="System mapping summary title"
          value={current("summaryTitle")}
          isEditing={isEditing}
          onChange={(next) => updateLocalized("summaryTitle", next)}
          className="mx-auto max-w-2xl font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite"
        />
        {isEditing ? (
          <div className="mx-auto mt-8 grid max-w-5xl gap-5 text-left md:grid-cols-3">
            {value.conclusions.map((conclusion, index) => (
              <div key={index} className="min-w-0 rounded-[8px] border border-electricBlue/35 bg-archiveBlue/12 p-4">
                <EditableText label={`Conclusion ${index + 1} title`} value={conclusion.title[locale]} isEditing onChange={(next) => updateConclusion(index, "title", next)} className="font-display text-lg font-semibold text-acidGreen" />
                <div className="mt-3">
                  <EditableText label={`Conclusion ${index + 1} body`} value={conclusion.body[locale]} isEditing multiline onChange={(next) => updateConclusion(index, "body", next)} className="text-sm leading-7 text-softWhite/66" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mx-auto mt-9 grid max-w-6xl gap-10 md:grid-cols-3 md:gap-8">
            {value.conclusions.map((conclusion, index) => (
              <article key={index} className="flex min-w-0 flex-col items-center">
                <motion.div
                  className="flex h-[clamp(9rem,13vw,10.625rem)] w-[clamp(9rem,13vw,10.625rem)] items-center justify-center rounded-full bg-acidGreen/90 p-5 text-center shadow-[0_16px_40px_rgba(198,255,66,0.12),inset_0_1px_0_rgba(255,255,255,0.24)]"
                  animate={shouldReduceMotion ? undefined : { scale: [1, 1.025, 1] }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 5.2 + index * 0.4,
                    repeat: shouldReduceMotion ? 0 : Infinity,
                    ease: "easeInOut",
                    delay: shouldReduceMotion ? 0 : index * 0.4,
                  }}
                >
                  <h4 className="text-[clamp(1rem,1.35vw,1.2rem)] font-semibold leading-[1.4] text-deepIndigo">
                    {conclusion.title[locale]}
                  </h4>
                </motion.div>
                <p className="mt-6 max-w-sm text-left text-sm leading-7 text-softWhite/62 md:text-base">
                  {conclusion.body[locale]}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

    </section>
  );
}

function BlockFrame({ index, count, isEditing, onMove, onRemove, children }: { index: number; count: number; isEditing: boolean; onMove: (index: number, direction: -1 | 1) => void; onRemove: () => void; children: React.ReactNode }) {
  return <div className={isEditing ? "relative rounded-lg border border-dashed border-electricBlue/38 p-4 pt-14" : ""}>{isEditing ? <div className="absolute right-3 top-3 flex gap-2"><button type="button" className="editor-icon" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Move block up"><ChevronUp /></button><button type="button" className="editor-icon" disabled={index === count - 1} onClick={() => onMove(index, 1)} aria-label="Move block down"><ChevronDown /></button><button type="button" className="editor-icon text-peach" onClick={onRemove} aria-label="Delete block"><Trash2 /></button></div> : null}{children}</div>;
}

function ContentBlockView({ chapterId, block, locale, isEditing, supportingResult, onSupportingResultChange, onChange }: { chapterId: ChapterId; block: ContentBlock; locale: Locale; isEditing: boolean; supportingResult?: ResultBlock; onSupportingResultChange: (block: ResultBlock) => void; onChange: (block: ContentBlock) => void }) {
  if (block.type === "paragraph") return <EditableText label="Paragraph" value={block.body} isEditing={isEditing} multiline onChange={(body) => onChange({ ...block, body })} className="mx-auto max-w-4xl text-lg leading-9 text-softWhite/68" />;
  if (block.type === "result") return <div className="mx-auto max-w-4xl border-l-2 border-acidGreen/70 bg-acidGreen/[0.045] px-6 py-5"><p className="font-mono text-[10px] font-bold tracking-[0.16em] text-acidGreen">ADOPTED DIRECTION</p><div className="mt-3"><EditableText label="Result note" value={block.body} isEditing={isEditing} multiline onChange={(body) => onChange({ ...block, body })} className="text-lg leading-8 text-softWhite/76" /></div></div>;
  if (block.type === "reflection") return <div className="mx-auto max-w-4xl text-center"><EditableText label="Reflection title" value={block.title} isEditing={isEditing} multiline onChange={(title) => onChange({ ...block, title })} className="font-display text-3xl font-semibold" /><div className="mt-5 text-left"><EditableText label="Reflection copy" value={block.body} isEditing={isEditing} multiline onChange={(body) => onChange({ ...block, body })} className="text-lg leading-9 text-softWhite/64" /></div></div>;
  if (block.type === "flow") return <div><p className="mb-8 text-center font-display text-2xl font-semibold text-softWhite">{locale === "zh" ? "养成反馈节奏" : "Progression feedback rhythm"}</p><div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-center md:gap-2">{block.steps.map((step, index) => <div key={`${block.id}-${index}`} className="contents">{isEditing ? <input className="min-w-0 flex-1 rounded-md border border-electricBlue/40 bg-archiveBlue/18 px-3 py-3 text-center text-sm outline-none" value={step} onChange={(event) => onChange({ ...block, steps: block.steps.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /> : <span className={`min-w-0 flex-1 rounded-md px-3 py-3 text-center text-sm ${index === 3 || index === 4 ? "bg-acidGreen text-deepIndigo" : "bg-softWhite/[0.055] text-softWhite/68"}`}>{step}</span>}{index < block.steps.length - 1 ? <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-acidGreen/60 md:rotate-0" /> : null}</div>)}</div></div>;
  if (block.type === "comparison") return <div className="grid gap-5 md:grid-cols-2">{(["left", "right"] as const).map((side) => { const titleKey = `${side}Title` as const; const descriptionKey = `${side}Description` as const; const imageKey = `${side}Image` as const; return <div key={side} className="min-w-0"><DraftImage slot={block[imageKey]} label={block[titleKey]} slotId={`${chapterId}-${block.id}-${side}`} isEditing={isEditing} onChange={(image) => onChange({ ...block, [imageKey]: image })} /><div className="mt-5"><EditableText label={`${side} title`} value={block[titleKey]} isEditing={isEditing} onChange={(value) => onChange({ ...block, [titleKey]: value })} className="font-display text-2xl font-semibold" /><div className="mt-3"><EditableText label={`${side} description`} value={block[descriptionKey]} isEditing={isEditing} multiline onChange={(value) => onChange({ ...block, [descriptionKey]: value })} className="text-base leading-7 text-softWhite/62" /></div></div></div>; })}</div>;
  if (block.type === "principles") return <div><EditableText label="Principles title" value={block.title} isEditing={isEditing} onChange={(title) => onChange({ ...block, title })} className="text-center font-display text-2xl font-semibold" /><div className={`mx-auto mt-10 grid max-w-6xl gap-px overflow-hidden rounded-lg border border-softWhite/10 bg-softWhite/10 ${block.items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>{block.items.map((item, index) => <div key={`${block.id}-${index}`} className="bg-[#151746] p-6">{isEditing ? <><input className="w-full bg-transparent font-display text-xl font-semibold text-acidGreen outline-none" value={item.title} onChange={(event) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, title: event.target.value } : current) })} /><textarea className="mt-3 w-full resize-y bg-transparent text-sm leading-7 text-softWhite/62 outline-none" rows={3} value={item.description} onChange={(event) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, description: event.target.value } : current) })} /></> : <><p className="font-display text-xl font-semibold text-acidGreen">{item.title}</p><p className="mt-3 text-sm leading-7 text-softWhite/62">{item.description}</p></>}</div>)}</div></div>;
  if (block.type === "staticDemo" && block.id === "progression-demo") return <ProgressionEvidence block={block} chapterId={chapterId} locale={locale} isEditing={isEditing} supportingResult={supportingResult} onSupportingResultChange={onSupportingResultChange} onChange={onChange} />;
  if (block.type === "staticDemo") return <div><div className="grid gap-5 md:grid-cols-3">{block.items.map((item, index) => <div key={`${block.id}-${index}`}><DraftImage slot={item.image} label={`Static interaction ${index + 1}`} slotId={`${chapterId}-${block.id}-static-${index}`} isEditing={isEditing} compact onChange={(image) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, image } : current) })} /><div className="mt-4"><EditableText label={`Static description ${index + 1}`} value={item.description} isEditing={isEditing} multiline onChange={(description) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, description } : current) })} className="text-base leading-7 text-softWhite/62" /></div></div>)}</div><ArrowDown className="mx-auto my-9 h-8 w-8 text-acidGreen" /><div className="mx-auto max-w-5xl"><DraftImage slot={block.demoImage} label={block.demoTitle} slotId={`${chapterId}-${block.id}-demo`} isEditing={isEditing} onChange={(demoImage) => onChange({ ...block, demoImage })} /><div className="mt-5 text-center"><EditableText label="Demo title" value={block.demoTitle} isEditing={isEditing} onChange={(demoTitle) => onChange({ ...block, demoTitle })} className="font-display text-2xl font-semibold" /><div className="mx-auto mt-3 max-w-3xl"><EditableText label="Demo description" value={block.demoDescription} isEditing={isEditing} multiline onChange={(demoDescription) => onChange({ ...block, demoDescription })} className="text-base leading-7 text-softWhite/62" /></div></div></div></div>;
  return <div><EditableText label="Gallery intro" value={block.intro} isEditing={isEditing} multiline onChange={(intro) => onChange({ ...block, intro })} className="mx-auto max-w-4xl text-center text-lg leading-8 text-softWhite/66" /><div className="mt-10 grid gap-x-6 gap-y-10 md:grid-cols-2 xl:grid-cols-3">{block.items.map((item, index) => <div key={`${block.id}-${index}`}><DraftImage slot={item.image} label={item.title} slotId={`${chapterId}-${block.id}-gallery-${index}`} isEditing={isEditing} compact onChange={(image) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, image } : current) })} /><div className="mt-4"><EditableText label={`Gallery title ${index + 1}`} value={item.title} isEditing={isEditing} onChange={(title) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, title } : current) })} className="font-display text-xl font-semibold" /><div className="mt-2"><EditableText label={`Gallery description ${index + 1}`} value={item.description} isEditing={isEditing} multiline onChange={(description) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, description } : current) })} className="text-base leading-7 text-softWhite/58" /></div></div></div>)}</div></div>;
}

function ProgressionEvidence({ block, chapterId, locale, isEditing, supportingResult, onSupportingResultChange, onChange }: { block: StaticDemoBlock; chapterId: ChapterId; locale: Locale; isEditing: boolean; supportingResult?: ResultBlock; onSupportingResultChange: (block: ResultBlock) => void; onChange: (block: ContentBlock) => void }) {
  const titles = locale === "zh"
    ? ["首屏信息过载", "模型展示空间被压缩", "普通操作与成长反馈混在一起"]
    : ["First-screen information overload", "Character display space is compressed", "Routine actions and progression feedback share one rhythm"];

  return (
    <div>
      <div className="grid min-w-0 gap-x-7 gap-y-10 md:grid-cols-3 lg:gap-x-8">
        {block.items.map((item, index) => (
          <article key={`${block.id}-${index}`} className="min-w-0">
            <DraftImage slot={item.image} label={titles[index] ?? `Evidence ${index + 1}`} slotId={`${chapterId}-${block.id}-static-${index}`} isEditing={isEditing} compact onChange={(image) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, image } : current) })} />
            <div className="mt-5 text-left">
              <h4 className="font-display text-[clamp(1.05rem,1.35vw,1.2rem)] font-semibold leading-[1.45] text-softWhite">{titles[index]}</h4>
              <div className="mt-3">
                <EditableText label={`Evidence description ${index + 1}`} value={item.description} isEditing={isEditing} multiline onChange={(description) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, description } : current) })} className="text-base leading-7 text-softWhite/62" />
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mx-auto mt-16 max-w-5xl md:mt-20">
        <div className="mb-7 text-center">
          <EditableText label="Demo title" value={block.demoTitle} isEditing={isEditing} onChange={(demoTitle) => onChange({ ...block, demoTitle })} className="font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite" />
        </div>
        <DraftImage slot={block.demoImage} label={block.demoTitle} slotId={`${chapterId}-${block.id}-demo`} isEditing={isEditing} onChange={(demoImage) => onChange({ ...block, demoImage })} />
        <div className="mx-auto mt-6 max-w-3xl text-left">
          <EditableText label="Demo description" value={block.demoDescription} isEditing={isEditing} multiline onChange={(demoDescription) => onChange({ ...block, demoDescription })} className="text-base leading-7 text-softWhite/66" />
          {supportingResult ? (
            <div className="mt-3">
              <EditableText label="Adopted direction note" value={supportingResult.body} isEditing={isEditing} multiline onChange={(body) => onSupportingResultChange({ ...supportingResult, body })} className="text-sm leading-6 text-[#9FAAD2]/72" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TemplateInserter({ onInsert }: { onInsert: (type: TemplateType) => void }) {
  const [type, setType] = useState<TemplateType>("paragraph");
  return <div className="mt-16 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-dashed border-electricBlue/35 bg-archiveBlue/10 p-4"><span className="font-mono text-[10px] font-bold tracking-[0.14em] text-acidGreen">INSERT TEMPLATE</span><select className="rounded-md border border-softWhite/12 bg-deepIndigo px-3 py-2 text-sm text-softWhite outline-none" value={type} onChange={(event) => setType(event.target.value as TemplateType)}>{(Object.keys(templateLabels) as TemplateType[]).map((key) => <option key={key} value={key}>{templateLabels[key]}</option>)}</select><button type="button" className="editor-action" onClick={() => onInsert(type)}><Plus className="h-3.5 w-3.5" />Insert</button></div>;
}

function DraftImage({ slot, label, slotId, isEditing, onChange, compact = false, hero = false }: { slot: DraftImageSlot; label: string; slotId: string; isEditing: boolean; onChange: (slot: DraftImageSlot) => void; compact?: boolean; hero?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localImage, setLocalImage] = useState<{ url: string; record: ThreeDCharacterDraftImageRecord } | null>(null);
  const [publicFailed, setPublicFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setPublicFailed(false), [slot.publicPath]);
  useEffect(() => {
    let cancelled = false; let url = ""; setLocalImage(null);
    if (!slot.localImageId) return undefined;
    getThreeDCharacterDraftImage(slot.localImageId).then((record) => { if (cancelled) return; if (record) { url = URL.createObjectURL(record.blob); setLocalImage({ url, record }); } }).catch(() => { if (!cancelled) setError("Local image could not be read; public path fallback is active."); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [slot.localImageId, revision]);

  const choose = () => inputRef.current?.click();
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) { setError("Choose PNG, JPEG, WebP, AVIF, or GIF."); return; }
    if (file.size === 0 || file.size > MAXIMUM_IMAGE_SIZE) { setError("Image must be between 1 byte and 20 MB."); return; }
    const id = slot.localImageId || `3d-character-ui-rhythm:${slotId}`;
    try { setBusy(true); await putThreeDCharacterDraftImage({ id, blob: file, fileName: file.name, mimeType: file.type, size: file.size, updatedAt: new Date().toISOString() }); onChange({ ...slot, localImageId: id }); setRevision((value) => value + 1); setError(""); }
    catch { setError("Image could not be saved. Existing image was not changed."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!slot.localImageId) return;
    try { setBusy(true); await deleteThreeDCharacterDraftImage(slot.localImageId); onChange({ publicPath: slot.publicPath }); setRevision((value) => value + 1); }
    catch { setError("Local image could not be removed."); }
    finally { setBusy(false); }
  };
  const source = localImage?.url || (!publicFailed ? slot.publicPath : "");
  const frame = hero ? "relative grid aspect-[16/11] w-full place-items-center overflow-hidden rounded-lg bg-[#171b50]" : "case-study-media-frame";
  const visual = source ? <img src={source} alt={label} className={hero ? "h-full w-full object-contain" : "case-study-media-image"} onError={() => { if (!localImage) setPublicFailed(true); }} /> : <div className="case-study-media-placeholder">Visual slot</div>;
  return <figure className="min-w-0"><button type="button" className={`${frame} ${isEditing ? "cursor-pointer ring-1 ring-electricBlue/40" : "cursor-default"}`} disabled={!isEditing || busy} onClick={choose}>{visual}</button>{isEditing ? <figcaption className="mt-3 rounded-lg border border-electricBlue/25 bg-archiveBlue/10 p-3"><input ref={inputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" onChange={upload} /><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-[10px] font-bold text-acidGreen">{label}</p><div className="flex gap-2"><button type="button" className="editor-action" onClick={choose}>{source ? "Replace" : "Upload"}</button>{slot.localImageId ? <button type="button" className="editor-action text-peach" onClick={remove}><Trash2 className="h-3 w-3" />Remove</button> : null}</div></div><input className="mt-3 w-full border-b border-softWhite/12 bg-transparent pb-2 font-mono text-xs outline-none" value={slot.publicPath} placeholder="/images/projects/3d-character-ui/example.webp" onChange={(event) => onChange({ ...slot, publicPath: event.target.value })} />{error ? <p className="mt-2 text-xs text-peach">{error}</p> : null}</figcaption> : null}</figure>;
}
