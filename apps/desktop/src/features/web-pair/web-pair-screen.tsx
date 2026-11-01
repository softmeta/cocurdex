import {
  createSavedHostStore,
  HostAccessError,
  type HostAccessFailure,
  pairHost,
} from "@cocurdex/client-runtime";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { Button, Input, Text } from "@/components/ui";
import { savePairedHost } from "@/lib";
import {
  type RelayPairingLinkProblem,
  readRelayPairingLink,
} from "./relay-pairing-link";

type PairFailure = RelayPairingLinkProblem | HostAccessFailure | "storage";

function pairFailure(error: unknown): PairFailure {
  return error instanceof HostAccessError ? error.reason : "storage";
}

export function WebPairScreen() {
  const { t } = useTranslation();
  const [link, setLink] = useState("");
  const [pairing, setPairing] = useState(false);
  const [failure, setFailure] = useState<PairFailure | null>(null);

  const failureMessages: Record<PairFailure, string> = {
    invalid: t("webPair.failure.invalid"),
    notRelay: t("webPair.failure.notRelay"),
    insecure: t("webPair.failure.insecure"),
    rateLimited: t("webPair.failure.rateLimited"),
    unreachable: t("webPair.failure.unreachable"),
    storage: t("webPair.failure.storage"),
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const read = readRelayPairingLink(link, window.location.protocol);
    if (!read.ok) {
      setFailure(read.problem);
      return;
    }
    setPairing(true);
    setFailure(null);
    try {
      const host = await pairHost({
        ...read.link,
        label: t("webPair.deviceLabel"),
        store: createSavedHostStore(null),
      });
      await savePairedHost({ ...host, endpoints: [host.baseUrl] });
      window.location.reload();
    } catch (error) {
      setFailure(pairFailure(error));
      setPairing(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4 text-app-foreground">
      <form
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={(event) => void submit(event)}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <CocurdexMark className="size-7" />
            <Text as="h1" size="title" weight="medium">
              {t("webPair.title")}
            </Text>
          </div>
          <Text size="body" tone="muted">
            {t("webPair.description")}
          </Text>
        </div>
        <div className="flex flex-col gap-1">
          <Input
            aria-label={t("webPair.linkLabel")}
            autoComplete="off"
            disabled={pairing}
            placeholder={t("webPair.linkLabel")}
            spellCheck={false}
            value={link}
            onChange={(event) => setLink(event.target.value)}
          />
          {failure ? (
            <Text size="meta" tone="destructive">
              {failureMessages[failure]}
            </Text>
          ) : null}
        </div>
        <Button disabled={pairing || !link.trim()} type="submit">
          {pairing ? t("webPair.pairing") : t("webPair.action")}
        </Button>
      </form>
    </main>
  );
}
