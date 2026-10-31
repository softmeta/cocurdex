import { atom } from "jotai";
import { permissionsBySessionAtom } from "@/features/agent/permission";
import { questionsBySessionAtom } from "@/features/agent/question";

export const pendingRequestSessionIdsAtom = atom((get) => {
  const ids = new Set<string>();
  for (const [sessionId, permissions] of Object.entries(
    get(permissionsBySessionAtom),
  )) {
    if (permissions.some((permission) => permission.status === "pending")) {
      ids.add(sessionId);
    }
  }
  for (const [sessionId, questions] of Object.entries(
    get(questionsBySessionAtom),
  )) {
    if (questions.some((question) => question.status === "pending")) {
      ids.add(sessionId);
    }
  }
  return ids;
});
