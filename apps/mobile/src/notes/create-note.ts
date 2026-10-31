import { mutate } from "swr";
import { hostConnection } from "@/connection";
import { discardNoteWhenBlank } from "./editor/note-doc-sessions";

export async function createBlankNote(hostId: string) {
  const note = await hostConnection(hostId).request("note.create", {});
  discardNoteWhenBlank(hostId, note.id);
  void mutate(["note.list", hostId]);
  return note;
}
