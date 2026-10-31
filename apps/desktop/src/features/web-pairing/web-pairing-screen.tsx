import { Link2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { Button, Input, Label, Spinner, Text } from "@/components/ui";
import {
  pairThisBrowser,
  type WebPairingReason,
  webPairingFailureReason,
} from "@/lib";

export interface WebPairingScreenProps {
  reason: WebPairingReason;
}

function useReasonMessage() {
  const { t } = useTranslation();
  return (reason: WebPairingReason) => {
    const messages: Record<WebPairingReason, string> = {
      missing: t("webPairing.reason.missing"),
      invalid: t("webPairing.reason.invalid"),
      rateLimited: t("webPairing.reason.rateLimited"),
      unreachable: t("webPairing.reason.unreachable"),
    };
    return messages[reason];
  };
}

export function WebPairingScreen({ reason }: WebPairingScreenProps) {
  const { t } = useTranslation();
  const reasonMessage = useReasonMessage();
  const codeId = useId();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<WebPairingReason>(reason);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim() || pending) return;
    setPending(true);
    try {
      await pairThisBrowser(code);
      window.location.reload();
    } catch (error) {
      setFailure(webPairingFailureReason(error));
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4 text-app-foreground">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <CocurdexMark className="size-7" />
            <Text as="h1" size="title" weight="medium">
              {t("webPairing.title")}
            </Text>
          </div>
          <Text size="body" tone="muted">
            {reasonMessage(failure)}
          </Text>
        </div>
        <form className="flex flex-col gap-2" onSubmit={submit}>
          <Label htmlFor={codeId}>{t("webPairing.codeLabel")}</Label>
          <div className="flex items-center gap-2">
            <Input
              autoComplete="one-time-code"
              autoFocus
              className="min-w-0 flex-1 font-mono"
              id={codeId}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
              value={code}
            />
            <Button disabled={!code.trim() || pending} type="submit">
              {pending ? <Spinner /> : <Link2 className="size-4" />}
              {t("webPairing.pair")}
            </Button>
          </div>
          <Text size="meta" tone="muted">
            {t("webPairing.hint")}
          </Text>
        </form>
      </div>
    </main>
  );
}
