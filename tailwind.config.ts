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
        primary: {
          DEFAULT: "#3B82F6",
          50: "#EFF6FF",
          100: "#DBEAFE",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
        },
        secondary: {
          DEFAULT: "#6366F1",
          500: "#6366F1",
          600: "#4F46E5",
        },
        accent: {
          DEFAULT: "#14B8A6",
          500: "#14B8A6",
          600: "#0D9488",
        },
        brand: {
          bg: "#F1F5F9",
          text: "#0F172A",
        },
      },
      fontFamily: {
        heading: ["Roboto", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      borderRadius: {
        brand: "12px",
      },
      boxShadow: {
        brand: "0 2px 12px 0 rgba(15,23,42,0.08)",
        "brand-lg": "0 8px 32px 0 rgba(15,23,42,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
