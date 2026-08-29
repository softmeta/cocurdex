import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en-US", "zh-CN"],
  extract: {
    defaultNS: "common",
    defaultValue: "",
    indentation: 2,
    input: ["src/**/*.{ts,tsx}", "!src/test/**"],
    keySeparator: ".",
    nsSeparator: ":",
    output: "src/locales/{{language}}/{{namespace}}.json",
    outputFormat: "json",
    primaryLanguage: "en-US",
    removeUnusedKeys: false,
    sort: true,
    transComponents: ["Trans"],
    useTranslationNames: ["useTranslation"],
  },
  lint: {
    checkInterpolationParams: true,
    ignore: ["src/test/**"],
    ignoredAttributes: ["className", "data-testid"],
    ignoredTags: ["code", "pre"],
  },
  types: {
    enableSelector: false,
    indentation: 2,
    input: ["src/locales/en-US/*.json"],
    output: "src/i18n/generated.d.ts",
    resourcesFile: "src/i18n/resources.generated.d.ts",
  },
});
