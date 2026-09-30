import { lazyComponent } from "@/lib";
import type { OnboardingViewProps } from "./onboarding-view";

export const OnboardingView = lazyComponent<OnboardingViewProps>(
  async () => (await import("./onboarding-view")).OnboardingView,
);
