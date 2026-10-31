import type { SavedHost } from "@cocurdex/client-runtime";
import type { HostAccessScope } from "@cocurdex/shared";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  hostAddress,
  selectHost,
  useCurrentHost,
  useSavedHosts,
} from "@/hosts";
import {
  BrandHost,
  Form,
  FormRow,
  FormSection,
  FormText,
  SelectedMark,
  ValueFormRow,
} from "@/ui";
import { useUnpairHost } from "./use-unpair-host";

const SHOWN_SCOPES = [
  "read",
  "interact",
  "approvals",
  "execute",
  "files.read",
  "files.write",
  "git.destructive",
] as const satisfies readonly HostAccessScope[];

type ShownScope = (typeof SHOWN_SCOPES)[number];

function useScopeLabels() {
  const { t } = useTranslation("hosts");
  const labels: Record<ShownScope, { title: string; detail: string }> = {
    read: { title: t("scope.read"), detail: t("scopeDetail.read") },
    interact: { title: t("scope.interact"), detail: t("scopeDetail.interact") },
    approvals: {
      title: t("scope.approvals"),
      detail: t("scopeDetail.approvals"),
    },
    execute: { title: t("scope.execute"), detail: t("scopeDetail.execute") },
    "files.read": {
      title: t("scope.filesRead"),
      detail: t("scopeDetail.filesRead"),
    },
    "files.write": {
      title: t("scope.filesWrite"),
      detail: t("scopeDetail.filesWrite"),
    },
    "git.destructive": {
      title: t("scope.gitDestructive"),
      detail: t("scopeDetail.gitDestructive"),
    },
  };
  return labels;
}

function Detail({ host, current }: { host: SavedHost; current: boolean }) {
  const router = useRouter();
  const { t, i18n } = useTranslation("hosts");
  const scopeLabels = useScopeLabels();
  const { unpair, dialog } = useUnpairHost();
  const pairedAt = new Date(host.pairedAt).toLocaleString(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const muted = (text: string) => <FormText tone="muted">{text}</FormText>;
  return (
    <>
      <Stack.Screen options={{ title: host.name }} />
      <Form>
        <FormSection>
          <ValueFormRow
            testID="computer-rename"
            label={t("detail.name")}
            value={host.name}
            onPress={() =>
              router.push({
                pathname: "/rename-computer/[hostId]",
                params: { hostId: host.hostId },
              })
            }
          />
          <FormRow trailing={muted(hostAddress(host))}>
            {t("detail.address")}
          </FormRow>
          <FormRow trailing={muted(pairedAt)}>{t("detail.pairedAt")}</FormRow>
        </FormSection>
        <FormSection
          title={t("detail.scopes")}
          footer={t("detail.scopesFooter")}
        >
          {SHOWN_SCOPES.map((scope) => (
            <FormRow
              key={scope}
              testID={`computer-scope-${scope}`}
              supporting={scopeLabels[scope].detail}
              trailing={<SelectedMark selected={host.scopes.includes(scope)} />}
            >
              {scopeLabels[scope].title}
            </FormRow>
          ))}
        </FormSection>
        <FormSection>
          {current ? null : (
            <FormRow
              testID="computer-switch"
              onPress={() => {
                selectHost(host.hostId);
                router.back();
              }}
            >
              <FormText tone="tint">{t("actions.switch")}</FormText>
            </FormRow>
          )}
          <FormRow
            testID="computer-remove"
            onPress={() => unpair(host, () => router.back())}
          >
            <FormText tone="destructive">{t("actions.remove")}</FormText>
          </FormRow>
        </FormSection>
      </Form>
      {dialog ? <BrandHost matchContents>{dialog}</BrandHost> : null}
    </>
  );
}

export function ComputerDetailScreen({ hostId }: { hostId: string }) {
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  const current = useCurrentHost();
  return host ? (
    <Detail host={host} current={host.hostId === current?.hostId} />
  ) : null;
}
