import type { MessageRecord } from "@cocurdex/shared/internal/contracts";
import {
  delegationReportOutcome,
  renderDelegatedWorkReport,
} from "@cocurdex/shared/internal/delegated-work";
import { foldDelegationReports } from "@cocurdex/shared/internal/delegation-transcript";
import { describe, expect, it } from "vitest";

function message(overrides: Partial<MessageRecord>): MessageRecord {
  return {
    id: "m",
    sessionId: "home",
    role: "user",
    content: "text",
    attachments: [],
    createdAt: "2026-11-12T00:00:00.000Z",
    ...overrides,
  };
}

const report = (id: string, sessionId = "work-1") =>
  message({
    id,
    origin: {
      kind: "delegation",
      sessionId,
      sessionTitle: `Work ${sessionId}`,
      outcome: "ready",
    },
  });

describe("foldDelegationReports", () => {
  it("hides reports answered by an assistant reply and credits the reply", () => {
    const fold = foldDelegationReports(
      [
        message({ id: "ask" }),
        report("r1", "work-1"),
        report("r2", "work-2"),
        message({ id: "thinking", role: "assistant", kind: "reasoning" }),
        message({ id: "reply", role: "assistant", kind: "response" }),
      ],
      { personal: true },
    );
    expect([...fold.hiddenMessageIds]).toEqual(["r1", "r2"]);
    expect(fold.sourcesByReplyId.get("reply")?.map((s) => s.sessionId)).toEqual(
      ["work-1", "work-2"],
    );
    expect(fold.sourcesByReplyId.has("thinking")).toBe(false);
    expect(fold.pendingByMessageId.size).toBe(0);
  });

  it("keeps an unanswered report as a pending status", () => {
    const fold = foldDelegationReports(
      [message({ id: "reply", role: "assistant" }), report("r1")],
      { personal: true },
    );
    expect(fold.hiddenMessageIds.size).toBe(0);
    expect(fold.pendingByMessageId.get("r1")).toMatchObject({
      sessionId: "work-1",
      outcome: "ready",
    });
  });

  it("folds legacy peer reports only in an assistant's thread", () => {
    const messages = [
      message({
        id: "peer",
        origin: { kind: "peer", sessionId: "work-1", sessionTitle: "Fix" },
      }),
      message({ id: "reply", role: "assistant" }),
    ];
    expect(
      foldDelegationReports(messages, { personal: true }).hiddenMessageIds,
    ).toEqual(new Set(["peer"]));
    expect(
      foldDelegationReports(messages, { personal: false }).hiddenMessageIds
        .size,
    ).toBe(0);
  });
});

describe("delegation reports", () => {
  it("does not wake the assistant for a dropped turn", () => {
    const dropped = {
      status: "dropped" as const,
      summary: "x",
      question: null,
    };
    expect(delegationReportOutcome("completed", dropped)).toBeNull();
    expect(delegationReportOutcome("cancelled", dropped)).toBe("cancelled");
    expect(delegationReportOutcome("completed", null)).toBe("finished");
  });

  it("sends the summary instead of the reply when the worker reported", () => {
    const content = renderDelegatedWorkReport({
      title: "Fix",
      sessionId: "work-1",
      outcome: "needs_you",
      error: null,
      report: {
        status: "needs_you",
        summary: "Two fixes possible",
        question: "Keep the old flag?",
      },
      reply: "long transcript",
      readMore: null,
    });
    expect(content).toContain("Summary: Two fixes possible");
    expect(content).toContain("Question for the user: Keep the old flag?");
    expect(content).not.toContain("long transcript");
  });

  it("shortens a long reply and says where to read the rest", () => {
    const content = renderDelegatedWorkReport({
      title: "Fix",
      sessionId: "work-1",
      outcome: "finished",
      error: null,
      report: null,
      reply: "x".repeat(10_000),
      readMore: "Read it with history_read.",
    });
    expect(content.length).toBeLessThan(7_000);
    expect(content).toContain("[Reply shortened. Read it with history_read.]");
  });
});
