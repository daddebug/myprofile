import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Download, Edit3, FileUp, Plus, Trash2, X } from "lucide-react";
import { PageTransition } from "../components/PageTransition";
import { ProjectCoverEditor } from "../components/ProjectCoverEditor";
import { UnityGamePlayer } from "../components/UnityGamePlayer";
import { getProjectBySlug } from "../data/projects";
import { useLocale } from "../locales/LocaleContext";
import {
  deleteGameJamDraftImage,
  getGameJamDraftImage,
  putGameJamDraftImage,
  type GameJamDraftImageRecord,
} from "../lib/gameJamImageDraftDb";
import { GAME_JAM_DRAFT_STORAGE_KEY } from "../lib/gameJamDraftStorage";
import { caseStudyLayout } from "../lib/caseStudyLayout";
import { setProjectPublicMetaOverride } from "../lib/projectMetadata";

export { GAME_JAM_DRAFT_STORAGE_KEY } from "../lib/gameJamDraftStorage";
const AUTOSAVE_DELAY_MS = 400;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"];
const MAXIMUM_IMAGE_SIZE = 20 * 1024 * 1024;

type SectionKey =
  | "projectIntro"
  | "startingPoint"
  | "firstInterpretation"
  | "problemRecognition"
  | "mechanicQuestion"
  | "mechanicShift"
  | "iteration"
  | "playableResult"
  | "reflection";

type ImageSlotKey =
  | "initialThemeNotes"
  | "earlyConceptDirection"
  | "missingMechanic"
  | "mechanicReframing"
  | "iteration01"
  | "iteration02"
  | "iteration03"
  | "playablePrototype"
  | "coreRuleDiagram";

type ThinkingNodeId =
  | "theme"
  | "first-interpretation"
  | "early-idea"
  | "friction"
  | "mechanic-question"
  | "rule-shift"
  | "prototype"
  | "reflection";

type DraftImageSlot = {
  publicPath: string;
  localImageId?: string;
};

type ThinkingNode = {
  id: ThinkingNodeId;
  label: string;
  body: string;
  emphasis: "default" | "accent";
};

type ThinkingMapDraft = {
  eyebrow: string;
  heading: string;
  description: string;
  nodes: ThinkingNode[];
};

type GameJamChapterId = "concept-to-action" | "theme-to-rule" | "playable-prototype";
type GameJamTemplateType = "paragraph" | "comparison" | "ruleTranslation" | "ideaFilter" | "staticDemo" | "scopeNote" | "reflection";

type ParagraphBlock = { id: string; type: "paragraph"; body: string };
type ComparisonBlock = {
  id: string;
  type: "comparison";
  leftTitle: string;
  leftItems: string[];
  rightTitle: string;
  rightItems: string[];
  imageSlotKey?: ImageSlotKey;
};
type RuleTranslationBlock = { id: string; type: "ruleTranslation"; labels: string[] };
type IdeaFilterBlock = {
  id: string;
  type: "ideaFilter";
  title: string;
  columns: [string, string, string, string];
  rows: Array<[string, string, string, string]>;
};
type StaticDemoBlock = {
  id: string;
  type: "staticDemo";
  items: Array<{ title: string; description: string; imageSlotKey: ImageSlotKey }>;
  demoTitle: string;
  demoDescription: string;
  demoImageSlotKey: ImageSlotKey;
};
type ScopeNoteBlock = { id: string; type: "scopeNote"; title: string; keep: string[]; remove: string[] };
type ReflectionBlock = { id: string; type: "reflection"; title: string; body: string };
type GameJamBlock = ParagraphBlock | ComparisonBlock | RuleTranslationBlock | IdeaFilterBlock | StaticDemoBlock | ScopeNoteBlock | ReflectionBlock;

type GameJamChapter = {
  id: GameJamChapterId;
  title: string;
  heading: string;
  body: string;
  blocks: GameJamBlock[];
};

export type GameJamDraft = {
  version: 1;
  category: string;
  title: string;
  subtitle: string;
  duration: string;
  team: string;
  context: string;
  framingQuestion: string;
  chapters: GameJamChapter[];
  reflection: { title: string; body: string };
  updatedAt: string;
  sections: Record<SectionKey, string>;
  thinkingMap: ThinkingMapDraft;
  imageSlots: Record<ImageSlotKey, DraftImageSlot>;
};

type SaveStatus = "ready" | "saving" | "saved" | "error";

function requirePublishedProject() {
  const project = getProjectBySlug("from-theme-to-playable-rule");
  if (!project) throw new Error("Missing shared project metadata for from-theme-to-playable-rule.");
  return project;
}

const publishedProject = requirePublishedProject();

const previousDefaultTitle = "From Theme to Playable Rule";
const previousDefaultSubtitle = "A game jam retrospective on turning an abstract prompt into actions players could actually perform.";
const previousDefaultQuestion = "Does the idea change what the player does?";

const defaultGameJamChapters: GameJamChapter[] = [
  {
    id: "concept-to-action",
    title: "从概念反转到操作问题",
    heading: "一个故事发生反转，不代表玩家体验到了反转",
    body: "最初的创意探索大量集中在故事和设定层面：身份互换、真相揭露、梦境结构，以及视觉或叙事上的翻转。\n\n这些方向都能解释主题，却未必改变玩家的行为。玩家可能仍然只是移动、点击、收集或按顺序完成任务，所谓“反转”只发生在剧情结果中。\n\n这让我们意识到，Game Jam 的关键不是证明概念足够聪明，而是让玩家在最短时间内，通过自己的操作感受到规则发生了变化。",
    blocks: [
      {
        id: "concept-comparison",
        type: "comparison",
        leftTitle: "只体现概念",
        leftItems: ["结局揭示身份反转", "场景视觉发生翻转", "文字告诉玩家真相不同"],
        rightTitle: "真正改变玩法",
        rightItems: ["玩家必须重新解释已有信息", "原本的操作规则发生变化", "之前的选择获得新的含义"],
        imageSlotKey: "initialThemeNotes",
      },
    ],
  },
  {
    id: "theme-to-rule",
    title: "从主题联想到可玩规则",
    heading: "“它是否改变玩家做的事？”成为我们的筛选标准",
    body: "为了避免继续停留在概念讨论中，我们开始用一个更直接的问题检查每个方案：这个反转是否改变玩家观察、选择、组合或行动的方式？\n\n在这一判断下，记忆、合成和状态反转逐渐成为更合适的方向。玩家不只是看到某个对象发生变化，而是需要记住它原本的含义，在组合后重新判断它的功能，并根据新的规则调整下一步操作。\n\n主题因此不再是附加在玩法上的解释，而是进入了核心循环本身。",
    blocks: [
      { id: "rule-translation", type: "ruleTranslation", labels: ["Flip the Script", "记忆 / 识别 / 组合", "原有含义被重新解释", "重新规划下一次行动"] },
      {
        id: "idea-filter",
        type: "ideaFilter",
        title: "创意筛选判断",
        columns: ["方案", "是否改变玩家行动", "Jam 时间内是否可验证", "处理"],
        rows: [
          ["纯剧情反转", "较弱", "制作量较高", "放弃"],
          ["场景或画面翻转", "局部改变", "中等", "暂停"],
          ["记忆与规则反转", "直接改变判断", "较高", "保留"],
          ["多层叙事嵌套", "概念强但规则复杂", "较低", "放弃"],
        ],
      },
    ],
  },
  {
    id: "playable-prototype",
    title: "从设计命题到可玩原型",
    heading: "先验证核心行为，再决定是否扩展内容",
    body: "在 Game Jam 的时间限制下，我们没有继续增加世界观和系统数量，而是优先验证最小的可玩循环：玩家是否能理解当前对象、记住它的状态，在组合或翻转后发现含义发生变化，并据此调整下一步操作。\n\n原型制作过程中，我们不断删除无法直接服务核心规则的内容，并通过交互反馈、信息提示和操作顺序，让“反转”尽可能由玩家亲自发现，而不是依靠文字解释。\n\n最终原型并不是一个完整游戏，但它帮助我更明确地区分了“有趣的主题联想”和“真正进入玩家行为的玩法规则”。",
    blocks: [
      {
        id: "prototype-demo",
        type: "staticDemo",
        items: [
          { title: "初始信息与对象状态", description: "玩家先建立对对象和现有规则的基本理解。", imageSlotKey: "iteration01" },
          { title: "记忆、选择或组合过程", description: "玩家通过操作保留并重新组织已有信息。", imageSlotKey: "iteration02" },
          { title: "规则变化后的新状态", description: "原有含义发生变化，迫使玩家重新判断下一步行动。", imageSlotKey: "iteration03" },
        ],
        demoTitle: "核心可玩规则演示",
        demoDescription: "展示玩家如何通过观察、记忆与组合，发现对象含义发生变化，并重新调整下一步行动。",
        demoImageSlotKey: "playablePrototype",
      },
      { id: "jam-scope", type: "scopeNote", title: "Jam 期间的取舍", keep: ["核心反转规则", "必要操作反馈", "最小可玩循环"], remove: ["复杂世界观", "多层叙事结构", "与核心行为无关的内容"] },
    ],
  },
];

