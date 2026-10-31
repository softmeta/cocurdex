import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCurrentHost } from "@/hosts";
import {
  APPEARANCE_PREFERENCES,
  type AppearancePreference,
  setAppearance,
  usePreferences,
} from "@/preferences";
import {
  archivedSessionRows,
  useArchivedSessions,
  useHostSessions,
} from "@/sessions";
import { useGroupedColors } from "@/theme";
import {
  Form,
  FormRow,
  FormSection,
  FormText,
  ListScreenHeader,
  SelectedMark,
  ValueFormRow,
} from "@/ui";
import { useTextSizeLabels } from "./font-size-screen";
import { LOCALE_ENDONYMS } from "./locale-names";

function useAppearanceLabels(): Record<AppearancePreference, string> {
  const { t } = useTranslation("settings");
  return {
    system: t("appearance.system"),
    light: t("appearance.light"),
    dark: t("appearance.dark"),
  };
}

function ArchivedRow({ hostId }: { hostId: string }) {
  const router = useRouter();
  const { t } = useTranslation("settings");
  const { workspaces } = useHostSessions(hostId);
  const { data } = useArchivedSessions(hostId);
  const count = data ? archivedSessionRows(data, workspaces).length : null;
  return (
    <ValueFormRow
      testID="settings-archived"
      label={t("sessions.archived")}
      value={count === null ? "" : String(count)}
      onPress={() =>
        router.push({ pathname: "/archived/[hostId]", params: { hostId } })
      }
    />
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation(["settings", "common"]);
  const preferences = usePreferences();
  const appearanceLabels = useAppearanceLabels();
  const host = useCurrentHost();
  const grouped = useGroupedColors();
  const textLabels = useTextSizeLabels();
  const fontSizeValue = textLabels[preferences.textSize];
  const language =
    preferences.language === "system"
      ? t("language.system")
      : LOCALE_ENDONYMS[preferences.language];
  return (
    <>
      <ListScreenHeader
        title={t("common:screens.settings")}
        background={grouped.page}
      />
      <Form>
        <FormSection>
          <ValueFormRow
            testID="settings-computers"
            label={t("computers")}
            value={host?.name ?? ""}
            onPress={() => router.push("/computers")}
          />
        </FormSection>
        <FormSection title={t("appearance.title")}>
          {APPEARANCE_PREFERENCES.map((appearance) => (
            <FormRow
              key={appearance}
              testID={`settings-appearance-${appearance}`}
              onPress={() => setAppearance(appearance)}
              trailing={
                <SelectedMark
                  selected={preferences.appearance === appearance}
                />
              }
            >
              {appearanceLabels[appearance]}
            </FormRow>
          ))}
        </FormSection>
        <FormSection>
          <ValueFormRow
            testID="settings-font-size"
            label={t("fontSize.title")}
            value={fontSizeValue}
            onPress={() => router.push("/settings/font-size")}
          />
          <ValueFormRow
            testID="settings-language"
            label={t("language.title")}
            value={language}
            onPress={() => router.push("/settings/language")}
          />
        </FormSection>
        {host ? (
          <FormSection title={t("sessions.title")}>
            <ArchivedRow hostId={host.hostId} />
          </FormSection>
        ) : null}
        <FormSection title={t("about.title")}>
          <FormRow
            trailing={
              <FormText tone="muted">
                {Constants.expoConfig?.version ?? ""}
              </FormText>
            }
          >
            {t("about.version")}
          </FormRow>
        </FormSection>
      </Form>
    </>
  );
}
