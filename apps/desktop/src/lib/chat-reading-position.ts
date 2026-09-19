export interface ChatReadingPosition {
  atBottom: boolean;
  messageId: string | null;
  scrollTop: number;
  anchorId?: string;
  anchorFraction?: number;
}

const readers = new Map<string, () => ChatReadingPosition | null>();
let pending: Record<string, ChatReadingPosition> = {};

export function registerChatReader(
  key: string,
  read: () => ChatReadingPosition | null,
) {
  readers.set(key, read);
  return () => {
    if (readers.get(key) === read) readers.delete(key);
  };
}

export function captureChatReadingPositions() {
  const positions: Record<string, ChatReadingPosition> = { ...pending };
  for (const [key, read] of readers) {
    const position = read();
    if (position) positions[key] = position;
  }
  return positions;
}

export function setChatReadingPositions(
  positions: Record<string, ChatReadingPosition>,
) {
  pending = positions;
}

export function takeChatReadingPosition(key: string) {
  const position = pending[key];
  delete pending[key];
  return position;
}