export const defaultGameJamDraft: GameJamDraft = {
  version: 1,
  category: "Game Jam / 游戏设计 / 快速原型",
  title: "让主题真正改变玩家的行动",
  subtitle: "在 Game Jam 的有限时间里，将“反转”从叙事概念转化为玩家能够直接感知的操作规则。",
  duration: "",
  team: "2 人团队",
  context: "这是一次由两人完成的 Game Jam 项目。面对“Flip the Script”这一主题，我们最初提出了许多关于身份、叙事和世界反转的概念，但很快发现：不少想法虽然听起来符合主题，玩家实际执行的操作却没有发生变化。于是，我们将设计重点从“如何讲一个反转故事”转向“如何让反转直接改变玩家的判断与行动”，并围绕记忆、合成和规则变化快速搭建可玩原型。",
  framingQuestion: "这个创意，是否真的改变了玩家正在做的事？",
  chapters: structuredClone(defaultGameJamChapters),
  reflection: {
    title: "主题不是被解释出来的，而是被玩家操作出来的",
    body: "这次 Game Jam 最重要的收获，不是找到一个看起来足够新奇的反转设定，而是建立了一条更直接的玩法判断标准：一个主题只有进入玩家的观察、选择和行动，才真正成为游戏机制。\n\n它也让我开始用更严格的方式检查创意——不是先问这个故事是否有趣，而是先问：玩家会因此做出什么不同的事情？",
  },
  updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  sections: {
    projectIntro:
      "This case is a retrospective on a recurring problem I noticed while working under Game Jam constraints.\n\nA theme can feel conceptually correct while still having almost no effect on the player's actual behaviour.\n\nThe challenge was not simply to create an idea that could be explained through the theme.\n\nIt was to find a rule the player could perform.",
    startingPoint:
      "Game Jam prompts often begin as abstract language.\n\nMy first instinct was to search for concepts, stories, visual metaphors, or narrative reversals that appeared to match the theme.\n\nThis produced ideas that sounded relevant when described.\n\nBut description was doing too much of the work.",
    firstInterpretation:
      "At the beginning, I often evaluated ideas by asking:\n\nDoes this concept fit the theme?\n\nThat question was useful for generating directions, but weak for evaluating gameplay.\n\nA theme could exist in the story, title, visual framing, or final reveal while the player's minute-to-minute actions remained unchanged.",
    problemRecognition:
      "The turning point was recognising a gap between thematic meaning and playable behaviour.\n\nIf the theme disappeared from the explanation, would the player still notice it through what they were asked to do?\n\nIn several early ideas, the answer was no.\n\nThe concept carried the theme.\n\nThe mechanic did not.",
    mechanicQuestion:
      "I began using a more direct question:\n\nDoes the idea change what the player does?\n\nInstead of asking only what the theme meant, I asked:\n\nWhat action exists because of this theme?\n\nWhat rule changes because of this theme?\n\nWhat decision would disappear if the theme were removed?",
    mechanicShift:
      "This shifted my attention from explaining the theme to operationalising it.\n\nThe goal became finding the smallest rule that allowed the player to perform the idea rather than only understand it.\n\nNarrative framing could still support the experience.\n\nBut it could no longer carry the entire concept alone.",
    iteration:
      "Under Game Jam time pressure, this also changed how I evaluated scope.\n\nA smaller mechanic with a visible relationship to the theme was more useful than a large concept that required extensive explanation, narrative content, or production work before the idea became playable.\n\nThe prototype became a test of one question:\n\nCan the player experience the theme through action?",
    playableResult:
      "The resulting prototype should be presented here as evidence of the final playable rule.\n\nDo not claim that the mechanic was perfect.\n\nThis section should later document:\n\n- the final player action\n- the core rule\n- the smallest playable loop\n- what changed from the earlier interpretation\n\nI will replace this draft text after reconstructing the exact Game Jam process.",
    reflection:
      "The most useful lesson was not a specific Game Jam technique.\n\nIt was a change in how I evaluate game ideas.\n\nA concept can be thematically clever and still remain mechanically passive.\n\nI now try to ask earlier:\n\nDoes the idea change what the player does?",
  },
  thinkingMap: {
    eyebrow: "Idea to mechanic map",
    heading: "Where meaning became a rule.",
    description: "A writing map for tracing the move from thematic interpretation into player behaviour.",
    nodes: [
      { id: "theme", label: "Theme", body: "Receive an abstract\nGame Jam prompt", emphasis: "default" },
      {
        id: "first-interpretation",
        label: "First Interpretation",
        body: "Search for a concept\nthat appears to fit\nthe theme",
        emphasis: "default",
      },
      {
        id: "early-idea",
        label: "Early Idea",
        body: "Story, framing,\nor visual metaphor\nfeels related",
        emphasis: "default",
      },
      {
        id: "friction",
        label: "Friction",
        body: "The idea explains\nthe theme,\n\nbut does not yet change\nwhat the player does",
        emphasis: "accent",
      },
      {
        id: "mechanic-question",
        label: "Mechanic Question",
        body: "What action is the player\nperforming because of\nthe theme?",
        emphasis: "accent",
      },
      {
        id: "rule-shift",
        label: "Rule Shift",
        body: "Move the theme\nfrom narrative meaning\ninto player behaviour",
        emphasis: "accent",
      },
      {
        id: "prototype",
        label: "Prototype",
        body: "Build the smallest\nplayable expression\nof the rule",
        emphasis: "default",
      },
      {
        id: "reflection",
        label: "Reflection",
        body: "Does the mechanic still\ncommunicate the theme\nwithout explanation?",
        emphasis: "default",
      },
    ],
  },
  imageSlots: {
    initialThemeNotes: { publicPath: "" },
    earlyConceptDirection: { publicPath: "" },
    missingMechanic: { publicPath: "" },
    mechanicReframing: { publicPath: "" },
    iteration01: { publicPath: "" },
    iteration02: { publicPath: "" },
    iteration03: { publicPath: "" },
    playablePrototype: { publicPath: "" },
    coreRuleDiagram: { publicPath: "" },
  },
};

const sectionMeta: Record<SectionKey, { number: string; title: string }> = {
  projectIntro: { number: "01", title: "Project Intro" },
  startingPoint: { number: "02", title: "Starting Point" },
  firstInterpretation: { number: "03", title: "First Interpretation" },
  problemRecognition: { number: "04", title: "Problem Recognition" },
  mechanicQuestion: { number: "05", title: "Mechanic Question" },
  mechanicShift: { number: "06", title: "Mechanic Shift" },
  iteration: { number: "07", title: "Iteration" },
  playableResult: { number: "08", title: "Playable Result" },
  reflection: { number: "09", title: "Reflection" },
};

