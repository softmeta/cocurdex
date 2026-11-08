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

export type ChatWindowSurface = "shell" | "chat";

export type ChatWindowPanelView =
  | "editor"
  | "notes"
  | "decks"
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
  | { kind: "run-terminal-command"; command: string }
  | { kind: "review-turn"; sessionId: string; messageId: string; path: string }
  | { kind: "send-browser-annotations"; annotations: BrowserAnnotation[] }
  | { kind: "remove-browser-annotations"; ids: string[] };

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
