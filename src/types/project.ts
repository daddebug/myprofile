export type ProjectCategory =
  | "UX / Product Design"
  | "Game UX"
  | "Indie Games"
  | "Visual / UI Art"
  | "Research / Case Study"
  | "Experiments";

export type ProjectType =
  | "UX Design"
  | "Game UX"
  | "Indie Game"
  | "UI Art"
  | "Research"
  | "Prototype";

export type ProjectImage = {
  src: string;
  alt: string;
  caption?: string;
};

export type ProjectMetadata = {
  label: string;
  value: string;
};

export type CaseMapItem = {
  label: string;
  title: string;
};

export type VisualAnnotation = {
  number: string;
  label: string;
  x: number;
  y: number;
};

export type AnnotatedImage = {
  src?: string;
  alt: string;
  label?: string;
  guidance?: string;
  ratio?: "wide" | "mobile" | "square";
  annotations?: VisualAnnotation[];
};

export type InteractionCostType = "navigation" | "interpretation" | "memory";

export type InteractionCostItem = {
  label: string;
  description: string;
  costType: InteractionCostType;
};

export type FlowStep = {
  label: string;
  note?: string;
  tags?: InteractionCostType[];
};

export type StateItem = {
  name: string;
  description?: string;
  image?: string;
  note?: string;
};

export type ConstraintItem = {
  label: string;
  constraint: string;
  whyItMattered?: string;
  designResponse?: string;
};

export type OutcomeItem = {
  label: string;
  result: string;
  mode?: "metric" | "structural";
};

export type Playable = {
  title: string;
  description: string;
  iframeUrl: string;
  openInNewTabUrl?: string;
};

export type ProjectBlock =
  | { type: "text"; title?: string; body: string }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "imageGrid"; images: ProjectImage[] }
  | { type: "quote"; text: string; author?: string }
  | { type: "twoColumn"; title?: string; left: string; right: string }
  | {
      type: "contextComparison";
      title?: string;
      intro?: string[];
      leftTitle: string;
      leftItems: string[];
      rightTitle: string;
      rightItems: string[];
      statement?: string;
      placeholder?: string;
    }
  | {
      type: "interactionCostMap";
      title?: string;
      body?: string;
      items: InteractionCostItem[];
      flow?: FlowStep[];
      placeholder?: string;
    }
  | {
      type: "principleGrid";
      title?: string;
      statement?: string;
      note?: string;
      items: { title: string; description: string }[];
    }
  | {
      type: "turningPoint";
      eyebrow?: string;
      title: string;
      statement: string;
      body?: string;
      before?: AnnotatedImage;
      after?: AnnotatedImage;
    }
  | {
      type: "flowComparison";
      eyebrow?: string;
      title?: string;
      beforeLabel?: string;
      afterLabel?: string;
      before: FlowStep[];
      after: FlowStep[];
      fields?: { label: string; value: string }[];
    }
  | {
      type: "annotatedComparison";
      eyebrow?: string;
      title?: string;
      body?: string;
      before: AnnotatedImage;
      after: AnnotatedImage;
      model?: { label: string; description: string }[];
      fields?: { label: string; value: string }[];
    }
  | {
      type: "stateMatrix";
      eyebrow?: string;
      title?: string;
      body?: string;
      note?: string;
      items: StateItem[];
    }
  | {
      type: "visualAdaptation";
      title?: string;
      body?: string;
      columns: { label: string; value: string }[];
      visuals?: AnnotatedImage[];
    }
  | {
      type: "constraintGrid";
      title?: string;
      statement?: string;
      items: ConstraintItem[];
    }
  | {
      type: "outcomeGrid";
      title?: string;
      note?: string;
      items: OutcomeItem[];
    }
  | {
      type: "playable";
      title: string;
      description?: string;
      iframeUrl: string;
      openInNewTabUrl?: string;
    };

export type Project = {
  slug: string;
  title: string;
  subtitle: string;
  duration?: string;
  category: ProjectCategory;
  type: ProjectType;
  year: string;
  cover: string;
  images: ProjectImage[];
  tags?: string[];
  primaryQuestion?: string;
  metadata?: ProjectMetadata[];
  caseMap?: CaseMapItem[];
  heroComparison?: {
    before: AnnotatedImage;
    after: AnnotatedImage;
  };
  openingEyebrow?: string;
  openingTitle?: string;
  openingSummary?: string;
  processTitle?: string;
  summary: string;
  background: string;
  role: string;
  timeline: string;
  tools: string[];
  designGoals: string[];
  process: string[];
  highlights: string[];
  featured?: boolean;
  playable?: Playable;
  videoUrl?: string;
  externalLinks?: {
    label: string;
    url: string;
  }[];
  blocks: ProjectBlock[];
};
