import {
  ENTITY_URI_PREFIX,
  type EntityRef,
  parseEntityRef,
} from "@cocurdex/shared";
import { BrowserWindow } from "electron";

export const DEEP_LINK_SCHEME = ENTITY_URI_PREFIX.slice(0, -"://".length);
export const ENTITY_OPEN_REQUESTED_CHANNEL = "entity:openRequested";

let pendingEntity: EntityRef | null = null;

export function entityRefFromDeepLink(url: string): EntityRef | null {
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith(ENTITY_URI_PREFIX)) return null;
  return parseEntityRef(
    ENTITY_URI_PREFIX + trimmed.slice(ENTITY_URI_PREFIX.length),
  );
}

export function entityRefFromArgv(argv: readonly string[]): EntityRef | null {
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    const ref = entityRefFromDeepLink(argv[index] ?? "");
    if (ref) return ref;
  }
  return null;
}

export function requestEntityOpen(ref: EntityRef): void {
  pendingEntity = ref;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(ENTITY_OPEN_REQUESTED_CHANNEL);
    }
  }
}

export function consumePendingEntityOpen(): EntityRef | null {
  const ref = pendingEntity;
  pendingEntity = null;
  return ref;
}
