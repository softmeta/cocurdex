import { useRef, useState } from "react";
import { toast } from "sonner";
import { desktopApi, requestDaemon, useMountEffect } from "@/lib";

export interface ApplicationLoginWaiting {
  id: string;
  loginId: string;
  authUrl: string;
}

export interface ApplicationLogin {
  waiting: ApplicationLoginWaiting | null;
  busyId: string | null;
  start(id: string): Promise<void>;
  cancel(): void;
  submitReturn(url: string): Promise<void>;
}

function cancelAttempt(id: string, loginId: string) {
  void requestDaemon("application.login.cancel", { id, loginId }).catch(
    (cause) => toast.error(String(cause)),
  );
}

export function useApplicationLogin(
  onChanged: () => Promise<unknown>,
): ApplicationLogin {
  const [waiting, setWaiting] = useState<ApplicationLoginWaiting | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const active = useRef<{ id: string; loginId: string } | null>(null);
  const attempt = useRef(0);

  function abandon() {
    attempt.current += 1;
    const current = active.current;
    active.current = null;
    if (current) cancelAttempt(current.id, current.loginId);
  }

  useMountEffect(() => abandon);

  function cancel() {
    abandon();
    setWaiting(null);
    setBusyId(null);
  }

  async function start(id: string) {
    abandon();
    const current = attempt.current;
    setBusyId(id);
    try {
      const started = await requestDaemon("application.login.start", { id });
      if (current !== attempt.current) {
        if (started.loginId) cancelAttempt(id, started.loginId);
        return;
      }
      if (started.loginId && started.authUrl) {
        const next = { id, loginId: started.loginId, authUrl: started.authUrl };
        active.current = { id, loginId: started.loginId };
        setWaiting(next);
        void desktopApi.openExternal(started.authUrl);
        const outcome = await requestDaemon("application.login.wait", {
          id,
          loginId: started.loginId,
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
        setBusyId(null);
      }
    }
  }

  async function submitReturn(url: string) {
    if (!waiting) return;
    try {
      await requestDaemon("application.login.return", {
        id: waiting.id,
        loginId: waiting.loginId,
        url,
      });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return { waiting, busyId, start, cancel, submitReturn };
}
