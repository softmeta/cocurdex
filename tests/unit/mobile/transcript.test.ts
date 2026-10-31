import {
  buildTranscript,
  pendingInteraction,
} from "@cocurdex/mobile/internal/session-detail/transcript";
import type {
  AgentToolCallRecord,
  ImageAttachment,
  MessageRecord,
  SessionInteractionSnapshot,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function message(
  id: string,
  seq: number,
  role: MessageRecord["role"],
  content: string,
  extra: Partial<MessageRecord> = {},
): MessageRecord {
  return {
    id,
    sessionId: "s1",
    role,
    content,
    attachments: [],
    createdAt: `2026-10-24T10:00:0${seq}.000Z`,
    seq,
    ...extra,
  };
}

function tool(
  id: string,
  seq: number,
  status: AgentToolCallRecord["status"],
): AgentToolCallRecord {
  return {
    id,
    sessionId: "s1",
    title: `Read src/${id}.ts`,
    status,
    content: [],
    locations: [],
    startedAt: `2026-10-24T10:00:0${seq}.000Z`,
    updatedAt: `2026-10-24T10:00:0${seq}.000Z`,
    seq,
  };
}

describe("buildTranscript", () => {
  it("keeps a user message that carries only images", () => {
    const photo: ImageAttachment = {
      kind: "image",
      id: "img-1",
      name: "receipt.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      filePath: "/data/image-attachments/img-1.png",
      width: 300,
      height: 200,
    };
    const items = buildTranscript({
      messages: [
        message("u1", 1, "user", "", {
          attachments: [photo, { kind: "context-folder", folderPath: "/w" }],
        }),
      ],
      activeMessages: [],
      toolCalls: [],
      workspacePath: null,
    });

    expect(items).toEqual([
      { kind: "user", id: "u1", text: "", images: [photo] },
    ]);
  });

  it("interleaves messages and tool calls in journal order", () => {
    const items = buildTranscript({
      messages: [
        message("u1", 1, "user", "Add discount codes"),
        message("a1", 3, "assistant", "Done."),
      ],
      activeMessages: [],
      toolCalls: [tool("cart", 2, "completed")],
      workspacePath: null,
    });

    expect(items).toEqual([
      { kind: "user", id: "u1", text: "Add discount codes", images: [] },
      {
        kind: "tool",
        id: "cart",
        title: "Read src/cart.ts",
        detail: null,
        status: "completed",
      },
      { kind: "assistant", id: "a1", text: "Done.", streaming: false },
    ]);
  });

  it("names a tool by its action and workspace-relative target", () => {
    const items = buildTranscript({
      messages: [],
      activeMessages: [],
      toolCalls: [
        {
          ...tool("read", 1, "completed"),
          title: "read",
          rawInput: { path: "/work/acme-shop/src/cart.ts" },
        },
        {
          ...tool("bash", 2, "failed"),
          title: "bash",
          rawInput: { command: "pnpm   test" },
        },
      ],
      workspacePath: "/work/acme-shop",
    });

    expect(items).toMatchObject([
      { title: "Read", detail: "src/cart.ts", status: "completed" },
      { title: "Bash", detail: "pnpm test", status: "failed" },
    ]);
  });

  it("hides reasoning, system, and blank messages", () => {
    const items = buildTranscript({
      messages: [
        message("r1", 1, "assistant", "thinking", { kind: "reasoning" }),
        message("sys", 2, "system", "Session started"),
        message("blank", 3, "assistant", "  "),
        message("a1", 4, "assistant", "Answer"),
      ],
      activeMessages: [],
      toolCalls: [],
      workspacePath: null,
    });

    expect(items.map((item) => item.id)).toEqual(["a1"]);
  });

  it("appends streaming messages once, after finished ones", () => {
    const items = buildTranscript({
      messages: [message("u1", 1, "user", "Go")],
      activeMessages: [
        message("a2", 5, "assistant", "Writing the tests"),
        message("u1", 1, "user", "Go"),
      ],
      toolCalls: [],
      workspacePath: null,
    });

    expect(items).toEqual([
      { kind: "user", id: "u1", text: "Go", images: [] },
      {
        kind: "assistant",
        id: "a2",
        text: "Writing the tests",
        streaming: true,
      },
    ]);
  });
});

describe("pendingInteraction", () => {
  const empty: SessionInteractionSnapshot = {
    permissions: [],
    questions: [],
    planApprovals: [],
  };

  it("returns nothing when every request is resolved", () => {
    expect(
      pendingInteraction({
        ...empty,
        questions: [
          {
            id: "q1",
            sessionId: "s1",
            providerId: "claude-agent",
            question: "Keep member prices?",
            status: "answered",
            createdAt: "2026-10-24T10:00:00.000Z",
            updatedAt: "2026-10-24T10:00:00.000Z",
          },
        ],
      }),
    ).toBeNull();
  });

  it("returns the oldest pending request across kinds", () => {
    const pending = pendingInteraction({
      permissions: [
        {
          id: "p1",
          sessionId: "s1",
          providerId: "claude-agent",
          kind: "execute",
          title: "pnpm test",
          locations: [],
          options: [],
          status: "pending",
          createdAt: "2026-10-24T10:00:05.000Z",
          updatedAt: "2026-10-24T10:00:05.000Z",
        },
      ],
      questions: [],
      planApprovals: [
        {
          id: "plan1",
          sessionId: "s1",
          providerId: "claude-agent",
          planContent: "1. Write tests",
          source: "inline",
          status: "pending",
          createdAt: "2026-10-24T10:00:02.000Z",
          updatedAt: "2026-10-24T10:00:02.000Z",
        },
      ],
    });

    expect(pending).toMatchObject({ kind: "plan", record: { id: "plan1" } });
  });
});
