import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        line: "#d8dee6",
        panel: "#f7f9fb",
        brand: "#0f766e",
        accent: "#b45309"
      }
    }
  },
  plugins: []
};

export default config;

