import type { Config } from "tailwindcss";

const rgbVar = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "happy-blue": {
          900: rgbVar("happy-blue-900"),
          700: rgbVar("happy-blue-700"),
          500: rgbVar("happy-blue-500"),
          200: rgbVar("happy-blue-200"),
        },
        cream: {
          50:  rgbVar("cream-50"),
          100: rgbVar("cream-100"),
          200: rgbVar("cream-200"),
        },
        accent: {
          coral: rgbVar("accent-coral"),
          green: rgbVar("accent-green"),
        },
        text: {
          primary: rgbVar("text-primary"),
          "on-blue": rgbVar("text-on-blue"),
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
      },
      maxWidth: {
        page: "var(--max-page)",
      },
    },
  },
  plugins: [],
};

export default config;
