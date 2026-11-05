import { isPersonalSession, type SessionRecord } from "@cocurdex/shared";
import { type MutableRefObject, type Ref, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ChatComposerHandle } from "@/features/composer";
import { PersonaIntro, usePersonaRole } from "@/features/personal";

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
  const storedRole = usePersonaRole(
    isPersonal ? (session?.agentRoleId ?? null) : null,
    t("defaultName"),
  );
  if (!session || !storedRole) return null;
  const role = { ...storedRole, agentId: session.agentType };

  return {
    composerRole: role,
    composerPlaceholder: t("thread.placeholder", { name: role.name }),
    composerRef: (handle: ChatComposerHandle | null) => {
      composer.current = handle;
      assignRef(composerRef, handle);
    },
    emptyState: (
      <PersonaIntro
        role={role}
        onPickSuggestion={(text) => composer.current?.insertText(text)}
      />
    ),
  };
}
