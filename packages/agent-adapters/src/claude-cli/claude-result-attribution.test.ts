import { describe, expect, it } from "vitest";
import { createClaudeResultAttribution } from "./claude-result-attribution";

describe("createClaudeResultAttribution", () => {
  it("keeps a user turn active after a resume handshake", () => {
    const attribution = createClaudeResultAttribution();

    attribution.beginUserTurn("turn-1");

    expect(
      attribution.classifyResult({
        isError: false,
        numTurns: 0,
        resultId: "resume-result",
      }),
    ).toEqual({ kind: "resume-handshake" });
    expect(
      attribution.classifyResult({
        isError: false,
        numTurns: 1,
        resultId: "turn-result",
      }),
    ).toEqual({ kind: "user-turn", turnId: "turn-1" });
  });

  it("rejects duplicate and unattributed terminal results", () => {
    const attribution = createClaudeResultAttribution();

    expect(
      attribution.classifyResult({
        isError: false,
        numTurns: 1,
        resultId: "background-result",
      }),
    ).toEqual({ kind: "unattributed" });

    attribution.beginUserTurn("turn-1");
    expect(
      attribution.classifyResult({
        isError: false,
        numTurns: 1,
        resultId: "turn-result",
      }),
    ).toEqual({ kind: "user-turn", turnId: "turn-1" });
    expect(
      attribution.classifyResult({
        isError: false,
        numTurns: 1,
        resultId: "turn-result",
      }),
    ).toEqual({ kind: "duplicate" });
  });

  it("attributes a zero-turn error to the active user turn", () => {
    const attribution = createClaudeResultAttribution();

    attribution.beginUserTurn("turn-1");

    expect(
      attribution.classifyResult({
        isError: true,
        numTurns: 0,
        resultId: "failed-result",
      }),
    ).toEqual({ kind: "user-turn", turnId: "turn-1" });
  });

  it("does not attribute a result after the user turn is cancelled", () => {
    const attribution = createClaudeResultAttribution();

    attribution.beginUserTurn("turn-1");
    attribution.cancelUserTurn("turn-1");

    expect(
      attribution.classifyResult({
        isError: false,
        numTurns: 1,
        resultId: "late-result",
      }),
    ).toEqual({ kind: "unattributed" });
  });
});
