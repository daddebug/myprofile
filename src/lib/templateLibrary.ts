// The new Template System. Only reviewed templates are registered here.
// Unreviewed files remain available for later reconstruction, but are not
// loaded by the new library and cannot appear in its builder or gallery.

import type { ComponentType } from "react";
import type { UniversalMedia, UniversalMediaType } from "./universalMedia";

export type TemplateFieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "image"
  | "images"
  | "game"
  | "media"
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
  // Presentation-only ordinal for templates whose visual numbering follows
  // their occurrence in the current ordered flow. Never persisted as data.
  sectionIntroIndex?: number;
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
      onUploadAnnotationEvidence: (itemId: string, annotationId: string) => void;
      onRemoveAnnotationEvidence: (itemId: string, annotationId: string, evidenceId: string) => void;
      error?: string;
    };
    directionCompare?: {
      onUploadImage: (side: "left" | "right") => void;
      onRemoveImage: (side: "left" | "right") => void;
      onImageSettingChange: (side: "left" | "right", updates: Record<string, unknown>) => void;
      onUploadAnnotationEvidence: (side: "left" | "right", annotationId: string) => void;
      onRemoveAnnotationEvidence: (side: "left" | "right", annotationId: string, evidenceId: string) => void;
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
    universalMedia?: {
      onMediaChange: (media: UniversalMedia) => void;
      onChooseImage: () => void;
      onChooseFigmaFallback: () => void;
      onChooseGameFolder: () => void;
      onChooseGameZip: () => void;
      onChooseGameCover: () => void;
      onUseSavedGame: (gameId: string) => void | Promise<void>;
      availableGames: Array<{ gameId: string; originalFileName: string; displayName: string }>;
      activeType: UniversalMediaType;
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
    "../templates/StatementLongformTemplate.tsx",
    "../templates/SupportingNoteTemplate.tsx",
    "../templates/ImageRowTemplate.tsx",
    "../templates/UniversalMediaTemplate.tsx",
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
