import type { ProjectBlockType } from "./projectDocuments";

// A lightweight structural-preview identifier used by the visual template
// picker (see BlockLayoutPicker) to draw a small shape diagram instead of
// showing a raw layout-id dropdown. Purely presentational — has no effect
// on the block's actual content or rendering.
export type BlockLayoutShape =
  | "text-block" | "quote" | "two-col" | "three-col"
  | "single" | "grid"
  | "flow-h" | "flow-v"
  | "embed" | "divider"
  | "comparison-columns" | "matrix-table" | "timeline-dates"
  | "annotated-image" | "boundary-list" | "grouped-cards" | "image-slot-grid" | "thinking-map" | "tabbed-content";

export type BlockLayoutDefinition = { id: string; labelZh: string; labelEn: string; type: ProjectBlockType; shape: BlockLayoutShape };

const TEXT_SHAPE_OVERRIDES: Record<string, BlockLayoutShape> = {
  "two-column-text": "two-col", "problem-response": "two-col", "question-answer": "two-col",
  "challenge-decision-outcome": "two-col", "quote-insight": "quote", "large-statement": "quote", "key-takeaway": "quote",
};
const MEDIA_SHAPE_OVERRIDES: Record<string, BlockLayoutShape> = {
  "two-equal-images": "two-col", "before-after": "two-col", "mobile-screen-pair": "two-col", "large-small": "two-col",
  "three-image-row": "three-col", "large-two-small": "three-col", "responsive-grid": "grid",
  "image-text-left": "two-col", "image-text-right": "two-col",
};
const STRUCTURED_SHAPE_OVERRIDES: Record<string, BlockLayoutShape> = {
  "role-timeline-tools": "flow-h", "timeline": "flow-h", "milestones": "flow-h", "user-journey": "flow-h",
  "comparison-matrix": "two-col", "pros-cons": "two-col",
};
const DIAGRAM_SHAPE_OVERRIDES: Record<string, BlockLayoutShape> = {
  "vertical-flow": "flow-v", "hierarchy-map": "flow-v", "branching-tree": "flow-v", "swimlane": "flow-v",
};

function withShapes(entries: Array<[string, string, string]>, type: ProjectBlockType, fallback: BlockLayoutShape, overrides: Record<string, BlockLayoutShape>): BlockLayoutDefinition[] {
  return entries.map(([id, labelZh, labelEn]) => ({ id, labelZh, labelEn, type, shape: overrides[id] ?? fallback }));
}

