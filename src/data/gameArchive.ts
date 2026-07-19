export type GameArchiveItem = {
  id: string;
  title: string;
  playtime: string;
  experienceNote?: string;
  platform?: string;
  genreTags: string[];
  completion?: string;
  favorite: boolean;
  shortReview: string;
  designObservation: string;
  achievementNote?: string;
};

export const gameArchiveItems: GameArchiveItem[] = [
  {
    id: "stardew-valley",
    title: "星露谷物语",
    playtime: "284h",
    experienceNote: "碎片叙事 / 模拟经营",
    genreTags: ["模拟经营", "碎片叙事", "关系系统"],
    completion: "成就 26/40｜通关主线",
    favorite: false,
    shortReview: "通过居民日常、四季行动和社区关系，把小镇叙事自然嵌入玩家的每日规划中。",
    designObservation: "它最值得学习的是碎片化叙事如何与资源取舍、时间规划和角色关系自然绑定。",
    achievementNote: "成就 26/40｜通关主线",
  },
  {
    id: "baldurs-gate-3",
    title: "博德之门3",
    playtime: "252h",
    experienceNote: "网状叙事 / 选择自由",
    genreTags: ["CRPG", "网状叙事", "选择反馈"],
    completion: "成就 32/54",
    favorite: false,
    shortReview: "平视演出、俯视探索和分支叙事共同支撑了高自由度体验。",
    designObservation: "骰子不是核心本身，真正的价值在于底层开放性和非线性网状叙事。",
    achievementNote: "成就 32/54",
  },
  {
    id: "assassins-creed-shadows",
    title: "刺客信条影",
    playtime: "239h",
    experienceNote: "叙事系统 / 探索面板",
    genreTags: ["开放世界", "叙事系统", "探索"],
    favorite: false,
    shortReview: "刺杀面板会随探索逐步解锁，促使玩家反思支线顺序与决策逻辑。",
    designObservation: "动态信息解锁比固定模板更能强化玩家的探索参与感。",
  },
  {
    id: "pokemon-scarlet-violet",
    title: "宝可梦朱紫",
    playtime: "196h",
    experienceNote: "开放世界 / 节奏控制",
    genreTags: ["开放世界", "收集", "节奏控制"],
    completion: "主线宝可梦全完成全收集",
    favorite: false,
    shortReview: "开放世界结构通过等级能力锁控制节奏，同时保留自由捕捉和探索期待。",
    designObservation: "能力门槛可以在不破坏自由感的前提下，柔性引导玩家推进主线。",
    achievementNote: "主线宝可梦全完成全收集",
  },
  {
    id: "persona-5-royal",
    title: "女神异闻录皇家版",
    playtime: "190h",
    experienceNote: "双线节奏 / 心理学表达",
    genreTags: ["JRPG", "双线节奏", "心理学表达"],
    favorite: false,
    shortReview: "白天经营羁绊、夜晚潜入战斗的双线结构形成了强节奏感。",
    designObservation: "它把荣格心理学概念转化为角色、迷宫和成长系统，是思想表达与玩法结构结合的参考。",
  },
  {
    id: "mass-effect",
    title: "质量效应",
    playtime: "177h",
    experienceNote: "角色关系 / 叙事选择",
    genreTags: ["科幻", "角色关系", "叙事选择"],
    favorite: false,
    shortReview: "长期角色关系和选择后果共同构成强烈的科幻叙事沉浸。",
    designObservation: "队友关系和世界状态变化是持续投入的重要来源。",
  },
  {
    id: "core-keeper",
    title: "地心护核者",
    playtime: "148h",
    experienceNote: "生存建造 / 多人探索",
    genreTags: ["生存建造", "探索", "多人"],
    favorite: false,
    shortReview: "探索、资源采集和基地建设形成稳定的地下世界循环。",
    designObservation: "轻量生存系统可以通过空间扩张和资源目标持续制造探索动力。",
  },
  {
    id: "persona-3",
    title: "女神异闻录3",
    playtime: "127h",
    genreTags: ["JRPG", "时间管理", "角色成长"],
    favorite: false,
    shortReview: "时间管理和角色成长结构形成持续推进压力。",
    designObservation: "有限日程可以强化选择重量，但也需要控制玩家焦虑。",
  },
  {
    id: "hogwarts-legacy",
    title: "霍格沃茨之遗",
    playtime: "118h",
    genreTags: ["3A", "魔法世界", "探索"],
    completion: "成就 32/45",
    favorite: false,
    shortReview: "服饰系统和魔法世界观沉浸感出色，但后期内容同质化明显。",
    designObservation: "开放地图需要更强的探索动线和关卡节奏，否则容易在后期失去新鲜感。",
    achievementNote: "成就 32/45",
  },
  {
    id: "palworld",
    title: "幻兽帕鲁",
    playtime: "107h",
    genreTags: ["生存建造", "经营管线", "养成"],
    completion: "EA 阶段全成就",
    favorite: false,
    shortReview: "经营管线、帕鲁词条和战斗搭配共同构成深层成长循环。",
    designObservation: "它真正可借鉴的不只是“帕鲁形象”，而是生蛋、词条、生产和战斗之间的复合循环。",
    achievementNote: "EA 阶段全成就",
  },
  {
    id: "dynasty-warriors-origins",
    title: "三国无双起源",
    playtime: "107h",
    genreTags: ["动作", "战斗模组", "演出"],
    favorite: false,
    shortReview: "多武器模组让重复战斗场景保持变化，剧情演出也具备细腻呼吸感。",
    designObservation: "微表情和轻微镜头变化很适合优化站桩对话类演出。",
  },
  {
    id: "path-to-nowhere",
    title: "无期迷途",
    playtime: "开服至今 3.5 年",
    experienceNote: "触屏操作 / 玩法核心",
    genreTags: ["战棋", "触屏操作", "美术风格", "活动观察"],
    completion: "所有通行证全收集",
    favorite: true,
    shortReview: "触屏操作空间大，玩法核心至今没有同类平替。",
    designObservation: "它的优势在于触屏手感和玩法操作深度，但长期活动模板化和角色次抛会削弱内容生命力。",
    achievementNote: "所有通行证全收集",
  },
  {
    id: "infinity-nikki",
    title: "无限暖暖",
    playtime: "付费测试 + 开服至今",
    experienceNote: "多端转型 / 内外循环",
    genreTags: ["多端转型", "换装", "活动结构", "内外循环"],
    favorite: false,
    shortReview: "强美术和产品进化潜力突出，但当前活动仍常停留在 2D 入口 + 3D 关卡的迁移思路。",
    designObservation: "核心问题是剧情玩法内循环与氪金社区外循环割裂，活动需要更多与已有成长系统交错的内容。",
  },
];

