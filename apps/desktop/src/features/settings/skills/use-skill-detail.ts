import type { InstalledSkillDetail, SkillRef } from "@cocurdex/shared";
import { useRef, useState } from "react";
import { queryErrorMessage, useSkillDetailQuery } from "./skill-queries";

export function useSkillDetail(ref: SkillRef) {
  const query = useSkillDetailQuery(ref);
  const [actionError, setActionError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);

  const run = async (
    action: () => Promise<InstalledSkillDetail | null>,
  ): Promise<boolean> => {
    if (busyRef.current) {
      return false;
    }
    busyRef.current = true;
    setIsBusy(true);
    setActionError("");
    try {
      const next = await action();
      if (next) {
        await query.mutate(next, { revalidate: false });
      }
      return true;
    } catch (error) {
      setActionError(queryErrorMessage(error));
      return false;
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  return {
    detail: query.data ?? null,
    error: actionError || queryErrorMessage(query.error),
    isBusy,
    run,
  };
}
