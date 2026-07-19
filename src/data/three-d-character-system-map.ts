export type SystemMapLocalizedText = {
  zh: string;
  en: string;
};

export type SystemMapGroup = {
  id: string;
  title: SystemMapLocalizedText;
  items: SystemMapLocalizedText[];
};

export type SystemMapBranch = {
  id: string;
  label: SystemMapLocalizedText;
  groups: SystemMapGroup[];
};

export const threeDCharacterSystemMap = {
  rootTitle: {
    zh: "项目系统结构",
    en: "Project System Structure",
  },
  branches: [
    {
      id: "tasks-daily-loop",
      label: { zh: "任务与日常循环", en: "Tasks & Daily Loop" },
      groups: [
        {
          id: "login-daily",
          title: { zh: "登录与每日任务", en: "Login & daily tasks" },
          items: [
            { zh: "登录奖励与每日签到建立当天的第一个领取动作", en: "Login rewards and daily check-ins establish the first claim action of the day" },
            { zh: "每日任务将养成、战斗、资源领取与活跃度奖励串联起来", en: "Daily tasks connect progression, battles, resource claims, and activity rewards" },
          ],
        },
        {
          id: "guild-cooperation",
          title: { zh: "公会协作", en: "Guild cooperation" },
          items: [
            { zh: "公会任务、成员协作与公会资源形成持续回访路径", en: "Guild tasks, member cooperation, and shared resources create recurring return paths" },
            { zh: "个人任务与集体责任在同一日常循环中交替出现", en: "Personal tasks and shared responsibilities alternate within the same daily loop" },
          ],
        },
        {
          id: "battle-activities",
          title: { zh: "副本、PVP 与召唤任务", en: "Instances, PVP & summoning tasks" },
          items: [
            { zh: "副本、扫荡和实例活动持续消耗体力并返回养成资源", en: "Instances, sweeps, and dungeon activities consume energy and return progression resources" },
            { zh: "PVP 与召唤相关任务把玩家带往不同入口和奖励页面", en: "PVP and summoning tasks move players through different entry points and reward screens" },
          ],
        },
      ],
    },
    {
      id: "progression-paths",
      label: { zh: "多线养成路径", en: "Progression Paths" },
      groups: [
        {
          id: "hero-progression",
          title: { zh: "英雄基础成长", en: "Core hero progression" },
          items: [
            { zh: "等级、技能与阶级并行推进，并分别受到资源和当前阶段限制", en: "Level, skill, and rank advance in parallel, each with resource and stage restrictions" },
            { zh: "灵魂石决定收集与进阶节奏，强化了长期目标", en: "Soul stones shape collection and promotion pacing, reinforcing long-term goals" },
          ],
        },
        {
          id: "extended-progression",
          title: { zh: "扩展养成线", en: "Extended progression lines" },
          items: [
            { zh: "雕文、皮肤、元素与神器提供额外属性和独立资源路径", en: "Glyphs, skins, elements, and artifacts add stats through separate resource paths" },
            { zh: "泰坦拥有独立的成长与资源循环，需要在英雄系统之外持续管理", en: "Titan progression has its own growth and resource loop outside the hero system" },
          ],
        },
        {
          id: "resources-restrictions",
          title: { zh: "资源来源与升级限制", en: "Resource sources & upgrade restrictions" },
          items: [
            { zh: "不同资源来自任务、副本、商店、活动与公会协作", en: "Resources come from tasks, instances, shops, events, and guild cooperation" },
            { zh: "缺少资源、等级门槛与前置条件会频繁中断连续升级", en: "Missing resources, level gates, and prerequisites repeatedly interrupt upgrade sequences" },
          ],
        },
      ],
    },
    {
      id: "social-recurring-events",
      label: { zh: "社交与周期活动", en: "Social & Recurring Events" },
      groups: [
        {
          id: "guild-responsibilities",
          title: { zh: "公会责任", en: "Guild responsibilities" },
          items: [
            { zh: "成员贡献、协作任务和集体奖励要求玩家持续检查进度", en: "Member contributions, cooperative tasks, and shared rewards require repeated progress checks" },
            { zh: "公会活动把个人养成目标与团队目标叠加在一起", en: "Guild activities layer team goals over personal progression goals" },
          ],
        },
        {
          id: "passes-events",
          title: { zh: "通行证与周期活动", en: "Passes & recurring events" },
          items: [
            { zh: "周期活动、通行证与阶段奖励形成额外的任务和领取节奏", en: "Recurring events, passes, and milestone rewards add another task-and-claim rhythm" },
            { zh: "活动入口和倒计时不断争夺首页与系统页面的注意力", en: "Event entries and countdowns continually compete for attention across home and system screens" },
          ],
        },
        {
          id: "spending-loops",
          title: { zh: "消费与钻石循环", en: "Spending & diamond loops" },
          items: [
            { zh: "消费任务和钻石消耗活动将付费行为连接到周期奖励", en: "Spending tasks and diamond-consumption events connect purchases to recurring rewards" },
            { zh: "商店兑换、资源补充与活动目标共同影响升级决策", en: "Shop exchanges, resource top-ups, and event goals jointly shape upgrade decisions" },
          ],
        },
      ],
    },
    {
      id: "onboarding-return",
      label: { zh: "新手与回归机制", en: "Onboarding & Return" },
      groups: [
        {
          id: "onboarding-events",
          title: { zh: "新手活动", en: "Onboarding events" },
          items: [
            { zh: "新手目标用阶段任务逐步开放战斗、养成与社交系统", en: "Staged onboarding goals gradually unlock battle, progression, and social systems" },
            { zh: "连续奖励帮助玩家建立登录、养成和资源领取习惯", en: "Sequential rewards establish habits around login, progression, and resource claims" },
          ],
        },
        {
          id: "returning-player",
          title: { zh: "回归奖励", en: "Returning-player rewards" },
          items: [
            { zh: "回归任务通过集中资源和补偿奖励帮助玩家追赶进度", en: "Return tasks use concentrated resources and compensation rewards to support catch-up" },
            { zh: "大量重新开放的入口需要明确当前优先目标，避免回归玩家再次迷失", en: "Many reopened entry points require a clear priority so returning players do not become lost again" },
          ],
        },
        {
          id: "guided-return",
          title: { zh: "重新建立循环", en: "Re-establishing the loop" },
          items: [
            { zh: "引导需要把玩家重新带回每日任务、英雄养成与公会协作", en: "Guidance must reconnect players with daily tasks, hero progression, and guild cooperation" },
            { zh: "奖励反馈承担确认当前进度和提示下一步操作的双重职责", en: "Reward feedback must confirm current progress while also indicating the next action" },
          ],
        },
      ],
    },
  ] satisfies SystemMapBranch[],
};
