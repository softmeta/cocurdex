import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const ONBOARDING_DISMISSED_KEY = "cocurdex.onboarding-hidden";

export const onboardingDismissedAtom = atomWithStorage(
  ONBOARDING_DISMISSED_KEY,
  false,
);

export const onboardingEnteredAtom = atom(false);