const imageMeta: Record<ImageSlotKey, { label: string; suggestion: string }> = {
  initialThemeNotes: { label: "Initial theme notes", suggestion: "raw notes / first idea board / theme interpretation" },
  earlyConceptDirection: { label: "Early concept direction", suggestion: "story framing / concept sketch / early proposal" },
  missingMechanic: { label: "Where the mechanic was missing", suggestion: "diagram showing theme meaning vs player action" },
  mechanicReframing: { label: "Mechanic reframing", suggestion: "the question or rule shift that changed the direction" },
  iteration01: { label: "Iteration 01", suggestion: "first mechanic or prototype direction" },
  iteration02: { label: "Iteration 02", suggestion: "second mechanic or prototype direction" },
  iteration03: { label: "Iteration 03", suggestion: "third mechanic or prototype direction" },
  playablePrototype: { label: "Playable prototype", suggestion: "GIF / screenshot / playable capture" },
  coreRuleDiagram: { label: "Core rule diagram", suggestion: "final player action -> rule -> consequence loop" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  return (Object.keys(defaultGameJamDraft.imageSlots) as ImageSlotKey[]).reduce<Record<ImageSlotKey, DraftImageSlot>>(
    (result, key) => {
      const slot = source[key];
      if (typeof slot === "string") {
        result[key] = { publicPath: slot };
      } else if (isRecord(slot)) {
        result[key] = {
          publicPath: typeof slot.publicPath === "string" ? slot.publicPath : "",
          ...(typeof slot.localImageId === "string" && slot.localImageId ? { localImageId: slot.localImageId } : {}),
        };
      } else {
        result[key] = { ...defaultGameJamDraft.imageSlots[key] };
      }
      return result;
    },
    {} as Record<ImageSlotKey, DraftImageSlot>,
  );
}

function mergeThinkingMap(value: unknown): ThinkingMapDraft {
  const source = isRecord(value) ? value : {};
  const sourceNodes = Array.isArray(source.nodes) ? source.nodes : [];
  return {
    eyebrow: typeof source.eyebrow === "string" ? source.eyebrow : defaultGameJamDraft.thinkingMap.eyebrow,
    heading: typeof source.heading === "string" ? source.heading : defaultGameJamDraft.thinkingMap.heading,
    description: typeof source.description === "string" ? source.description : defaultGameJamDraft.thinkingMap.description,
    nodes: defaultGameJamDraft.thinkingMap.nodes.map((defaultNode) => {
      const node = sourceNodes.find((candidate) => isRecord(candidate) && candidate.id === defaultNode.id);
      if (!isRecord(node)) return defaultNode;
      return {
        ...defaultNode,
        label: typeof node.label === "string" ? node.label : defaultNode.label,
        body: typeof node.body === "string" ? node.body : defaultNode.body,
        emphasis: node.emphasis === "accent" || node.emphasis === "default" ? node.emphasis : defaultNode.emphasis,
      };
    }),
  };
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function readStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [...fallback];
}

function readImageSlotKey(value: unknown, fallback: ImageSlotKey): ImageSlotKey {
  return typeof value === "string" && value in defaultGameJamDraft.imageSlots ? value as ImageSlotKey : fallback;
}

function mergeGameJamBlock(value: unknown, fallback: GameJamBlock): GameJamBlock {
  if (!isRecord(value) || value.type !== fallback.type) return structuredClone(fallback);
  const id = readString(value.id, fallback.id);
  if (fallback.type === "paragraph") return { id, type: "paragraph", body: readString(value.body, fallback.body) };
  if (fallback.type === "comparison") {
    return {
      id,
      type: "comparison",
      leftTitle: readString(value.leftTitle, fallback.leftTitle),
      leftItems: readStringArray(value.leftItems, fallback.leftItems),
      rightTitle: readString(value.rightTitle, fallback.rightTitle),
      rightItems: readStringArray(value.rightItems, fallback.rightItems),
      imageSlotKey: fallback.imageSlotKey ? readImageSlotKey(value.imageSlotKey, fallback.imageSlotKey) : undefined,
    };
  }
  if (fallback.type === "ruleTranslation") {
    return { id, type: "ruleTranslation", labels: readStringArray(value.labels, fallback.labels) };
  }
  if (fallback.type === "ideaFilter") {
    const rows: IdeaFilterBlock["rows"] = Array.isArray(value.rows) ? value.rows.flatMap((row) => Array.isArray(row) && row.length === 4 && row.every((cell) => typeof cell === "string") ? [[...row] as IdeaFilterBlock["rows"][number]] : []) : fallback.rows.map((row) => [...row] as IdeaFilterBlock["rows"][number]);
    const columns: IdeaFilterBlock["columns"] = Array.isArray(value.columns) && value.columns.length === 4 && value.columns.every((cell) => typeof cell === "string") ? [...value.columns] as IdeaFilterBlock["columns"] : [...fallback.columns] as IdeaFilterBlock["columns"];
    return { id, type: "ideaFilter", title: readString(value.title, fallback.title), columns, rows };
  }
  if (fallback.type === "staticDemo") {
    const sourceItems = Array.isArray(value.items) ? value.items : [];
    return {
      id,
      type: "staticDemo",
      items: fallback.items.map((item, index) => {
        const source = isRecord(sourceItems[index]) ? sourceItems[index] : {};
        return {
          title: readString(source.title, item.title),
          description: readString(source.description, item.description),
          imageSlotKey: readImageSlotKey(source.imageSlotKey, item.imageSlotKey),
        };
      }),
      demoTitle: readString(value.demoTitle, fallback.demoTitle),
      demoDescription: readString(value.demoDescription, fallback.demoDescription),
      demoImageSlotKey: readImageSlotKey(value.demoImageSlotKey, fallback.demoImageSlotKey),
    };
  }
  if (fallback.type === "reflection") {
    return { id, type: "reflection", title: readString(value.title, fallback.title), body: readString(value.body, fallback.body) };
  }
  return {
    id,
    type: "scopeNote",
    title: readString(value.title, fallback.title),
    keep: readStringArray(value.keep, fallback.keep),
    remove: readStringArray(value.remove, fallback.remove),
  };
}

function createTemplateBlock(type: GameJamTemplateType): GameJamBlock {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (type === "paragraph") return { id, type, body: "在这里补充正文说明。" };
  if (type === "comparison") return { id, type, leftTitle: "方向 A", leftItems: ["判断 01", "判断 02"], rightTitle: "方向 B", rightItems: ["判断 01", "判断 02"] };
  if (type === "ruleTranslation") return { id, type, labels: ["概念", "玩家行动", "规则变化", "下一步行为"] };
  if (type === "ideaFilter") return { id, type, title: "方案判断", columns: ["方案", "行为变化", "可验证性", "处理"], rows: [["方案 01", "待判断", "待判断", "保留"]] };
  if (type === "staticDemo") return {
    id,
    type,
    items: [
      { title: "静态交互稿 01", description: "补充说明。", imageSlotKey: "iteration01" },
      { title: "静态交互稿 02", description: "补充说明。", imageSlotKey: "iteration02" },
      { title: "静态交互稿 03", description: "补充说明。", imageSlotKey: "iteration03" },
    ],
    demoTitle: "动态演示",
    demoDescription: "补充动态演示说明。",
    demoImageSlotKey: "playablePrototype",
  };
  if (type === "reflection") return { id, type, title: "反思", body: "在这里补充这一步带来的设计判断。" };
  return { id, type, title: "设计取舍", keep: ["保留项"], remove: ["移除项"] };
}

function mergeGameJamChapters(value: unknown): GameJamChapter[] {
  if (!Array.isArray(value)) return structuredClone(defaultGameJamChapters);
  return defaultGameJamChapters.map((fallback) => {
    const source = value.find((item) => isRecord(item) && item.id === fallback.id);
    if (!isRecord(source)) return structuredClone(fallback);
    const sourceBlocks = Array.isArray(source.blocks) ? source.blocks : null;
    const blocks = sourceBlocks
      ? sourceBlocks.flatMap((block) => {
          if (!isRecord(block) || typeof block.type !== "string") return [];
          const fallbackBlock = fallback.blocks.find((item) => item.id === block.id && item.type === block.type) ?? createTemplateBlock(block.type as GameJamTemplateType);
          return [mergeGameJamBlock(block, { ...fallbackBlock, id: readString(block.id, fallbackBlock.id) } as GameJamBlock)];
        })
      : structuredClone(fallback.blocks);
    return {
      id: fallback.id,
      title: readString(source.title, fallback.title),
      heading: readString(source.heading, fallback.heading),
      body: readString(source.body, fallback.body),
      blocks,
    };
  });
}

export function mergeGameJamDraft(value: unknown): GameJamDraft {
  if (!isRecord(value)) return defaultGameJamDraft;
  const sourceReflection = isRecord(value.reflection) ? value.reflection : {};
  const title = typeof value.title === "string" && value.title !== previousDefaultTitle ? value.title : defaultGameJamDraft.title;
  const subtitle = typeof value.subtitle === "string" && value.subtitle !== previousDefaultSubtitle ? value.subtitle : defaultGameJamDraft.subtitle;
  const framingQuestion = typeof value.framingQuestion === "string" && value.framingQuestion !== previousDefaultQuestion ? value.framingQuestion : defaultGameJamDraft.framingQuestion;
  return {
    version: 1,
    category: readString(value.category, defaultGameJamDraft.category),
    title,
    subtitle,
    duration: readString(value.duration, defaultGameJamDraft.duration),
    team: readString(value.team, defaultGameJamDraft.team),
    context: readString(value.context, defaultGameJamDraft.context),
    framingQuestion,
    chapters: mergeGameJamChapters(value.chapters),
    reflection: {
      title: readString(sourceReflection.title, defaultGameJamDraft.reflection.title),
      body: readString(sourceReflection.body, defaultGameJamDraft.reflection.body),
    },
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : defaultGameJamDraft.updatedAt,
    sections: readStringRecord(value.sections, defaultGameJamDraft.sections),
    thinkingMap: mergeThinkingMap(value.thinkingMap),
    imageSlots: mergeImageSlots(value.imageSlots),
  };
}

function loadDraft() {
  if (typeof window === "undefined") return defaultGameJamDraft;
  try {
    // IMPORTANT:
    // User-authored local Game Jam case-study content.
    // Do not rename the storage key or reset persisted content during layout-only refactors.
    const stored = window.localStorage.getItem(GAME_JAM_DRAFT_STORAGE_KEY);
    if (!stored) return defaultGameJamDraft;
    const parsed = JSON.parse(stored) as unknown;
    return mergeGameJamDraft(parsed);
  } catch {
    return defaultGameJamDraft;
  }
}

function updated(draft: GameJamDraft) {
  return { ...draft, updatedAt: new Date().toISOString() };
}

function paragraphs(value: string) {
  return value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

export function GameJamDraftPage() {
  const { locale, messages, pathFor } = useLocale();
  const [draft, setDraft] = useState<GameJamDraft>(() => loadDraft());
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("ready");
  const [importError, setImportError] = useState("");
  const didMount = useRef(false);
  const importInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return undefined;
    }
    setSaveStatus("saving");
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(GAME_JAM_DRAFT_STORAGE_KEY, JSON.stringify(draft));
        try {
          setProjectPublicMetaOverride("from-theme-to-playable-rule", {
            titleZh: draft.title,
            summaryZh: draft.subtitle,
            duration: draft.duration,
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

  const changeDraft = (updater: (current: GameJamDraft) => GameJamDraft) => {
    setDraft((current) => updated(updater(current)));
    setImportError("");
  };
  const changeSection = (key: SectionKey, value: string) => changeDraft((current) => ({ ...current, sections: { ...current.sections, [key]: value } }));
  const changeImage = (key: ImageSlotKey, value: DraftImageSlot) => changeDraft((current) => ({ ...current, imageSlots: { ...current.imageSlots, [key]: value } }));
  const changeChapter = (id: GameJamChapterId, updater: (chapter: GameJamChapter) => GameJamChapter) => changeDraft((current) => ({ ...current, chapters: current.chapters.map((chapter) => chapter.id === id ? updater(chapter) : chapter) }));
  const changeBlock = (chapterId: GameJamChapterId, blockId: string, block: GameJamBlock) => changeChapter(chapterId, (chapter) => ({ ...chapter, blocks: chapter.blocks.map((item) => item.id === blockId ? block : item) }));
  const moveBlock = (chapterId: GameJamChapterId, index: number, direction: -1 | 1) => changeChapter(chapterId, (chapter) => {
    const target = index + direction;
    if (target < 0 || target >= chapter.blocks.length) return chapter;
    const blocks = [...chapter.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    return { ...chapter, blocks };
  });
  const removeBlock = (chapterId: GameJamChapterId, blockId: string) => changeChapter(chapterId, (chapter) => ({ ...chapter, blocks: chapter.blocks.filter((block) => block.id !== blockId) }));
  const insertBlock = (chapterId: GameJamChapterId, type: GameJamTemplateType) => changeChapter(chapterId, (chapter) => ({ ...chapter, blocks: [...chapter.blocks, createTemplateBlock(type)] }));

  const exportDraft = () => {
    const blob = new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "from-theme-to-playable-rule-draft.json";
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
      const value = JSON.parse(await file.text()) as unknown;
      if (!isRecord(value) || value.version !== 1) throw new Error("Invalid version-1 draft file.");
      const next = updated(mergeGameJamDraft(value));
      window.localStorage.setItem(GAME_JAM_DRAFT_STORAGE_KEY, JSON.stringify(next));
      try {
        setProjectPublicMetaOverride("from-theme-to-playable-rule", {
          titleZh: next.title,
          summaryZh: next.subtitle,
          duration: next.duration,
        });
      } catch {
        // Importing the case-study draft must not depend on the listing cache.
      }
      setDraft(next);
      setSaveStatus("saved");
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Invalid draft file.");
    }
  };

  return (
    <PageTransition>
      <article className="overflow-hidden bg-deepIndigo text-softWhite">
        {import.meta.env.DEV ? (
          <AuthorDock
            draftTitle={draft.title}
            isEditing={isEditing}
            saveStatus={saveStatus}
            importError={importError}
            onToggle={() => setIsEditing((value) => !value)}
            onExport={exportDraft}
            onImport={() => importInput.current?.click()}
          />
        ) : null}
        <input ref={importInput} className="hidden" type="file" accept="application/json,.json" onChange={importDraft} />

        <section className={caseStudyLayout.heroSection}>
          <div className="absolute inset-0 bg-grain bg-[length:18px_18px] opacity-25" />
          <div className={caseStudyLayout.heroContainer}>
            <Link to={pathFor("/work")} className={caseStudyLayout.backLink}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{messages.project.backToArchive}</Link>
            <div className={caseStudyLayout.heroComposition}>
              <div className={caseStudyLayout.heroCopy}>
                <EditableCaseText label="Category" value={draft.category} isEditing={isEditing} onChange={(category) => changeDraft((current) => ({ ...current, category }))} className={caseStudyLayout.category} />
                <EditableHeroText kind="title" isEditing={isEditing} value={draft.title} onChange={(title) => changeDraft((current) => ({ ...current, title }))} />
                <EditableHeroText kind="subtitle" isEditing={isEditing} value={draft.subtitle} onChange={(subtitle) => changeDraft((current) => ({ ...current, subtitle }))} />
              </div>
              <div className={caseStudyLayout.durationPosition}>
                {isEditing ? <EditableDuration value={draft.duration} onChange={(duration) => changeDraft((current) => ({ ...current, duration }))} /> : draft.duration ? <p className={caseStudyLayout.durationText}>{draft.duration}</p> : null}
              </div>
            </div>
          </div>
        </section>

        {isEditing ? <ProjectCoverEditor projectId="from-theme-to-playable-rule" locale={locale} /> : null}

        <section className="border-b border-softWhite/10 bg-deepIndigo px-4 py-8 md:px-6 md:py-10">
          <div className="mx-auto max-w-7xl">
            <EditableCaseText label="Project context" value={draft.context} isEditing={isEditing} multiline onChange={(context) => changeDraft((current) => ({ ...current, context }))} className="text-[clamp(1rem,1.1vw,1.125rem)] leading-[1.85] text-softWhite/68" />
            <div className="mt-8 border-l-2 border-acidGreen/65 pl-5 md:pl-7">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-acidGreen/76">Core design question</p>
              <EditableQuestion isEditing={isEditing} value={draft.framingQuestion} onChange={(framingQuestion) => changeDraft((current) => ({ ...current, framingQuestion }))} />
            </div>
            <div className="mt-6 max-w-sm"><EditableCaseText label="Team" value={draft.team} isEditing={isEditing} onChange={(team) => changeDraft((current) => ({ ...current, team }))} className="font-mono text-sm text-[#9FAAD2]" /></div>
          </div>
        </section>

        <section className={caseStudyLayout.contentSection}>
          <div className={caseStudyLayout.contentStack}>
            {draft.chapters.map((chapter, chapterIndex) => (
              <GameJamChapterSection
                key={chapter.id}
                chapter={chapter}
                index={chapterIndex}
                draft={draft}
                isEditing={isEditing}
                onChapterChange={(next) => changeChapter(chapter.id, () => next)}
                onBlockChange={(blockId, block) => changeBlock(chapter.id, blockId, block)}
                onMoveBlock={(index, direction) => moveBlock(chapter.id, index, direction)}
                onRemoveBlock={(blockId) => removeBlock(chapter.id, blockId)}
                onInsertBlock={(type) => insertBlock(chapter.id, type)}
                onImageChange={changeImage}
              />
            ))}
            <UnityGamePlayer
              title="Afterwarm"
              iframeUrl="/games/afterwarm/index.html"
              externalUrl="https://play.unity.com/en/games/d21db0be-36a7-4193-a21f-64e34a979196/tem"
              locale={locale}
            />
            {isEditing ? <LegacyGameJamBackup draft={draft} onSectionChange={changeSection} onThinkingMapChange={(thinkingMap) => changeDraft((current) => ({ ...current, thinkingMap }))} /> : null}
          </div>
        </section>

        <section className="border-t border-softWhite/10 bg-[#101032] px-4 py-24 md:px-6 md:py-32">
          <div className="mx-auto max-w-5xl text-center">
            <EditableCaseText label="Reflection title" value={draft.reflection.title} isEditing={isEditing} multiline onChange={(title) => changeDraft((current) => ({ ...current, reflection: { ...current.reflection, title } }))} className="font-display text-[clamp(2.3rem,5vw,5rem)] font-semibold leading-[1.08] text-softWhite" />
            <div className="mx-auto mt-8 max-w-3xl text-left"><EditableCaseText label="Reflection body" value={draft.reflection.body} isEditing={isEditing} multiline onChange={(body) => changeDraft((current) => ({ ...current, reflection: { ...current.reflection, body } }))} className="text-[clamp(1.05rem,1.15vw,1.25rem)] leading-[1.75] text-softWhite/70" /></div>
          </div>
        </section>
      </article>
    </PageTransition>
  );
}

function AuthorDock({
  draftTitle,
  isEditing,
  saveStatus,
  importError,
  onToggle,
  onExport,
  onImport,
}: {
  draftTitle: string;
  isEditing: boolean;
  saveStatus: SaveStatus;
  importError: string;
  onToggle: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const normalise = (value: string) => value.replace(/\s+/g, " ").trim();
  const synced = normalise(draftTitle) === normalise(publishedProject.title);
  const status = saveStatus === "saving" ? "Saving..." : saveStatus === "error" ? "Save error" : "Saved locally";
  return (
    <div className="fixed right-3 top-[82px] z-[80] flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 md:right-6 md:top-[84px]">
      <button type="button" className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] shadow-archive backdrop-blur ${isEditing ? "border-acidGreen bg-acidGreen text-deepIndigo" : "border-electricBlue/55 bg-deepIndigo/88 text-acidGreen"}`} onClick={onToggle}>
        {isEditing ? <X className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
        {isEditing ? "Done editing" : "Edit content"}
      </button>
      {isEditing ? (
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2 rounded-[10px] border border-electricBlue/35 bg-deepIndigo/94 px-3 py-2 shadow-archive backdrop-blur">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-softWhite/48">{status}</span>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-softWhite/14 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-softWhite/70" onClick={onExport}><Download className="h-3.5 w-3.5" /> Export draft</button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border border-softWhite/14 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-softWhite/70" onClick={onImport}><FileUp className="h-3.5 w-3.5" /> Import draft</button>
          <div className="w-full border-t border-softWhite/10 pt-2 text-right">
            <p className={`font-mono text-[9px] font-bold uppercase tracking-[0.14em] ${synced ? "text-softWhite/42" : "text-peach"}`}>{synced ? "Title synced" : "Title differs from site"}</p>
            {!synced ? <p className="mt-1 text-[11px] text-softWhite/54"><span className="mr-2 font-mono text-[9px] uppercase text-softWhite/34">Site title</span>{publishedProject.title}</p> : null}
          </div>
          <p className="w-full text-right font-mono text-[9px] uppercase leading-4 tracking-[0.1em] text-softWhite/42">Local images are stored in this browser. JSON export does not include image blobs.</p>
          {importError ? <p className="w-full text-right text-xs text-peach">{importError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function EditableHeroText({ kind, isEditing, value, onChange }: { kind: "title" | "subtitle"; isEditing: boolean; value: string; onChange: (value: string) => void }) {
  const title = kind === "title";
  if (!isEditing) return title ? <h1 className={caseStudyLayout.heroTitle}>{value}</h1> : <p className={`${caseStudyLayout.subtitle} whitespace-pre-line`}>{value}</p>;
  return (
    <label className={`block min-w-0 rounded-[8px] border border-electricBlue/50 bg-archiveBlue/20 p-3 ${title ? "mt-5 max-w-5xl" : "mt-6 max-w-3xl"}`}>
      <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen/74">Editable / {kind}</span>
      <textarea aria-label={title ? "Project title" : "Project subtitle"} className={title ? caseStudyLayout.heroTitleEditor : "w-full min-w-0 resize-y bg-deepIndigo/42 p-3 text-[clamp(1.125rem,1.5vw,1.5rem)] leading-[1.65] outline-none"} rows={Math.max(title ? 2 : 3, value.split("\n").length + 1)} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function EditableQuestion({ isEditing, value, onChange }: { isEditing: boolean; value: string; onChange: (value: string) => void }) {
  if (!isEditing) return <h2 className="mt-3 max-w-4xl whitespace-pre-line font-display text-[clamp(1.4rem,2.4vw,2.25rem)] leading-[1.3] text-softWhite/88">{value}</h2>;
  return <textarea aria-label="Framing question" className="mt-3 w-full max-w-4xl resize-y border-b border-acidGreen/55 bg-transparent pb-3 font-display text-[clamp(1.4rem,2.4vw,2.25rem)] leading-[1.3] outline-none" rows={Math.max(2, value.split("\n").length + 1)} value={value} onChange={(event) => onChange(event.target.value)} />;
}

function EditableDuration({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="block min-w-0 sm:w-64"><span className="mb-2 block font-mono text-xs font-bold uppercase tracking-[0.1em] text-[#9FAAD2] sm:text-right">Duration</span><input className="w-full min-w-0 rounded-[6px] border border-electricBlue/45 bg-deepIndigo/58 px-3 py-2 font-mono text-sm text-softWhite outline-none transition focus:border-acidGreen/60 sm:text-right" value={value} placeholder="Add duration" onChange={(event) => onChange(event.target.value)} /></label>;
}

function EditableCaseText({ label, value, isEditing, onChange, className, multiline = false }: { label: string; value: string; isEditing: boolean; onChange: (value: string) => void; className: string; multiline?: boolean }) {
  if (!isEditing) return <div className={className}>{multiline ? paragraphs(value).map((paragraph) => <p key={paragraph} className="mb-5 whitespace-pre-line last:mb-0">{paragraph}</p>) : value}</div>;
  return <label className={`block min-w-0 rounded-[8px] border border-electricBlue/45 bg-archiveBlue/16 p-3 ${className}`}><span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-acidGreen/70">Editable / {label}</span>{multiline ? <textarea className="w-full min-w-0 resize-y bg-deepIndigo/42 p-3 text-base leading-7 text-softWhite outline-none" rows={Math.max(3, value.split("\n").length + 1)} value={value} onChange={(event) => onChange(event.target.value)} /> : <input className="w-full min-w-0 bg-transparent font-inherit text-inherit outline-none" value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function GameJamChapterSection({ chapter, index, draft, isEditing, onChapterChange, onBlockChange, onMoveBlock, onRemoveBlock, onInsertBlock, onImageChange }: {
  chapter: GameJamChapter;
  index: number;
  draft: GameJamDraft;
  isEditing: boolean;
  onChapterChange: (chapter: GameJamChapter) => void;
  onBlockChange: (blockId: string, block: GameJamBlock) => void;
  onMoveBlock: (index: number, direction: -1 | 1) => void;
  onRemoveBlock: (blockId: string) => void;
  onInsertBlock: (type: GameJamTemplateType) => void;
  onImageChange: (key: ImageSlotKey, value: DraftImageSlot) => void;
}) {
  return <section id={chapter.id} className="scroll-mt-24">
    <div className={caseStudyLayout.majorGrid}>
      <div className={caseStudyLayout.majorTitleComposition}>
        <span aria-hidden="true" className={caseStudyLayout.majorNumber}>{String(index + 1).padStart(2, "0")}</span>
        <div className={caseStudyLayout.majorTitleOffset}>
          {isEditing ? <EditableCaseText label="Chapter title" value={chapter.title} isEditing onChange={(title) => onChapterChange({ ...chapter, title })} className={caseStudyLayout.majorTitle} multiline /> : <h2 className={caseStudyLayout.majorTitle}>{chapter.title}</h2>}
        </div>
      </div>
      <div className={caseStudyLayout.majorCopy}>
        <EditableCaseText label="Chapter heading" value={chapter.heading} isEditing={isEditing} onChange={(heading) => onChapterChange({ ...chapter, heading })} className={caseStudyLayout.majorHeading} multiline />
        <EditableCaseText label="Chapter body" value={chapter.body} isEditing={isEditing} onChange={(body) => onChapterChange({ ...chapter, body })} className={caseStudyLayout.majorBody} multiline />
      </div>
    </div>
    <div className={chapter.blocks.length > 0 || isEditing ? caseStudyLayout.blocks : ""}>
      {chapter.blocks.map((block, blockIndex) => <div key={block.id} className={isEditing ? "relative min-w-0 rounded-lg border border-dashed border-electricBlue/35 p-4 pt-14" : "min-w-0"}>
        {isEditing ? <div className="absolute right-3 top-3 flex gap-2"><button type="button" className="editor-icon" disabled={blockIndex === 0} onClick={() => onMoveBlock(blockIndex, -1)} aria-label="Move block up"><ChevronUp /></button><button type="button" className="editor-icon" disabled={blockIndex === chapter.blocks.length - 1} onClick={() => onMoveBlock(blockIndex, 1)} aria-label="Move block down"><ChevronDown /></button><button type="button" className="editor-icon text-peach" onClick={() => onRemoveBlock(block.id)} aria-label="Delete block"><Trash2 /></button></div> : null}
        <GameJamBlockView block={block} draft={draft} isEditing={isEditing} onChange={(next) => onBlockChange(block.id, next)} onImageChange={onImageChange} />
      </div>)}
    </div>
    {isEditing ? <GameJamTemplateInserter onInsert={onInsertBlock} /> : null}
  </section>;
}

function EditableStringList({ label, items, isEditing, onChange }: { label: string; items: string[]; isEditing: boolean; onChange: (items: string[]) => void }) {
  if (!isEditing) return <ul className="mt-5 grid gap-3">{items.map((item, index) => <li key={`${index}-${item}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 border-t border-softWhite/10 pt-3 text-base leading-7 text-softWhite/68"><span className="font-mono text-xs leading-7 text-[#9FAAD2]/70">{String(index + 1).padStart(2, "0")}</span><span>{item}</span></li>)}</ul>;
  return <div className="mt-4 grid gap-2"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#9FAAD2]">{label}</p>{items.map((item, index) => <div key={index} className="flex gap-2"><input className="min-w-0 flex-1 border-b border-softWhite/14 bg-transparent px-2 py-2 text-sm outline-none focus:border-acidGreen" value={item} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} /><button type="button" className="editor-icon text-peach" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${label} ${index + 1}`}><Trash2 /></button></div>)}<button type="button" className="editor-action justify-self-start" onClick={() => onChange([...items, "新增判断"])}><Plus className="h-3.5 w-3.5" />Add item</button></div>;
}

function GameJamBlockView({ block, draft, isEditing, onChange, onImageChange }: { block: GameJamBlock; draft: GameJamDraft; isEditing: boolean; onChange: (block: GameJamBlock) => void; onImageChange: (key: ImageSlotKey, value: DraftImageSlot) => void }) {
  if (block.type === "paragraph") return <EditableCaseText label="Paragraph" value={block.body} isEditing={isEditing} multiline onChange={(body) => onChange({ ...block, body })} className="mx-auto max-w-4xl text-[clamp(1.05rem,1.15vw,1.25rem)] leading-[1.75] text-softWhite/70" />;
  if (block.type === "comparison") return <div>
    <div className="grid gap-6 md:grid-cols-2 md:gap-8">
      <div className="min-w-0 rounded-[18px] bg-archiveBlue/18 p-6 shadow-[inset_0_1px_0_rgba(244,245,250,0.06)]"><EditableCaseText label="Left comparison title" value={block.leftTitle} isEditing={isEditing} onChange={(leftTitle) => onChange({ ...block, leftTitle })} className="font-display text-[clamp(1.4rem,2vw,2rem)] font-semibold text-softWhite" /><EditableStringList label="Left items" items={block.leftItems} isEditing={isEditing} onChange={(leftItems) => onChange({ ...block, leftItems })} /></div>
      <div className="min-w-0 rounded-[18px] bg-acidGreen/[0.055] p-6 shadow-[inset_0_1px_0_rgba(52,240,37,0.13)]"><EditableCaseText label="Right comparison title" value={block.rightTitle} isEditing={isEditing} onChange={(rightTitle) => onChange({ ...block, rightTitle })} className="font-display text-[clamp(1.4rem,2vw,2rem)] font-semibold text-acidGreen" /><EditableStringList label="Right items" items={block.rightItems} isEditing={isEditing} onChange={(rightItems) => onChange({ ...block, rightItems })} /></div>
    </div>
    {block.imageSlotKey ? <div className="mx-auto mt-10 max-w-5xl"><GameJamImageSlot slotKey={block.imageSlotKey} slot={draft.imageSlots[block.imageSlotKey]} isEditing={isEditing} onChange={onImageChange} /></div> : null}
  </div>;
  if (block.type === "ruleTranslation") return <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-center md:gap-3">{block.labels.map((label, index) => <div key={`${index}-${label}`} className="contents">{isEditing ? <input className="min-w-0 flex-1 rounded-full border border-electricBlue/35 bg-archiveBlue/18 px-4 py-3 text-center text-sm font-semibold outline-none focus:border-acidGreen" value={label} onChange={(event) => onChange({ ...block, labels: block.labels.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /> : <div className={`min-w-0 flex-1 rounded-full px-4 py-3 text-center text-sm font-semibold leading-6 ${index === 0 || index === block.labels.length - 1 ? "bg-acidGreen/10 text-acidGreen" : "bg-archiveBlue/25 text-softWhite/72"}`}>{label}</div>}{index < block.labels.length - 1 ? <ArrowRight className="mx-auto h-5 w-5 shrink-0 rotate-90 text-acidGreen/65 md:rotate-0" aria-hidden="true" /> : null}</div>)}</div>;
  if (block.type === "ideaFilter") return <div className="min-w-0">
    <EditableCaseText label="Table title" value={block.title} isEditing={isEditing} onChange={(title) => onChange({ ...block, title })} className="text-center font-display text-[clamp(1.25rem,2vw,1.5rem)] font-semibold leading-[1.3] text-softWhite" />
    <div className="mt-7 overflow-x-auto rounded-[18px] bg-archiveBlue/16 shadow-[inset_0_1px_0_rgba(244,245,250,0.07)]"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr>{block.columns.map((column, index) => <th key={index} className="border-b border-softWhite/12 px-5 py-4 font-mono text-xs font-bold tracking-[0.06em] text-[#9FAAD2]">{isEditing ? <input className="w-full bg-transparent outline-none" value={column} onChange={(event) => onChange({ ...block, columns: block.columns.map((item, itemIndex) => itemIndex === index ? event.target.value : item) as IdeaFilterBlock["columns"] })} /> : column}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-softWhite/8 px-5 py-4 align-top text-sm leading-6 text-softWhite/66">{isEditing ? <textarea className="w-full resize-y bg-transparent outline-none" rows={2} value={cell} onChange={(event) => onChange({ ...block, rows: block.rows.map((current, index) => index === rowIndex ? current.map((item, columnIndex) => columnIndex === cellIndex ? event.target.value : item) as IdeaFilterBlock["rows"][number] : current) })} /> : cellIndex === 3 ? <span className="inline-flex rounded-full bg-acidGreen/10 px-3 py-1 font-semibold text-acidGreen">{cell}</span> : cell}</td>)}{isEditing ? <td className="border-b border-softWhite/8 px-2 py-4"><button type="button" className="editor-icon text-peach" aria-label={`Remove row ${rowIndex + 1}`} onClick={() => onChange({ ...block, rows: block.rows.filter((_, index) => index !== rowIndex) })}><Trash2 /></button></td> : null}</tr>)}</tbody></table></div>
    {isEditing ? <button type="button" className="editor-action mt-3" onClick={() => onChange({ ...block, rows: [...block.rows, ["新方案", "待判断", "待判断", "保留"]] })}><Plus className="h-3.5 w-3.5" />Add row</button> : null}
  </div>;
  if (block.type === "staticDemo") return <div>
    <div className="grid gap-6 md:grid-cols-3">{block.items.map((item, index) => <div key={index} className="min-w-0"><GameJamImageSlot slotKey={item.imageSlotKey} slot={draft.imageSlots[item.imageSlotKey]} isEditing={isEditing} onChange={onImageChange} compact /><div className="mt-4"><EditableCaseText label={`Static title ${index + 1}`} value={item.title} isEditing={isEditing} onChange={(title) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, title } : current) })} className="font-display text-xl font-semibold text-softWhite" /><EditableCaseText label={`Static description ${index + 1}`} value={item.description} isEditing={isEditing} multiline onChange={(description) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, description } : current) })} className="mt-2 text-base leading-7 text-softWhite/62" /></div></div>)}</div>
    <ArrowDown className="mx-auto my-8 h-9 w-9 text-acidGreen" aria-hidden="true" />
    <div className="mx-auto max-w-5xl"><GameJamImageSlot slotKey={block.demoImageSlotKey} slot={draft.imageSlots[block.demoImageSlotKey]} isEditing={isEditing} onChange={onImageChange} /><div className="mt-5 text-center"><EditableCaseText label="Demo title" value={block.demoTitle} isEditing={isEditing} onChange={(demoTitle) => onChange({ ...block, demoTitle })} className="font-display text-2xl font-semibold text-softWhite" /><div className="mx-auto mt-3 max-w-3xl"><EditableCaseText label="Demo description" value={block.demoDescription} isEditing={isEditing} multiline onChange={(demoDescription) => onChange({ ...block, demoDescription })} className="text-base leading-7 text-softWhite/62" /></div></div></div>
  </div>;
  if (block.type === "reflection") return <div className="mx-auto max-w-4xl text-center"><EditableCaseText label="Reflection title" value={block.title} isEditing={isEditing} multiline onChange={(title) => onChange({ ...block, title })} className="font-display text-[clamp(1.7rem,3vw,3rem)] font-semibold leading-[1.2] text-softWhite" /><div className="mx-auto mt-5 max-w-3xl text-left"><EditableCaseText label="Reflection body" value={block.body} isEditing={isEditing} multiline onChange={(body) => onChange({ ...block, body })} className="text-base leading-8 text-softWhite/66" /></div></div>;
  return <div className="mx-auto max-w-5xl">
    <EditableCaseText label="Scope note title" value={block.title} isEditing={isEditing} onChange={(title) => onChange({ ...block, title })} className="text-center font-display text-[clamp(1.4rem,2vw,2rem)] font-semibold text-softWhite" />
    <div className="mt-7 grid gap-6 md:grid-cols-2"><div className="rounded-[18px] bg-acidGreen/[0.055] p-6"><p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-acidGreen">Keep</p><EditableStringList label="Keep" items={block.keep} isEditing={isEditing} onChange={(keep) => onChange({ ...block, keep })} /></div><div className="rounded-[18px] bg-archiveBlue/16 p-6"><p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#9FAAD2]">Remove</p><EditableStringList label="Remove" items={block.remove} isEditing={isEditing} onChange={(remove) => onChange({ ...block, remove })} /></div></div>
  </div>;
}

