import type {
  SkillLibraryList,
  SkillUpdateCheckResult,
} from "@cocurdex/shared";
import { useState } from "react";
import useSWR from "swr";
import { DAEMON_READ_OPTIONS, queryErrorMessage } from "./skill-queries";
import { skillsApi } from "./skills-api";

export interface SkillLibraryState {
  library: SkillLibraryList | null;
  loadError: string;
  isChecking: boolean;
  lastCheck: SkillUpdateCheckResult | null;
  refresh(): Promise<void>;
  checkUpdates(): Promise<void>;
}

export function useSkillLibrary(workspaceId: string | null): SkillLibraryState {
  const query = useSWR(
    ["skills.list", workspaceId],
    () => skillsApi.list(workspaceId),
    DAEMON_READ_OPTIONS,
  );
  const [checkError, setCheckError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<SkillUpdateCheckResult | null>(
    null,
  );

  const refresh = async () => {
    await query.mutate();
  };

  const checkUpdates = async () => {
    setIsChecking(true);
    setCheckError("");
    try {
      setLastCheck(await skillsApi.checkUpdates(workspaceId));
      await refresh();
    } catch (error) {
      setCheckError(queryErrorMessage(error));
    } finally {
      setIsChecking(false);
    }
  };

  return {
    library: query.data ?? null,
    loadError: checkError || queryErrorMessage(query.error),
    isChecking,
    lastCheck,
    refresh,
    checkUpdates,
  };
}
