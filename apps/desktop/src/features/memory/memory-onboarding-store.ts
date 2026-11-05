import { atomWithStorage } from "jotai/utils";

export const memoryOnboardingSkippedAtom = atomWithStorage(
  "cocurdex.memory-onboarding-skipped",
  false,
);
