import { useAtomValue, useSetAtom } from "jotai";
import {
  type MutableRefObject,
  type ReactNode,
  type Ref,
  useCallback,
  useRef,
} from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui";
import { conversationsAtom } from "@/features/chat";
import type { ChatComposerHandle } from "@/features/composer";
import {
  type SessionPaneBinding,
  type SessionSplitNode,
  sessionSplitLayoutAtom,
  sessionsAtom,
  setSessionSplitSizesAtom,
} from "@/features/sessions";
import { CenterPanel } from "../center-panel";
import { SessionPaneHeader } from "./session-pane-header";
import { sessionPaneTitle } from "./session-pane-title";
import { useSessionSplitActions } from "./use-session-split-actions";

function assignComposerRef(
  ref: Ref<ChatComposerHandle> | undefined,
  value: ChatComposerHandle | null,
) {
  if (!ref) {
    return;
  }
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as MutableRefObject<ChatComposerHandle | null>).current = value;
}

function SessionPaneFrame({
  children,
  onActivate,
}: {
  children: ReactNode;
  onActivate(): void;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer down focuses this pane
    <div
      className="flex h-full min-h-0 min-w-0 flex-col"
      onMouseDown={onActivate}
    >
      {children}
    </div>
  );
}

interface SessionSplitLayoutProps {
  composerRef?: Ref<ChatComposerHandle>;
  hideTitlebarSpacer?: boolean;
  /** Set when the surrounding shell renders the pane header for a lone pane. */
  hideSinglePaneHeader?: boolean;
  headerEndInset?: number;
  headerStartInset?: number;
}

export function SessionSplitLayout({
  composerRef,
  hideTitlebarSpacer = false,
  hideSinglePaneHeader = false,
  headerEndInset = 0,
  headerStartInset = 0,
}: SessionSplitLayoutProps) {
  const layout = useAtomValue(sessionSplitLayoutAtom);
  const sessions = useAtomValue(sessionsAtom);
  const conversations = useAtomValue(conversationsAtom);
  const setSplitSizes = useSetAtom(setSessionSplitSizesAtom);
  const {
    closeAllPanes,
    closePane,
    focusedPaneId,
    focusSessionPane,
    paneCount,
    splitPaneById,
  } = useSessionSplitActions();
  const composerByPaneRef = useRef(
    new Map<string, ChatComposerHandle | null>(),
  );
  const showPaneHeader = !(hideSinglePaneHeader && paneCount === 1);

  const handleClose = useCallback(
    (paneId: string) => {
      const nextFocused = closePane(paneId);
      if (!nextFocused) {
        return;
      }
      assignComposerRef(
        composerRef,
        composerByPaneRef.current.get(nextFocused.id) ?? null,
      );
    },
    [closePane, composerRef],
  );

  const handleCloseAll = useCallback(
    (paneId: string) => {
      const kept = closeAllPanes(paneId);
      if (!kept) {
        return;
      }
      assignComposerRef(
        composerRef,
        composerByPaneRef.current.get(paneId) ?? null,
      );
    },
    [closeAllPanes, composerRef],
  );

  const handleActivate = useCallback(
    (pane: SessionPaneBinding) => {
      if (pane.id === focusedPaneId) {
        return;
      }
      focusSessionPane(pane.id);
      assignComposerRef(
        composerRef,
        composerByPaneRef.current.get(pane.id) ?? null,
      );
    },
    [composerRef, focusedPaneId, focusSessionPane],
  );

  const renderNode = (
    node: SessionSplitNode,
    occupiesTitlebar: boolean,
    touchesEnd = true,
    touchesStart = true,
  ): ReactNode => {
    if (node.type === "split") {
      const firstId = `${node.id}-a`;
      const secondId = `${node.id}-b`;
      return (
        <ResizablePanelGroup
          className="h-full min-h-0"
          defaultLayout={{
            [firstId]: node.sizes[0],
            [secondId]: node.sizes[1],
          }}
          id={node.id}
          onLayoutChanged={(nextLayout) => {
            const firstSize = nextLayout[firstId];
            const secondSize = nextLayout[secondId];
            if (
              typeof firstSize === "number" &&
              typeof secondSize === "number"
            ) {
              setSplitSizes({
                splitId: node.id,
                sizes: [firstSize, secondSize],
              });
            }
          }}
          orientation={node.direction === "right" ? "horizontal" : "vertical"}
        >
          <ResizablePanel
            className="min-h-0 min-w-0"
            defaultSize={node.sizes[0]}
            id={firstId}
            minSize={15}
          >
            {renderNode(
              node.first,
              occupiesTitlebar,
              touchesEnd && node.direction !== "right",
              touchesStart,
            )}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel
            className="min-h-0 min-w-0"
            defaultSize={node.sizes[1]}
            id={secondId}
            minSize={15}
          >
            {renderNode(
              node.second,
              occupiesTitlebar && node.direction === "right",
              touchesEnd,
              touchesStart && node.direction !== "right",
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      );
    }

    const isFocused = node.pane.id === focusedPaneId;
    return (
      <SessionPaneFrame onActivate={() => handleActivate(node.pane)}>
        {showPaneHeader ? (
          <SessionPaneHeader
            endInset={occupiesTitlebar && touchesEnd ? headerEndInset : 0}
            startInset={
              occupiesTitlebar && !hideTitlebarSpacer && touchesStart
                ? headerStartInset
                : 0
            }
            canClose={paneCount > 1}
            isFocused={isFocused}
            occupiesTitlebar={occupiesTitlebar && !hideTitlebarSpacer}
            title={sessionPaneTitle(node.pane, conversations, sessions)}
            onClose={() => handleClose(node.pane.id)}
            onCloseAll={() => handleCloseAll(node.pane.id)}
            onSplitDown={() => splitPaneById(node.pane.id, "down")}
            onSplitRight={() => splitPaneById(node.pane.id, "right")}
          />
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">
          <CenterPanel
            composerRef={(handle) => {
              composerByPaneRef.current.set(node.pane.id, handle);
              if (node.pane.id === focusedPaneId) {
                assignComposerRef(composerRef, handle);
              }
            }}
            hideTitlebarSpacer
            isFocused={isFocused}
            pane={node.pane}
          />
        </div>
      </SessionPaneFrame>
    );
  };

  return (
    <div className="h-full min-h-0 min-w-0">{renderNode(layout, true)}</div>
  );
}
