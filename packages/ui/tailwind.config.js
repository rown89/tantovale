import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    join(__dirname, "../../apps/storefront/**/*.{js,jsx,ts,tsx}"),
    join(__dirname, "./src/**/*.{js,jsx,ts,tsx}"),
    join(__dirname, "./src/**/*.stories.@(js|jsx|mjs|ts|tsx)"),
  ],
  theme: {
    extend: {
      colors: {
        grey: {
          50: "#F2F4F7", // grey50
          100: "#F2F4F6", // grey100
          200: "#EAECF0", // grey200
          300: "#D0D5DD", // grey300
          400: "#98A2B3", // grey400
          500: "#667085", // grey500
          600: "#475467", // grey600
          700: "#344054", // grey700
          800: "#1D2939", // grey800
          900: "#101828", // grey900
        },
        primary: {
          100: "#FFEDEB", // primary100
          200: "#FED7D7", // primary200
          300: "#FBBDBB", // primary300
          400: "#F69292", // primary400
          500: "#ED7777", // primary500
          600: "#D95656", // primary600
          700: "#C64141", // primary700
          800: "#9E3838", // primary800
          900: "#7D3030", // primary900
        },
        secondary: {
          100: "#EBFAFF", // secondary100
          200: "#E6F5FA", // secondary200
          300: "#CCEAF4", // secondary300
          400: "#B2E3F3", // secondary400
          500: "#8FD9F1", // secondary500
          600: "#7BCFE7", // secondary600
          700: "#54B8D9", // secondary700
          800: "#3B9EBF", // secondary800
          900: "#217693", // secondary900
        },
        success: {
          100: "#D1FADF", // success100
          200: "#A6F4C5", // success200
          300: "#6CE9A6", // success300
          400: "#32D583", // success400
          500: "#12B76A", // success500
          600: "#039855", // success600
          700: "#027A48", // success700
          800: "#05603A", // success800
          900: "#054F31", // success900
        },
        error: {
          100: "#FEE4E2", // error100
          200: "#FECAC5", // error200
          300: "#FDA29B", // error300
          400: "#F97066", // error400
          500: "#F04438", // error500
          600: "#D92D20", // error600
          700: "#B42318", // error700
          800: "#912018", // error800
          900: "#7A2712", // error900
        },
        warning: {
          100: "#FEF0C7", // warning100
          200: "#FEDF89", // warning200
          300: "#FEC84B", // warning300
          400: "#FDB022", // warning400
          500: "#F79209", // warning500
          600: "#DC6803", // warning600
          700: "#B54708", // warning700
          800: "#93370D", // warning800
          900: "#7A2E0E", // warning900
        },
      },
    },
  },
  plugins: [],
};

export default config;
