import { useAtom, useSetAtom } from "jotai";
import { usePersonalAgents } from "@/features/personal";
import { selectSessionAtom } from "@/features/sessions";
import { PersonaEditDialog } from "./persona-edit-dialog";
import {
  personalAgentDraftAtom,
  personalAgentEditIdAtom,
} from "./personal-agent-edit-store";

function EditingPersona({ id, onClose }: { id: string; onClose(): void }) {
  const { agents } = usePersonalAgents();
  const agent = agents.find((item) => item.id === id) ?? null;
  return (
    <PersonaEditDialog
      agent={agent}
      key={agent?.id ?? "none"}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    />
  );
}

export function PersonaEditDialogHost() {
  const [editId, setEditId] = useAtom(personalAgentEditIdAtom);
  const [draft, setDraft] = useAtom(personalAgentDraftAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  if (draft) {
    return (
      <PersonaEditDialog
        draft={draft}
        onCreated={(created) => selectSession(created.homeSessionId)}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      />
    );
  }
  if (!editId) return null;
  return <EditingPersona id={editId} onClose={() => setEditId(null)} />;
}