export const blockLayoutLibrary: BlockLayoutDefinition[] = [
  ...withShapes([
    ["section-introduction", "章节引言", "Section introduction"], ["large-statement", "大号判断", "Large statement"],
    ["standard-body", "标准正文", "Standard body"], ["two-column-text", "双栏正文", "Two-column text"],
    ["quote-insight", "引用 / 洞察", "Quote / insight"], ["question-answer", "问题与回答", "Question and answer"],
    ["problem-response", "问题 / 回应", "Problem / response"], ["key-takeaway", "关键结论", "Key takeaway"],
    ["numbered-findings", "编号发现", "Numbered findings"], ["caption-footnote", "说明 / 脚注", "Caption / footnote"],
    ["role-metadata", "角色与元数据", "Role and metadata"], ["challenge-decision-outcome", "挑战 / 决策 / 结果", "Challenge / decision / outcome"],
  ], "text", "text-block", TEXT_SHAPE_OVERRIDES),
  ...withShapes([
    ["full-width-image", "通栏单图", "Full-width single image"], ["contained-image", "收束单图", "Contained single image"],
    ["image-caption", "图片与说明", "Image with caption"], ["two-equal-images", "双图并列", "Two equal images"],
    ["large-small", "一大一小", "One large + one small"], ["large-two-small", "一大两小", "One large + two small"],
    ["three-image-row", "三图并列", "Three-image row"], ["responsive-grid", "响应式图网格", "Responsive image grid"],
    ["before-after", "前后对比", "Before / after"], ["image-text-left", "左文右图", "Text left / image right"],
    ["image-text-right", "左图右文", "Image left / text right"], ["device-mockup", "设备框截图", "Device mockup"],
    ["mobile-screen-pair", "竖屏双图", "Tall mobile screen pair"], ["annotated-process", "带标注过程图", "Process image with annotations"],
    ["visual-break", "封面式视觉间奏", "Cover-like visual break"],
  ], "media", "single", MEDIA_SHAPE_OVERRIDES),
  ...withShapes([
    ["metrics-row", "指标行", "Metrics row"], ["role-timeline-tools", "角色 / 时间 / 工具", "Role / timeline / tools"],
    ["key-value-facts", "键值事实", "Key-value facts"], ["tag-list", "标签列表", "Tag list"],
    ["deliverables", "交付物", "Deliverables"], ["principles-cards", "原则卡片", "Principles cards"],
    ["research-findings", "研究发现", "Research findings"], ["pain-opportunity", "痛点 / 机会", "Pain point / opportunity"],
    ["decision-rationale", "决策依据", "Decision rationale"], ["comparison-matrix", "对比矩阵", "Comparison matrix"],
    ["pros-cons", "优劣对照", "Pros / cons"], ["timeline", "时间线", "Timeline"], ["milestones", "里程碑", "Milestones"],
    ["user-journey", "用户旅程", "User journey"], ["design-process", "设计过程", "Design process"],
    ["feature-breakdown", "功能拆解", "Feature breakdown"], ["system-layers", "系统层级", "System layers"],
    ["outcome-reflection", "结果与反思", "Outcome and reflection"],
    ["constraints", "责任与约束", "Constraints"], ["next-steps", "下一步", "Next steps"], ["state-matrix", "状态矩阵", "State matrix"],
  ], "structured", "grid", STRUCTURED_SHAPE_OVERRIDES),
  ...withShapes([
    ["figma-embed", "Figma 原型", "Figma prototype"],
  ], "figma-prototype", "embed", {}),
  ...withShapes([
    ["horizontal-flow", "横向流程", "Horizontal flow"], ["vertical-flow", "纵向流程", "Vertical flow"],
    ["branching-tree", "分支树", "Branching tree"], ["user-flow", "用户流程", "User flow"], ["system-flow", "系统流程", "System flow"],
    ["decision-flow", "决策流程", "Decision flow"], ["input-process-output", "输入 → 处理 → 输出", "Input → process → output"],
    ["before-intervention-after", "之前 → 介入 → 之后", "Before → intervention → after"],
    ["research-insight-output", "研究 → 洞察 → 原则 → 产出", "Research → insight → principle → output"],
    ["swimlane", "泳道流程", "Swimlane process"], ["hierarchy-map", "层级图", "Hierarchy map"],
    ["relationship-map", "关系图", "Relationship map"],
  ], "diagram", "flow-h", DIAGRAM_SHAPE_OVERRIDES),
  ...withShapes([
    ["divider-line", "分隔线", "Divider"],
  ], "divider", "divider", {}),
  ...withShapes([
    ["comparison-columns", "多列对比（独立图注）", "Multi-column comparison (independent captions)"],
  ], "comparison-table", "comparison-columns", {}),
  ...withShapes([
    ["matrix-table", "矩阵表格", "Matrix table"],
  ], "decision-matrix", "matrix-table", {}),
  ...withShapes([
    ["timeline-dates", "带日期时间线", "Timeline with dates"],
  ], "timeline", "timeline-dates", {}),
  ...withShapes([
    ["annotated-image-grid", "带独立说明的图片", "Images with independent captions"],
  ], "annotated-image", "annotated-image", {}),
  ...withShapes([
    ["boundary-list-columns", "保留 / 调整对照表", "Keep / change comparison"],
  ], "boundary-list", "boundary-list", {}),
  ...withShapes([
    ["grouped-cards-list", "分组卡片", "Grouped cards"],
  ], "grouped-cards", "grouped-cards", {}),
  ...withShapes([
    ["image-slot-grid", "带标签的图片位网格", "Labeled image slot grid"],
  ], "image-slot-grid", "image-slot-grid", {}),
  ...withShapes([
    ["thinking-map-nodes", "思考 / 系统地图", "Thinking / system map"],
  ], "thinking-map", "thinking-map", {}),
  ...withShapes([
    ["tabbed-panels", "标签页内容", "Tabbed content"],
  ], "tabbed-content", "tabbed-content", {}),
];


