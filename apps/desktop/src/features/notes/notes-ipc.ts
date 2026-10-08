import type {
  ApplyNoteDocUpdatePayload,
  CreateNotePayload,
  DeleteNotePayload,
  GetNoteDocPayload,
  GetNotePayload,
  MoveNotePayload,
  NoteDocSnapshot,
  NoteRecord,
  NoteSummary,
  UpdateNotePayload,
} from "@cocurdex/shared";
import { desktopApi } from "@/lib";

export const notesIpc = {
  list: (): Promise<NoteSummary[]> => desktopApi.notesList(),
  get: (payload: GetNotePayload): Promise<NoteRecord | null> =>
    desktopApi.notesGet(payload),
  getDoc: (payload: GetNoteDocPayload): Promise<NoteDocSnapshot | null> =>
    desktopApi.notesGetDoc(payload),
  applyDocUpdate: (payload: ApplyNoteDocUpdatePayload): Promise<NoteRecord> =>
    desktopApi.notesApplyDocUpdate(payload),
  create: (payload: CreateNotePayload): Promise<NoteRecord> =>
    desktopApi.notesCreate(payload),
  update: (payload: UpdateNotePayload): Promise<NoteRecord> =>
    desktopApi.notesUpdate(payload),
  move: (payload: MoveNotePayload): Promise<NoteRecord> =>
    desktopApi.notesMove(payload),
  delete: (payload: DeleteNotePayload): Promise<void> =>
    desktopApi.notesDelete(payload),
};
