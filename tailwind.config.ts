import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // SparkReels palette, ported from the Claude Design handoff.
        // Warm paper and ochre throughout; the deep blue is not a secondary
        // accent so much as where primary controls land on hover — see
        // .spark-cta in globals.css.
        spark: {
          amber: "#BA7517",
          "amber-tint": "#FDF7EE",
          "amber-glow": "#D99128",
          blue: "#1B5E82",
          "blue-deep": "#154E6C",
          paper: "#F1EFE8",
          ink: "#2C2C2A",
          "ink-soft": "#4A4842",
          "ink-muted": "#6F6D64",
          "ink-faint": "#9B978A",
          rule: "#E3E0D7",
          "rule-soft": "#EAE7DD",
          "rule-dim": "#D5D1C5",
        },
        // The old semantic names now resolve to the warm palette, so pages
        // that have not been rebuilt yet shift with the redesign instead of
        // staying blue against a paper background.
        primary: {
          DEFAULT: "#BA7517",
          50: "#FDF7EE",
          100: "#F7E9D3",
          500: "#BA7517",
          600: "#A3660F",
          700: "#8D580F",
        },
        secondary: {
          DEFAULT: "#1B5E82",
          500: "#1B5E82",
          600: "#154E6C",
        },
        accent: {
          DEFAULT: "#1B5E82",
          500: "#1B5E82",
          600: "#154E6C",
        },
        brand: {
          bg: "#F1EFE8",
          text: "#2C2C2A",
        },
      },
      fontFamily: {
        heading: ["'DM Sans'", "system-ui", "sans-serif"],
        body: ["'DM Sans'", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        brand: "12px",
        nav: "7px",
        card: "10px",
      },
      boxShadow: {
        brand: "0 6px 22px rgba(44,44,42,.07)",
        "brand-lg": "0 8px 32px 0 rgba(44,44,42,.12)",
        cta: "0 2px 8px rgba(186,117,23,.3)",
        "cta-hover": "0 2px 10px rgba(27,94,130,.34)",
        mic: "0 6px 18px rgba(186,117,23,.34)",
        glass:
          "0 6px 22px rgba(44,44,42,.07), inset 0 1px 0 rgba(255,255,255,.9)",
      },
      animation: {
        slideDown: "slideDown 0.3s ease-out",
        "mic-pulse": "mic-pulse 2.2s ease-out infinite",
      },
      keyframes: {
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "mic-pulse": {
          "0%": { transform: "scale(1)", opacity: ".55" },
          "70%": { transform: "scale(2.1)", opacity: "0" },
          "100%": { transform: "scale(2.1)", opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
