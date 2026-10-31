import { type EntityRef, parseEntityRef } from "@cocurdex/shared";

const NOTE_LINK_PREFIX = "note://";

export function entityLinkRef(url: string): EntityRef | null {
  const trimmed = url.trim();
  if (trimmed.startsWith(NOTE_LINK_PREFIX)) {
    return parseEntityRef(`note:${trimmed.slice(NOTE_LINK_PREFIX.length)}`);
  }
  return parseEntityRef(trimmed);
}

export function entityLinkHref(hostId: string, ref: EntityRef) {
  if (ref.kind === "issue") {
    return {
      pathname: "/issue/[hostId]/[issueId]",
      params: { hostId, issueId: ref.id },
    } as const;
  }
  if (ref.kind === "note") {
    return {
      pathname: "/note/[hostId]/[noteId]",
      params: { hostId, noteId: ref.id },
    } as const;
  }
  if (ref.kind === "session") {
    return {
      pathname: "/session/[hostId]/[sessionId]",
      params: { hostId, sessionId: ref.id },
    } as const;
  }
  return null;
}
