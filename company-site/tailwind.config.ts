import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0f172a",
          accent: "#2563eb",
        },
      },
    },
  },
  plugins: [],
};

export default config;
