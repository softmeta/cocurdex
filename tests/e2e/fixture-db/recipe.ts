import type { StubTurn } from "../helpers/llm-stub";

export const FIXTURE_WORKSPACE_ID = "fixture-acme-shop";
export const FIXTURE_WORKSPACE_NAME = "acme-shop";
export const FIXTURE_MULTI_FOLDER_WORKSPACE_ID = "fixture-acme-suite";

export interface FixtureWorkspace {
  id: string;
  name: string;
  folders: string[];
}

export const FIXTURE_WORKSPACES: FixtureWorkspace[] = [
  {
    id: FIXTURE_WORKSPACE_ID,
    name: FIXTURE_WORKSPACE_NAME,
    folders: ["acme-shop"],
  },
  {
    id: FIXTURE_MULTI_FOLDER_WORKSPACE_ID,
    name: "acme-suite",
    folders: ["acme-web", "acme-docs"],
  },
];

export interface FixtureTurn {
  messageId: string;
  prompt: string;
  replies: StubTurn[];
}

export interface FixtureInterruptedTurn {
  messageId: string;
  prompt: string;
  queued: { messageId: string; prompt: string };
}

export interface FixtureTeammate {
  name: string;
  prompt: string;
  replies: StubTurn[];
  leadReplies: StubTurn[];
}

export interface FixtureSession {
  id: string;
  title: string;
  kind: "main" | "chat";
  turns: FixtureTurn[];
  teammates?: FixtureTeammate[];
  turnsAfterTeam?: FixtureTurn[];
  pinned?: boolean;
  archived?: boolean;
  interruptedTurn?: FixtureInterruptedTurn;
  roleId?: string;
}

export interface FixtureRole {
  id: string;
  name: string;
  emoji: string;
}

export const FIXTURE_ROLES: FixtureRole[] = [
  { id: "fixture-role-reviewer", name: "Checkout reviewer", emoji: "🕵️" },
];

export interface FixtureNote {
  key: string;
  title: string;
  bodyMarkdown: string;
  parentKey?: string;
  inWorkspace?: boolean;
}

export interface FixtureDeck {
  title: string;
  markdown: string;
  inWorkspace?: boolean;
}

export interface FixtureIssue {
  title: string;
  description: string;
  status: "backlog" | "doing" | "review" | "done";
  priority: "urgent" | "high" | "medium" | "low" | "none";
  labels: string[];
  comment?: string;
  linkedSessionId?: string;
  image?: { fixture: string; name: string };
}

export const FIXTURE_LABELS = [
  { name: "bug", color: "#d14343" },
  { name: "feature", color: "#2f7de1" },
  { name: "checkout", color: "#8a5cf5" },
];

const DISCOUNT_FILE = `export interface DiscountCode {
  code: string;
  amountOff?: number;
  percentOff?: number;
}

export function applyDiscount(subtotal: number, discount: DiscountCode): number {
  const percent = discount.percentOff ? subtotal * (discount.percentOff / 100) : 0;
  return Math.max(0, subtotal - (discount.amountOff ?? 0) - percent);
}
`;

const RELEASE_NOTES = `## Acme Shop 0.4.0

### Added
- Percentage discount codes at checkout.
- Cart subtotal now rounds to cents.

### Fixed
- Empty carts no longer show a negative total.

| Area | Change | Risk |
| --- | --- | --- |
| Cart | Rounding | Low |
| Checkout | \`applyDiscount\` percent codes | Medium |

\`\`\`ts
applyDiscount(100, { code: "SPRING10", percentOff: 10 }); // 90
\`\`\`

\`\`\`mermaid
flowchart LR
  Cart --> Discount --> Checkout
\`\`\`
`;

const AUDIT_TURN_COUNT = 14;

const AUDIT_STAGES = ["cart", "payment", "fulfillment"];

