import type { KeyValueStorage } from "@cocurdex/client-runtime";

export interface ChunkStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  deleteItem(key: string): void;
}

export const MAX_CHUNK_LENGTH = 600;

interface ChunkHead {
  generation: number;
  count: number;
}

function readHead(raw: string | null): ChunkHead | null {
  const match = raw ? /^(\d+):(\d+)$/.exec(raw) : null;
  if (!match) return null;
  return { generation: Number(match[1]), count: Number(match[2]) };
}

function chunkKey(key: string, generation: number, index: number) {
  return `${key}.${generation}.${index}`;
}

function isHighSurrogate(code: number) {
  return code >= 0xd800 && code <= 0xdbff;
}

export function splitChunks(value: string, maxLength = MAX_CHUNK_LENGTH) {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + maxLength, value.length);
    if (end < value.length && isHighSurrogate(value.charCodeAt(end - 1))) {
      end -= 1;
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

export function createChunkedStorage(
  store: ChunkStore,
  maxLength = MAX_CHUNK_LENGTH,
): KeyValueStorage {
  return {
    getItem(key) {
      const head = readHead(store.getItem(key));
      if (!head) return null;
      const chunks: string[] = [];
      for (let index = 0; index < head.count; index += 1) {
        const chunk = store.getItem(chunkKey(key, head.generation, index));
        if (chunk === null) return null;
        chunks.push(chunk);
      }
      return chunks.join("");
    },
    setItem(key, value) {
      const previous = readHead(store.getItem(key));
      const generation = (previous?.generation ?? 0) + 1;
      const chunks = splitChunks(value, maxLength);
      chunks.forEach((chunk, index) => {
        store.setItem(chunkKey(key, generation, index), chunk);
      });
      store.setItem(key, `${generation}:${chunks.length}`);
      if (!previous) return;
      for (let index = 0; index < previous.count; index += 1) {
        store.deleteItem(chunkKey(key, previous.generation, index));
      }
    },
  };
}
