export interface ClaudeTerminalResult {
  resultId: string | null;
  numTurns: number | null;
  isError: boolean;
}

export type ClaudeResultDisposition =
  | { kind: "duplicate" }
  | { kind: "resume-handshake" }
  | { kind: "unattributed" }
  | { kind: "user-turn"; turnId: string };

const MAX_REMEMBERED_RESULT_IDS = 256;

export function createClaudeResultAttribution() {
  let activeTurnId: string | null = null;
  const resultIds: string[] = [];
  const seenResultIds = new Set<string>();

  function rememberResultId(resultId: string | null) {
    if (!resultId) {
      return false;
    }
    if (seenResultIds.has(resultId)) {
      return true;
    }

    resultIds.push(resultId);
    seenResultIds.add(resultId);
    if (resultIds.length > MAX_REMEMBERED_RESULT_IDS) {
      const expiredResultId = resultIds.shift();
      if (expiredResultId) {
        seenResultIds.delete(expiredResultId);
      }
    }
    return false;
  }

  return {
    beginUserTurn(turnId: string) {
      activeTurnId = turnId;
    },
    cancelUserTurn(turnId?: string) {
      if (turnId && activeTurnId !== turnId) {
        return;
      }
      activeTurnId = null;
    },
    classifyResult(result: ClaudeTerminalResult): ClaudeResultDisposition {
      if (rememberResultId(result.resultId)) {
        return { kind: "duplicate" };
      }
      if (!activeTurnId) {
        return { kind: "unattributed" };
      }
      if (!result.isError && result.numTurns === 0) {
        return { kind: "resume-handshake" };
      }

      const turnId = activeTurnId;
      activeTurnId = null;
      return { kind: "user-turn", turnId };
    },
  };
}