const gameJamTemplateLabels: Record<GameJamTemplateType, string> = {
  paragraph: "正文说明段落",
  comparison: "双列对比",
  ruleTranslation: "规则转译流程",
  ideaFilter: "可编辑判断表",
  staticDemo: "三图到动态演示",
  scopeNote: "取舍总结",
  reflection: "反思段落",
};

function GameJamTemplateInserter({ onInsert }: { onInsert: (type: GameJamTemplateType) => void }) {
  const [type, setType] = useState<GameJamTemplateType>("paragraph");
  return <div className="mt-14 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-dashed border-electricBlue/35 bg-archiveBlue/10 p-4"><span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-acidGreen">Insert template</span><select className="rounded-md border border-softWhite/12 bg-deepIndigo px-3 py-2 text-sm text-softWhite outline-none" value={type} onChange={(event) => setType(event.target.value as GameJamTemplateType)}>{(Object.keys(gameJamTemplateLabels) as GameJamTemplateType[]).map((key) => <option key={key} value={key}>{gameJamTemplateLabels[key]}</option>)}</select><button type="button" className="editor-action" onClick={() => onInsert(type)}><Plus className="h-3.5 w-3.5" />Insert</button></div>;
}

function LegacyGameJamBackup({ draft, onSectionChange, onThinkingMapChange }: { draft: GameJamDraft; onSectionChange: (key: SectionKey, value: string) => void; onThinkingMapChange: (value: ThinkingMapDraft) => void }) {
  return <details className="rounded-lg border border-dashed border-softWhite/14 bg-archiveBlue/8 p-5"><summary className="cursor-pointer font-mono text-xs font-bold uppercase tracking-[0.12em] text-[#9FAAD2]">Legacy draft backup / preserved content</summary><p className="mt-3 text-sm leading-6 text-softWhite/48">The previous nine-part draft and thinking map remain preserved here for reference. They are not rendered in the public three-chapter narrative.</p><div className="mt-6 grid gap-5">{(Object.keys(draft.sections) as SectionKey[]).map((key) => <EditableCaseText key={key} label={sectionMeta[key].title} value={draft.sections[key]} isEditing multiline onChange={(value) => onSectionChange(key, value)} className="text-sm leading-6 text-softWhite/62" />)}<IdeaMechanicMap value={draft.thinkingMap} isEditing onChange={onThinkingMapChange} /></div></details>;
}

