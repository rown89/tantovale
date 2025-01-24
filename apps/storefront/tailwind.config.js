import config from "@tantovale/ui/tailwind.config";

console.log("tailwind loaded", config);

export default {
  ...config,
  theme: {
    ...config.theme,
    screens: {
      xs: "0px",
      sm: "576px",
      md: "768px",
      lg: "992px",
      xl: "1200px",
      xxl: "1400px",
    },
    extend: {
      ...config.theme?.extend,
    },
  },
};
