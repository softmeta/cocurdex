import type {
  CreateDeckDownloadPayload,
  CreateDeckPayload,
  DeleteDeckPayload,
  EditDeckPayload,
  GetDeckPayload,
  ImportDeckImagePayload,
  ImportDeckPayload,
  UpdateDeckPayload,
} from "@cocurdex/shared";
import { requestDaemon } from "@/lib";

export const decksApi = {
  list: () => requestDaemon("deck.list"),
  get: (payload: GetDeckPayload) => requestDaemon("deck.get", payload),
  create: (payload: CreateDeckPayload) => requestDaemon("deck.create", payload),
  update: (payload: UpdateDeckPayload) => requestDaemon("deck.update", payload),
  edit: (payload: EditDeckPayload) => requestDaemon("deck.edit", payload),
  delete: async (payload: DeleteDeckPayload) => {
    await requestDaemon("deck.delete", payload);
  },
  createDownload: (payload: CreateDeckDownloadPayload) =>
    requestDaemon("deck.createDownload", payload),
  importImage: (payload: ImportDeckImagePayload) =>
    requestDaemon("deck.importImage", payload),
  importPptx: (payload: ImportDeckPayload) =>
    requestDaemon("deck.import", payload),
};
