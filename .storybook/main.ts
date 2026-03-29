import type { StorybookConfig } from "@storybook/html-vite";
import wasm from "vite-plugin-wasm";

const config: StorybookConfig = {
  stories: ["../stories/**/*.mdx", "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: "@storybook/html-vite",
  viteFinal: (config) => {
    config.plugins = config.plugins || [];
    config.plugins.push(wasm());
    return config;
  },
};
export default config;
