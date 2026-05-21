import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Rubik",
          "Heebo",
          "Assistant",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d8e9ff",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af",
        },
      },
    },
  },
  plugins: [],
};

export default config;
