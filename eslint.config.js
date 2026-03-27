// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended, {
  ignores: [
    "dist/",
    "node_modules/",
    "references/",
    "tooling/",
    "process/",
    "eslint.config.js",
  ],
}, storybook.configs["flat/recommended"]);
