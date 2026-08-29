# Product

## Register

product

## Users

Professional developers running multi-agent, multi-session coding work. They juggle several AI agents concurrently across distinct tasks (feature implementation, debugging, design iteration), and need one desktop surface where chat, terminal, editor, browser preview, and session state coexist without context-switching across separate apps. The user is keyboard-fluent, comfortable with CLI mental models, and unforgiving of UI friction; their session is long-running, often hours, frequently spans multiple projects.

## Product Purpose

Cocurdex is a unified multi-agent development workspace, delivered as a native desktop app (Electron). It collapses the typical "Claude Code CLI in one terminal + IDE in another + browser preview in a third + Slack for the agent's status" workflow into a single shell with chat, integrated terminal (PTY), editor, browser preview with design-mode annotation, sessions, and workspaces.

Success looks like: a developer can run several agents in parallel without losing track of which one needs attention, can review and steer each session at a glance, and can complete a full feature loop (specify → implement → preview → critique → iterate) without leaving the app. The product exists because today's AI coding tools are fragmented, and chat-first wrappers do not scale past a single conversation.

The project also includes a marketing surface (landing/site) for distribution, but the primary register is product. PRODUCT.md captures product defaults; the marketing surface may override per task.

## Brand Personality

Calm, precise, professional. The Linear / Raycast lane: confident expertise expressed through restraint, not through flourish. Voice is direct and operator-grade — short sentences, technical without being jargon-heavy, no marketing puffery, no exclamation points. The interface should feel like a tool a senior developer would choose because it gets out of the way, not one they tolerate because management bought it.

Status and activity copy (already established in i18n) sets the tone: "Thinking", "Using tools", "Ready for follow-up changes" — neutral, honest, no anthropomorphizing.

## Anti-references

Specific patterns Cocurdex must not resemble:

- **AI SaaS marketing aesthetic**: purple/blue gradients, glow effects, glassmorphism, hero-metric templates, gradient text, dark backgrounds with neon accents. The "AI thing" visual cliché.
- **Enterprise IDE chrome**: VS Code, Cursor, JetBrains. Dense toolbars, tab stacks ten deep, sidebar trees that demand half the screen, status bars crammed with icons. Cocurdex is a workspace, not a configurable cockpit.
- **Web-app-in-Electron**: ChatGPT Desktop or any tool that visibly is a browser tab wrapped in a window chrome. The product must feel native to the desktop, with proper window behavior, platform-appropriate spacing, native menus, and keyboard behavior that respects OS conventions.
- **Chat-as-center-of-gravity**: Slack, Discord, ChatGPT. Cocurdex is not optimized for "scrolling back through conversation history"; the chat is one pane among several, in service of the workflow, not the destination.

## Design Principles

1. **Quiet expertise.** Depth without noise. Surface power through restraint and precision, not through visual weight. If a UI element is not actively useful in the current state, it should not compete for attention.
2. **Workspace, not chat window.** Multi-pane is the default mental model. Sessions, chat, terminal, editor, and preview are peers. No single pane should monopolize the layout, and the user must always be able to see what every active agent is doing.
3. **Keyboard-first, mouse-respectful.** Every primary action should be reachable from the keyboard. The Cmd-K palette and shortcut affordances are first-class, not vestigial. Mouse interactions must remain idiomatic and responsive, but the design assumes a fluent user.
4. **Honest agent state.** Status, activity, errors, and intermediate steps are surfaced plainly. No anthropomorphic flourish, no fake confidence, no progress bars that lie. The developer must always be able to tell what each agent is doing and whether it needs them.
5. **Theme parity is non-negotiable.** Dark and light are equal citizens, enforced by the existing `theme-parity` lint. Neither is the "fallback"; both are designed, both shipped at full quality. Design tokens are the source of truth (also enforced by lint); raw hex values are a code smell.

## Accessibility & Inclusion

WCAG 2.1 AA is the aspirational target, not a current hard gate. Pre-release, dev velocity is prioritized over formal conformance, but no design decision should make AA unreachable later. Practical implications now:

- Contrast ratios should at minimum meet AA on text and meaningful UI elements; do not let tinted neutrals slip below threshold.
- All interactive elements must be reachable via keyboard, with visible focus states; this is part of the keyboard-first principle, not an a11y add-on.
- Reduced-motion preferences should be respected wherever motion is introduced (the `animate` command will enforce this).
- Bilingual i18n (en-US, zh-CN) is a hard requirement enforced by `i18n:lint`; new strings must be extracted, translated to both locales, and types regenerated before merging.
- Color must never be the sole carrier of meaning (status, severity, validation): pair with iconography, copy, or shape.