function IdeaMechanicMap({ value, isEditing, onChange }: { value: ThinkingMapDraft; isEditing: boolean; onChange: (value: ThinkingMapDraft) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; x: number; left: number } | null>(null);
  const updateNode = (id: ThinkingNodeId, patch: Partial<ThinkingNode>) => onChange({ ...value, nodes: value.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) });
  const editableTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("input, textarea, label, button"));
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || editableTarget(event.target) || !scrollRef.current) return;
    drag.current = { id: event.pointerId, x: event.clientX, left: scrollRef.current.scrollLeft };
    scrollRef.current.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId || !scrollRef.current) return;
    event.preventDefault();
    scrollRef.current.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
  };
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId || !scrollRef.current) return;
    if (scrollRef.current.hasPointerCapture(event.pointerId)) scrollRef.current.releasePointerCapture(event.pointerId);
    drag.current = null;
  };
  return (
    <section className="bg-[#101032] px-4 py-20 md:px-6 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 grid gap-5 lg:grid-cols-[1fr_0.55fr] lg:items-end">
          <div>
            {isEditing ? <input aria-label="Map eyebrow" className="w-full bg-transparent font-mono text-xs font-bold uppercase tracking-[0.22em] text-acidGreen outline-none" value={value.eyebrow} onChange={(event) => onChange({ ...value, eyebrow: event.target.value })} /> : <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-acidGreen/78">{value.eyebrow}</p>}
            {isEditing ? <textarea aria-label="Map heading" className="mt-3 w-full resize-none overflow-hidden bg-transparent font-display text-4xl leading-tight outline-none md:text-6xl" rows={2} value={value.heading} onChange={(event) => onChange({ ...value, heading: event.target.value })} /> : <h2 className="mt-3 whitespace-pre-line font-display text-4xl leading-tight md:text-6xl">{value.heading}</h2>}
          </div>
          {isEditing ? <textarea aria-label="Map description" className="w-full resize-none overflow-hidden border-l border-electricBlue/40 bg-transparent pl-4 text-sm leading-6 outline-none" rows={4} value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} /> : <p className="border-l border-electricBlue/40 pl-4 text-sm leading-6 text-softWhite/54">{value.description}</p>}
        </div>
        <div ref={scrollRef} className="game-jam-map-scroll hidden cursor-grab overflow-x-auto lg:block" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
          <div className="grid w-max grid-flow-col gap-3 [grid-auto-columns:212px] xl:[grid-auto-columns:216px]">
            {value.nodes.map((node, index) => <MapNode key={node.id} node={node} index={index} last={index === value.nodes.length - 1} isEditing={isEditing} onChange={(patch) => updateNode(node.id, patch)} />)}
          </div>
        </div>
        <div className="grid gap-3 lg:hidden">
          {value.nodes.map((node, index) => <MapNode key={node.id} node={node} index={index} last={index === value.nodes.length - 1} isEditing={isEditing} onChange={(patch) => updateNode(node.id, patch)} mobile />)}
        </div>
      </div>
    </section>
  );
}

