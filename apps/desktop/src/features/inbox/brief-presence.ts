import { type Brief, briefEntryAfterAway } from "@cocurdex/shared";

let entryPending = true;
let leftAt: number | null = null;

function leave() {
  leftAt ??= Date.now();
}

function comeBack() {
  if (leftAt === null) return;
  const awayMs = Date.now() - leftAt;
  leftAt = null;
  if (briefEntryAfterAway(awayMs)) entryPending = true;
}

if (typeof window !== "undefined") {
  window.addEventListener("blur", leave);
  window.addEventListener("focus", comeBack);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leave();
    else if (document.hasFocus()) comeBack();
  });
}

export function deliverBriefOnEntry(brief: Brief | null, deliver: () => void) {
  if (!entryPending) return;
  entryPending = false;
  if (brief) deliver();
}
