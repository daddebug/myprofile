import type { CommonMessages } from "../types";

export const zhCommon: CommonMessages = {
  brand: { name: "迪丽达 · 杜曼", subtitle: "游戏体验 / 交互", homeLabel: "返回主页" },
  nav: {
    home: "Home", work: "Work", play: "Play", about: "About", contact: "Contact",
    sayHello: "Say hello", openMenu: "Open menu", closeMenu: "Close menu",
  },
  language: { chinese: "中文", english: "EN", label: "语言" },
  project: {
    viewProject: "View Project", back: "Back", backToArchive: "Back to archive",
    nextProject: "Next Project", previousProject: "Previous Project",
    englishInProgress: "English version in progress.",
    chineseAvailable: "The complete Chinese case study is currently available.",
    viewChineseVersion: "View Chinese version",
  },
  homeEditor: {
    editHome: "编辑首页",
    doneEditing: "完成编辑",
    saving: "保存中...",
    savedLocally: "已保存到本地",
    saveError: "保存失败",
    uploadCover: "上传封面",
    changeCover: "更换封面",
    replaceCover: "替换封面",
    removeCover: "移除封面",
    confirmRemove: "确定移除这张首页封面吗？",
    unsupportedFile: "请选择 PNG、JPEG、WebP 或 AVIF 图片。",
    fileTooLarge: "图片不能超过 20 MB。",
    homepageCoverTitle: "首页封面",
    homepageCoverHelper: "这张图片会显示在首页和项目列表的项目卡片中。",
    emptyCover: "暂无首页封面",
  },
  footer: {
    title: "Let’s Make Something Playable",
    description: "Open to UX, Game UX, interaction design, and playful little-world projects.",
    email: "Email",
    credit: "设计与开发：Dilida Duman",
    stack: "React · TypeScript · Vite · Framer Motion · Unity WebGL",
  },
};
