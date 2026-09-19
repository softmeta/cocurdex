import type { BrowserAnnotation } from "@cocurdex/shared";
import type { ChatContextRequest } from "./chat-context-store";

export interface ChatWindowState {
  detached: boolean;
  transitioning: boolean;
}

export interface ChatWindowTransfer {
  id: string;
  snapshot: string;
}

export interface ChatWindowApi {
  addContext(request: ChatContextRequest): Promise<void>;
  getPendingContext(): Promise<ChatContextRequest[]>;
  acknowledgeContext(id: string): Promise<void>;
  onContextAvailable(listener: () => void): () => void;
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
