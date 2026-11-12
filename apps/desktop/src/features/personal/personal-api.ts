import {
  type CreatePersonalAgentPayload,
  type DuplicatePersonalAgentPayload,
  isSupportedLocale,
  type UpdatePersonalAgentPayload,
} from "@cocurdex/shared";
import i18n from "i18next";
import { requestDaemon } from "@/lib";

function uiLocale() {
  return isSupportedLocale(i18n.language) ? i18n.language : null;
}

export const personalApi = {
  list: () => requestDaemon("personalAgent.list"),
  draft: () => requestDaemon("personalAgent.draft", { locale: uiLocale() }),
  create: (payload: CreatePersonalAgentPayload) =>
    requestDaemon("personalAgent.create", payload),
  greet: (id: string) =>
    requestDaemon("personalAgent.greet", { id, locale: uiLocale() }),
  update: (payload: UpdatePersonalAgentPayload) =>
    requestDaemon("personalAgent.update", payload),
  duplicate: (payload: DuplicatePersonalAgentPayload) =>
    requestDaemon("personalAgent.duplicate", payload),
  remove: (id: string) => requestDaemon("personalAgent.delete", { id }),
};
