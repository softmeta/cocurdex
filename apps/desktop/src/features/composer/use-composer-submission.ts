import { useSetAtom } from "jotai";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { composerPendingOperationsAtom } from "./composer-pending-operations";

export type ComposerSendOutcome = "sent" | "kept";

export function useComposerSubmission() {
  const setPending = useSetAtom(composerPendingOperationsAtom);
  const active = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const submit = (
    send: () => ComposerSendOutcome | Promise<ComposerSendOutcome>,
    clear: () => void,
  ) => {
    if (active.current) return;
    active.current = true;
    setPending((count) => count + 1);
    const settle = (outcome: ComposerSendOutcome) => {
      if (outcome === "sent") clear();
      active.current = false;
      setPending((count) => count - 1);
      setSubmitting(false);
    };
    const fail = (error: unknown) => {
      toast.error(error instanceof Error ? error.message : String(error));
      settle("kept");
    };
    let result: ComposerSendOutcome | Promise<ComposerSendOutcome>;
    try {
      result = send();
    } catch (error) {
      fail(error);
      return;
    }
    if (result === "sent" || result === "kept") {
      settle(result);
      return;
    }
    setSubmitting(true);
    void result.then(settle, fail);
  };
  return { submitting, submit };
}
