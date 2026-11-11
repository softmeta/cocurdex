interface CommandSummary {
  name: string;
  summary: string;
}

interface CommandCategory {
  title: string;
  commands: CommandSummary[];
}

export const COMMAND_CATEGORIES: CommandCategory[] = [
  {
    title: "Knowledge",
    commands: [
      { name: "note", summary: "Notes, PRDs, and specs" },
      { name: "issue", summary: "Issues, statuses, labels, and views" },
      { name: "deck", summary: "Slide decks: create, edit, export" },
      { name: "link", summary: "Links between sessions, notes, issues" },
      { name: "image", summary: "Images embedded in notes and issues" },
      { name: "search", summary: "Search notes and issues" },
      { name: "memory", summary: "Long-term memory and cloud sync" },
    ],
  },
  {
    title: "Sessions and agents",
    commands: [
      { name: "workspace", summary: "Registered workspaces" },
      { name: "session", summary: "Agent sessions: create, send, inspect" },
      { name: "worktree", summary: "Git worktrees for sessions" },
      { name: "team", summary: "Teammate agents under a lead session" },
      { name: "script-run", summary: "Scripted fan-out to subagents" },
      { name: "persona", summary: "Personal agents and their work" },
      { name: "routine", summary: "Scheduled persona routines" },
      { name: "inbox", summary: "Persona inbox and daily brief" },
      { name: "role", summary: "Agent roles" },
    ],
  },
  {
    title: "Setup",
    commands: [
      { name: "provider", summary: "Model providers and models" },
      { name: "agent", summary: "Agent CLI sign-in and updates" },
      { name: "mcp", summary: "MCP servers" },
      { name: "apps", summary: "Connected apps (Notion, Linear, GitHub)" },
      { name: "skills", summary: "Agent skills and the product skill pack" },
    ],
  },
  {
    title: "App and host",
    commands: [
      { name: "open", summary: "Open a folder in the desktop app" },
      { name: "daemon", summary: "Daemon status and background service" },
      { name: "diagnostics", summary: "Diagnostics export and log level" },
      { name: "web", summary: "Local web client URL" },
      { name: "host", summary: "Remote access, relay, paired devices" },
    ],
  },
];

const CONTINUATION_INDENT = "      ";
const MIN_WIDTH = 60;
const MAX_WIDTH = 100;

export function helpWidth(columns: number | undefined): number {
  if (!columns) return MAX_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, columns));
}

function commandOf(line: string): string | undefined {
  const match = /^ {2}cocurdex ([a-z][a-z-]*)/.exec(line);
  return match?.[1];
}

export function groupUsageLines(lines: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let current: string | undefined;
  for (const line of lines) {
    current = commandOf(line) ?? current;
    if (!current) continue;
    const group = groups.get(current) ?? [];
    group.push(line.trimStart());
    groups.set(current, group);
  }
  return groups;
}

function splitUsageAndNote(line: string): { usage: string; note?: string } {
  const match = /^(.*?\S)\s{3,}\(?([^()]+?)\)?$/.exec(line);
  if (!match?.[1] || !match[2]) {
    return { usage: line };
  }
  return { usage: match[1], note: match[2] };
}

const OPENERS = new Set(["[", "(", "<"]);
const CLOSERS = new Set(["]", ")", ">"]);

function usageTokens(text: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let depth = 0;
  for (const char of text) {
    if (OPENERS.has(char)) depth += 1;
    if (CLOSERS.has(char)) depth = Math.max(0, depth - 1);
    if (char === " " && depth === 0) {
      if (token) tokens.push(token);
      token = "";
      continue;
    }
    token += char;
  }
  if (token) tokens.push(token);
  return tokens;
}

export function wrapLine(text: string, width: number, indent: string) {
  const words = usageTokens(text);
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    const prefix = rows.length === 0 ? "" : indent;
    const candidate = row ? `${row} ${word}` : `${prefix}${word}`;
    if (row && candidate.length > width) {
      rows.push(row);
      row = `${indent}${word}`;
    } else {
      row = candidate;
    }
  }
  if (row) rows.push(row);
  return rows;
}

export function formatCommandHelp(
  command: string,
  lines: string[],
  width: number,
): string {
  const body = lines.flatMap((line) => {
    if (!line.startsWith("cocurdex ")) {
      return wrapLine(line, width - 2, "").map((row) => `  ${row}`);
    }
    const { usage, note } = splitUsageAndNote(line);
    const rows = wrapLine(usage, width - 2, CONTINUATION_INDENT).map(
      (row) => `  ${row}`,
    );
    if (note) {
      rows.push(
        ...wrapLine(note, width - 8, "").map(
          (row) => `  ${CONTINUATION_INDENT}${row}`,
        ),
      );
    }
    return rows;
  });
  return [`Usage: cocurdex ${command} <action> [options]`, "", ...body].join(
    "\n",
  );
}

function columnFor(lefts: string[]) {
  return Math.max(...lefts.map((left) => left.length)) + 3;
}

function padded(
  rows: Array<[string, string]>,
  column = columnFor(rows.map(([left]) => left)),
) {
  return rows.map(([left, right]) => `  ${left.padEnd(column)}${right}`);
}

export function formatOverview(version: string): string {
  const commandColumn = columnFor(
    COMMAND_CATEGORIES.flatMap((category) =>
      category.commands.map(({ name }) => name),
    ),
  );
  const sections = COMMAND_CATEGORIES.flatMap((category) => [
    "",
    `${category.title}:`,
    ...padded(
      category.commands.map(({ name, summary }) => [name, summary]),
      commandColumn,
    ),
  ]);
  return [
    `Cocurdex CLI ${version}`,
    "",
    "Usage:",
    ...padded([
      ["cocurdex [path]", "Open a folder in the desktop app (like code .)"],
      ["cocurdex <command> <action>", "Run a command"],
      ["cocurdex <command> --help", "Show a command's actions and flags"],
      ["cocurdex help --all", "Show every command's usage"],
    ]),
    ...sections,
    "",
    "Flags:",
    ...padded([
      ["--json", "Print machine-readable output (most commands)"],
      ["-h, --help", "Show help"],
      ["-v, --version", "Print the CLI version"],
    ]),
  ].join("\n");
}

export function formatFullHelp(lines: string[], width: number): string {
  const groups = groupUsageLines(lines);
  const ordered = [
    ...COMMAND_CATEGORIES.flatMap((category) =>
      category.commands.map(({ name }) => name),
    ),
    ...groups.keys(),
  ];
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const name of ordered) {
    const group = groups.get(name);
    if (!group || seen.has(name)) continue;
    seen.add(name);
    blocks.push(formatCommandHelp(name, group, width));
  }
  return blocks.join("\n\n");
}