function auditStage(index: number, stage: string): string[] {
  const lines = Array.from(
    { length: 28 },
    (_, line) =>
      `  { step: ${line + 1}, cart: "cart-${index + 1}", total: ${(index + 1) * 100 + line} },`,
  );
  return [
    `Totals recorded for each ${stage} step of this cart:`,
    "",
    "```ts",
    `const ${stage}Steps = [`,
    ...lines,
    "];",
    "```",
    "",
  ];
}

function auditReply(index: number): string {
  return [
    `### Checkout audit ${index + 1}`,
    "",
    ...AUDIT_STAGES.flatMap((stage) => auditStage(index, stage)),
  ].join("\n");
}

const AUDIT_TURNS: FixtureTurn[] = Array.from(
  { length: AUDIT_TURN_COUNT },
  (_, index) => ({
    messageId: `fixture-message-audit-${index + 1}`,
    prompt: `Audit checkout cart ${index + 1}.`,
    replies: [{ text: [auditReply(index)] }],
  }),
);

const DIAGRAM_STAGES = ["Cart", "Discount", "Payment", "Fulfillment", "Refund"];

function diagramReply(): string {
  return DIAGRAM_STAGES.flatMap((stage, index) => [
    `### ${index + 1}. ${stage} boundary`,
    "",
    "```mermaid",
    "flowchart TD",
    `  ${stage}Start[${stage} request] --> ${stage}Check{Valid?}`,
    `  ${stage}Check -->|yes| ${stage}Apply[Apply ${stage.toLowerCase()}]`,
    `  ${stage}Check -->|no| ${stage}Reject[Reject]`,
    `  ${stage}Apply --> ${stage}Log[Audit log]`,
    `  ${stage}Reject --> ${stage}Log`,
    "```",
    "",
  ]).join("\n");
}

const DIAGRAM_TURNS: FixtureTurn[] = [
  {
    messageId: "fixture-message-diagrams-1",
    prompt: "List the checkout stages.",
    replies: [{ text: [DIAGRAM_STAGES.join(", ")] }],
  },
  {
    messageId: "fixture-message-diagrams-2",
    prompt: "Which stage can reject a cart?",
    replies: [{ text: ["Every stage can reject a cart."] }],
  },
  {
    messageId: "fixture-message-diagrams-3",
    prompt: "Draw each checkout stage as a flowchart.",
    replies: [{ text: [diagramReply()] }],
  },
  {
    messageId: "fixture-message-diagrams-4",
    prompt: "Where is the audit log written?",
    replies: [{ text: ["Each stage writes to the audit log at its end."] }],
  },
  ...Array.from({ length: 6 }, (_, index) => ({
    messageId: `fixture-message-diagrams-${index + 5}`,
    prompt: `Audit diagram cart ${index + 1}.`,
    replies: [{ text: [auditReply(index)] }],
  })),
];

export const FIXTURE_TEAMMATE_TOOL_CALLS = 30;
export const FIXTURE_MISSING_CHECKOUT_PATH =
  "src/checkout/repositories/sqlite-checkout-session-repository-with-retries-and-audit-trail.ts";

const REVIEW_FILES = ["src/cart.ts", "src/discount.ts", "README.md"];

function teammateReview(name: string): FixtureTeammate {
  const reads = Array.from(
    { length: FIXTURE_TEAMMATE_TOOL_CALLS - 1 },
    (_, index) => ({
      name: "read",
      arguments: { path: REVIEW_FILES[index % REVIEW_FILES.length] },
    }),
  );
  return {
    name,
    prompt: `Review the cart modules and write findings to notes/${name}.md.`,
    replies: [
      {
        toolCalls: [
          ...reads,
          { name: "read", arguments: { path: `notes/${name}.md` } },
        ],
      },
      { text: [`${name} found no rounding issues in the cart.`] },
    ],
    leadReplies: [{ text: [`Noted the report from ${name}.`] }],
  };
}

