// The new Template System. Only reviewed templates are registered here.
// Unreviewed files remain available for later reconstruction, but are not
// loaded by the new library and cannot appear in its builder or gallery.

import type { ComponentType } from "react";

export type TemplateFieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "image"
  | "images"
  | "game"
  | "xmind"
  | "list"
  | "select"
  | "table";

export type TemplateFieldDefinition = {
  id: string;
  labelZh: string;
  labelEn: string;
  type: TemplateFieldType;
  required?: boolean;
  min?: number;
  max?: number;
};

export type TemplateMeta = {
  id: string;
  nameZh: string;
  nameEn: string;
  descriptionZh?: string;
  descriptionEn?: string;
  schema: TemplateFieldDefinition[];
  createdAt: string;
};

export type TemplateContentValue =
  | { zh: string; en: string }
  | { assetId?: string; publicPath?: string; alt?: string }
  | Array<{ assetId?: string; publicPath?: string; alt?: string }>
  | Array<{ zh: string; en: string }>
  | unknown;

export type TemplateProps = {
  content: Record<string, TemplateContentValue>;
  locale: "zh" | "en";
  inlineEditor?: {
    onLocalizedTextChange: (field: string, value: string) => void;
    imageRow?: {
      onUploadFirstImage: () => void;
      onAddItemAfter: (itemId: string) => void;
      onAddNewRow: () => void;
      onReplaceImage: (itemId: string) => void;
      onRemoveImage: (itemId: string) => void;
      onRemoveItem: (itemId: string) => void;
      onCancelPlaceholder: (itemId: string) => void;
      onItemChange: (itemId: string, updates: Record<string, unknown>) => void;
      error?: string;
    };
    directionCompare?: {
      onUploadImage: (side: "left" | "right") => void;
      onRemoveImage: (side: "left" | "right") => void;
      onImageSettingChange: (side: "left" | "right", updates: { hoverPreviewMode: "none" | "floating" }) => void;
      onDirectionChange: (direction: "left-to-right" | "right-to-left" | "none") => void;
      error?: string;
    };
    playableGame?: {
      onChooseFolder: () => void;
      onChooseZip: () => void;
      onChooseCover: () => void;
      onUseSavedBuild: (gameId: string) => void | Promise<void>;
      availableGames: Array<{
        gameId: string;
        originalFileName: string;
        displayName: string;
        fileCount: number;
        totalBytes: number;
        createdAt: string;
      }>;
      onContentChange: (updates: Record<string, unknown>) => void;
      busy?: boolean;
      stage?: "" | "reading" | "checking" | "copying" | "verifying" | "saving";
      error?: string;
    };
  };
  // Symmetric left/right inset (px) for this template's outer container,
  // resolved by the caller as: this project instance's own override ->
  // this template's saved default (templateLayoutDefaults.ts) -> 0. Every
  // template forwards this straight into TemplateContent; it is the only
  // thing that controls a template's overall width and position now —
  // there is no more per-template-type wide/standard/narrow guessing.
  horizontalInset?: number;
};

export type TemplateLayoutControlDefinition = {
  key: string;
  label: string;
  type?: "text" | "select";
  options?: Array<{ label: string; value: string }>;
};

export type RegisteredTemplate = {
  meta: TemplateMeta;
  Component: ComponentType<TemplateProps>;
  layoutControlSchema: TemplateLayoutControlDefinition[];
};

type TemplateModule = {
  templateMeta?: TemplateMeta;
  default?: ComponentType<TemplateProps>;
  layoutControlSchema?: TemplateLayoutControlDefinition[];
};

const modules = import.meta.glob<TemplateModule>(
  [
    "../templates/ProjectHeaderTemplate.tsx",
    "../templates/StatementLongformTemplate.tsx",
    "../templates/XMindBreakdownTemplate.tsx",
    "../templates/SupportingNoteTemplate.tsx",
    "../templates/PhaseMilestonesTemplate.tsx",
    "../templates/CircleSummaryTemplate.tsx",
    "../templates/DecisionTableTemplate.tsx",
    "../templates/ImageRowTemplate.tsx",
    "../templates/FigmaPrototypeTemplate.tsx",
    "../templates/ProcessFlowTemplate.tsx",
    "../templates/PlayableGameTemplate.tsx",
    "../templates/DirectionCompareTemplate.tsx",
  ],
  { eager: true },
);

export function getRegisteredTemplates(): RegisteredTemplate[] {
  const templates: RegisteredTemplate[] = [];
  for (const module of Object.values(modules)) {
    if (module.templateMeta && module.default) {
      templates.push({
        meta: module.templateMeta,
        Component: module.default,
        layoutControlSchema: module.layoutControlSchema ?? [],
      });
    }
  }
  return templates.sort((a, b) =>
    a.meta.createdAt.localeCompare(b.meta.createdAt),
  );
}

export function getRegisteredTemplate(
  id: string,
): RegisteredTemplate | undefined {
  return getRegisteredTemplates().find((template) => template.meta.id === id);
}
