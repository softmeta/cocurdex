import type { SavedHost } from "@cocurdex/client-runtime";

export function hostAddress(host: SavedHost) {
  return new URL(host.baseUrl).host;
}