export const homeGameArchiveIds = [
  "stardew-valley",
  "baldurs-gate-3",
  "assassins-creed-shadows",
  "pokemon-scarlet-violet",
  "persona-5-royal",
  "path-to-nowhere",
  "infinity-nikki",
];

export const gameArchiveFilters = [
  "All",
  "Most Played",
  "Favorites",
  "RPG",
  "Simulation",
  "Multiplayer",
  "Narrative",
  "System Design",
] as const;

export type GameArchiveFilter = (typeof gameArchiveFilters)[number];

export const gameArchiveCopy = {
  home: {
    eyebrow: "PLAY EXPERIENCE",
    intro: "我把长期游玩经验整理成游戏系统、交互节奏和玩家体验观察。",
    favoriteLabel: "FAVORITE GAME",
    favoriteDescription: "长期观察触屏操作、关卡节奏、美术风格、活动更新与角色生命力的核心样本。",
    cta: "View full game archive",
  },
  page: {
    zh: {
      eyebrow: "PLAY HISTORY / DESIGN NOTES",
      title: "游戏经历",
      subtitle: "游玩时长、成就、评测与设计观察。",
      intro: "记录长期游玩中的完成度、体验判断，以及我对游戏系统、交互和内容节奏的观察。",
    },
    en: {
      eyebrow: "PLAY HISTORY / DESIGN NOTES",
      title: "Game Log",
      subtitle: "Playtime, achievements, reviews, and design observations.",
      intro: "A record of long-term play, completion, experience notes, and observations about game systems and interaction.",
    },
  },
};
