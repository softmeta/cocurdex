import type { BuildId } from "../../lib/site";

export const dict = {
  meta: {
    description:
      "Multi-agent development workspace for professional developers. Chat, terminal, editor, and browser preview in one desktop shell.",
  },
  nav: {
    docs: "Docs",
    download: "Download",
    primaryAria: "Primary",
    footerAria: "Footer",
  },
  footer: {
    tagline: "Pre-release.",
    gettingStarted: "Getting started",
  },
  home: {
    eyebrow: "Desktop workspace",
    heading: "Multi-agent development without the context switch tax",
    lede: "Run several AI coding agents in parallel. Chat, terminal, editor, and browser preview stay in one shell — so you always know which session needs you next.",
    downloadCta: "Download",
    docsCta: "Documentation",
    featuresHeading: "Built for long sessions",
    featuresIntro:
      "Cocurdex is for developers who juggle agents across features, fixes, and design loops — not for scrolling a single chat forever.",
    features: [
      {
        title: "Parallel sessions",
        body: "Keep multiple agent runs visible. Status stays honest: thinking, using tools, waiting for you.",
      },
      {
        title: "Workspace, not chat window",
        body: "Terminal (PTY), editor, and browser preview sit beside chat as peers — not buried behind a transcript.",
      },
      {
        title: "Keyboard-first",
        body: "Command palette and shortcuts for primary actions. Mouse stays idiomatic; power users are not second-class.",
      },
      {
        title: "Local-first product data",
        body: "Notes and issues live in app-owned storage on your machine. Cloud team surfaces come later without rewriting that boundary.",
      },
    ],
    agentsHeading: "Bring your own agent",
    agentsIntro:
      "Cocurdex orchestrates the agent CLIs you already have installed — plus a built-in runtime — and keeps status, permissions, and plans legible in one shell.",
    agentColumns: ["Agent", "Runtime", "Plan mode", "Steering", "Permissions"],
    agentRows: [
      {
        name: "Claude Agent",
        runtime: "claude CLI",
        plan: "Yes",
        steering: "Yes",
        permissions: "default · accept-edits · auto · bypass",
      },
      {
        name: "Codex",
        runtime: "codex CLI",
        plan: "Yes",
        steering: "Yes",
        permissions: "read-only · auto · full-access",
      },
      {
        name: "OpenCode",
        runtime: "opencode CLI",
        plan: "Yes",
        steering: "No",
        permissions: "ask · allow · deny",
      },
      {
        name: "Grok Build",
        runtime: "grok CLI over ACP",
        plan: "Yes",
        steering: "Yes",
        permissions: "ask · auto · always-approve",
      },
      {
        name: "Pi",
        runtime: "Built in",
        plan: "—",
        steering: "Yes",
        permissions: "read-only",
      },
    ],
    agentsMore: "Full permission modes and capabilities",
    capabilitiesHeading: "More than sessions",
    capabilitiesIntro:
      "The workspace around the agents: isolated checkouts, a scriptable CLI, and an optional product skill pack.",
    capabilities: [
      {
        title: "Managed worktrees",
        body: "Give each session its own git checkout. Fetch-before-create, setup and cleanup scripts, and a tracked inventory — parallel agents never share a dirty working tree.",
        href: "/docs/cli/#worktrees",
      },
      {
        title: "A real CLI",
        body: "cocurdex opens folders, manages notes, issues, skills, and worktrees, and drives sessions and workflows — with --json where scripts need it. Agents use it instead of touching the database.",
        href: "/docs/cli/",
      },
      {
        title: "Product skills",
        body: "An optional cocurdex-* skill pack teaches agents the grill → PRD → issue → ship loop against the same app-owned data plane.",
        href: "/docs/skills/",
      },
    ],
    startHeading: "Start here",
    startBody:
      "Pre-release builds are available for macOS, Windows, and Linux.",
    gettingStarted: "Getting started",
    desktopOverview: "Desktop overview",
  },
  download: {
    pageTitle: "Download",
    metaDescription:
      "Download Cocurdex for macOS, Windows, and Linux. Pre-release.",
    eyebrow: "Pre-release",
    heading: "Download Cocurdex",
    intro:
      "Pre-release builds for macOS, Windows, and Linux. APIs and workflows may change between versions.",
    builds: {
      "mac-arm64": {
        label: "macOS Apple silicon",
        note: "Signed and notarized DMG.",
      },
      "mac-x64": {
        label: "macOS Intel",
        note: "Signed and notarized DMG.",
      },
      "win-x64": {
        label: "Windows x64",
        note: "Unsigned NSIS installer. SmartScreen may warn.",
      },
      "linux-x64": {
        label: "Linux x64",
        note: "AppImage. Mark it executable, then run it.",
      },
    } satisfies Record<BuildId, { label: string; note: string }>,
    releaseNotes: "Release notes",
    installNote:
      "On macOS, open the DMG and drag Cocurdex to Applications. Every public macOS build is signed with Developer ID and notarized by Apple. Windows installers are unsigned.",
    readDocs: "Read the docs",
    backHome: "Back to home",
  },
};

export type MarketingDict = typeof dict;
