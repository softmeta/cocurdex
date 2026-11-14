import type { Context } from "@earendil-works/chord/context";
import {
  defineExtension,
  GenerationTask,
  type HookApi,
  hook,
  LiveDoc,
  section,
  ToolResultEntry,
  ToolTask,
  UserEntry,
} from "@earendil-works/pi-durable";
import { renderPiWorkspaceRootsPrompt } from "../pi-sdk/pi-workspace-roots";
import { CocurdexRunDoc } from "./durable-docs";
import {
  renderProjectContextSection,
  renderSkillsSection,
  type WorkspaceResourceCache,
} from "./durable-resources";

const PI_CHAT_SYSTEM_PROMPT = [
  "You are a helpful assistant in a conversation with the user.",
  "Answer directly and accurately, and reply in the user's language.",
  "Ask a brief clarifying question when a request is ambiguous.",
  "",
  "Formatting rules:",
  "- Use $...$ for inline math and $$...$$ for block math.",
  "- Do not wrap math expressions in backticks.",
  "- Use fenced code blocks with a language for code.",
].join("\n");

const ASSISTANT_PREAMBLE =
  "You are an assistant running inside Cocurdex. You can inspect files, run commands, and edit files in your working directory with your tools, and use the Cocurdex tools you are offered.";

const RUN_ENTRY_PAGE = 200;

function userText(entry: { model?: readonly unknown[] }) {
  const message = entry.model?.[0] as { content?: unknown } | undefined;
  if (typeof message?.content === "string") return message.content;
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .map((part: { type?: string; text?: string }) =>
      part.type === "text" ? (part.text ?? "") : "",
    )
    .join("");
}

/** Whether the current run already called `tool` successfully, or was already reminded. */
async function runProgress(
  api: HookApi,
  tool: string,
  reminder: string,
  context: Context,
) {
  const live = await api.snapshot(LiveDoc, api.conversationId, context);
  const first = live?.run?.first;
  if (!first) return { reported: false, reminded: false };
  let reported = false;
  let reminded = false;
  let cursor: Parameters<HookApi["entries"]>[2];
  do {
    const page = await api.entries(
      { minEntryId: first },
      RUN_ENTRY_PAGE,
      cursor,
      context,
    );
    for (const entry of page.items) {
      if (ToolResultEntry.is(entry)) {
        const result = entry.model?.[0] as
          | { toolName?: string; isError?: boolean }
          | undefined;
        if (result?.toolName === tool && result.isError !== true) {
          reported = true;
        }
      } else if (UserEntry.is(entry) && userText(entry) === reminder) {
        reminded = true;
      }
    }
    cursor = page.next;
  } while (cursor !== undefined && !(reported && reminded));
  return { reported, reminded };
}

/** Run policy: blocks tools outside the allowed list and asks once for a required tool. */
const RunPolicy = defineExtension({
  name: "cocurdex-run-policy",
  hooks: [
    hook(ToolTask, {
      async beforeTool(call, api, context) {
        const run = await api.snapshot(
          CocurdexRunDoc,
          api.conversationId,
          context,
        );
        const allowed = run?.policy?.allowedTools;
        if (!allowed || allowed.includes(call.name)) return undefined;
        return { block: run.policy?.blockedToolReason ?? "Not allowed" };
      },
    }),
    hook(GenerationTask, {
      async onYield(_answer, api, context) {
        const run = await api.snapshot(
          CocurdexRunDoc,
          api.conversationId,
          context,
        );
        const required = run?.policy?.requiredTool;
        if (!required) return undefined;
        const progress = await runProgress(
          api,
          required.name,
          required.reminder,
          context,
        );
        if (progress.reported || progress.reminded) return undefined;
        return { continue: required.reminder };
      },
    }),
  ],
});

export function createAssistantExtension(resources: WorkspaceResourceCache) {
  return defineExtension({
    name: "cocurdex-assistant",
    sections: [
      section("preamble", () => ASSISTANT_PREAMBLE, { tag: false }),
      section("project_context", async (input) => {
        const cwd = input.env?.cwd;
        if (!cwd) return undefined;
        return renderProjectContextSection(
          (await resources.get(cwd)).contextFiles,
        );
      }),
      section("skills", async (input) => {
        const cwd = input.env?.cwd;
        if (!cwd) return undefined;
        return renderSkillsSection((await resources.get(cwd)).skills);
      }),
      section("workspace_roots", async (input, context) => {
        const run = await input.read.snapshot(
          CocurdexRunDoc,
          input.conversationId,
          context,
        );
        const cwd = input.env?.cwd;
        if (!cwd || !run) return undefined;
        return (
          renderPiWorkspaceRootsPrompt(cwd, run.workspaceRoots) ?? undefined
        );
      }),
      section("cwd", (input) => input.env?.cwd.replace(/\\/g, "/")),
      section(
        "cocurdex_sections",
        async (input, context) => {
          const run = await input.read.snapshot(
            CocurdexRunDoc,
            input.conversationId,
            context,
          );
          const entries = Object.entries(run?.sections ?? {}).filter(
            ([, text]) => text.trim(),
          );
          if (entries.length === 0) return undefined;
          return entries
            .map(([key, text]) => `<${key}>\n${text}\n</${key}>`)
            .join("\n\n");
        },
        { tag: false },
      ),
    ],
  });
}

export const ChatExtension = defineExtension({
  name: "cocurdex-chat",
  sections: [section("preamble", () => PI_CHAT_SYSTEM_PROMPT, { tag: false })],
});

export { RunPolicy };
