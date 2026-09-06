import { useRef, useState } from "react";
import { toast } from "sonner";

export function useComposerSubmission() {
  const active = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const submit = (send: () => void | Promise<void>, clear: () => void) => {
    if (active.current) return;
    active.current = true;
    try {
      const result = send();
      if (!result) {
        clear();
        active.current = false;
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
          setSubmitting(false);
        });
    } catch (error) {
      active.current = false;
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  return { submitting, submit };
}
