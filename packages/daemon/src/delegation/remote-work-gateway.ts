import type {
  DelegationCatalog,
  RemoteHostStatus,
  RemoteWorkSendPayload,
  RemoteWorkStarted,
  RemoteWorkStartPayload,
  RemoteWorkStatus,
  RemoteWorkTarget,
} from "@cocurdex/shared";

export interface RemoteWorkGateway {
  hosts(): { hostId: string; name: string; status: RemoteHostStatus }[];
  catalog(hostId: string): Promise<DelegationCatalog>;
  start(
    hostId: string,
    payload: RemoteWorkStartPayload,
  ): Promise<RemoteWorkStarted>;
  status(hostId: string, sessionIds: string[]): Promise<RemoteWorkStatus[]>;
  send(
    hostId: string,
    payload: RemoteWorkSendPayload,
  ): Promise<RemoteWorkStatus>;
  stop(hostId: string, target: RemoteWorkTarget): Promise<RemoteWorkStatus>;
  isUnreachable(error: unknown): boolean;
}