function MapNode({ node, index, last, isEditing, onChange, mobile = false }: { node: ThinkingNode; index: number; last: boolean; isEditing: boolean; onChange: (patch: Partial<ThinkingNode>) => void; mobile?: boolean }) {
  const accent = node.emphasis === "accent";
  const card = <div data-game-jam-node={node.id} className={`h-full min-w-0 border p-4 ${accent ? "border-acidGreen/55 bg-acidGreen/8" : "border-softWhite/12 bg-archiveBlue/18"}`}>
    {isEditing ? <><label className="block border-b border-softWhite/10 pb-2"><span className="font-mono text-[9px] uppercase text-acidGreen/60">Label</span><input className="mt-1 w-full min-w-0 bg-transparent font-mono text-[10px] font-bold uppercase tracking-[0.12em] outline-none" value={node.label} onChange={(event) => onChange({ label: event.target.value })} /></label><label className="mt-3 block"><span className="font-mono text-[9px] uppercase text-acidGreen/60">Body</span><textarea className="mt-1 w-full min-w-0 resize-none overflow-hidden bg-transparent text-sm leading-6 outline-none" rows={Math.max(5, node.body.split("\n").length + 1)} value={node.body} onChange={(event) => onChange({ body: event.target.value })} /></label></> : <><p className={`font-mono text-[10px] font-bold uppercase tracking-[0.15em] ${accent ? "text-acidGreen" : "text-softWhite/40"}`}>{node.label}</p><p className="mt-4 whitespace-pre-line text-sm font-semibold leading-6 text-softWhite/76">{node.body}</p></>}
  </div>;
  if (!mobile) return <div className="relative">{!last ? <span className={`absolute left-[calc(100%-5px)] top-1/2 h-px w-5 ${accent ? "bg-acidGreen/70" : "bg-softWhite/16"}`} /> : null}{card}</div>;
  return <div className="grid grid-cols-[34px_1fr] gap-3"><div className="flex flex-col items-center"><span className={`grid h-8 w-8 place-items-center rounded-full border font-mono text-[10px] ${accent ? "border-acidGreen bg-acidGreen text-deepIndigo" : "border-softWhite/18"}`}>{String(index + 1).padStart(2, "0")}</span>{!last ? <span className="flex-1 border-l border-softWhite/14" /> : null}</div>{card}</div>;
}

