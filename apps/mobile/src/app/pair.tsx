import { buildHostPairingLink } from "@cocurdex/shared";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TextInputInstance } from "react-native";
import { hosts, type PairFailure, selectHost, usePairingRoutes } from "@/hosts";
import {
  FieldSection,
  Form,
  FormNote,
  FormRow,
  FormSection,
  FormText,
  FormTextField,
  keyboardHidden,
  ModalCloseButton,
  SheetAction,
} from "@/ui";

function useFailureMessages(): Record<PairFailure, string> {
  const { t } = useTranslation("hosts");
  return {
    link: t("pair.failure.link"),
    invalid: t("pair.failure.invalid"),
    rateLimited: t("pair.failure.rateLimited"),
    unreachable: t("pair.failure.unreachable"),
  };
}

function deepLinkPairingLink({ host, code }: { host?: string; code?: string }) {
  if (!host || !code) return "";
  try {
    return buildHostPairingLink(host, code);
  } catch {
    return "";
  }
}

export default function PairScreen() {
  const { t } = useTranslation("hosts");
  const failureMessages = useFailureMessages();
  const router = useRouter();
  const { switchToScan } = usePairingRoutes();
  const linkInput = useRef<TextInputInstance>(null);
  const params = useLocalSearchParams<{ host?: string; code?: string }>();
  const initialLink = deepLinkPairingLink(params);
  const [link, setLink] = useState(initialLink);
  const [pairing, setPairing] = useState(false);
  const [failure, setFailure] = useState<PairFailure | null>(null);
  const canPair = !pairing && link.trim() !== "";

  const pair = async () => {
    if (!canPair) return;
    linkInput.current?.blur();
    setPairing(true);
    setFailure(null);
    const result = await hosts.pair(
      link,
      Constants.deviceName ?? "Cocurdex Mobile",
    );
    setPairing(false);
    if ("failure" in result) {
      setFailure(result.failure);
      return;
    }
    selectHost(result.host.hostId);
    await keyboardHidden();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const scanInstead = async () => {
    linkInput.current?.blur();
    await keyboardHidden();
    await switchToScan();
  };

  return (
    <>
      <ModalCloseButton />
      <SheetAction
        label={pairing ? t("pair.pairing") : t("pair.action")}
        disabled={!canPair}
        onPress={() => void pair()}
      />
      <Form adjustsForKeyboard>
        <FieldSection
          footer={
            failure ? (
              <FormNote tone="destructive">{failureMessages[failure]}</FormNote>
            ) : (
              <FormNote>{t("pair.hint")}</FormNote>
            )
          }
        >
          <FormTextField
            ref={linkInput}
            testID="pairing-link"
            placeholder={t("pair.linkPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            defaultValue={initialLink}
            keyboardType="url"
            onChangeText={(value) => {
              setLink(value);
              setFailure(null);
            }}
            onSubmitEditing={() => void pair()}
          />
        </FieldSection>
        <FormSection>
          <FormRow onPress={() => void scanInstead()}>
            <FormText tone="tint">{t("pair.scanInstead")}</FormText>
          </FormRow>
        </FormSection>
      </Form>
    </>
  );
}
