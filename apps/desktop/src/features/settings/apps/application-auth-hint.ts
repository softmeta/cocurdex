import type { ApplicationId } from "@cocurdex/shared";
import type { TFunction } from "i18next";

export function applicationAuthHint(
  applicationId: ApplicationId,
  t: TFunction<"personal">,
) {
  return applicationId === "github"
    ? t("apps.githubAuth", {
        defaultValue:
          "Uses your GitHub CLI sign-in, or authorize in your browser",
      })
    : t("apps.browserOAuth", { defaultValue: "Authorize in your browser" });
}
