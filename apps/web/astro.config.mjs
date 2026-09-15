import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// Pin cookie@2 for this app. Parent dirs (e.g. ~/node_modules/cookie@0.7)
// can otherwise win Node resolution and break Astro 7 (needs parseCookie).
// Express elsewhere in the monorepo keeps cookie@0.7 via its own pnpm graph.
const require = createRequire(import.meta.url);
const cookieEntry = require.resolve("cookie");
// cookie@2 entry is …/cookie/dist/index.js — alias the package root.
const cookiePackageRoot = path.resolve(path.dirname(cookieEntry), "..");

// Marketing + docs (ADR 0003). SSG only — no auth, no desktop imports.
// Locales: English at the unprefixed root, 简体中文 under /zh-cn/.
export default defineConfig({
  site: "https://cocurdex.com",
  output: "static",
  server: {
    port: 4321,
  },
  vite: {
    resolve: {
      alias: {
        cookie: cookiePackageRoot,
      },
      dedupe: ["cookie"],
    },
    // Keep Vite from walking outside the monorepo for optimize/deps edge cases.
    server: {
      fs: {
        allow: [
          path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
        ],
      },
    },
  },
  integrations: [
    starlight({
      title: {
        en: "Cocurdex Docs",
        "zh-CN": "Cocurdex 文档",
      },
      description:
        "Product documentation for Cocurdex — multi-agent desktop workspace, CLI, and agents.",
      favicon: "/favicon.svg",
      logo: {
        src: "./src/assets/cocurdex-mark.svg",
        alt: "Cocurdex",
      },
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
        "zh-cn": {
          label: "简体中文",
          lang: "zh-CN",
        },
      },
      // Content lives under src/content/docs/docs → public URLs at /docs/*;
      // zh-CN mirrors at src/content/docs/zh-cn/docs → /zh-cn/docs/*.
      sidebar: [
        {
          label: "Start",
          translations: { "zh-CN": "开始" },
          items: [
            {
              label: "Introduction",
              translations: { "zh-CN": "介绍" },
              slug: "docs",
            },
            {
              label: "Getting started",
              translations: { "zh-CN": "快速上手" },
              slug: "docs/getting-started",
            },
          ],
        },
        {
          label: "Product",
          translations: { "zh-CN": "产品" },
          items: [
            {
              label: "Desktop workspace",
              translations: { "zh-CN": "桌面工作台" },
              slug: "docs/desktop",
            },
            {
              label: "Notes and issues",
              translations: { "zh-CN": "笔记与 Issue" },
              slug: "docs/notes-and-issues",
            },
            {
              label: "Agents",
              translations: { "zh-CN": "Agent" },
              slug: "docs/agents",
            },
            {
              label: "Skills",
              translations: { "zh-CN": "Skills" },
              slug: "docs/skills",
            },
            {
              label: "Workflows",
              translations: { "zh-CN": "工作流" },
              slug: "docs/workflows",
            },
            {
              label: "CLI",
              translations: { "zh-CN": "CLI" },
              slug: "docs/cli",
            },
            {
              label: "Providers and settings",
              translations: { "zh-CN": "Provider 与设置" },
              slug: "docs/providers-and-settings",
            },
          ],
        },
        {
          label: "Concepts",
          translations: { "zh-CN": "概念" },
          items: [
            {
              label: "Workspaces and data",
              translations: { "zh-CN": "工作区与数据" },
              slug: "docs/concepts/workspaces-and-data",
            },
          ],
        },
      ],
      customCss: ["./src/styles/docs.css"],
      head: [
        {
          tag: "meta",
          attrs: {
            name: "theme-color",
            content: "#0c0c0d",
          },
        },
      ],
    }),
    sitemap({
      filter: (page) => !page.includes("/404"),
      i18n: {
        defaultLocale: "en",
        locales: {
          en: "en",
          "zh-cn": "zh-CN",
        },
      },
    }),
  ],
});
