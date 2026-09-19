import type {
  SessionSplitDirection,
  SessionSplitNode,
} from "./session-split-tree";

export const MIN_SESSION_PANE_WIDTH_PX = 375;
export const MIN_SESSION_PANE_HEIGHT_PX = 320;
export const SESSION_SPLIT_SEPARATOR_PX = 1;

export interface SessionPaneSize {
  width: number;
  height: number;
}

export function minSessionPaneSize(node: SessionSplitNode): SessionPaneSize {
  if (node.type === "pane") {
    return {
      width: MIN_SESSION_PANE_WIDTH_PX,
      height: MIN_SESSION_PANE_HEIGHT_PX,
    };
  }
  const first = minSessionPaneSize(node.first);
  const second = minSessionPaneSize(node.second);
  if (node.direction === "down") {
    return {
      width: Math.max(first.width, second.width),
      height: first.height + second.height + SESSION_SPLIT_SEPARATOR_PX,
    };
  }
  return {
    width: first.width + second.width + SESSION_SPLIT_SEPARATOR_PX,
    height: Math.max(first.height, second.height),
  };
}

export function canSplitPane(
  paneSize: SessionPaneSize | undefined,
  direction: SessionSplitDirection,
): boolean {
  if (paneSize === undefined) {
    return true;
  }
  if (direction === "down") {
    return (
      paneSize.height >=
      MIN_SESSION_PANE_HEIGHT_PX * 2 + SESSION_SPLIT_SEPARATOR_PX
    );
  }
  return (
    paneSize.width >= MIN_SESSION_PANE_WIDTH_PX * 2 + SESSION_SPLIT_SEPARATOR_PX
  );
}
