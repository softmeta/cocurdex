export const ROOT_PANE_ID = "session-pane-root";

export type SessionSplitDirection = "right" | "down";

export interface SessionPaneBinding {
  id: string;
  sessionId: string | null;
  conversationId: string | null;
}

export type SessionSplitNode =
  | { type: "pane"; pane: SessionPaneBinding }
  | {
      type: "split";
      id: string;
      direction: SessionSplitDirection;
      sizes: [number, number];
      first: SessionSplitNode;
      second: SessionSplitNode;
    };

export function createRootPane(
  content?: Pick<SessionPaneBinding, "sessionId" | "conversationId">,
): SessionSplitNode {
  return {
    type: "pane",
    pane: {
      id: ROOT_PANE_ID,
      sessionId: content?.sessionId ?? null,
      conversationId: content?.conversationId ?? null,
    },
  };
}

export function listPanes(node: SessionSplitNode): SessionPaneBinding[] {
  if (node.type === "pane") {
    return [node.pane];
  }
  return [...listPanes(node.first), ...listPanes(node.second)];
}

export function paneCount(node: SessionSplitNode): number {
  return listPanes(node).length;
}

export function findPane(
  node: SessionSplitNode,
  paneId: string,
): SessionPaneBinding | null {
  if (node.type === "pane") {
    return node.pane.id === paneId ? node.pane : null;
  }
  return findPane(node.first, paneId) ?? findPane(node.second, paneId);
}

export function firstPane(node: SessionSplitNode): SessionPaneBinding {
  if (node.type === "pane") {
    return node.pane;
  }
  return firstPane(node.first);
}

export function findPaneIdBySessionId(
  node: SessionSplitNode,
  sessionId: string,
): string | null {
  for (const pane of listPanes(node)) {
    if (pane.sessionId === sessionId) {
      return pane.id;
    }
  }
  return null;
}

export function findPaneIdByConversationId(
  node: SessionSplitNode,
  conversationId: string,
): string | null {
  for (const pane of listPanes(node)) {
    if (pane.conversationId === conversationId) {
      return pane.id;
    }
  }
  return null;
}

export function setPaneBinding(
  node: SessionSplitNode,
  paneId: string,
  binding: Partial<Pick<SessionPaneBinding, "sessionId" | "conversationId">>,
): SessionSplitNode {
  if (node.type === "pane") {
    if (node.pane.id !== paneId) {
      return node;
    }
    return {
      type: "pane",
      pane: {
        ...node.pane,
        ...binding,
      },
    };
  }
  const first = setPaneBinding(node.first, paneId, binding);
  const second = setPaneBinding(node.second, paneId, binding);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

export function setSplitSizes(
  node: SessionSplitNode,
  splitId: string,
  sizes: [number, number],
): SessionSplitNode {
  if (node.type === "pane") {
    return node;
  }
  if (node.id === splitId) {
    return { ...node, sizes };
  }
  const first = setSplitSizes(node.first, splitId, sizes);
  const second = setSplitSizes(node.second, splitId, sizes);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

export function clearPaneSessions(
  node: SessionSplitNode,
  sessionIds: ReadonlySet<string>,
): SessionSplitNode {
  if (node.type === "pane") {
    if (!node.pane.sessionId || !sessionIds.has(node.pane.sessionId)) {
      return node;
    }
    return {
      type: "pane",
      pane: { ...node.pane, sessionId: null },
    };
  }
  const first = clearPaneSessions(node.first, sessionIds);
  const second = clearPaneSessions(node.second, sessionIds);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

export function clearPaneConversations(
  node: SessionSplitNode,
  conversationIds: ReadonlySet<string>,
): SessionSplitNode {
  if (node.type === "pane") {
    if (
      !node.pane.conversationId ||
      !conversationIds.has(node.pane.conversationId)
    ) {
      return node;
    }
    return {
      type: "pane",
      pane: { ...node.pane, conversationId: null },
    };
  }
  const first = clearPaneConversations(node.first, conversationIds);
  const second = clearPaneConversations(node.second, conversationIds);
  if (first === node.first && second === node.second) {
    return node;
  }
  return { ...node, first, second };
}

export function revealPaneContent(
  node: SessionSplitNode,
  paneId: string,
  binding: Pick<SessionPaneBinding, "sessionId" | "conversationId">,
): { root: SessionSplitNode; focusedPaneId: string } | null {
  if (binding.sessionId) {
    const existing = findPaneIdBySessionId(node, binding.sessionId);
    if (existing) {
      return { root: node, focusedPaneId: existing };
    }
  } else if (binding.conversationId) {
    const existing = findPaneIdByConversationId(node, binding.conversationId);
    if (existing) {
      return { root: node, focusedPaneId: existing };
    }
  }
  if (!findPane(node, paneId)) {
    return null;
  }
  return {
    root: setPaneBinding(node, paneId, binding),
    focusedPaneId: paneId,
  };
}

export function splitPane(
  node: SessionSplitNode,
  paneId: string,
  direction: SessionSplitDirection,
  options?: { createId?: () => string },
): { root: SessionSplitNode; newPaneId: string } | null {
  if (!findPane(node, paneId)) {
    return null;
  }
  const createId = options?.createId ?? (() => crypto.randomUUID());
  const newPaneId = createId();
  const splitId = createId();
  const next = replacePaneWithSplit(
    node,
    paneId,
    direction,
    splitId,
    newPaneId,
  );
  return { root: next, newPaneId };
}

export function collapseToPane(
  node: SessionSplitNode,
  paneId: string,
): SessionSplitNode | null {
  const pane = findPane(node, paneId);
  if (!pane) {
    return null;
  }
  if (node.type === "pane") {
    return node;
  }
  return createRootPane({
    sessionId: pane.sessionId,
    conversationId: pane.conversationId,
  });
}

export function closePane(
  node: SessionSplitNode,
  paneId: string,
): { root: SessionSplitNode; successor: SessionPaneBinding } | null {
  if (node.type === "pane") {
    return null;
  }
  if (node.first.type === "pane" && node.first.pane.id === paneId) {
    return { root: node.second, successor: firstPane(node.second) };
  }
  if (node.second.type === "pane" && node.second.pane.id === paneId) {
    return { root: node.first, successor: firstPane(node.first) };
  }
  const closedFirst = closePane(node.first, paneId);
  if (closedFirst) {
    return {
      root: { ...node, first: closedFirst.root },
      successor: closedFirst.successor,
    };
  }
  const closedSecond = closePane(node.second, paneId);
  if (closedSecond) {
    return {
      root: { ...node, second: closedSecond.root },
      successor: closedSecond.successor,
    };
  }
  return null;
}

function replacePaneWithSplit(
  node: SessionSplitNode,
  paneId: string,
  direction: SessionSplitDirection,
  splitId: string,
  newPaneId: string,
): SessionSplitNode {
  if (node.type === "pane") {
    if (node.pane.id !== paneId) {
      return node;
    }
    return {
      type: "split",
      id: splitId,
      direction,
      sizes: [50, 50],
      first: node,
      second: {
        type: "pane",
        pane: {
          id: newPaneId,
          sessionId: null,
          conversationId: null,
        },
      },
    };
  }
  return {
    ...node,
    first: replacePaneWithSplit(
      node.first,
      paneId,
      direction,
      splitId,
      newPaneId,
    ),
    second: replacePaneWithSplit(
      node.second,
      paneId,
      direction,
      splitId,
      newPaneId,
    ),
  };
}