function CaseSection({ sectionKey, draft, isEditing, onChange, accent = false, statement = false }: { sectionKey: SectionKey; draft: GameJamDraft; isEditing: boolean; onChange: (key: SectionKey, value: string) => void; accent?: boolean; statement?: boolean }) {
  const meta = sectionMeta[sectionKey];
  return <section className={`grid gap-8 border-t pt-8 xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.5fr)] xl:gap-x-[clamp(4rem,6vw,6rem)] ${accent ? "border-acidGreen/35" : "border-softWhite/10"}`}>
    <div className="min-w-0"><p className={`font-mono text-xs font-bold tracking-[0.22em] ${accent ? "text-acidGreen" : "text-softWhite/40"}`}>{meta.number}</p><h2 className="mt-3 break-words font-display text-[clamp(2.25rem,4vw,4.4rem)] leading-[1.02]">{meta.title}</h2></div>
    <div className="min-w-0 max-w-[52rem]"><EditableBody label={meta.title} isEditing={isEditing} value={draft.sections[sectionKey]} onChange={(value) => onChange(sectionKey, value)} statement={statement} /></div>
  </section>;
}

function EditableBody({ label, isEditing, value, onChange, statement }: { label: string; isEditing: boolean; value: string; onChange: (value: string) => void; statement: boolean }) {
  if (isEditing) return <label className="block w-full min-w-0 border border-electricBlue/45 bg-archiveBlue/16 p-3"><span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen/70">Editable / {label}</span><textarea className={`w-full min-w-0 resize-none overflow-hidden bg-deepIndigo/42 p-3 outline-none ${statement ? "font-display text-3xl leading-tight" : "text-base leading-7"}`} rows={Math.max(statement ? 8 : 10, value.split("\n").length + 2)} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
  return <div className={statement ? "font-display text-3xl leading-tight text-softWhite/88 md:text-5xl" : "text-lg leading-8 text-softWhite/70"}>{paragraphs(value).map((paragraph) => <p key={paragraph} className="mb-5 whitespace-pre-line last:mb-0">{paragraph}</p>)}</div>;
}

