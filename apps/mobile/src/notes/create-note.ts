import type { CreateNotePayload } from "@cocurdex/shared";
import { mutate } from "swr";
import { hostConnection } from "@/connection";
import { discardNoteWhenBlank } from "./editor/note-doc-sessions";

export async function createBlankNote(
  hostId: string,
  placement: Pick<CreateNotePayload, "parentId" | "workspaceId"> = {},
) {
  const note = await hostConnection(hostId).request("note.create", placement);
  discardNoteWhenBlank(hostId, note.id);
  void mutate(["note.list", hostId]);
  return note;
}
