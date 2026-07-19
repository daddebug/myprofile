import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#181743",
        forest: "#181743",
        tealDeep: "#2A43C7",
        mint: "#34F025",
        fern: "#2A43C7",
        pistachio: "#34F025",
        cream: "#F4F5FA",
        paper: "#20235E",
        clay: "#F0B08A",
        peach: "#F0B08A",
        violetInk: "#223190",
        deepIndigo: "#181743",
        archiveBlue: "#223190",
        electricBlue: "#2A43C7",
        acidGreen: "#34F025",
        softWhite: "#F4F5FA"
      },
      fontFamily: {
        display: ["Space Grotesk", "Inter", "Avenir Next", "Segoe UI", "Arial", "sans-serif"],
        sans: ["Inter", "Avenir Next", "Segoe UI", "Arial", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "Consolas", "Liberation Mono", "monospace"]
      },
      boxShadow: {
        soft: "0 22px 60px rgba(5, 7, 34, 0.26)",
        card: "0 16px 40px rgba(5, 7, 34, 0.22)",
        archive: "0 18px 54px rgba(6, 8, 40, 0.28)",
        sticker: "0 10px 28px rgba(6, 8, 40, 0.18)"
      },
      opacity: {
        3: "0.03",
        7: "0.07",
        8: "0.08",
        12: "0.12",
        14: "0.14",
        15: "0.15",
        16: "0.16",
        18: "0.18",
        22: "0.22",
        35: "0.35",
        45: "0.45",
        54: "0.54",
        58: "0.58",
        62: "0.62",
        64: "0.64",
        66: "0.66",
        68: "0.68",
        72: "0.72",
        76: "0.76",
        78: "0.78",
        86: "0.86",
        88: "0.88"
      },
      backgroundImage: {
        grain:
          "radial-gradient(circle at 1px 1px, rgba(244,245,250,0.08) 1px, transparent 0)",
        garden:
          "linear-gradient(135deg, #181743 0%, #1D236F 48%, #223190 100%)",
        paperSpecks:
          "radial-gradient(circle at 20% 20%, rgba(52,240,37,0.12) 0 1px, transparent 2px), radial-gradient(circle at 78% 32%, rgba(42,67,199,0.24) 0 1px, transparent 2px), radial-gradient(circle at 42% 78%, rgba(244,245,250,0.08) 0 1px, transparent 2px)"
      }
    }
  },
  plugins: []
} satisfies Config;
