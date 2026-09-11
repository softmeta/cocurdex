import { describe, expect, it } from "vitest";
import {
  clearPaneConversations,
  clearPaneSessions,
  closePane,
  collapseToPane,
  createRootPane,
  findPane,
  findPaneIdBySessionId,
  listPanes,
  paneCount,
  ROOT_PANE_ID,
  revealPaneContent,
  setPaneBinding,
  setSplitSizes,
  splitPane,
} from "./session-split-tree";

function createIds(labels: string[]) {
  let index = 0;
  return () => {
    const label = labels[index];
    index += 1;
    return label ?? `id-${index}`;
  };
}

describe("session split tree", () => {
  it("starts as a single empty root pane", () => {
    const root = createRootPane();
    expect(paneCount(root)).toBe(1);
    expect(findPane(root, ROOT_PANE_ID)).toEqual({
      id: ROOT_PANE_ID,
      sessionId: null,
      conversationId: null,
    });
  });

  it("splits the focused pane to the right and keeps the original session", () => {
    const root = setPaneBinding(createRootPane(), ROOT_PANE_ID, {
      sessionId: "session-a",
    });
    const split = splitPane(root, ROOT_PANE_ID, "right", {
      createId: createIds(["pane-b", "split-1"]),
    });

    expect(split).not.toBeNull();
    expect(split?.newPaneId).toBe("pane-b");
    expect(paneCount(split?.root ?? createRootPane())).toBe(2);
    expect(
      findPane(split?.root ?? createRootPane(), ROOT_PANE_ID)?.sessionId,
    ).toBe("session-a");
    expect(findPane(split?.root ?? createRootPane(), "pane-b")).toEqual({
      id: "pane-b",
      sessionId: null,
      conversationId: null,
    });
    expect(split?.root.type).toBe("split");
    if (split?.root.type === "split") {
      expect(split.root.direction).toBe("right");
      expect(split.root.sizes).toEqual([50, 50]);
    }
  });

  it("splits down under an existing right split", () => {
    const first = splitPane(createRootPane(), ROOT_PANE_ID, "right", {
      createId: createIds(["pane-b", "split-1"]),
    });
    expect(first).not.toBeNull();
    const second = splitPane(
      first?.root ?? createRootPane(),
      "pane-b",
      "down",
      {
        createId: createIds(["pane-c", "split-2"]),
      },
    );

    expect(second).not.toBeNull();
    expect(
      listPanes(second?.root ?? createRootPane()).map((pane) => pane.id),
    ).toEqual([ROOT_PANE_ID, "pane-b", "pane-c"]);
  });

  it("keeps splitting after four panes", () => {
    let root = createRootPane();
    let nextId = 0;
    const createId = () => {
      nextId += 1;
      return `id-${nextId}`;
    };
    for (let index = 0; index < 5; index += 1) {
      const split = splitPane(root, ROOT_PANE_ID, "right", { createId });
      expect(split).not.toBeNull();
      root = split?.root ?? root;
    }
    expect(paneCount(root)).toBe(6);
  });

  it("closes a pane and returns the sibling as successor", () => {
    const split = splitPane(createRootPane(), ROOT_PANE_ID, "right", {
      createId: createIds(["pane-b", "split-1"]),
    });
    expect(split).not.toBeNull();
    const closed = closePane(split?.root ?? createRootPane(), "pane-b");
    expect(closed).not.toBeNull();
    expect(closed?.root).toEqual(createRootPane());
    expect(closed?.successor.id).toBe(ROOT_PANE_ID);
  });

  it("cannot close the last pane", () => {
    expect(closePane(createRootPane(), ROOT_PANE_ID)).toBeNull();
  });

  it("collapses splits to a single root pane keeping the chosen binding", () => {
    const split = splitPane(
      setPaneBinding(createRootPane(), ROOT_PANE_ID, {
        sessionId: "session-a",
      }),
      ROOT_PANE_ID,
      "right",
      { createId: createIds(["pane-b", "split-1"]) },
    );
    const withSecond = setPaneBinding(
      split?.root ?? createRootPane(),
      "pane-b",
      {
        conversationId: "conversation-b",
      },
    );

    const collapsed = collapseToPane(withSecond, "pane-b");
    expect(collapsed).toEqual(
      createRootPane({
        sessionId: null,
        conversationId: "conversation-b",
      }),
    );
  });

  it("does not collapse when the pane is missing or already alone", () => {
    const root = setPaneBinding(createRootPane(), ROOT_PANE_ID, {
      sessionId: "session-a",
    });
    expect(collapseToPane(root, ROOT_PANE_ID)).toBe(root);
    expect(collapseToPane(root, "missing")).toBeNull();
  });

  it("finds a pane that already shows a session", () => {
    const root = setPaneBinding(createRootPane(), ROOT_PANE_ID, {
      sessionId: "session-a",
    });
    expect(findPaneIdBySessionId(root, "session-a")).toBe(ROOT_PANE_ID);
    expect(findPaneIdBySessionId(root, "missing")).toBeNull();
  });

  it("clears removed sessions without dropping the pane", () => {
    const split = splitPane(
      setPaneBinding(createRootPane(), ROOT_PANE_ID, {
        sessionId: "session-a",
      }),
      ROOT_PANE_ID,
      "right",
      { createId: createIds(["pane-b", "split-1"]) },
    );
    const withSecond = setPaneBinding(
      split?.root ?? createRootPane(),
      "pane-b",
      {
        sessionId: "session-b",
      },
    );
    const cleared = clearPaneSessions(withSecond, new Set(["session-b"]));
    expect(findPane(cleared, ROOT_PANE_ID)?.sessionId).toBe("session-a");
    expect(findPane(cleared, "pane-b")?.sessionId).toBeNull();
  });

  it("updates split sizes by split id", () => {
    const split = splitPane(createRootPane(), ROOT_PANE_ID, "down", {
      createId: createIds(["pane-b", "split-1"]),
    });
    expect(split?.root.type).toBe("split");
    if (split?.root.type !== "split") {
      return;
    }
    const resized = setSplitSizes(split.root, "split-1", [30, 70]);
    expect(resized.type).toBe("split");
    if (resized.type === "split") {
      expect(resized.sizes).toEqual([30, 70]);
    }
  });

  it("binds content onto the target pane when nothing else shows it", () => {
    const split = splitPane(createRootPane(), ROOT_PANE_ID, "right", {
      createId: createIds(["pane-b", "split-1"]),
    });
    const revealed = revealPaneContent(
      split?.root ?? createRootPane(),
      "pane-b",
      {
        sessionId: "session-a",
        conversationId: null,
      },
    );

    expect(revealed.focusedPaneId).toBe("pane-b");
    expect(findPane(revealed.root, "pane-b")?.sessionId).toBe("session-a");
    expect(findPane(revealed.root, ROOT_PANE_ID)?.sessionId).toBeNull();
  });

  it("focuses the pane that already shows a session instead of duplicating it", () => {
    const split = splitPane(
      setPaneBinding(createRootPane(), ROOT_PANE_ID, {
        sessionId: "session-a",
      }),
      ROOT_PANE_ID,
      "right",
      { createId: createIds(["pane-b", "split-1"]) },
    );
    const revealed = revealPaneContent(
      split?.root ?? createRootPane(),
      "pane-b",
      {
        sessionId: "session-a",
        conversationId: null,
      },
    );

    expect(revealed.focusedPaneId).toBe(ROOT_PANE_ID);
    expect(
      listPanes(revealed.root).filter((pane) => pane.sessionId === "session-a"),
    ).toHaveLength(1);
    expect(findPane(revealed.root, "pane-b")?.sessionId).toBeNull();
  });

  it("focuses the pane that already shows a conversation instead of duplicating it", () => {
    const split = splitPane(
      setPaneBinding(createRootPane(), ROOT_PANE_ID, {
        conversationId: "conversation-a",
      }),
      ROOT_PANE_ID,
      "right",
      { createId: createIds(["pane-b", "split-1"]) },
    );
    const revealed = revealPaneContent(
      split?.root ?? createRootPane(),
      "pane-b",
      {
        sessionId: null,
        conversationId: "conversation-a",
      },
    );

    expect(revealed.focusedPaneId).toBe(ROOT_PANE_ID);
    expect(findPane(revealed.root, "pane-b")?.conversationId).toBeNull();
  });

  it("clears removed conversations without dropping the pane", () => {
    const root = setPaneBinding(createRootPane(), ROOT_PANE_ID, {
      conversationId: "conversation-a",
    });
    const cleared = clearPaneConversations(root, new Set(["conversation-a"]));
    expect(findPane(cleared, ROOT_PANE_ID)).toEqual({
      id: ROOT_PANE_ID,
      sessionId: null,
      conversationId: null,
    });
  });
});
