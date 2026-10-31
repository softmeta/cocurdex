import type {
  ApplyNoteDocUpdatePayload,
  CreateNotePayload,
  DeleteNotePayload,
  GetNoteDocPayload,
  GetNotePayload,
  MoveNotePayload,
  UpdateNotePayload,
} from "@cocurdex/shared";
import { requestDaemon } from "@/lib";

export const notesApi = {
  list: () => requestDaemon("note.list"),
  get: (payload: GetNotePayload) => requestDaemon("note.get", payload),
  getDoc: (payload: GetNoteDocPayload) => requestDaemon("note.getDoc", payload),
  applyDocUpdate: (payload: ApplyNoteDocUpdatePayload) =>
    requestDaemon("note.applyDocUpdate", payload),
  create: (payload: CreateNotePayload) => requestDaemon("note.create", payload),
  update: (payload: UpdateNotePayload) => requestDaemon("note.update", payload),
  move: (payload: MoveNotePayload) => requestDaemon("note.move", payload),
  delete: async (payload: DeleteNotePayload) => {
    await requestDaemon("note.delete", payload);
  },
};
