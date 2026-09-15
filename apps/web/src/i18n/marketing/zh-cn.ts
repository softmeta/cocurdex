import type { MarketingDict } from "./en";

export const dict: MarketingDict = {
  meta: {
    description:
      "面向专业开发者的多 Agent 开发工作台。对话、终端、编辑器和浏览器预览共处于一个桌面工作台中。",
  },
  nav: {
    docs: "文档",
    download: "下载",
    primaryAria: "主导航",
    footerAria: "页脚",
  },
  footer: {
    tagline: "预发布。",
    gettingStarted: "快速上手",
  },
  home: {
    eyebrow: "桌面工作台",
    heading: "多 Agent 并行开发，告别上下文切换税",
    lede: "同时运行多个 AI 编程 Agent。对话、终端、编辑器和浏览器预览共处于一个工作台——你始终清楚哪个会话需要你处理。",
    downloadCta: "下载",
    docsCta: "文档",
    featuresHeading: "为长时间会话而生",
    featuresIntro:
      "Cocurdex 面向那些在功能开发、缺陷修复和设计迭代之间同时驾驭多个 Agent 的开发者——而不是让一个聊天窗口无限滚动下去。",
    features: [
      {
        title: "并行会话",
        body: "多个 Agent 运行一目了然。状态如实呈现：思考中、正在使用工具、等待你处理。",
      },
      {
        title: "工作台，而非聊天窗口",
        body: "终端（PTY）、编辑器和浏览器预览与对话并列——而不是埋在对话记录后面。",
      },
      {
        title: "键盘优先",
        body: "命令面板和快捷键覆盖主要操作。鼠标交互保持直觉，重度用户不受委屈。",
      },
      {
        title: "本地优先的产品数据",
        body: "笔记和 Issue 保存在本机的应用私有存储中。未来云端团队功能接入时，这条边界无需重写。",
      },
    ],
    agentsHeading: "用你已有的 Agent",
    agentsIntro:
      "Cocurdex 编排你已安装的 Agent CLI——外加一个内置运行时——把状态、权限和计划清晰地收进同一个工作台。",
    agentColumns: ["Agent", "运行时", "计划模式", "引导", "权限模式"],
    agentRows: [
      {
        name: "Claude Agent",
        runtime: "claude CLI",
        plan: "支持",
        steering: "支持",
        permissions: "default · accept-edits · auto · bypass",
      },
      {
        name: "Codex",
        runtime: "codex CLI",
        plan: "支持",
        steering: "支持",
        permissions: "read-only · auto · full-access",
      },
      {
        name: "OpenCode",
        runtime: "opencode CLI",
        plan: "支持",
        steering: "不支持",
        permissions: "ask · allow · deny",
      },
      {
        name: "Grok Build",
        runtime: "grok CLI(ACP)",
        plan: "支持",
        steering: "支持",
        permissions: "ask · auto · always-approve",
      },
      {
        name: "Pi",
        runtime: "内置",
        plan: "—",
        steering: "支持",
        permissions: "read-only",
      },
    ],
    agentsMore: "完整的权限模式与能力说明",
    capabilitiesHeading: "不止会话",
    capabilitiesIntro:
      "Agent 周围的工作台设施:隔离检出、可脚本化的 CLI,以及可选的产品 skill 包。",
    capabilities: [
      {
        title: "托管工作树",
        body: "给每个会话独立的 git 检出。创建前 fetch、setup/cleanup 脚本、可追踪的清单——并行 Agent 不再共享一棵脏工作树。",
        href: "/zh-cn/docs/cli/#worktrees",
      },
      {
        title: "真正的 CLI",
        body: "cocurdex 打开文件夹,管理笔记、Issue、Skills 和工作树,驱动会话与工作流——脚本需要处皆有 --json。Agent 经由它而非直接操作数据库。",
        href: "/zh-cn/docs/cli/",
      },
      {
        title: "产品 Skills",
        body: "可选的 cocurdex-* skill 包教会 Agent 在同一套应用私有数据面上执行 grill → PRD → Issue → 交付 的循环。",
        href: "/zh-cn/docs/skills/",
      },
    ],
    startHeading: "从这里开始",
    startBody: "预发布构建已提供 macOS、Windows 和 Linux 版本。",
    gettingStarted: "快速上手",
    desktopOverview: "桌面版概览",
  },
  download: {
    pageTitle: "下载",
    metaDescription: "下载 macOS、Windows 和 Linux 版 Cocurdex。预发布。",
    eyebrow: "预发布",
    heading: "下载 Cocurdex",
    intro:
      "macOS、Windows 和 Linux 的预发布构建。各版本之间的 API 与工作流可能发生变化。",
    builds: {
      "mac-arm64": {
        label: "macOS Apple silicon",
        note: "已签名并公证的 DMG。",
      },
      "mac-x64": {
        label: "macOS Intel",
        note: "已签名并公证的 DMG。",
      },
      "win-x64": {
        label: "Windows x64",
        note: "未签名的 NSIS 安装包，SmartScreen 可能提示警告。",
      },
      "linux-x64": {
        label: "Linux x64",
        note: "AppImage。赋予可执行权限后运行。",
      },
    },
    releaseNotes: "发布说明",
    installNote:
      "在 macOS 上，打开 DMG 并将 Cocurdex 拖入「应用程序」。每个公开的 macOS 构建都经过 Developer ID 签名并由 Apple 公证。Windows 安装包未签名。",
    readDocs: "阅读文档",
    backHome: "返回首页",
  },
};
