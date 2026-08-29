import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const ONBOARDING_DISMISSED_KEY = "cocurdex.onboarding-hidden";

/**
 * Set only by the explicit "don't show this again" choice. Kept in
 * localStorage rather than the database: it describes this install's UI state,
 * not user data worth syncing.
 */
export const onboardingDismissedAtom = atomWithStorage(
  ONBOARDING_DISMISSED_KEY,
  false,
);

/**
 * Set when the user leaves the welcome screen for the app. In-memory on
 * purpose: an install that is still empty on the next launch gets the welcome
 * screen again unless it was dismissed for good.
 */
export const onboardingEnteredAtom = atom(false);
