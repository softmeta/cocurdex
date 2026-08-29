import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import {
  type FollowUpBehavior,
  isFollowUpBehavior,
} from "./follow-up-behavior-types";

export const FOLLOW_UP_BEHAVIOR_STORAGE_KEY =
  "agents.desktop.follow-up-behavior";

const storedFollowUpBehaviorAtom = atomWithStorage<unknown>(
  FOLLOW_UP_BEHAVIOR_STORAGE_KEY,
  "steer",
);

export const followUpBehaviorAtom = atom(
  (get): FollowUpBehavior => {
    const stored = get(storedFollowUpBehaviorAtom);
    return isFollowUpBehavior(stored) ? stored : "steer";
  },
  (_get, set, behavior: FollowUpBehavior) => {
    set(storedFollowUpBehaviorAtom, behavior);
  },
);
