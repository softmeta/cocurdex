import {
  type DelegationReportFold,
  foldDelegationReports,
  type MessageRecord,
} from "@cocurdex/shared";
import { createContext, useMemo } from "react";

const EMPTY_FOLD: DelegationReportFold = {
  hiddenMessageIds: new Set(),
  sourcesByReplyId: new Map(),
  pendingByMessageId: new Map(),
};

export const DelegationFoldContext =
  createContext<DelegationReportFold>(EMPTY_FOLD);

export function useDelegationFold(
  messages: MessageRecord[],
  assistant: boolean,
) {
  return useMemo(() => {
    if (!assistant) return { fold: EMPTY_FOLD, visibleMessages: messages };
    const fold = foldDelegationReports(messages, { personal: true });
    const visibleMessages =
      fold.hiddenMessageIds.size === 0
        ? messages
        : messages.filter((message) => !fold.hiddenMessageIds.has(message.id));
    return { fold, visibleMessages };
  }, [assistant, messages]);
}
