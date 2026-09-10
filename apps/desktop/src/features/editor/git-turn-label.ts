import type { TurnChangeSet } from "@cocurdex/shared";

export function turnListTitle(turn: TurnChangeSet, prompt: string): string {
  const text = prompt.replace(/\s+/g, " ").trim();
  if (text.length > 0) {
    return text;
  }
  const path = turn.files[0]?.path;
  if (!path) {
    return "";
  }
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}
