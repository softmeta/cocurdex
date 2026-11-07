import { savedHostSafetyCode } from "@cocurdex/client-runtime";
import { useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text } from "react-native";
import { mobileNoiseCrypto, useSavedHosts } from "@/hosts";
import { useThemeColors } from "@/theme";
import { Form, FormSection, ModalCloseButton } from "@/ui";
import { whenHostOnline } from "./host-reachability";

function useCloseWhenApproved(hostId: string) {
  const router = useRouter();
  useEffect(
    () =>
      whenHostOnline(hostId, () => {
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }),
    [hostId, router],
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
  useCloseWhenApproved(hostId);
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
        </FormSection>
      </Form>
    </>
  );
}

const styles = StyleSheet.create({
  code: {
    fontSize: 34,
    fontVariant: ["tabular-nums"],
    letterSpacing: 4,
    paddingVertical: 16,
    textAlign: "center",
  },
});
