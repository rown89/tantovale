import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";
const config = {
  default: {
    placement: "global",
    override: {
      converter: "aws-apigw-v2",
    },
  },
  buildCommand: "npx turbo next:build",
} satisfies OpenNextConfig;

export default config;
