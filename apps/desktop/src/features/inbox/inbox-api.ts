import { requestDaemon } from "@/lib";

export const inboxApi = {
  list: () => requestDaemon("inbox.list"),
  read: (id: string) => requestDaemon("inbox.read", { id }),
  brief: (timeZone: string) => requestDaemon("inbox.brief", { timeZone }),
  postBrief: (payload: { updatedAt: string; day: string; content: string }) =>
    requestDaemon("inbox.postBrief", payload),
};
