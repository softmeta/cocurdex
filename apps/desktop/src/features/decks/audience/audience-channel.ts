import type { DeckContent } from "@cocurdex/shared";

export type PresenterMessage =
  | { type: "show"; content: DeckContent; index: number }
  | { type: "end" };

export type AudienceMessage =
  | { type: "ready" }
  | { type: "navigate"; index: number }
  | { type: "closed" };

const CHANNEL_PREFIX = "cocurdex-deck-audience:";

export function audienceChannelName(channel: string): string {
  return `${CHANNEL_PREFIX}${channel}`;
}

export function audienceChannelFromLocation(search: string): string | null {
  return new URLSearchParams(search).get("channel");
}
