import { useAtom } from "jotai";
import { usePersonalAgents } from "@/features/personal";
import { PersonaEditDialog } from "./persona-edit-dialog";
import { personalAgentEditIdAtom } from "./personal-agent-edit-store";

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
  if (!editId) return null;
  return <EditingPersona id={editId} onClose={() => setEditId(null)} />;
}
