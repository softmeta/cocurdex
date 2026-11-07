import type {
  ApplicationConnection,
  UpdateApplicationPayload,
} from "@cocurdex/shared";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { requestDaemon } from "@/lib";

export type ApplicationChanges = Partial<
  Omit<UpdateApplicationPayload, "id" | "revision">
>;

function toPayload(
  base: ApplicationConnection,
  changes: ApplicationChanges,
): UpdateApplicationPayload {
  return {
    id: base.id,
    revision: base.revision,
    displayName: base.displayName,
    allPersonas: base.allPersonas,
    personaIds: base.personaIds,
    allowDelegatedWork: base.allowDelegatedWork,
    allowWorkSessions: base.allowWorkSessions,
    enabled: base.enabled,
    ...changes,
  };
}

export function useApplicationSave(
  connection: ApplicationConnection,
  onSaved: (next: ApplicationConnection) => Promise<unknown>,
  onFailed: () => Promise<unknown>,
) {
  const [pending, setPending] = useState<ApplicationChanges>({});
  const queued = useRef<ApplicationChanges>({});
  const saving = useRef(false);

  async function flush(start: ApplicationConnection) {
    if (saving.current) return;
    saving.current = true;
    let base = start;
    try {
      while (Object.keys(queued.current).length > 0) {
        const changes = queued.current;
        queued.current = {};
        base = await requestDaemon(
          "application.update",
          toPayload(base, changes),
        );
        await onSaved(base);
      }
    } catch (cause) {
      queued.current = {};
      toast.error(cause instanceof Error ? cause.message : String(cause));
      await onFailed();
    } finally {
      saving.current = false;
      setPending({});
    }
  }

  function save(changes: ApplicationChanges) {
    queued.current = { ...queued.current, ...changes };
    setPending((current) => ({ ...current, ...changes }));
    void flush(connection);
  }

  return { view: { ...connection, ...pending }, save };
}
