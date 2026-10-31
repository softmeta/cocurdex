import type { SavedHost } from "@cocurdex/client-runtime";
import { SaveRoleForm } from "@/agents";
import { useSavedHosts } from "@/hosts";
import { chooseRole } from "./new-session-draft";
import { useNewSessionSelection } from "./new-session-selection";
import { updateNewSessionDraft, useNewSessionState } from "./new-session-store";

function Form({ host }: { host: SavedHost }) {
  const { roleDraft, roleSummary } = useNewSessionSelection(host);
  return (
    <SaveRoleForm
      host={host}
      draft={roleDraft}
      summary={roleSummary}
      onSaved={(role) =>
        updateNewSessionDraft((draft) => chooseRole(draft, role))
      }
    />
  );
}

export function NewSessionSaveRole() {
  const { hostId } = useNewSessionState();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  return host ? <Form host={host} /> : null;
}
