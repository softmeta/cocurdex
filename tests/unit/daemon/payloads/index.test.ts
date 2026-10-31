import path from "node:path";
import { parseDaemonRequest } from "@cocurdex/daemon/internal/payloads/index";
import type { DaemonMethod, DaemonRequest } from "@cocurdex/rpc";
import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve("/workspace/repo");

function request<M extends DaemonMethod>(method: M, params: unknown) {
  return { id: "1", method, params, token: "test" } as DaemonRequest<M>;
}

function parse<M extends DaemonMethod>(method: M, params: unknown) {
  return () => parseDaemonRequest(request(method, params));
}

describe("parseDaemonRequest", () => {
  it("keeps git file operations inside the workspace", () => {
    expect(
      parse("git.stageFiles", {
        rootPath: workspaceRoot,
        filePaths: ["src/index.ts"],
      }),
    ).not.toThrow();
    expect(
      parse("git.stageFiles", {
        rootPath: workspaceRoot,
        filePaths: ["../outside.txt"],
      }),
    ).toThrow(/Invalid git\.stageFiles payload/);
    expect(
      parse("git.discardFiles", {
        rootPath: workspaceRoot,
        filePaths: [path.resolve("/etc/passwd")],
      }),
    ).toThrow(/Invalid git\.discardFiles payload/);
    expect(parse("git.status", { rootPath: "relative/repo" })).toThrow(
      /Invalid git\.status payload/,
    );
  });

  it("rejects option-like branch names", () => {
    expect(
      parse("git.checkoutBranch", {
        rootPath: workspaceRoot,
        branch: "--orphan",
      }),
    ).toThrow(/option-like branch/);
  });

  it("rejects unknown agents", () => {
    expect(parse("agent.login", { agentId: "rm -rf" })).toThrow(
      /unknown agent/,
    );
    expect(parse("agent.login", { agentId: "codex" })).not.toThrow();
    expect(parse("acpRegistry.uninstall", { agentId: "codex" })).toThrow(
      /not a registry agent/,
    );
  });

  it("accepts issue identifiers and label names the CLI passes", () => {
    expect(
      parse("issue.get", { id: "COC-12", viewId: "project" }),
    ).not.toThrow();
    expect(parse("issue.deleteLabel", { id: "bug" })).not.toThrow();
    expect(parse("issue.get", { id: "" })).toThrow(/Invalid issue\.get/);
  });

  describe("provider-minted request ids", () => {
    const devinToolCallId =
      "call_1f058c81523341fe8833b328#47d6d5e5cdff43fd81380990458824d7";
    const cursorToolCallId =
      "call-2b8ed068-77e4-4be6-b234-07a445e8315b-11\nfc_39066401-957d-9733-8e74-4d8b0515686b_3";

    it.each([devinToolCallId, cursorToolCallId])(
      "accepts %j on every resolve method",
      (id) => {
        expect(
          parse("permission.resolve", { requestId: id, optionId: "allow" }),
        ).not.toThrow();
        expect(
          parse("question.resolve", { questionId: id, answer: "yes" }),
        ).not.toThrow();
        expect(
          parse("planApproval.resolve", {
            approvalId: id,
            decision: { outcome: "approved" },
          }),
        ).not.toThrow();
      },
    );

    it.each(["", "call\u0000x", "bad\rid"])("rejects %j", (id) => {
      expect(
        parse("permission.resolve", { requestId: id, optionId: "allow" }),
      ).toThrow(/Invalid permission\.resolve payload/);
    });

    it("keeps session ids restricted", () => {
      expect(
        parse("session.stop", { sessionId: "call_example|fc_example" }),
      ).toThrow(/Invalid session\.stop payload/);
    });
  });

  it("returns normalized params", () => {
    expect(
      parseDaemonRequest(request("issue.createLabel", { name: "  bug  " })),
    ).toMatchObject({ params: { name: "bug" } });
  });

  it("passes methods without a schema through unchanged", () => {
    const original = request("workflow.start", { workflowRunId: "run-1" });
    expect(parseDaemonRequest(original)).toBe(original);
  });
  it("bounds terminal sessions to absolute directories and sane sizes", () => {
    const spawn = {
      terminalId: "terminal-1",
      workspaceId: "ws-1",
      cwd: workspaceRoot,
      cols: 80,
      rows: 24,
    };
    expect(parse("terminal.spawn", spawn)).not.toThrow();
    expect(parse("terminal.spawn", { ...spawn, cwd: "relative" })).toThrow(
      /Invalid terminal\.spawn payload/,
    );
    expect(parse("terminal.spawn", { ...spawn, cols: 0 })).toThrow();
    expect(parse("terminal.spawn", { ...spawn, rows: 5000 })).toThrow();
    expect(
      parse("terminal.spawn", { ...spawn, workspaceId: "../escape" }),
    ).toThrow();
    expect(
      parse("terminal.resize", { terminalId: "t", cols: 80.5, rows: 24 }),
    ).toThrow();
    expect(parse("terminal.kill", {})).toThrow();
  });

  it("accepts terminal input up to the paste cap", () => {
    expect(
      parse("terminal.write", { terminalId: "t", data: "echo 你好\n" }),
    ).not.toThrow();
    expect(
      parse("terminal.write", { terminalId: "t", data: "x".repeat(1_000_001) }),
    ).toThrow(/Invalid terminal\.write payload/);
  });
});
