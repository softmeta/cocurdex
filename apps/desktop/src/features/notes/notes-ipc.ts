import type {
  CreateNotePayload,
  DeleteNotePayload,
  GetNotePayload,
  MoveNotePayload,
  NoteRecord,
  NoteSummary,
  RenameNotePayload,
  UpdateNotePayload,
} from "@cocurdex/shared";
import { desktopApi } from "@/lib";

export const notesIpc = {
  list: (): Promise<NoteSummary[]> => desktopApi.notesList(),
  get: (payload: GetNotePayload): Promise<NoteRecord | null> =>
    desktopApi.notesGet(payload),
  create: (payload: CreateNotePayload): Promise<NoteRecord> =>
    desktopApi.notesCreate(payload),
  update: (payload: UpdateNotePayload): Promise<NoteRecord> =>
    desktopApi.notesUpdate(payload),
  rename: (payload: RenameNotePayload): Promise<NoteRecord> =>
    desktopApi.notesRename(payload),
  move: (payload: MoveNotePayload): Promise<NoteRecord> =>
    desktopApi.notesMove(payload),
  delete: (payload: DeleteNotePayload): Promise<void> =>
    desktopApi.notesDelete(payload),
};
