import type { Project, ProjectCategory } from "../types/project";

export const categories: ProjectCategory[] = [
  "UX / Product Design",
  "Game UX",
  "Indie Games",
  "Visual / UI Art",
  "Research / Case Study",
  "Experiments",
];

export const projects: Project[] = [
  {
    slug: "cross-platform-game-ux",
    title: "Keeping the Game, Lightening the Experience",
    subtitle: "Adapting a mobile game experience for a lightweight mini-program context.",
    duration: "2024.11 — 2025.02",
    category: "Game UX",
    type: "Game UX",
    year: "2026",
    cover: "",
    images: [],
    tags: ["Game UX", "Cross-platform UX", "Interaction Design", "UI Systems", "Mini Program"],
    primaryQuestion:
      "What should change when a game built for long-term retention enters a platform designed for instant access?",
    metadata: [
      { label: "Role", value: "UI / Interaction Designer" },
      { label: "Platform", value: "Mobile Game -> Mini Program" },
      {
        label: "Focus",
        value: "Interaction Adaptation, Information Hierarchy, Lightweight Game UX",
      },
      { label: "Evidence", value: "[ADD REAL PROJECT CONTEXT]" },
    ],
    caseMap: [
      { label: "01", title: "Context" },
      { label: "02", title: "Constraints" },
      { label: "03", title: "Audit" },
      { label: "04", title: "Reframe" },
      { label: "05", title: "Hierarchy" },
      { label: "06", title: "Systems" },
      { label: "07", title: "Outcome" },
    ],
    heroComparison: {
      before: {
        src: "",
        alt: "Original mobile experience placeholder",
        label: "ORIGINAL MOBILE EXPERIENCE",
        guidance: "Add real mobile game screens. PNG / WebP recommended. Portrait mobile UI, suggested ratio: 9:16.",
        ratio: "mobile",
      },
      after: {
        src: "",
        alt: "Mini-program adaptation placeholder",
        label: "MINI-PROGRAM ADAPTATION",
        guidance: "Add real adapted mini-program screens. PNG / WebP recommended. Portrait mobile UI, suggested ratio: 9:16.",
        ratio: "mobile",
      },
    },
    summary: "[ADD 2-3 SENTENCE REAL PROJECT SUMMARY]",
    background:
      "This scaffold is reserved for the real project context, constraints, screen evidence, design decisions, and verified outcomes.",
    openingEyebrow: "Project spine",
    openingTitle: "Platform constraints changed. The old mobile interaction hierarchy no longer fit.",
    openingSummary:
      "The current scaffold prioritises the strongest available story: a two-week interaction restructuring sprint focused on recurring popup patterns, hierarchy, and two core systems. [ADD REAL PROJECT CONTEXT]",
    processTitle: "Two-week Interaction Restructuring Sprint",
    role: "UI / Interaction Designer",
    timeline: "[ADD REAL TIMELINE]",
    tools: ["[ADD REAL TOOLS]"],
    designGoals: [
      "[REPLACE WITH REAL PRINCIPLES AFTER PROJECT REVIEW]",
      "Reveal the next action earlier.",
      "Compress information around player intent.",
      "Replace accumulated familiarity with immediate readability.",
    ],
    process: [
      "[ADD REAL ORIGINAL FLOW]",
      "[ADD REAL DESIGN DECISION]",
      "[ADD VERIFIED OUTCOME]",
    ],
    highlights: [
      "Interaction adaptation",
      "Information hierarchy",
      "Lightweight game UX",
    ],
    featured: true,
    blocks: [
      {
        type: "contextComparison",
        title: "The Platform Changed.\nThe Interaction Assumptions Did Too.",
        intro: [
          "The original mobile experience was designed around returning players, longer sessions, and accumulated familiarity.",
          "The mini-program context introduced a different expectation: enter quickly, understand quickly, and reach meaningful play with less commitment.",
        ],
        leftTitle: "Mobile Game",
        leftItems: [
          "Returning players",
          "Longer sessions",
          "Accumulated familiarity",
          "Higher interface tolerance",
          "Deeper system navigation",
        ],
        rightTitle: "Mini Program",
        rightItems: [
          "Lower entry commitment",
          "Shorter sessions",
          "More first-time exposure",
          "Lower learning patience",
          "Faster value expectation",
        ],
        statement: "The problem was not screen size. It was interaction context.",
        placeholder: "[ADD REAL BUSINESS / PRODUCT CONTEXT]",
      },
      {
        type: "interactionCostMap",
        title: "Where Was the Original Experience Asking Too Much?",
        body:
          "I reviewed the original experience through interaction cost: where players had to navigate, interpret, or remember before reaching the action they came for.",
        items: [
          {
            label: "Navigation Cost",
            description: "How far must the player travel through the interface?",
            costType: "navigation",
          },
          {
            label: "Interpretation Cost",
            description: "How much information must the player decode at once?",
            costType: "interpretation",
          },
          {
            label: "Memory Cost",
            description: "How much does the interface assume the player already knows?",
            costType: "memory",
          },
        ],
        flow: [
          { label: "Entry", tags: ["navigation"] },
          { label: "System Hub", tags: ["navigation", "memory"] },
          { label: "Tab", tags: ["navigation"] },
          { label: "Sub-page", tags: ["navigation"] },
          { label: "Read State", tags: ["interpretation"] },
          { label: "Locate Action", tags: ["interpretation", "memory"] },
          { label: "Act", tags: ["navigation"] },
        ],
        placeholder: "[ADD ONE REAL ORIGINAL FEATURE FLOW]",
      },
      {
        type: "principleGrid",
        title: "The Goal Was Not to Remove UI.",
        statement: "It was to reduce the time between entering, understanding, and acting.",
        note: "[REPLACE WITH REAL PRINCIPLES AFTER PROJECT REVIEW]",
        items: [
          {
            title: "Reveal the Next Action Earlier",
            description:
              "Core actions should become visible before players fully understand every surrounding system.",
          },
          {
            title: "Compress Information Around Player Intent",
            description:
              "Information should be organised around what the player is trying to do, rather than only reflecting the original system architecture.",
          },
          {
            title: "Replace Accumulated Familiarity With Immediate Readability",
            description:
              "A lightweight platform cannot assume that every player already understands the visual language of the original game.",
          },
        ],
      },
      {
        type: "turningPoint",
        eyebrow: "Editorial turning point",
        title: "Two-week Interaction Restructuring Sprint",
        statement: "Change hierarchy before changing components.",
        body:
          "This is the central design reframe to support with real project evidence: the adaptation should first clarify what the player needs to understand and do, then reshape the UI components around that hierarchy.",
        before: {
          src: "",
          alt: "Old overlay hierarchy placeholder",
          label: "OLD OVERLAY HIERARCHY",
          guidance: "Add real before hierarchy diagram or screen stack. Wide PNG / WebP recommended.",
          ratio: "wide",
        },
        after: {
          src: "",
          alt: "New interaction hierarchy placeholder",
          label: "NEW INTERACTION HIERARCHY",
          guidance: "Add real new hierarchy diagram or screen stack. Wide PNG / WebP recommended.",
          ratio: "wide",
        },
      },
      {
        type: "flowComparison",
        eyebrow: "01 / FLOW",
        title: "Compress the Path to Core Action",
        beforeLabel: "Before / Original Flow",
        afterLabel: "After / Adapted Flow",
        before: [
          { label: "[ADD ORIGINAL FLOW]", note: "Replace with real original steps.", tags: ["navigation"] },
          { label: "PNG / WebP", note: "Optional flow diagram or screen sequence." },
          { label: "Suggested", note: "Horizontal flow or stacked mobile path." },
        ],
        after: [
          { label: "[ADD ADAPTED FLOW]", note: "Replace with real adapted steps.", tags: ["navigation"] },
          { label: "PNG / WebP", note: "Optional adapted flow diagram." },
          { label: "Suggested", note: "Show reduced path clearly." },
        ],
        fields: [
          { label: "Problem", value: "[ADD REAL PROBLEM]" },
          { label: "Decision", value: "[ADD REAL DESIGN DECISION]" },
          { label: "Why", value: "[ADD REAL REASONING]" },
          { label: "Trade-off", value: "[ADD REAL CONSTRAINT OR COMPROMISE]" },
        ],
      },
      {
        type: "annotatedComparison",
        eyebrow: "02 / HIERARCHY",
        title: "Make the Screen Answer One Question First",
        body:
          "A dense interface may communicate many systems correctly while still failing to tell the player what matters first.",
        before: {
          src: "",
          alt: "Before screen placeholder",
          label: "[ADD BEFORE SCREEN]",
          guidance: "PNG / WebP recommended. Portrait mobile UI. Suggested ratio: 9:16.",
          ratio: "mobile",
          annotations: [
            { number: "1", label: "Primary Action", x: 50, y: 24 },
            { number: "2", label: "Current State", x: 42, y: 48 },
            { number: "3", label: "Supporting System", x: 55, y: 72 },
          ],
        },
        after: {
          src: "",
          alt: "After screen placeholder",
          label: "[ADD AFTER SCREEN]",
          guidance: "PNG / WebP recommended. Portrait mobile UI. Suggested ratio: 9:16.",
          ratio: "mobile",
          annotations: [
            { number: "1", label: "Primary Action", x: 50, y: 24 },
            { number: "2", label: "Current State", x: 42, y: 48 },
            { number: "3", label: "Supporting System", x: 55, y: 72 },
          ],
        },
        model: [
          { label: "Primary", description: "What can I do now?" },
          { label: "Secondary", description: "Where am I in the system?" },
          { label: "Tertiary", description: "What supporting information may I need?" },
        ],
        fields: [
          { label: "What was competing for attention?", value: "[ADD REAL CONTENT]" },
          { label: "What I prioritised", value: "[ADD REAL CONTENT]" },
          { label: "What I de-emphasised", value: "[ADD REAL CONTENT]" },
        ],
      },
      {
        type: "stateMatrix",
        eyebrow: "03 / STATE",
        title: "Reduce the Time Needed to Read State",
        body:
          "Players should not need to reconstruct a system state from several disconnected interface elements.",
        note: "[REPLACE WITH REAL PROJECT STATES] [ADD REAL STATE DESIGN DECISIONS]",
        items: [
          { name: "Locked", description: "Structural placeholder only.", note: "Add real state image later." },
          { name: "In Progress", description: "Structural placeholder only.", note: "Add real state image later." },
          { name: "Available", description: "Structural placeholder only.", note: "Add real state image later." },
          { name: "Ready to Claim", description: "Structural placeholder only.", note: "Add real state image later." },
          { name: "Claimed", description: "Structural placeholder only.", note: "Add real state image later." },
        ],
      },
      {
        type: "visualAdaptation",
        title: "Lighter Interaction Did Not Mean a Generic Interface.",
        body:
          "The mini-program version still needed to feel connected to the original game while carrying less visual and informational weight.",
        columns: [
          { label: "Retained", value: "[ADD GAME IDENTITY ELEMENTS THAT WERE RETAINED]" },
          { label: "Reduced", value: "[ADD VISUAL OR INFORMATIONAL WEIGHT THAT WAS REDUCED]" },
          { label: "Rebuilt", value: "[ADD COMPONENTS OR HIERARCHY THAT WERE REBUILT]" },
        ],
        visuals: [
          {
            src: "",
            alt: "Original component placeholder",
            label: "Original Component",
            guidance: "Add original UI component. PNG / WebP recommended.",
          },
          {
            src: "",
            alt: "Adaptation exploration placeholder",
            label: "Adaptation Exploration",
            guidance: "Add exploration board or variant set.",
          },
          {
            src: "",
            alt: "Final lightweight component placeholder",
            label: "Final Lightweight Component",
            guidance: "Add final adapted component.",
          },
        ],
      },
      {
        type: "constraintGrid",
        title: "What Could Not Simply Be Removed",
        statement:
          "The challenge was not designing an ideal lightweight game from scratch. It was reducing interaction cost inside an existing product and business structure.",
        items: [
          {
            label: "Business",
            constraint: "[ADD REAL CONSTRAINT]",
            whyItMattered: "[ADD REAL CONTEXT]",
            designResponse: "[ADD REAL RESPONSE]",
          },
          {
            label: "Legacy System",
            constraint: "[ADD REAL CONSTRAINT]",
            whyItMattered: "[ADD REAL CONTEXT]",
            designResponse: "[ADD REAL RESPONSE]",
          },
          {
            label: "Production",
            constraint: "[ADD REAL CONSTRAINT]",
            whyItMattered: "[ADD REAL CONTEXT]",
            designResponse: "[ADD REAL RESPONSE]",
          },
          {
            label: "Asset Reuse",
            constraint: "[ADD REAL CONSTRAINT]",
            whyItMattered: "[ADD REAL CONTEXT]",
            designResponse: "[ADD REAL RESPONSE]",
          },
        ],
      },
      {
        type: "outcomeGrid",
        title: "What Changed",
        note:
          "Only replace these with outcomes that can be supported by real project evidence.",
        items: [
          { label: "Shorter Core Path", result: "[ADD VERIFIED RESULT]", mode: "structural" },
          { label: "Clearer Primary Action", result: "[ADD VERIFIED RESULT]", mode: "structural" },
          {
            label: "Reduced Simultaneous Information",
            result: "[ADD VERIFIED RESULT]",
            mode: "structural",
          },
          {
            label: "Reusable Lightweight Components",
            result: "[ADD VERIFIED RESULT]",
            mode: "structural",
          },
        ],
      },
      {
        type: "text",
        title: "Cross-platform Adaptation Is Not Responsive Design.",
        body:
          "I initially thought of platform adaptation as a problem of density and screen structure.\n\nThe project made me pay more attention to the behavioural assumptions hidden inside an interface: how much users already know, how long they are willing to stay, and how much effort they will spend before receiving value.\n\nWhen the platform changes, interaction assumptions need to be questioned before components are resized.\n\n[REWRITE WITH MY REAL REFLECTION]",
      },
    ],
  },
  {
    slug: "game-ux-case-study",
    title: "Moonlit Inventory",
    subtitle: "A game UX case study for cozy item management and player trust.",
    category: "Game UX",
    type: "Game UX",
    year: "2026",
    cover: "/images/projects/project-1/cover.png",
    images: [
      {
        src: "/images/projects/project-1/process-1.png",
        alt: "Inventory flow sketches",
        caption: "Mapping player intent across collecting, comparing, and crafting.",
      },
      {
        src: "/images/projects/project-1/final-1.png",
        alt: "Final inventory interface",
        caption: "A calm panel system with readable item states.",
      },
    ],
    summary:
      "A compact interaction system for inventory, item comparison, and crafting decisions in a soft adventure game.",
    background:
      "The prototype needed an inventory that felt gentle without hiding information. The main challenge was helping players understand value, rarity, and next actions while preserving a quiet mood.",
    role: "Game UX designer, interaction designer, prototype planner",
    timeline: "4 weeks",
    tools: ["Figma", "FigJam", "Unity", "Notion"],
    designGoals: [
      "Make item comparison readable in under three seconds.",
      "Reduce menu anxiety during crafting decisions.",
      "Use motion and hierarchy to make state changes feel playful but precise.",
    ],
    process: [
      "Audited inventory patterns in cozy, RPG, and puzzle games.",
      "Created player-intent flows for collect, compare, equip, craft, and discard.",
      "Built low-fidelity panels, then tested item density and motion timing.",
    ],
    highlights: [
      "Soft state tokens for rarity and affordance.",
      "One-handed navigation pattern for controller and touch.",
      "Microcopy that explains risk without sounding punitive.",
    ],
    featured: true,
    externalLinks: [
      { label: "Behance", url: "https://www.behance.net/" },
      { label: "Prototype Notes", url: "https://example.com/" },
    ],
    blocks: [
      {
        type: "text",
        title: "The core question",
        body: "How can an inventory become a quiet guide instead of a storage closet? I treated every item state as a small conversation between the system and the player.",
      },
      {
        type: "imageGrid",
        images: [
          {
            src: "/images/projects/project-1/process-1.png",
            alt: "Early flow sketch",
            caption: "Player goals were grouped by emotional load.",
          },
          {
            src: "/images/projects/project-1/process-2.png",
            alt: "Wireframe exploration",
            caption: "Card density tests for item comparison.",
          },
        ],
      },
      {
        type: "twoColumn",
        title: "Design tension",
        left: "Players wanted quick decisions, but the game world wanted softness, patience, and atmosphere.",
        right:
          "The interface used layered detail: a calm default view, then richer comparison data only when the player asked for it.",
      },
      {
        type: "quote",
        text: "The interface should feel like a pocket notebook that happens to understand game rules.",
        author: "Design principle",
      },
      {
        type: "image",
        src: "/images/projects/project-1/final-1.png",
        alt: "Final inventory design",
        caption: "Final direction with nested states, item focus, and soft motion.",
      },
    ],
  },
  {
    slug: "3d-character-ui-rhythm",
    title: "从系统驱动到体验驱动：重新分配界面节奏",
    subtitle: "在成熟养成框架中，重新组织高频系统操作与连续角色体验之间的注意力分配。",
    duration: "2021.07 — 2024.02",
    category: "Game UX",
    type: "Game UX",
    year: "2024",
    cover: "",
    images: [],
    tags: ["System UI", "Interaction Prototyping", "3D Character Presentation"],
    primaryQuestion: "当玩家的主要行为从菜单中的高频系统操作，转向更连续的角色与内容体验时，UI 如何保留必要的操作效率，同时减少对玩家注意力的持续占用？",
    summary: "从系统驱动到体验驱动，重新组织高频操作与连续内容体验之间的界面节奏。",
    background: "早期研发环境中的英雄养成交互探索与系统页面生产验证。",
    role: "UI Designer",
    timeline: "2021.07 — 2024.02",
    tools: [],
    designGoals: [],
    process: [],
    highlights: ["System UI", "Interaction Prototyping"],
    blocks: [],
  },
  {
    slug: "from-theme-to-playable-rule",
    title: "让主题真正改变玩家的行动",
    subtitle: "在 Game Jam 的有限时间里，将“反转”从叙事概念转化为玩家能够直接感知的操作规则。",
    category: "Indie Games",
    type: "Prototype",
    year: "Draft",
    cover: "/images/projects/game-jam/cover.webp",
    images: [],
    tags: ["GAME DESIGN", "RAPID PROTOTYPING"],
    summary: "在有限时间里，将主题转译为玩家能够直接感知的操作规则。",
    background: "An editable retrospective about theme interpretation, player action, mechanic framing, and iteration.",
    role: "",
    timeline: "",
    tools: [],
    designGoals: [],
    process: [],
    highlights: ["Game Design", "Prototyping"],
    blocks: [],
  },
  {
    slug: "ktv-tablet-interface",
    title: "Echo Room Tablet",
    subtitle: "A KTV tablet interface for fast song picking, room control, and social flow.",
    category: "UX / Product Design",
    type: "UX Design",
    year: "2025",
    cover: "/images/projects/project-2/cover.png",
    images: [
      {
        src: "/images/projects/project-2/process-1.png",
        alt: "KTV tablet user journey",
      },
      {
        src: "/images/projects/project-2/final-1.png",
        alt: "KTV tablet final screens",
      },
    ],
    summary:
      "A tablet-first UX redesign that helps groups search, queue, control room settings, and keep the party moving.",
    background:
      "KTV interfaces often collapse under group pressure: many people, low light, loud sound, and fast decisions. This concept focuses on glanceable structure and generous controls.",
    role: "Product UX, interface design, interaction flows",
    timeline: "3 weeks",
    tools: ["Figma", "Maze", "Principle"],
    designGoals: [
      "Make search, queue, and room controls visible without crowding the screen.",
      "Design for low-light use and distracted group interaction.",
      "Let guests recover quickly from wrong taps.",
    ],
    process: [
      "Mapped high-pressure moments in a singing room.",
      "Separated persistent controls from discovery surfaces.",
      "Prototyped queue editing, duet handoff, and lighting presets.",
    ],
    highlights: [
      "Large tap targets and contrast-friendly song rows.",
      "Room mood controls that behave like swatches.",
      "Queue cards with visible owner, status, and quick actions.",
    ],
    featured: true,
    externalLinks: [{ label: "PDF Case Study", url: "https://example.com/" }],
    blocks: [
      {
        type: "text",
        title: "Designing for noise",
        body: "The tablet is passed around, tapped from odd angles, and used in a dark room. I designed the interface around recovery, not perfection.",
      },
      {
        type: "image",
        src: "/images/projects/project-2/process-1.png",
        alt: "Journey map for KTV tablet interaction",
        caption: "Journey moments where social pressure changes UX priorities.",
      },
      {
        type: "twoColumn",
        title: "Navigation model",
        left: "The bottom rail keeps primary actions stable: Discover, Queue, Room, and Mine.",
        right:
          "Contextual sheets handle song details, playlist editing, and quick controls without forcing users to leave the group flow.",
      },
      {
        type: "imageGrid",
        images: [
          {
            src: "/images/projects/project-2/final-1.png",
            alt: "Song search screen",
            caption: "Search and quick filters.",
          },
          {
            src: "/images/projects/project-2/final-2.png",
            alt: "Room control screen",
            caption: "Lighting, volume, and service controls.",
          },
        ],
      },
    ],
  },
  {
    slug: "playable-web-game-prototype",
    title: "Seed Sprite",
    subtitle: "A tiny browser prototype about planting paths and collecting light.",
    category: "Indie Games",
    type: "Indie Game",
    year: "2026",
    cover: "/images/projects/project-3/cover.png",
    images: [
      {
        src: "/images/projects/project-3/process-1.png",
        alt: "Seed Sprite mechanic sketch",
      },
      {
        src: "/images/projects/project-3/final-1.png",
        alt: "Seed Sprite prototype screenshot",
      },
    ],
    summary:
      "A playable HTML5 game prototype exploring simple path planning, tactile clicks, and tiny garden rewards.",
    background:
      "This prototype began as a one-button interaction toy. It evolved into a compact loop where movement, planting, and collection are all readable through small changes in rhythm.",
    role: "Game designer, UX designer, prototype developer",
    timeline: "2 weeks",
    tools: ["HTML5 Canvas", "TypeScript", "Figma"],
    designGoals: [
      "Keep the goal understandable without a tutorial screen.",
      "Make every click feel like it leaves a trace.",
      "Build a playable web export that can sit inside the portfolio.",
    ],
    process: [
      "Started with paper loops for path and reward timing.",
      "Tested click density, feedback timing, and fail-soft interactions.",
      "Packaged a lightweight iframe demo for the Play page.",
    ],
    highlights: [
      "Embedded playable demo.",
      "Responsive iframe shell for future Unity, Godot, or HTML5 builds.",
      "Gentle feedback loops instead of punishment states.",
    ],
    featured: true,
    playable: {
      title: "Play Seed Sprite",
      description:
        "Click around the field to plant mint paths, collect light, and watch the garden react.",
      iframeUrl: "/games/demo/index.html",
      openInNewTabUrl: "/games/demo/index.html",
    },
    externalLinks: [
      { label: "Itch.io", url: "https://itch.io/" },
      { label: "GitHub", url: "https://github.com/" },
    ],
    blocks: [
      {
        type: "text",
        title: "Prototype loop",
        body: "The game asks for one small action at a time: choose a tile, plant a trace, collect a glow, then decide where the garden should grow next.",
      },
      {
        type: "playable",
        title: "Seed Sprite embedded demo",
        description:
          "This block uses the same content structure future Unity WebGL, Godot, or HTML5 demos can use.",
        iframeUrl: "/games/demo/index.html",
        openInNewTabUrl: "/games/demo/index.html",
      },
      {
        type: "imageGrid",
        images: [
          {
            src: "/images/projects/project-3/process-1.png",
            alt: "Mechanic sketch",
            caption: "Early mechanic notes.",
          },
          {
            src: "/images/projects/project-3/final-1.png",
            alt: "Prototype final state",
            caption: "Playable loop concept.",
          },
        ],
      },
    ],
  },
  {
    slug: "visual-system-ui-art",
    title: "Lunar Menu Garden",
    subtitle: "A visual system and UI art exploration for game menus and soft widgets.",
    category: "Visual / UI Art",
    type: "UI Art",
    year: "2025",
    cover: "/images/projects/project-4/cover.png",
    images: [
      {
        src: "/images/projects/project-4/process-1.png",
        alt: "Visual system tokens",
      },
      {
        src: "/images/projects/project-4/final-1.png",
        alt: "Menu system final art",
      },
    ],
    summary:
      "A UI art study blending deep teal panels, mint status chips, cream surfaces, and small decorative motifs.",
    background:
      "The exploration looks for a middle point between polished product UI and expressive game interface art.",
    role: "Visual designer, UI artist, design systems explorer",
    timeline: "2 weeks",
    tools: ["Figma", "Photoshop", "After Effects"],
    designGoals: [
      "Define reusable visual tokens for game-like interfaces.",
      "Keep ornament precise and restrained.",
      "Balance quiet craft with a small amount of cuteness.",
    ],
    process: [
      "Built moodboards for material, shape, and motion.",
      "Created color, shadow, border, and label tokens.",
      "Applied the tokens to menu, card, tooltip, and progress states.",
    ],
    highlights: [
      "Mint and clay accent system.",
      "Soft glass panels with crisp borders.",
      "Motion rules for hover, reveal, and focus states.",
    ],
    featured: false,
    blocks: [
      {
        type: "text",
        title: "System before screens",
        body: "I started from atmosphere, then translated it into practical tokens: panel depth, accent color, line weight, chip size, and small decorative marks.",
      },
      {
        type: "imageGrid",
        images: [
          {
            src: "/images/projects/project-4/process-1.png",
            alt: "Token sheet",
            caption: "Color, border, and chip explorations.",
          },
          {
            src: "/images/projects/project-4/final-1.png",
            alt: "Final UI art board",
            caption: "Final menu and widget composition.",
          },
        ],
      },
      {
        type: "quote",
        text: "Make it feel collectible, but keep every surface useful.",
        author: "Visual rule",
      },
    ],
  },
  {
    slug: "ui-personal-practice",
    title: "UI Personal Practice",
    subtitle: "A running visual archive of personal UI exercises, interface studies, and game UI explorations.",
    category: "Visual / UI Art",
    type: "UI Art",
    year: "2026",
    cover: "",
    images: [],
    summary:
      "A growing collection of personal UI practice pieces managed by dropping images into the project and arranging them locally.",
    background:
      "This archive is designed as a visual shelf for interface practice rather than a formal case study.",
    role: "UI designer, visual designer",
    timeline: "Ongoing",
    tools: ["Figma", "Photoshop", "Illustrator"],
    designGoals: [
      "Keep UI screenshots large and readable.",
      "Preserve original image proportions.",
      "Make future image additions easy to manage.",
    ],
    process: [
      "Drop image files into the UI practice folder.",
      "Open the local edit mode to adjust order and optional text.",
      "Save metadata back into the project source.",
    ],
    highlights: ["UI art practice", "Visual archive", "Local metadata workflow"],
    featured: false,
    blocks: [],
  },
];

export const featuredProjects = projects.filter((project) => project.featured);
export const playableProjects = projects.filter((project) => project.playable);

export const getProjectBySlug = (slug: string) =>
  projects.find((project) => project.slug === slug);

export const getAdjacentProjects = (slug: string) => {
  const index = projects.findIndex((project) => project.slug === slug);
  if (index === -1) {
    return { previous: undefined, next: undefined };
  }

  return {
    previous: projects[(index - 1 + projects.length) % projects.length],
    next: projects[(index + 1) % projects.length],
  };
};
