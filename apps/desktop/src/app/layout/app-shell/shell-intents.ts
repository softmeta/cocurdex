import { useStore } from "jotai";
import {
  editorPanelOpenAtom,
  fileTreeVisibleAtom,
  openFilePreviewAtom,
  reviewGitTurnAtom,
} from "@/features/editor";
import { useChatWindowIntents } from "../chat-window";
import { rightPanelResolvedActiveViewAtom } from "../right-editor-panel-store";
import { bumpRightPanelRevealAtom } from "../right-panel-reveal";

// Shell-surface intent consumer mounted in the primary window. Chat features
// dispatch intents instead of writing panel atoms directly, so the same action
// works whether the chat surface lives in this window or the detached one.
export function useShellIntents() {
  const store = useStore();
  useChatWindowIntents((intent) => {
    switch (intent.kind) {
      case "open-file": {
        // The chat link already pointed at the file, so collapse the explorer
        // instead of letting it steal space alongside the opened file.
        store.set(fileTreeVisibleAtom, false);
        store.set(openFilePreviewAtom, {
          filePath: intent.filePath,
          startLine: intent.startLine ?? null,
          endLine: intent.endLine ?? null,
        });
        return true;
      }
      case "show-panel": {
        store.set(editorPanelOpenAtom, true);
        if (
          intent.view === "editor" ||
          intent.view === "pdf" ||
          intent.view === "browser"
        ) {
          store.set(bumpRightPanelRevealAtom, intent.view);
        } else {
          store.set(rightPanelResolvedActiveViewAtom, intent.view);
        }
        return true;
      }
      case "review-turn": {
        store.set(reviewGitTurnAtom, {
          sessionId: intent.sessionId,
          messageId: intent.messageId,
          path: intent.path,
        });
        store.set(editorPanelOpenAtom, true);
        store.set(rightPanelResolvedActiveViewAtom, "git");
        return true;
      }
      default:
        return false;
    }
  });
}
