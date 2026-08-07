export type LocalizedProfileText = { zh: string; en: string };

export const portfolioProfile = {
  name: "Dilida Duman",
  role: { zh: "游戏体验 / 交互设计", en: "Game UX / Interaction Designer" },
  positioning: {
    zh: "Game UX/UI Portfolio",
    en: "Game UX/UI Portfolio",
  },
  summary: {
    zh: "",
    en: "I design interfaces like systems, and systems like little worlds. My work connects interaction logic, game experience, and visual systems.",
  },
  skills: ["Figma", "FigJam", "Unity", "Godot", "HTML/CSS", "TypeScript", "After Effects", "Photoshop"],
  experience: [] as Array<{ id: string; company: LocalizedProfileText; role: LocalizedProfileText; date: LocalizedProfileText; bullets: LocalizedProfileText[] }>,
  education: [] as Array<{ id: string; school: LocalizedProfileText; degree: LocalizedProfileText; date: LocalizedProfileText }>,
  contact: {
    email: "hello@example.com",
    website: "",
    location: "Sydney, Australia",
  },
};