function GameJamImageSlot({ slotKey, slot, isEditing, onChange, compact = false }: { slotKey: ImageSlotKey; slot: DraftImageSlot; isEditing: boolean; onChange: (key: ImageSlotKey, value: DraftImageSlot) => void; compact?: boolean }) {
  const meta = imageMeta[slotKey];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localImage, setLocalImage] = useState<{ url: string; record: GameJamDraftImageRecord } | null>(null);
  const [lookupComplete, setLookupComplete] = useState(!slot.localImageId);
  const [publicFailed, setPublicFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setPublicFailed(false), [slot.publicPath]);
  useEffect(() => {
    let cancelled = false;
    let url = "";
    setLocalImage(null);
    setLookupComplete(!slot.localImageId);
    if (!slot.localImageId) return undefined;
    getGameJamDraftImage(slot.localImageId).then((record) => {
      if (cancelled) return;
      if (record) { url = URL.createObjectURL(record.blob); setLocalImage({ url, record }); }
      setLookupComplete(true);
    }).catch(() => { if (!cancelled) { setLookupComplete(true); setError("The local image could not be read. The public path is being used instead."); } });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [slot.localImageId, revision]);

  const choose = () => { setError(""); inputRef.current?.click(); };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) { setError("Choose a PNG, JPEG, WebP, AVIF, or GIF image."); return; }
    if (file.size === 0) { setError("This image file is empty."); return; }
    if (file.size > MAXIMUM_IMAGE_SIZE) { setError("This image is larger than the 20 MB limit."); return; }
    const id = slot.localImageId || `from-theme-to-playable-rule:${slotKey}`;
    try { setBusy(true); await putGameJamDraftImage({ id, blob: file, fileName: file.name, mimeType: file.type, size: file.size, updatedAt: new Date().toISOString() }); onChange(slotKey, { ...slot, localImageId: id }); setRevision((value) => value + 1); }
    catch { setError("The image could not be saved. Your existing image was not changed."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!slot.localImageId) return;
    try { setBusy(true); await deleteGameJamDraftImage(slot.localImageId); onChange(slotKey, { publicPath: slot.publicPath }); setRevision((value) => value + 1); }
    catch { setError("The local image could not be removed."); }
    finally { setBusy(false); }
  };
  const source = localImage?.url || (!publicFailed ? slot.publicPath : "");
  const hasImage = Boolean(source) && (!slot.localImageId || lookupComplete);
  const frameClass = "case-study-media-frame";
  const visual = hasImage ? <img src={source} alt={meta.label} className="case-study-media-image" onError={() => { if (localImage) { URL.revokeObjectURL(localImage.url); setLocalImage(null); } else setPublicFailed(true); }} /> : <div className="case-study-media-placeholder">Archived visual slot</div>;
  return <figure className="grid min-w-0 gap-3">
    {isEditing ? <button type="button" data-testid={`game-jam-image-${slotKey}`} className={`${frameClass} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-acidGreen/60`} aria-label={`${localImage ? "Replace" : "Choose"} image for ${meta.label}`} disabled={busy} onClick={choose}>{visual}</button> : <div className={frameClass}>{visual}</div>}
    {isEditing ? <figcaption className="border border-electricBlue/30 bg-archiveBlue/12 p-3"><input ref={inputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" onChange={upload} /><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen">{meta.label}</p><p className="mt-1 text-xs text-softWhite/44">{localImage ? `${localImage.record.fileName} / ${(localImage.record.size / 1024 / 1024).toFixed(1)} MB` : "Local draft image"}</p></div><div className="flex flex-wrap gap-2"><button type="button" className="rounded-full border border-softWhite/14 px-3 py-2 font-mono text-[10px] uppercase text-softWhite/70" onClick={choose} disabled={busy}>{slot.localImageId ? "Replace local image" : "Choose image"}</button>{slot.localImageId ? <button type="button" className="inline-flex items-center gap-1 rounded-full border border-softWhite/12 px-3 py-2 font-mono text-[10px] uppercase text-softWhite/48" onClick={remove} disabled={busy}><Trash2 className="h-3 w-3" /> Remove local image</button> : null}</div></div><p className="mt-3 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-softWhite/38">Public asset path</p><input className="mt-2 w-full min-w-0 border border-softWhite/10 bg-deepIndigo/44 px-3 py-2 font-mono text-xs outline-none" aria-label={`Public asset path for ${meta.label}`} value={slot.publicPath} placeholder="/images/projects/game-jam/example.webp" onChange={(event) => onChange(slotKey, { ...slot, publicPath: event.target.value })} /><p className="mt-2 text-xs leading-5 text-softWhite/42">{meta.suggestion}</p>{error ? <p className="mt-2 text-xs text-peach">{error}</p> : null}</figcaption> : null}
  </figure>;
}
