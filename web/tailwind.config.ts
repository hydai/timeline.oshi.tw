import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-primary)"] },
      colors: {
        "accent-pink": "var(--accent-pink)",
        "accent-pink-light": "var(--accent-pink-light)",
        "accent-blue": "var(--accent-blue)",
        "accent-blue-light": "var(--accent-blue-light)",
        "accent-purple": "var(--accent-purple)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
      },
      borderRadius: { xl: "16px", "2xl": "20px", "3xl": "24px", pill: "28px" },
    },
  },
  plugins: [],
};

export default config;
