import type { BrowserAnnotation } from "@cocurdex/shared";
import type { ChatContextInput } from "./chat-context-store";

export interface ChatWindowState {
  detached: boolean;
  transitioning: boolean;
}

export interface ChatWindowTransfer {
  id: string;
  snapshot: string;
}

// Logical surfaces an intent addresses — never a physical window. The shell
// surface (editor, side panels, navigation) always lives in the primary
// window; the chat surface lives in whichever window currently owns the chat
// UI (the primary window while attached, the detached chat window otherwise).
// Routing surface → window happens in the main process, so an intent follows
// its surface across detach/reattach and queues while no window owns it.
export type ChatWindowSurface = "shell" | "chat";

// Mirrors RightPanelView in app/layout/right-editor-panel-store — kept as a
// literal union here so the wire contract does not depend on the shell layout
// module (which in turn imports feature code).
export type ChatWindowPanelView =
  | "editor"
  | "notes"
  | "issues"
  | "git"
  | "browser"
  | "pdf"
  | "terminal";

export type ChatWindowIntent =
  | { kind: "composer-input"; input: ChatContextInput }
  | {
      kind: "open-file";
      filePath: string;
      startLine?: number | null;
      endLine?: number | null;
    }
  | { kind: "show-panel"; view: ChatWindowPanelView }
  | { kind: "review-turn"; sessionId: string; messageId: string; path: string };

export interface ChatWindowIntentRequest {
  id: string;
  surface: ChatWindowSurface;
  intent: ChatWindowIntent;
}

export interface ChatWindowApi {
  dispatchIntent(request: {
    id?: string;
    surface: ChatWindowSurface;
    intent: ChatWindowIntent;
  }): Promise<void>;
  getPendingIntents(): Promise<ChatWindowIntentRequest[]>;
  acknowledgeIntent(id: string): Promise<void>;
  onIntentAvailable(listener: () => void): () => void;
  setBrowserContext(annotations: BrowserAnnotation[]): Promise<void>;
  getBrowserContext(): Promise<BrowserAnnotation[]>;
  onBrowserContext(
    listener: (annotations: BrowserAnnotation[]) => void,
  ): () => void;
  detach(snapshot: string): Promise<void>;
  reattach(snapshot: string): Promise<void>;
  bootstrap(): Promise<ChatWindowTransfer | null>;
  ready(id: string): Promise<void>;
  checkpoint(snapshot: string): Promise<void>;
  focus(): Promise<void>;
  toggleVisibility(): Promise<void>;
  getState(): Promise<ChatWindowState>;
  onState(listener: (state: ChatWindowState) => void): () => void;
  onTransfer(listener: (transfer: ChatWindowTransfer) => void): () => void;
}
