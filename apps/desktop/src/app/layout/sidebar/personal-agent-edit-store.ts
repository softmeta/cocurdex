import type { PersonalAgentRolePayload } from "@cocurdex/shared";
import { atom } from "jotai";

export const personalAgentEditIdAtom = atom<string | null>(null);

export const personalAgentDraftAtom = atom<PersonalAgentRolePayload | null>(
  null,
);
