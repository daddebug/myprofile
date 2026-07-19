import type { CommonMessages } from "../types";

export const enCommon: CommonMessages = {
  brand: { name: "Dilida Duman", subtitle: "game ux / interaction", homeLabel: "Go to homepage" },
  nav: {
    home: "Home", work: "Work", play: "Play", about: "About", contact: "Contact",
    sayHello: "Say hello", openMenu: "Open menu", closeMenu: "Close menu",
  },
  language: { chinese: "中文", english: "EN", label: "Language" },
  project: {
    viewProject: "View Project", back: "Back", backToArchive: "Back to archive",
    nextProject: "Next Project", previousProject: "Previous Project",
    englishInProgress: "English version in progress.",
    chineseAvailable: "The complete Chinese case study is currently available.",
    viewChineseVersion: "View Chinese version",
  },
  homeEditor: {
    editHome: "EDIT HOME",
    doneEditing: "DONE EDITING",
    saving: "SAVING...",
    savedLocally: "SAVED LOCALLY",
    saveError: "SAVE ERROR",
    uploadCover: "Upload cover",
    changeCover: "Change cover",
    replaceCover: "Replace cover",
    removeCover: "Remove cover",
    confirmRemove: "Remove this homepage cover?",
    unsupportedFile: "Choose a PNG, JPEG, WebP, or AVIF image.",
    fileTooLarge: "The image must be 20 MB or smaller.",
    homepageCoverTitle: "Homepage Cover",
    homepageCoverHelper: "This image is used on the homepage and project listing cards.",
    emptyCover: "No homepage cover",
  },
  footer: {
    title: "Let’s Make Something Playable",
    description: "Open to UX, Game UX, interaction design, and playful little-world projects.",
    email: "Email",
    credit: "Designed and developed by Dilida Duman",
    stack: "React · TypeScript · Vite · Framer Motion · Unity WebGL",
  },
};
