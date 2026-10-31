export const LINKABLE_ENTITY_KINDS = [
  "session",
  "note",
  "issue",
  "deck",
] as const;

export type LinkableEntityKind = (typeof LINKABLE_ENTITY_KINDS)[number];

export interface EntityRef {
  kind: LinkableEntityKind;
  id: string;
}

export const ENTITY_URI_PREFIX = "cocurdex://";

export type EntityLinkRelation =
  | "related"
  | "mentions"
  | "mentioned-by"
  | "blocks"
  | "blocked-by"
  | "duplicate-of"
  | "duplicated-by"
  | "parent"
  | "child"
  | "worked-on-by"
  | "works-on";

export interface EntityLink {
  target: EntityRef;
  title: string;
  detail: string | null;
  relation: EntityLinkRelation;
  removable: boolean;
}

export interface EntityLinkCandidate {
  target: EntityRef;
  title: string;
  detail: string | null;
}

export interface ListEntityLinksPayload {
  ref: EntityRef;
}

export interface EntityLinkPayload {
  source: EntityRef;
  target: EntityRef;
}

export function isLinkableEntityKind(
  value: unknown,
): value is LinkableEntityKind {
  return LINKABLE_ENTITY_KINDS.includes(value as LinkableEntityKind);
}

export function entityUri(ref: EntityRef): string {
  return `${ENTITY_URI_PREFIX}${ref.kind}/${encodeURIComponent(ref.id)}`;
}

function decodeId(raw: string): string | null {
  if (raw.includes("/")) return null;
  try {
    const id = decodeURIComponent(raw).trim();
    return id || null;
  } catch {
    return null;
  }
}

export function parseEntityRef(value: string): EntityRef | null {
  const trimmed = value.trim();
  const body = trimmed.startsWith(ENTITY_URI_PREFIX)
    ? trimmed.slice(ENTITY_URI_PREFIX.length).replace("/", ":")
    : trimmed;
  const separator = body.indexOf(":");
  if (separator <= 0) return null;
  const kind = body.slice(0, separator);
  const id = decodeId(body.slice(separator + 1));
  if (!isLinkableEntityKind(kind) || !id) return null;
  return { kind, id };
}

export function sameEntity(a: EntityRef, b: EntityRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}
