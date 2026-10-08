export interface NoteDocSessionHandle {
  pull: () => Promise<void>;
  flush: () => Promise<void>;
}

const sessions = new Map<string, NoteDocSessionHandle>();
const closing = new Map<string, Promise<void>>();

export function registerNoteDocSession(
  noteId: string,
  session: NoteDocSessionHandle,
): () => void {
  sessions.set(noteId, session);
  return () => {
    if (sessions.get(noteId) !== session) {
      return;
    }
    sessions.delete(noteId);
    const flushed = session.flush().finally(() => {
      if (closing.get(noteId) === flushed) {
        closing.delete(noteId);
      }
    });
    closing.set(noteId, flushed);
  };
}

export async function pullNoteDoc(noteId: string): Promise<void> {
  await sessions.get(noteId)?.pull();
}

export async function flushNoteDoc(noteId: string): Promise<void> {
  await Promise.all([sessions.get(noteId)?.flush(), closing.get(noteId)]);
}
