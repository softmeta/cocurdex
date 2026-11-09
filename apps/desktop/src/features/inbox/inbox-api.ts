import type { SupportedLocale } from "@cocurdex/shared";
import { requestDaemon } from "@/lib";

export const inboxApi = {
  list: () => requestDaemon("inbox.list"),
  brief: (timeZone: string) => requestDaemon("inbox.brief", { timeZone }),
  postBrief: (timeZone: string, locale: SupportedLocale | null) =>
    requestDaemon("inbox.postBrief", { timeZone, locale }),
};
