import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

const DISMISSED_TEAM_IDS_STORAGE_KEY = "cocurdex.team.dismissedIds";
const MAX_DISMISSED_TEAM_IDS = 100;

const storedDismissedTeamIdsAtom = atomWithStorage<unknown>(
  DISMISSED_TEAM_IDS_STORAGE_KEY,
  [],
  undefined,
  { getOnInit: true },
);

function normalizeTeamIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export const dismissedTeamIdsAtom = atom((get) =>
  normalizeTeamIds(get(storedDismissedTeamIdsAtom)),
);

export const dismissTeamAtom = atom(null, (get, set, teamId: string) => {
  const current = normalizeTeamIds(get(storedDismissedTeamIdsAtom));
  if (current.includes(teamId)) return;
  set(
    storedDismissedTeamIdsAtom,
    [...current, teamId].slice(-MAX_DISMISSED_TEAM_IDS),
  );
});
