import { useRef, useState } from "react";
import { toast } from "sonner";
import { requestDaemon, useMountEffect } from "@/lib";

export function useApplicationLogin(
  id: string,
  onChanged: () => Promise<unknown>,
) {
  const [waiting, setWaiting] = useState<{
    loginId: string;
    authUrl: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef<string | null>(null);
  const attempt = useRef(0);

  function cancel() {
    attempt.current += 1;
    const loginId = active.current;
    active.current = null;
    if (loginId)
      void requestDaemon("application.login.cancel", { id, loginId }).catch(
        (cause) => toast.error(String(cause)),
      );
    setWaiting(null);
    setBusy(false);
  }

  useMountEffect(() => () => {
    attempt.current += 1;
    const loginId = active.current;
    active.current = null;
    if (loginId)
      void requestDaemon("application.login.cancel", { id, loginId }).catch(
        (cause) => toast.error(String(cause)),
      );
  });

  async function start() {
    const current = ++attempt.current;
    setBusy(true);
    try {
      const started = await requestDaemon("application.login.start", { id });
      if (current !== attempt.current) {
        if (started.loginId)
          await requestDaemon("application.login.cancel", {
            id,
            loginId: started.loginId,
          });
        return;
      }
      if (started.loginId && started.authUrl) {
        const loginId = started.loginId;
        active.current = loginId;
        setWaiting({ loginId, authUrl: started.authUrl });
        const outcome = await requestDaemon("application.login.wait", {
          id,
          loginId,
        });
        if (current !== attempt.current) return;
        active.current = null;
        setWaiting(null);
        if (!outcome.success)
          throw new Error(outcome.error ?? "Authorization failed");
      }
      await requestDaemon("application.check", { id });
      await onChanged();
    } catch (cause) {
      if (current === attempt.current)
        toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (current === attempt.current) {
        active.current = null;
        setWaiting(null);
        setBusy(false);
      }
    }
  }

  return { waiting, busy, start, cancel };
}
