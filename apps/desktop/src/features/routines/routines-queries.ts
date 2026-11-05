import type { RoutineRecord, RoutineRunRecord } from "@cocurdex/shared";
import useSWR, { mutate } from "swr";
import { desktopApi, useMountEffect } from "@/lib";
import { routinesApi } from "./routines-api";

const NO_ROUTINES: RoutineRecord[] = [];
const NO_RUNS: RoutineRunRecord[] = [];

function isRoutineKey(key: unknown) {
  return (
    key === "routine.list" || (Array.isArray(key) && key[0] === "routine.runs")
  );
}

export function revalidateRoutines() {
  return mutate(isRoutineKey);
}

function useRoutineChanges() {
  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (event.areas.includes("routines")) void revalidateRoutines();
    }),
  );
}

export function useRoutines() {
  const { data } = useSWR("routine.list", routinesApi.list, {
    dedupingInterval: 0,
  });
  useRoutineChanges();
  return { routines: data ?? NO_ROUTINES, loaded: data !== undefined };
}

export function useRoutineRuns(routineId: string | null) {
  const { data } = useSWR(
    routineId ? ["routine.runs", routineId] : null,
    () => (routineId ? routinesApi.runs(routineId) : NO_RUNS),
    { dedupingInterval: 0 },
  );
  return data ?? NO_RUNS;
}
