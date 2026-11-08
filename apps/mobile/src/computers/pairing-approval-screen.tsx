import { savedHostSafetyCode } from "@cocurdex/client-runtime";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { hostConnection } from "@/connection";
import { mobileNoiseCrypto, useSavedHosts } from "@/hosts";
import { useThemeColors } from "@/theme";
import { Form, FormSection, ModalCloseButton } from "@/ui";

const APPROVAL_CONFIRMATION_MS = 600;

function ApprovalStatus({ hostId }: { hostId: string }) {
  const { t } = useTranslation("hosts");
  const colors = useThemeColors();
  const router = useRouter();
  const connection = hostConnection(hostId);
  const state = useSyncExternalStore(
    connection.subscribeState,
    connection.getState,
  );
  useFocusEffect(
    useCallback(() => {
      let closeTimer: ReturnType<typeof setTimeout> | undefined;
      const closeWhenLive = () => {
        if (connection.getState().status !== "live" || closeTimer) return;
        closeTimer = setTimeout(() => {
          if (router.canGoBack()) router.back();
          else router.replace("/");
        }, APPROVAL_CONFIRMATION_MS);
      };
      const unsubscribe = connection.subscribeState(closeWhenLive);
      closeWhenLive();
      if (connection.getState().status === "idle") void connection.connect();
      return () => {
        clearTimeout(closeTimer);
        unsubscribe();
      };
    }, [connection, router]),
  );
  const unavailable = state.waitReason === "offline";
  const rejected = state.waitReason === "unauthorized";
  const approved = state.status === "live";
  let label: string = t("list.status.pending");
  if (unavailable) label = t("list.status.offline");
  if (rejected) label = t("approval.rejected");
  if (approved) label = t("approval.approved");
  return (
    <View style={styles.status}>
      {!unavailable && !rejected && !approved && (
        <ActivityIndicator color={colors.mutedForeground} />
      )}
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: colors.mutedForeground }}
        testID="pairing-approval-status"
      >
        {label}
      </Text>
    </View>
  );
}

function groupDigits(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export function PairingApprovalScreen({ hostId }: { hostId: string }) {
  const { t } = useTranslation("hosts");
  const colors = useThemeColors();
  const host = useSavedHosts().find((saved) => saved.hostId === hostId);
  const safetyCode = useMemo(
    () => (host ? savedHostSafetyCode(host, mobileNoiseCrypto) : null),
    [host],
  );
  if (!host || !safetyCode) return <ModalCloseButton />;
  return (
    <>
      <ModalCloseButton />
      <Form>
        <FormSection
          title={t("approval.codeLabel")}
          footer={t("approval.description", { host: host.name })}
        >
          <Text
            accessibilityLabel={safetyCode.split("").join(" ")}
            selectable
            style={[styles.code, { color: colors.foreground }]}
            testID="pairing-approval-code"
          >
            {groupDigits(safetyCode)}
          </Text>
          <ApprovalStatus hostId={hostId} />
        </FormSection>
      </Form>
    </>
  );
}

const styles = StyleSheet.create({
  status: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  code: {
    fontSize: 34,
    fontVariant: ["tabular-nums"],
    letterSpacing: 4,
    paddingVertical: 16,
    textAlign: "center",
  },
});
