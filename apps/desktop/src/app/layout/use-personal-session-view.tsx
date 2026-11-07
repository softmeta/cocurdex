import {
  isPersonalSession,
  resolveAgentRoleAvatar,
  type SessionRecord,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { type MutableRefObject, type Ref, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ChatComposerHandle } from "@/features/composer";
import {
  PersonaGreetingActivity,
  PersonaIntro,
  usePersonaGreeting,
  usePersonaOfRole,
} from "@/features/personal";
import { personalAgentEditIdAtom } from "./sidebar/personal-agent-edit-store";

function assignRef(
  ref: Ref<ChatComposerHandle> | undefined,
  value: ChatComposerHandle | null,
) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as MutableRefObject<ChatComposerHandle | null>).current = value;
}

export function usePersonalSessionView(
  session: SessionRecord | undefined,
  composerRef: Ref<ChatComposerHandle> | undefined,
) {
  const { t } = useTranslation("personal");
  const composer = useRef<ChatComposerHandle | null>(null);
  const isPersonal = Boolean(session && isPersonalSession(session));
  const persona = usePersonaOfRole(
    isPersonal ? (session?.agentRoleId ?? null) : null,
  );
  const editingId = useAtomValue(personalAgentEditIdAtom);
  const personaId = persona?.id ?? null;
  const isEmpty = session?.lastMessageAt == null;
  const greeting = usePersonaGreeting(
    personaId,
    isEmpty && editingId !== personaId,
  );
  if (!session || !persona) return null;
  const role = { ...persona.role, agentId: session.agentType };

  return {
    composerRole: role,
    hue: resolveAgentRoleAvatar(role).color,
    composerPlaceholder: t("thread.placeholder", { name: role.name }),
    composerRef: (handle: ChatComposerHandle | null) => {
      composer.current = handle;
      assignRef(composerRef, handle);
    },
    emptyStateAlign: greeting ? ("start" as const) : ("center" as const),
    emptyState: greeting ? (
      <PersonaGreetingActivity role={role} />
    ) : (
      <PersonaIntro
        onPickSuggestion={(text) => composer.current?.sendText(text)}
      />
    ),
  };
}
