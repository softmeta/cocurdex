import { useSetAtom } from "jotai";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { composerPendingOperationsAtom } from "./composer-pending-operations";

export function useComposerSubmission() {
  const setPending = useSetAtom(composerPendingOperationsAtom);
  const active = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const submit = (send: () => void | Promise<void>, clear: () => void) => {
    if (active.current) return;
    active.current = true;
    setPending((count) => count + 1);
    try {
      const result = send();
      if (!result) {
        clear();
        active.current = false;
        setPending((count) => count - 1);
        return;
      }
      setSubmitting(true);
      void result
        .then(clear)
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          active.current = false;
          setPending((count) => count - 1);
          setSubmitting(false);
        });
    } catch (error) {
      active.current = false;
      setPending((count) => count - 1);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  return { submitting, submit };
}
