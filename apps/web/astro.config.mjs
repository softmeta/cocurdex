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
      title: "Cocurdex Docs",
      description:
        "Product documentation for Cocurdex — multi-agent desktop workspace, CLI, and agents.",
      favicon: "/favicon.svg",
      logo: {
        src: "./src/assets/cocurdex-mark.svg",
        alt: "Cocurdex",
      },
      // Content lives under src/content/docs/docs → public URLs at /docs/*
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Introduction", slug: "docs" },
            { label: "Getting started", slug: "docs/getting-started" },
          ],
        },
        {
          label: "Product",
          items: [
            { label: "Desktop workspace", slug: "docs/desktop" },
            { label: "Notes and issues", slug: "docs/notes-and-issues" },
            { label: "Agents", slug: "docs/agents" },
            { label: "Skills", slug: "docs/skills" },
            { label: "Workflows", slug: "docs/workflows" },
            { label: "CLI", slug: "docs/cli" },
          ],
        },
        {
          label: "Concepts",
          items: [
            {
              label: "Workspaces and data",
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
    }),
  ],
});
