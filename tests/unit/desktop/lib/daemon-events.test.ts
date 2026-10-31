import type { CocurdexDaemonEvent, DaemonEventMeta } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";

type EmitEvent = (event: CocurdexDaemonEvent, meta: DaemonEventMeta) => void;

const listeners = vi.hoisted(() => new Set<EmitEvent>());
vi.mock("@/lib/daemon-client", () => ({
  onLocalHostEvent: (listener: EmitEvent) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));

const emit: EmitEvent = (event, meta) => {
  for (const listener of [...listeners]) listener(event, meta);
};

const { daemonEventApi, onDaemonAgentEvent } = await import(
  "@/lib/daemon-events"
);

const meta = { epoch: "epoch-a", seq: 7 };

describe("daemon events", () => {
  it("routes daemon events to product and agent listeners", () => {
    const agent = vi.fn();
    const data = vi.fn();
    const searchDone = vi.fn();
    const files = vi.fn();
    onDaemonAgentEvent(agent);
    daemonEventApi.onDataChanged(data);
    daemonEventApi.onWorkspaceSearchDone(searchDone);
    daemonEventApi.onWorkspaceFilesChanged(files);

    emit({ type: "data.changed", areas: ["issues"] }, meta);
    emit({ type: "search.done", searchId: "s1", reason: "completed" }, meta);
    emit({ type: "workspace.filesChanged", rootPath: "/repo" }, meta);
    emit({ type: "team.changed", teamId: "t1" } as CocurdexDaemonEvent, meta);
    emit(
      {
        type: "state.changed",
        sessionId: "s1",
        status: "idle",
      } as CocurdexDaemonEvent,
      meta,
    );

    expect(data).toHaveBeenCalledWith({
      type: "data.changed",
      areas: ["issues"],
    });
    expect(searchDone).toHaveBeenCalledWith({
      searchId: "s1",
      reason: "completed",
    });
    expect(files).toHaveBeenCalledWith({ rootPath: "/repo" });
    expect(agent).toHaveBeenCalledOnce();
    expect(agent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "state.changed" }),
      meta,
    );
  });

  it("stops delivering to a listener after it unsubscribes", () => {
    const data = vi.fn();
    const unsubscribe = daemonEventApi.onDataChanged(data);
    unsubscribe();
    emit({ type: "data.changed", areas: ["notes"] }, meta);
    expect(data).not.toHaveBeenCalled();
  });
});
