import type {
  CreateRoutinePayload,
  UpdateRoutinePayload,
} from "@cocurdex/shared";
import { requestDaemon } from "@/lib";

export const routinesApi = {
  list: () => requestDaemon("routine.list", {}),
  runs: (routineId: string) =>
    requestDaemon("routine.runs", { routineId, limit: 20 }),
  create: (payload: CreateRoutinePayload) =>
    requestDaemon("routine.create", payload),
  update: (payload: UpdateRoutinePayload) =>
    requestDaemon("routine.update", payload),
  run: (id: string) => requestDaemon("routine.run", { id }),
  remove: (id: string) => requestDaemon("routine.delete", { id }),
};
