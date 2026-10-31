import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readImageInfo } from "@cocurdex/deck/image-info";
import type { DeckImage } from "@cocurdex/shared";
import {
  type ContentAddressedStore,
  createContentAddressedStore,
} from "../content-addressed-store";

export const MAX_DECK_IMAGE_BYTES = 20 * 1024 * 1024;
const UNUSED_IMAGE_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export function getDeckAssetsRoot(userDataPath: string) {
  return path.join(userDataPath, "deck-assets");
}

export class DeckAssetStore {
  constructor(private readonly store: ContentAddressedStore) {}

  static open(userDataPath: string) {
    return new DeckAssetStore(
      createContentAddressedStore(getDeckAssetsRoot(userDataPath), {
        maxFileBytes: MAX_DECK_IMAGE_BYTES,
      }),
    );
  }

  async importFile(filePath: string): Promise<DeckImage> {
    if (!path.isAbsolute(filePath)) {
      throw new Error("Image path must be absolute");
    }
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) throw new Error(`Image not found: ${filePath}`);
    if (info.size > MAX_DECK_IMAGE_BYTES) {
      throw new Error("Image is larger than 20 MB");
    }
    const image = await this.putImage(await readFile(filePath));
    if (!image) throw new Error("Only PNG and JPEG images are supported");
    return image;
  }

  async putImage(bytes: Buffer): Promise<DeckImage | null> {
    if (bytes.length > MAX_DECK_IMAGE_BYTES) return null;
    const image = readImageInfo(bytes);
    if (!image) return null;
    const stored = await this.store.put(bytes);
    if (!stored.stored) throw new Error("Image could not be stored");
    return { hash: stored.hash, ...image };
  }

  async load(hash: string): Promise<Buffer> {
    const bytes = await this.store.get(hash);
    if (!bytes) throw new Error(`Deck image not found: ${hash}`);
    return bytes;
  }

  locate(hash: string) {
    return this.store.locate(hash);
  }

  async requireAll(hashes: Iterable<string>) {
    for (const hash of new Set(hashes)) {
      if (!(await this.store.locate(hash))) {
        throw new Error(
          `Deck image not found: ${hash}; import it with deck.importImage first`,
        );
      }
    }
  }

  collectUnused(keep: Set<string>) {
    return this.store.gc(keep, { minAgeMs: UNUSED_IMAGE_MIN_AGE_MS });
  }
}