export const FIXTURE_TEAM_SESSION: FixtureSession = {
  id: "fixture-session-checkout-team",
  title: "Coordinate checkout review",
  kind: "main",
  turns: [
    {
      messageId: "fixture-message-team-1",
      prompt: "Check the project layout.",
      replies: [
        { toolCalls: [{ name: "read", arguments: { path: "package.json" } }] },
        { text: ["A TypeScript shop with cart and discount modules."] },
      ],
    },
  ],
  teammates: [teammateReview("cart-reviewer"), teammateReview("docs-reviewer")],
  turnsAfterTeam: [
    {
      messageId: "fixture-message-team-2",
      prompt: "Review the checkout code paths.",
      replies: [
        {
          toolCalls: [
            { name: "read", arguments: { path: "src/cart.ts" } },
            {
              name: "read",
              arguments: { path: FIXTURE_MISSING_CHECKOUT_PATH },
            },
            { name: "read", arguments: { path: "src/discount.ts" } },
          ],
        },
        {
          text: [
            "Checkout totals come from the cart; there is no checkout module.",
          ],
        },
      ],
    },
  ],
};

export const FIXTURE_SESSIONS: FixtureSession[] = [
  FIXTURE_TEAM_SESSION,
  {
    id: "fixture-session-discounts",
    title: "Add percentage discount codes",
    kind: "main",
    pinned: true,
    turns: [
      {
        messageId: "fixture-message-discounts-1",
        prompt:
          "Add support for percentage discount codes in the cart total. Keep fixed amount codes working.",
        replies: [
          {
            text: ["I'll look at the cart and discount modules first."],
            toolCalls: [
              { name: "read", arguments: { path: "src/cart.ts" } },
              { name: "read", arguments: { path: "src/discount.ts" } },
            ],
          },
          {
            text: [
              "Discounts only support a fixed `amountOff`. ",
              "I'll add an optional `percentOff`.",
            ],
            toolCalls: [
              {
                name: "write",
                arguments: { path: "src/discount.ts", content: DISCOUNT_FILE },
              },
            ],
          },
          {
            text: [
              "Done. `applyDiscount` now accepts `percentOff` alongside ",
              "`amountOff`, and never returns a negative total.",
            ],
          },
        ],
      },
      {
        messageId: "fixture-message-discounts-2",
        prompt: "Does the README mention discounts?",
        replies: [
          {
            toolCalls: [{ name: "read", arguments: { path: "README.md" } }],
          },
          {
            text: [
              "Yes. The README lists `src/discount.ts` as the module that ",
              "applies discount codes.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fixture-session-checkout-bug",
    title: "Investigate failing checkout",
    kind: "main",
    roleId: "fixture-role-reviewer",
    turns: [
      {
        messageId: "fixture-message-checkout-1",
        prompt: "Checkout fails for some carts. Check the checkout module.",
        replies: [
          {
            text: ["Opening the checkout module."],
            toolCalls: [
              { name: "read", arguments: { path: "src/checkout.ts" } },
            ],
          },
          {
            text: [
              "There is no `src/checkout.ts` in this project. ",
              "Checkout totals come from `cartSubtotal`, defined in:\n\n",
              "`src/cart.ts`",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fixture-session-release-notes",
    title: "Draft release notes",
    kind: "main",
    turns: [
      {
        messageId: "fixture-message-release-1",
        prompt: "Draft release notes for 0.4.0.",
        replies: [{ text: [RELEASE_NOTES] }],
      },
    ],
  },
  {
    id: "fixture-session-checkout-audit",
    title: "Checkout audit log",
    kind: "main",
    turns: AUDIT_TURNS,
  },
  {
    id: "fixture-session-checkout-diagrams",
    title: "Checkout flow diagrams",
    kind: "main",
    turns: DIAGRAM_TURNS,
  },
  {
    id: "fixture-session-old-spike",
    title: "Spike: gift cards",
    kind: "main",
    archived: true,
    turns: [
      {
        messageId: "fixture-message-spike-1",
        prompt: "Sketch how gift cards could reuse discount codes.",
        replies: [
          {
            text: [
              "Gift cards could be discount codes with a balance that ",
              "decreases on each use.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fixture-session-chat",
    title: "Debounce vs throttle",
    kind: "chat",
    turns: [
      {
        messageId: "fixture-message-chat-1",
        prompt: "What is the difference between debounce and throttle?",
        replies: [
          {
            text: [
              "**Debounce** waits until calls stop for a quiet period. ",
              "**Throttle** runs at most once per interval while calls continue.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "fixture-session-cents",
    title: "Store cart totals in cents",
    kind: "main",
    turns: [],
    interruptedTurn: {
      messageId: "fixture-message-cents-1",
      prompt: "Store cart totals as integer cents.",
      queued: {
        messageId: "fixture-message-cents-2",
        prompt: "Then update the release notes.",
      },
    },
  },
];

export const FIXTURE_NOTES: FixtureNote[] = [
  {
    key: "roadmap",
    title: "Acme Shop roadmap",
    inWorkspace: true,
    bodyMarkdown: `# Acme Shop roadmap

## Now
- Percentage discount codes
- Checkout error messages

## Next
- Gift cards
- Saved carts

> Dates are placeholders for the fixture.
`,
  },
  {
    key: "checkout-spec",
    parentKey: "roadmap",
    title: "Checkout spec",
    inWorkspace: true,
    bodyMarkdown: `# Checkout spec

1. Show the subtotal from \`cartSubtotal\`.
2. Apply at most one discount code.
3. Never charge less than zero.

- [x] Fixed amount codes
- [ ] Percentage codes

| Code | Discount | Status |
| --- | --- | --- |
| \`SPRING10\` | 10% off | Live |
| \`FIVEOFF\` | 5 off | Draft |
`,
  },
  {
    key: "discount-math",
    title: "Discount math",
    inWorkspace: true,
    bodyMarkdown: `Percentage codes round down to whole cents.

\`\`\`ts
export function applyDiscount(totalCents: number, percent: number) {
  const off = Math.floor((totalCents * percent) / 100);
  return Math.max(0, totalCents - off);
}
\`\`\`
`,
  },
  {
    key: "scratch",
    title: "Scratchpad",
    bodyMarkdown: "Ideas that are not tied to a workspace.\n",
  },
];

export const FIXTURE_DECKS: FixtureDeck[] = [
  {
    title: "Checkout review",
    inWorkspace: true,
    markdown: `# Checkout review

Acme Shop, Q1 demo

---

## Discount codes

- Fixed amount codes are live
- Percentage codes are in review
  - \`SPRING10\` takes 10% off
- Totals never drop below zero

Notes: Mention that the zero floor came from support tickets.

---

## Before and after

### Before
- One code per cart
- Errors without context

### After
- Clear error messages
- Codes validated on entry

---

## Rollout

| Code | Discount | Status |
| --- | --- | --- |
| \`SPRING10\` | 10% off | Live |
| \`FIVEOFF\` | 5 off | Draft |

---

# Questions?
`,
  },
];

export const FIXTURE_ISSUES: FixtureIssue[] = [
  {
    title: "Support percentage discount codes",
    description: "Codes like SPRING10 should take 10% off the subtotal.",
    status: "review",
    priority: "high",
    labels: ["feature", "checkout"],
    comment: "Implementation is ready for review in the discounts session.",
    linkedSessionId: "fixture-session-discounts",
    image: {
      fixture: "doc-images/checkout-screenshot.png",
      name: "Checkout with a discount code",
    },
  },
  {
    title: "Checkout fails for some carts",
    description: "Reported from the storefront demo. Steps are unclear.",
    status: "doing",
    priority: "urgent",
    labels: ["bug", "checkout"],
    linkedSessionId: "fixture-session-checkout-bug",
  },
  {
    title: "Gift cards",
    description: "Explore gift cards as discount codes with a balance.",
    status: "backlog",
    priority: "low",
    labels: ["feature"],
  },
  {
    title: "Round cart subtotal to cents",
    description: "Floating point sums show long decimals.",
    status: "done",
    priority: "medium",
    labels: ["bug"],
  },
  {
    title: "Write 0.4.0 release notes",
    description: "",
    status: "backlog",
    priority: "none",
    labels: [],
  },
];
