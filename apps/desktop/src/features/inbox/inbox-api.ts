import { requestDaemon } from "@/lib";

export const inboxApi = {
  list: () => requestDaemon("inbox.list"),
  read: (id: string) => requestDaemon("inbox.read", { id }),
};
