/** Public marketing/docs site constants (SSG). */
export const site = {
  name: "Cocurdex",
  url: "https://cocurdex.com",
  description:
    "Multi-agent development workspace for professional developers. Chat, terminal, editor, and browser preview in one desktop shell.",
  locale: "en",
} as const;

export const nav = [
  { href: "/docs/", label: "Docs" },
  { href: "/download/", label: "Download" },
] as const;
